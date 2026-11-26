import type { PlatformAdapter } from "../platform/types";
import { tafsirSurahCacheKey, translationSurahCacheKey } from "./quran-api";

export type TextResourceKind = "translation" | "tafsir";

export interface TextResourceStatus {
  id: string;
  cachedSurahs: number;
  totalSurahs: number;
  bytes: number;
}

const TOTAL_SURAHS = 114;
const CONCURRENCY = 3;

function surahKeyFor(kind: TextResourceKind, resourceId: string, surah: number): string {
  return kind === "translation"
    ? translationSurahCacheKey(Number(resourceId), surah)
    : tafsirSurahCacheKey(resourceId, surah);
}

/** Counts how many full surahs are stored for each translation or tafsir edition. */
export async function readTextDownloadStatus(
  platform: Pick<PlatformAdapter, "cacheList">,
  kind: TextResourceKind,
  resourceIds: readonly string[],
  totalSurahs = TOTAL_SURAHS,
): Promise<Map<string, TextResourceStatus>> {
  const result = new Map<string, TextResourceStatus>(
    resourceIds.map((id) => [id, { id, cachedSurahs: 0, totalSurahs, bytes: 0 }]),
  );

  // Build reverse lookup: exact surah cache key -> resourceId
  const keyToResource = new Map<string, string>();
  for (const id of resourceIds) {
    for (let s = 1; s <= totalSurahs; s++) {
      keyToResource.set(surahKeyFor(kind, id, s), id);
    }
  }

  for (const { key, size } of await platform.cacheList(kind)) {
    const id = keyToResource.get(key);
    if (!id) continue;
    const entry = result.get(id)!;
    entry.cachedSurahs += 1;
    entry.bytes += size;
  }

  return result;
}

/** Deletes all stored surahs (and any legacy per-ayah entries) for one translation or tafsir edition. */
export async function deleteTextResource(
  platform: Pick<PlatformAdapter, "cacheList" | "cacheDelete">,
  kind: TextResourceKind,
  resourceId: string,
  totalSurahs = TOTAL_SURAHS,
): Promise<void> {
  const knownKeys = new Set<string>();
  for (let s = 1; s <= totalSurahs; s++) {
    knownKeys.add(surahKeyFor(kind, resourceId, s));
  }
  const legacyPrefix = `${resourceId}_`;
  const listed = await platform.cacheList(kind);
  for (const { key } of listed) {
    if (knownKeys.has(key) || key.startsWith(legacyPrefix)) {
      await platform.cacheDelete(kind, key);
    }
  }
}

export interface BulkTextDownloadOptions {
  totalSurahs?: number;
  downloadSurah: (surah: number, signal?: AbortSignal) => Promise<void>;
  onProgress: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Downloads surahs 1..N with bounded concurrency, continuing past individual surah errors. */
export async function downloadAllTextSurahs({
  totalSurahs = TOTAL_SURAHS,
  downloadSurah,
  onProgress,
  signal,
}: BulkTextDownloadOptions): Promise<{ failed: number[] }> {
  if (totalSurahs <= 0) return { failed: [] };

  let nextSurah = 1;
  let done = 0;
  const failed: number[] = [];

  const worker = async (): Promise<void> => {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException("Aborted", "AbortError");
      }
      const surah = nextSurah++;
      if (surah > totalSurahs) return;

      try {
        await downloadSurah(surah, signal);
      } catch (err) {
        if ((err instanceof DOMException && err.name === "AbortError") || signal?.aborted) {
          throw err;
        }
        failed.push(surah);
      }

      done += 1;
      onProgress(done, totalSurahs);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalSurahs) }, () => worker()));
  return { failed };
}
