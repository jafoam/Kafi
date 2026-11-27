import type { AyahKey } from "../data/types";
import type { PlatformAdapter } from "../platform/types";

/** [startWord (0-based), endWord (exclusive), startMs, endMs] */
export type WordSegment = [number, number, number, number];

/** Maps catalog reciter IDs to Quran.com v4 recitation IDs that serve word-level segments. */
export const RECITER_SEGMENT_IDS: Record<string, number> = {
  Alafasy_128kbps: 7,
  Husary_128kbps: 6,
  Abdul_Basit_Murattal_192kbps: 2,
  Minshawy_Murattal_128kbps: 9,
  "Abdurrahmaan_As-Sudais_192kbps": 3,
  "Saood_ash-Shuraym_128kbps": 10,
  "Abu_Bakr_Ash-Shaatree_128kbps": 4,
  Hani_Rifai_192kbps: 5,
};

const CACHE_BUCKET = "segments";
const TOTAL_SURAHS = 114;
const SEGMENT_CONCURRENCY = 4;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function hasWordSegments(reciterId: string): boolean {
  return Boolean(RECITER_SEGMENT_IDS[reciterId]);
}

export function segmentCacheKey(reciterId: string, surah: number): string | null {
  const recId = RECITER_SEGMENT_IDS[reciterId];
  return recId ? `${recId}_${surah}` : null;
}

export interface SegmentDownloadStatus {
  supported: boolean;
  cachedSurahs: number;
  totalSurahs: number;
  bytes: number;
}

export async function readSegmentDownloadStatus(
  platform: Pick<PlatformAdapter, "cacheList">,
  reciterId: string,
  totalSurahs = TOTAL_SURAHS,
): Promise<SegmentDownloadStatus> {
  const recId = RECITER_SEGMENT_IDS[reciterId];
  if (!recId) {
    return { supported: false, cachedSurahs: 0, totalSurahs, bytes: 0 };
  }
  const known = new Set<string>();
  for (let s = 1; s <= totalSurahs; s += 1) {
    known.add(`${recId}_${s}`);
  }
  let cachedSurahs = 0;
  let bytes = 0;
  for (const { key, size } of await platform.cacheList(CACHE_BUCKET)) {
    if (!known.has(key)) continue;
    cachedSurahs += 1;
    bytes += size;
  }
  return { supported: true, cachedSurahs, totalSurahs, bytes };
}

export async function downloadSurahSegments(
  platform: Pick<PlatformAdapter, "cacheHas" | "cachePut">,
  reciterId: string,
  surah: number,
  signal?: AbortSignal,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  const recId = RECITER_SEGMENT_IDS[reciterId];
  if (!recId) return;
  const cacheKey = `${recId}_${surah}`;
  if (await platform.cacheHas(CACHE_BUCKET, cacheKey)) return;

  const url = `https://api.quran.com/api/v4/recitations/${recId}/by_chapter/${surah}?fields=segments&per_page=300`;
  const res = await fetcher(url, { signal });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const raw: unknown = await res.json();
  const parsed = parseSurahSegments(raw);
  if (parsed.size === 0) {
    throw new Error("Empty segments");
  }
  await platform.cachePut(CACHE_BUCKET, cacheKey, encoder.encode(JSON.stringify(raw)));
}

export async function deleteReciterSegments(
  platform: Pick<PlatformAdapter, "cacheDelete">,
  reciterId: string,
  totalSurahs = TOTAL_SURAHS,
): Promise<void> {
  const recId = RECITER_SEGMENT_IDS[reciterId];
  if (!recId) return;
  for (let s = 1; s <= totalSurahs; s += 1) {
    await platform.cacheDelete(CACHE_BUCKET, `${recId}_${s}`);
  }
}

