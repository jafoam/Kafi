import { glyphFontUrl } from "./glyph-pages";

/** Same name as MEDIA_CACHE in public/sw.js, so the service worker serves what is stored here. */
export const OFFLINE_CACHE = "kafi-media-v1";
export const PAGE_COUNT = 604;

/** Only the web build needs this: the desktop app bundles every page font. */
export function offlineSupported(): boolean {
  return typeof caches !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

function fontUrl(page: number): string {
  return new URL(glyphFontUrl(page), globalThis.location?.href ?? "http://localhost/").href;
}

async function cachedUrls(storage: CacheStorage): Promise<Set<string>> {
  const cache = await storage.open(OFFLINE_CACHE);
  return new Set((await cache.keys()).map((request) => request.url));
}

/** How many of the 604 page fonts are already stored for offline use. */
export async function countOfflinePages(storage: CacheStorage = caches): Promise<number> {
  const stored = await cachedUrls(storage);
  let count = 0;
  for (let page = 1; page <= PAGE_COUNT; page++) if (stored.has(fontUrl(page))) count++;
  return count;
}

export interface DownloadOptions {
  signal?: AbortSignal;
  /** Called with the number of pages stored so far, starting with those already stored. */
  onProgress?: (done: number, total: number) => void;
  concurrency?: number;
  fetchFn?: typeof fetch;
  storage?: CacheStorage;
}

export interface DownloadResult {
  done: number;
  failed: number;
}

/**
 * Stores every page font in the service worker's media cache so the whole mushaf opens offline.
 * Pages already stored are skipped, so an interrupted download resumes where it stopped.
 */
export async function downloadAllPages(options: DownloadOptions = {}): Promise<DownloadResult> {
  const { signal, onProgress, concurrency = 4, fetchFn = fetch, storage = caches } = options;
  const cache = await storage.open(OFFLINE_CACHE);
  const stored = await cachedUrls(storage);

  const missing: number[] = [];
  let done = 0;
  for (let page = 1; page <= PAGE_COUNT; page++) {
    if (stored.has(fontUrl(page))) done++;
    else missing.push(page);
  }
  onProgress?.(done, PAGE_COUNT);

  let failed = 0;
  let next = 0;
  async function worker(): Promise<void> {
    while (!signal?.aborted) {
      const page = missing[next++];
      if (page === undefined) return;
      const url = fontUrl(page);
      let saved = false;
      for (let attempt = 0; attempt < 2 && !saved && !signal?.aborted; attempt++) {
        try {
          const response = await fetchFn(url, { signal });
          if (response.ok) {
            await cache.put(url, response);
            saved = true;
          }
        } catch {
          // aborted or offline: retried once below, then counted as failed
        }
      }
      if (saved) {
        done++;
        onProgress?.(done, PAGE_COUNT);
      } else if (!signal?.aborted) {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { done, failed };
}
