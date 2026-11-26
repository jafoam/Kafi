import { describe, it, expect } from "vitest";
import {
  OFFLINE_CACHE,
  PAGE_COUNT,
  countOfflinePages,
  downloadAllPages,
} from "../src/services/offline-pages";
import { glyphFontUrl } from "../src/services/glyph-pages";

const urlOf = (page: number) => new URL(glyphFontUrl(page), globalThis.location.href).href;

/** Minimal in-memory CacheStorage: one named cache holding responses by URL. */
function fakeStorage(initial: number[] = []) {
  const entries = new Map<string, Response>(initial.map((p) => [urlOf(p), new Response("x")]));
  const opened: string[] = [];
  const cache = {
    keys: async () => [...entries.keys()].map((url) => ({ url }) as Request),
    put: async (url: string, response: Response) => {
      entries.set(url, response);
    },
  };
  const storage = {
    open: async (name: string) => {
      opened.push(name);
      return cache;
    },
  } as unknown as CacheStorage;
  return { storage, entries, opened };
}

const okFetch = (async () => new Response("font")) as unknown as typeof fetch;

describe("offline page download", () => {
  it("stores every page font in the service worker's media cache", async () => {
    const { storage, entries, opened } = fakeStorage();
    const progress: number[] = [];
    const result = await downloadAllPages({
      storage,
      fetchFn: okFetch,
      onProgress: (done) => progress.push(done),
    });
    expect(result).toEqual({ done: PAGE_COUNT, failed: 0 });
    expect(entries.size).toBe(PAGE_COUNT);
    expect(opened.every((name) => name === OFFLINE_CACHE)).toBe(true);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(PAGE_COUNT);
  });

  it("skips pages already stored, so an interrupted download resumes", async () => {
    const { storage } = fakeStorage([1, 2, 3, 300]);
    const requested: string[] = [];
    const fetchFn = (async (url: string) => {
      requested.push(url);
      return new Response("font");
    }) as unknown as typeof fetch;
    const progress: number[] = [];
    await downloadAllPages({ storage, fetchFn, onProgress: (d) => progress.push(d) });
    expect(requested).toHaveLength(PAGE_COUNT - 4);
    expect(requested).not.toContain(urlOf(300));
    expect(progress[0]).toBe(4);
  });

  it("retries a failed page once, then counts it as failed", async () => {
    const { storage, entries } = fakeStorage();
    let attempts = 0;
    const fetchFn = (async (url: string) => {
      if (url === urlOf(7)) {
        attempts++;
        return new Response("nope", { status: 500 });
      }
      return new Response("font");
    }) as unknown as typeof fetch;
    const result = await downloadAllPages({ storage, fetchFn });
    expect(attempts).toBe(2);
    expect(result).toEqual({ done: PAGE_COUNT - 1, failed: 1 });
    expect(entries.has(urlOf(7))).toBe(false);
  });

  it("stops when aborted and does not count aborted pages as failures", async () => {
    const { storage, entries } = fakeStorage();
    const controller = new AbortController();
    const fetchFn = (async () => {
      if (entries.size >= 10) controller.abort();
      return new Response("font");
    }) as unknown as typeof fetch;
    const result = await downloadAllPages({
      storage,
      fetchFn,
      signal: controller.signal,
      concurrency: 1,
    });
    expect(result.failed).toBe(0);
    expect(result.done).toBeLessThan(PAGE_COUNT);
    expect(entries.size).toBeLessThan(PAGE_COUNT);
  });

  it("counts the pages already stored", async () => {
    expect(await countOfflinePages(fakeStorage([5, 6, 7]).storage)).toBe(3);
    expect(await countOfflinePages(fakeStorage().storage)).toBe(0);
  });
});
