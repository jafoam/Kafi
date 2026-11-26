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
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
