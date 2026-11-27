import type { PlatformAdapter } from "../platform/types";
import { glyphFontUrl, REMOTE_QCF_FONT_BASE } from "./glyph-pages";

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

type FontCache = Pick<PlatformAdapter, "cacheList" | "cachePut">;

/**
 * Checks whether the v1 QCF page fonts are actually bundled inside the app assets.
 * Lightweight mobile APKs omit them (~47 MB) and fetch from Quran.com into the platform font cache.
 */
export async function hasBundledV1Fonts(fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(glyphFontUrl(1));
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("text/html")) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 4) return false;
    const view = new Uint8Array(buf, 0, 4);
    // WOFF2 magic header: "wOF2" (0x77 0x4F 0x46 0x32)
    return view[0] === 0x77 && view[1] === 0x4f && view[2] === 0x46 && view[3] === 0x32;
  } catch {
    return false;
  }
}

async function storedPlatformV1Pages(platform: FontCache): Promise<Set<number>> {
  const entries = await platform.cacheList("font").catch(() => []);
  const pages = new Set<number>();
  for (const entry of entries) {
    const match = /^p(\d+)\.woff2$/.exec(entry.key);
    if (match && entry.size > 0) pages.add(Number(match[1]));
  }
  return pages;
}

/** How many of the 604 v1 page fonts are saved in the platform's disk font cache. */
export async function countPlatformV1Pages(platform: FontCache): Promise<number> {
  return (await storedPlatformV1Pages(platform)).size;
}

/** Downloads missing v1 page fonts into the platform's disk font cache (used on Android/lightweight apps). */
export async function downloadPlatformV1Pages(
  platform: FontCache,
  options: Pick<DownloadOptions, "signal" | "onProgress" | "concurrency" | "fetchFn"> = {},
): Promise<DownloadResult> {
  const { signal, onProgress, concurrency = 4, fetchFn = fetch } = options;
  const stored = await storedPlatformV1Pages(platform);
  const missing: number[] = [];
  for (let page = 1; page <= PAGE_COUNT; page++) {
    if (!stored.has(page)) missing.push(page);
  }
  let done = PAGE_COUNT - missing.length;
  onProgress?.(done, PAGE_COUNT);

  let failed = 0;
  let next = 0;
  async function worker(): Promise<void> {
    while (!signal?.aborted) {
      const page = missing[next++];
      if (page === undefined) return;
      let saved = false;
      for (let attempt = 0; attempt < 2 && !saved && !signal?.aborted; attempt++) {
        try {
          const response = await fetchFn(`${REMOTE_QCF_FONT_BASE}/p${page}.woff2`, { signal });
          if (response.ok) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.byteLength > 0) {
              await platform.cachePut("font", `p${page}.woff2`, bytes);
              saved = true;
            }
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
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), missing.length) }, worker));
  return { done, failed };
}
