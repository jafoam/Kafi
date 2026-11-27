import { describe, expect, it } from "vitest";
import {
  TAJWEED_PAGE_COUNT,
  countTajweedPages,
  downloadTajweedPages,
  tajweedFontKey,
} from "../src/services/tajweed-download";

function fakeCache(initial: number[] = []) {
  const store = new Map<string, Uint8Array>();
  for (const page of initial) store.set(`font/${tajweedFontKey(page)}`, new Uint8Array([1]));
  return {
    store,
    async cacheList(bucket: string) {
      return [...store.entries()]
        .filter(([k]) => k.startsWith(`${bucket}/`))
        .map(([k, v]) => ({ key: k.slice(bucket.length + 1), size: v.byteLength }));
    },
    async cachePut(bucket: string, key: string, bytes: Uint8Array) {
      store.set(`${bucket}/${key}`, bytes);
    },
  };
}

describe("tajweed page download", () => {
  it("saves every missing page under the key the reader looks for, skipping saved ones", async () => {
    const cache = fakeCache([1, 2, 3]);
    cache.store.set("font/p9.woff2", new Uint8Array([1])); // a plain v1 page does not count
    expect(await countTajweedPages(cache)).toBe(3);

    const fetched: string[] = [];
    const failing = new Set([10]);
    const fetchFn = (async (url: string) => {
      fetched.push(url);
      const page = Number(/p(\d+)\.woff2$/.exec(url)?.[1]);
      if (failing.has(page)) return new Response(null, { status: 500 });
      return new Response(new Uint8Array([7, 7]));
    }) as unknown as typeof fetch;

    let last = 0;
    const result = await downloadTajweedPages(cache, { fetchFn, onProgress: (done) => (last = done) });
    expect(result).toEqual({ done: TAJWEED_PAGE_COUNT - 1, failed: 1 });
    expect(last).toBe(TAJWEED_PAGE_COUNT - 1);
    expect(fetched.some((u) => u.endsWith("/p1.woff2"))).toBe(false);
    expect(cache.store.get(`font/${tajweedFontKey(604)}`)).toEqual(new Uint8Array([7, 7]));
    expect(await countTajweedPages(cache)).toBe(TAJWEED_PAGE_COUNT - 1);
  });
});
