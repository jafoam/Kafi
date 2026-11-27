import quranPagesV2Url from "../data/quran-pages-v2.json?url";
import type { PlatformAdapter } from "../platform/types";
import { REMOTE_TAJWEED_FONT_BASE } from "./glyph-pages";

export const TAJWEED_PAGE_COUNT = 604;

type FontCache = Pick<PlatformAdapter, "cacheList" | "cachePut">;

/** The key the glyph page loader reads a tajweed page font from (see ensureFont in glyph-pages). */
export function tajweedFontKey(page: number): string {
  return `v4t-p${page}.woff2`;
}

async function storedPages(platform: FontCache): Promise<Set<number>> {
  const entries = await platform.cacheList("font").catch(() => []);
  const pages = new Set<number>();
  for (const entry of entries) {
    const match = /^v4t-p(\d+)\.woff2$/.exec(entry.key);
    if (match && entry.size > 0) pages.add(Number(match[1]));
  }
  return pages;
}

/** How many of the 604 tajweed page fonts are already saved on the device. */
export async function countTajweedPages(platform: FontCache): Promise<number> {
  return (await storedPages(platform)).size;
}

export interface TajweedDownloadOptions {
  signal?: AbortSignal;
  /** Called with the number of pages saved so far, starting with those already saved. */
  onProgress?: (done: number, total: number) => void;
  concurrency?: number;
  fetchFn?: typeof fetch;
}

/**
 * Saves every colored tajweed page font where the reader looks for it first, so tajweed mode opens
 * offline. Pages already saved are skipped, so a stopped download resumes where it left off.
 */
export async function downloadTajweedPages(
  platform: FontCache,
  options: TajweedDownloadOptions = {},
): Promise<{ done: number; failed: number }> {
  const { signal, onProgress, concurrency = 4, fetchFn = fetch } = options;
  const stored = await storedPages(platform);
  const missing: number[] = [];
  for (let page = 1; page <= TAJWEED_PAGE_COUNT; page++) if (!stored.has(page)) missing.push(page);
  let done = TAJWEED_PAGE_COUNT - missing.length;
  onProgress?.(done, TAJWEED_PAGE_COUNT);

  // The tajweed layout data is fetched on first use; asking for it now lets the offline cache keep it.
  if (missing.length > 0) void fetchFn(quranPagesV2Url, { signal }).catch(() => undefined);

  let failed = 0;
  let next = 0;
  async function worker(): Promise<void> {
    while (!signal?.aborted) {
      const page = missing[next++];
      if (page === undefined) return;
      let saved = false;
      for (let attempt = 0; attempt < 2 && !saved && !signal?.aborted; attempt++) {
        try {
          const response = await fetchFn(`${REMOTE_TAJWEED_FONT_BASE}/p${page}.woff2`, { signal });
          if (response.ok) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.byteLength > 0) {
              await platform.cachePut("font", tajweedFontKey(page), bytes);
              saved = true;
            }
          }
        } catch {
          // aborted or offline: retried once, then counted as failed
        }
      }
      if (saved) {
        done++;
        onProgress?.(done, TAJWEED_PAGE_COUNT);
      } else if (!signal?.aborted) {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
  return { done, failed };
}
