import { describe, it, expect, vi } from "vitest";
import type { PlatformAdapter } from "../src/platform/types";
import {
  createQuranApi,
  tafsirSurahCacheKey,
  translationSurahCacheKey,
} from "../src/services/quran-api";
import {
  deleteTextResource,
  downloadAllTextSurahs,
  readTextDownloadStatus,
} from "../src/services/text-downloads";

function createMemoryPlatform(): PlatformAdapter {
  const store = new Map<string, Uint8Array>();
  return {
    isDesktop: false,
    getPageImageUrl: async () => "",
    cacheGet: async (b, k) => store.get(`${b}:${k}`) ?? null,
    cachePut: async (b, k, v) => {
      store.set(`${b}:${k}`, v);
    },
    cacheHas: async (b, k) => store.has(`${b}:${k}`),
    cacheDelete: async (b, k) => {
      store.delete(`${b}:${k}`);
    },
    cacheList: async (b) => {
      const prefix = `${b}:`;
      const out: Array<{ key: string; size: number }> = [];
      for (const [full, bytes] of store.entries()) {
        if (full.startsWith(prefix)) {
          out.push({ key: full.slice(prefix.length), size: bytes.byteLength });
        }
      }
      return out;
    },
    kvGet: async () => null,
    kvSet: async () => {},
    createTilawaStorage: () => ({
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      keys: async () => [],
    }),
  };
}

describe("bulk translation & tafsir downloads", () => {
  it("bulk-downloads a surah translation once and serves ayahs from cache offline", async () => {
    const platform = createMemoryPlatform();
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            translations: [
              { text: "Ayat satu <script>x()</script>" },
              { text: "Ayat dua" },
            ],
          }),
          { status: 200 },
        ),
    );

    const api = createQuranApi(platform, mockFetch as unknown as typeof fetch);
    await api.downloadSurahTranslation(33, 1);
    // Second call skips network because surah is already cached
    await api.downloadSurahTranslation(33, 1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Reading ayahs uses the bulk-cached surah without network
    const a1 = await api.getTranslation(33, 1, 1);
    const a2 = await api.getTranslation(33, 1, 2);
    expect(a1).toEqual({ html: "Ayat satu ", fromCache: true });
    expect(a2).toEqual({ html: "Ayat dua", fromCache: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("bulk-downloads equran-id and quran.com tafsirs (with pagination) and serves them offline", async () => {
    const platform = createMemoryPlatform();
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("equran.id/api/v2/tafsir/1")) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: { tafsir: [{ ayat: 1, teks: "Kemenag 1" }, { ayat: 2, teks: "Kemenag 2" }] },
          }),
          { status: 200 },
        );
      }
      if (u.includes("tafsirs/16/by_chapter/2") && u.includes("page=1")) {
        return new Response(
          JSON.stringify({
            tafsirs: [{ verse_key: "2:1", text: "<p>Muyassar 1</p>" }],
            pagination: { next_page: 2 },
          }),
          { status: 200 },
        );
      }
      if (u.includes("tafsirs/16/by_chapter/2") && u.includes("page=2")) {
        return new Response(
          JSON.stringify({
            tafsirs: [{ verse_key: "2:2", text: "<p>Muyassar 2</p>" }],
            pagination: { next_page: null },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const api = createQuranApi(platform, mockFetch as unknown as typeof fetch);
    await api.downloadSurahTafsir("equran-id", 1);
    await api.downloadSurahTafsir("16", 2);

    const k1 = await api.getTafsir("equran-id", 1, 2);
    const m2 = await api.getTafsir("16", 2, 2);
    expect(k1).toEqual({ html: "<p>Kemenag 2</p>", fromCache: true });
    expect(m2).toEqual({ html: "<p>Muyassar 2</p>", fromCache: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("counts cached surahs accurately and deletes both surah and legacy per-ayah keys", async () => {
    const platform = createMemoryPlatform();
    await platform.cachePut("translation", translationSurahCacheKey(33, 1), new Uint8Array(100));
    await platform.cachePut("translation", translationSurahCacheKey(33, 2), new Uint8Array(150));
    await platform.cachePut("translation", "33_1_1", new Uint8Array(50)); // legacy per-ayah
    await platform.cachePut("translation", translationSurahCacheKey(20, 1), new Uint8Array(200));
    await platform.cachePut("tafsir", tafsirSurahCacheKey("equran-id", 1), new Uint8Array(300));

    const trStatus = await readTextDownloadStatus(platform, "translation", ["33", "20"], 5);
    expect(trStatus.get("33")).toEqual({ id: "33", cachedSurahs: 2, totalSurahs: 5, bytes: 250 });
    expect(trStatus.get("20")).toEqual({ id: "20", cachedSurahs: 1, totalSurahs: 5, bytes: 200 });

    const tfStatus = await readTextDownloadStatus(platform, "tafsir", ["equran-id", "16"], 5);
    expect(tfStatus.get("equran-id")?.cachedSurahs).toBe(1);
    expect(tfStatus.get("16")?.cachedSurahs).toBe(0);

    await deleteTextResource(platform, "translation", "33", 5);
    expect(await platform.cacheHas("translation", translationSurahCacheKey(33, 1))).toBe(false);
    expect(await platform.cacheHas("translation", "33_1_1")).toBe(false);
    expect(await platform.cacheHas("translation", translationSurahCacheKey(20, 1))).toBe(true);
  });

  it("continues downloading remaining surahs on failure and reports failed surahs", async () => {
    const progress: Array<[number, number]> = [];
    const { failed } = await downloadAllTextSurahs({
      totalSurahs: 5,
      downloadSurah: async (surah) => {
        if (surah === 3) throw new Error("HTTP 500");
      },
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(failed).toEqual([3]);
    expect(progress[progress.length - 1]).toEqual([5, 5]);
  });
});