export async function downloadAllReciterSegments(options: {
  platform: Pick<PlatformAdapter, "cacheHas" | "cachePut">;
  reciterId: string;
  totalSurahs?: number;
  onProgress: (done: number, total: number) => void;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<{ failed: number[] }> {
  const totalSurahs = options.totalSurahs ?? TOTAL_SURAHS;
  if (!hasWordSegments(options.reciterId) || totalSurahs <= 0) {
    return { failed: [] };
  }

  let nextSurah = 1;
  let done = 0;
  const failed: number[] = [];

  const worker = async (): Promise<void> => {
    while (true) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
      }
      const surah = nextSurah++;
      if (surah > totalSurahs) return;
      try {
        await downloadSurahSegments(
          options.platform,
          options.reciterId,
          surah,
          options.signal,
          options.fetcher,
        );
      } catch (err) {
        if ((err instanceof DOMException && err.name === "AbortError") || options.signal?.aborted) {
          throw err;
        }
        failed.push(surah);
      }
      done += 1;
      options.onProgress(done, totalSurahs);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SEGMENT_CONCURRENCY, totalSurahs) }, () => worker()),
  );
  return { failed };
}

export function parseSurahSegments(raw: unknown): Map<AyahKey, WordSegment[]> {
  const out = new Map<AyahKey, WordSegment[]>();
  const files = (raw as { audio_files?: { verse_key?: string; segments?: unknown[] }[] } | null)
    ?.audio_files;
  if (!Array.isArray(files)) return out;

  for (const file of files) {
    if (!file.verse_key || !Array.isArray(file.segments)) continue;
    const valid: WordSegment[] = [];
    for (const seg of file.segments) {
      if (!Array.isArray(seg) || seg.length < 4) continue;
      const [sWord, eWord, startMs, endMs] = seg;
      if (
        typeof sWord === "number" &&
        typeof eWord === "number" &&
        typeof startMs === "number" &&
        typeof endMs === "number" &&
        eWord > sWord &&
        endMs > startMs
      ) {
        valid.push([sWord, eWord, startMs, endMs]);
      }
    }
    if (valid.length > 0) {
      out.set(file.verse_key as AyahKey, valid);
    }
  }
  return out;
}

/** Returns [startWord, endWord) for the word spoken at `timeMs`, or null when outside all segments. */
export function findActiveWordRange(
  segments: readonly WordSegment[],
  timeMs: number,
): [number, number] | null {
  for (let i = 0; i < segments.length; i++) {
    const [sWord, eWord, startMs, endMs] = segments[i];
    if (timeMs >= startMs && timeMs < endMs) {
      return [sWord, eWord];
    }
  }
  return null;
}

export interface WordSegmentLoader {
  load(reciterId: string, surah: number): Promise<Map<AyahKey, WordSegment[]> | null>;
}

/** Fetches and caches per-surah word timing segments for supported reciters. */
export function createWordSegmentLoader(
  platform: PlatformAdapter,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): WordSegmentLoader {
  const mem = new Map<string, Promise<Map<AyahKey, WordSegment[]> | null>>();

  return {
    load(reciterId, surah) {
      const recId = RECITER_SEGMENT_IDS[reciterId];
      if (!recId) return Promise.resolve(null);

      const cacheKey = `${recId}_${surah}`;
      const existing = mem.get(cacheKey);
      if (existing) return existing;

      const promise = (async (): Promise<Map<AyahKey, WordSegment[]> | null> => {
        const cached = await platform.cacheGet(CACHE_BUCKET, cacheKey).catch(() => null);
        if (cached) {
          try {
            const parsed = parseSurahSegments(JSON.parse(decoder.decode(cached)));
            if (parsed.size > 0) return parsed;
          } catch {
            // fall through to network
          }
        }

        const url = `https://api.quran.com/api/v4/recitations/${recId}/by_chapter/${surah}?fields=segments&per_page=300`;
        const res = await fetcher(url);
        if (!res.ok) return null;
        const raw: unknown = await res.json();
        const parsed = parseSurahSegments(raw);
        if (parsed.size === 0) return null;
        await platform
          .cachePut(CACHE_BUCKET, cacheKey, encoder.encode(JSON.stringify(raw)))
          .catch(() => undefined);
        return parsed;
      })().catch(() => {
        mem.delete(cacheKey);
        return null;
      });

      mem.set(cacheKey, promise);
      return promise;
    },
  };
}
