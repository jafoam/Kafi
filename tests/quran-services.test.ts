import { describe, it, expect, vi, afterEach } from "vitest";
import type { PlatformAdapter } from "../src/platform/types";
import { sanitizeHtml } from "../src/services/sanitize";
import { buildEveryAyahUrl, createQuranApi } from "../src/services/quran-api";
import { normalizeArabic, createQuranSearch } from "../src/services/arabic-search";

function createMemoryCachePlatform(): {
  platform: PlatformAdapter;
  keys: string[];
} {
  const cache = new Map<string, Uint8Array>();
  const keys: string[] = [];
  const platform: PlatformAdapter = {
    isDesktop: false,
    getPageImageUrl: async (p) => `/mushaf/pages/${String(p).padStart(3, "0")}.gif`,
    cacheGet: async (b, k) => cache.get(`${b}:${k}`) ?? null,
    cachePut: async (b, k, v) => {
      keys.push(`${b}:${k}`);
      cache.set(`${b}:${k}`, v);
    },
    cacheHas: async (b, k) => cache.has(`${b}:${k}`),
    cacheDelete: async (b, k) => {
      cache.delete(`${b}:${k}`);
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
  return { platform, keys };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeHtml", () => {
  it("strips script, iframe, inline handlers, and javascript URLs while keeping safe tags", () => {
    const dirty = `<p onclick="alert(1)">Tafsir <b>penting</b><script>evil()</script><iframe src="x"></iframe><a href="javascript:steal()">klik</a><img src=x onerror=alert(2)></p>`;
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain("Tafsir");
    expect(clean).toContain("<b>penting</b>");
    expect(clean).not.toMatch(/script|iframe|onclick|onerror|javascript:/i);
    expect(clean).not.toContain("evil()");
  });

  it("keeps safe class, dir, and lang attributes and drops disallowed tags/attributes", () => {
    const dirty = `<p class="note" dir="rtl" lang="ar" style="color:red" data-x="1"><strong id="s1">Ayat</strong> <sup class="fn">1</sup><style>body{}</style></p>`;
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('class="note"');
    expect(clean).toContain('dir="rtl"');
    expect(clean).toContain('lang="ar"');
    expect(clean).toContain("<strong>Ayat</strong>");
    expect(clean).toContain('<sup class="fn">1</sup>');
    expect(clean).not.toMatch(/style=|data-x=|id=|body\{\}/i);
  });
});

describe("quran-api", () => {
  it("formats EveryAyah URLs with 3-digit zero-padded surah and ayah", () => {
    expect(buildEveryAyahUrl("Alafasy_128kbps", 1, 1)).toBe(
      "https://everyayah.com/data/Alafasy_128kbps/001001.mp3",
    );
    expect(buildEveryAyahUrl("Husary_128kbps", 114, 6)).toBe(
      "https://everyayah.com/data/Husary_128kbps/114006.mp3",
    );
  });

  it("fetches, sanitizes, and caches Quran.com translations with safe cache keys", async () => {
    const { platform, keys } = createMemoryCachePlatform();
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            verse: {
              translations: [
                { text: `Dengan nama Allah<sup foot_note="1">1</sup><script>bad()</script>` },
              ],
            },
          }),
          { status: 200 },
        ),
    );

    const api = createQuranApi(platform, mockFetch as unknown as typeof fetch);
    const first = await api.getTranslation(33, 1, 1);
    expect(first.fromCache).toBe(false);
    expect(first.html).toContain("Dengan nama Allah");
    expect(first.html).toContain("<sup>1</sup>");
    expect(first.html).not.toContain("script");
    expect(first.html).not.toContain("foot_note");

    const second = await api.getTranslation(33, 1, 1);
    expect(second.fromCache).toBe(true);
    expect(second.html).toBe(first.html);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(keys[0]).toMatch(/^[A-Za-z0-9._:-]+$/);
  });

  it("caches equran.id Indonesian tafsir per surah so multiple ayahs make 1 network request", async () => {
    const { platform } = createMemoryCachePlatform();
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              tafsir: [
                { ayat: "1", teks: "Paragraf 1\n\nParagraf 2 <script>x()</script>" },
                { ayat: 2, teks: "Tafsir ayat 2" },
              ],
            },
          }),
          { status: 200 },
        ),
    );

    const api = createQuranApi(platform, mockFetch as unknown as typeof fetch);
    const a1 = await api.getTafsir("equran-id", 1, 1);
    const a2 = await api.getTafsir("equran-id", 1, 2);
    expect(a1.fromCache).toBe(false);
    expect(a1.html).toContain("<p>Paragraf 1</p>");
    expect(a1.html).toContain("<p>Paragraf 2");
    expect(a1.html).not.toContain("<script>");
    expect(a2.fromCache).toBe(true);
    expect(a2.html).toContain("<p>Tafsir ayat 2</p>");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fetches, sanitizes, and caches Quran.com numeric tafsir per ayah", async () => {
    const { platform } = createMemoryCachePlatform();
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            tafsir: { text: `<p>Al-Muyassar</p><iframe src="evil"></iframe>` },
          }),
          { status: 200 },
        ),
    );

    const api = createQuranApi(platform, mockFetch as unknown as typeof fetch);
    const res = await api.getTafsir("16", 1, 1);
    expect(res.fromCache).toBe(false);
    expect(res.html).toBe("<p>Al-Muyassar</p>");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.quran.com/api/v4/tafsirs/16/by_ayah/1:1",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("returns cached content offline when fetch rejects", async () => {
    const enc = new TextEncoder();
    const platform: PlatformAdapter = {
      isDesktop: false,
      getPageImageUrl: async () => "",
      cacheGet: async () => enc.encode(JSON.stringify({ html: "<p>Cached terjemahan</p>" })),
      cachePut: async () => {},
      cacheHas: async () => true,
      cacheDelete: async () => {},
      kvGet: async () => null,
      kvSet: async () => {},
      createTilawaStorage: () => ({
        get: async () => null,
        put: async () => {},
        delete: async () => {},
        keys: async () => [],
      }),
    };
    const failingFetch = vi.fn(async () => {
      throw new Error("offline");
    });
    const api = createQuranApi(platform, failingFetch as unknown as typeof fetch);
    const res = await api.getTranslation(33, 1, 1);
    expect(res.fromCache).toBe(true);
    expect(res.html).toBe("<p>Cached terjemahan</p>");
    expect(failingFetch).not.toHaveBeenCalled();
  });

  it("caches audio MP3 bytes, propagates AbortSignal, and bounds object URLs", async () => {
    const { platform } = createMemoryCachePlatform();
    let urlSeq = 0;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createSpy = vi.fn(() => `blob:test-${++urlSeq}`);
    const revokeSpy = vi.fn();
    URL.createObjectURL = createSpy;
    URL.revokeObjectURL = revokeSpy;

    try {
      const mockFetch = vi.fn(
        async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
      );
      const api = createQuranApi(platform, mockFetch as unknown as typeof fetch);

      const controller = new AbortController();
      const first = await api.getAudioBlobUrl("Alafasy_128kbps", 1, 1, controller.signal);
      expect(first.fromCache).toBe(false);
      expect(first.url).toBe("blob:test-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://everyayah.com/data/Alafasy_128kbps/001001.mp3",
        expect.objectContaining({ signal: controller.signal }),
      );

      const second = await api.getAudioBlobUrl("Alafasy_128kbps", 1, 1);
      expect(second.fromCache).toBe(true);
      expect(second.url).toBe("blob:test-1");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledTimes(1);

      // Download 30 distinct ayahs to verify bounded LRU revokes older blob URLs
      for (let a = 2; a <= 31; a++) {
        await api.getAudioBlobUrl("Alafasy_128kbps", 2, a);
      }
      expect(revokeSpy).toHaveBeenCalled();

      const revokesBeforeDispose = revokeSpy.mock.calls.length;
      api.dispose();
      expect(revokeSpy.mock.calls.length).toBeGreaterThan(revokesBeforeDispose);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it("downloads surah audio skipping cached ayahs and reporting progress", async () => {
    const { platform } = createMemoryCachePlatform();
    await platform.cachePut("audio", "Alafasy_128kbps_001001", new Uint8Array([9]));

    const mockFetch = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const api = createQuranApi(platform, mockFetch as unknown as typeof fetch);
    const progress: Array<[number, number]> = [];

    await api.downloadSurahAudio("Alafasy_128kbps", 1, 4, (done, total) => {
      progress.push([done, total]);
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(progress).toHaveLength(4);
    expect(progress[progress.length - 1]).toEqual([4, 4]);
    expect(await platform.cacheHas("audio", "Alafasy_128kbps_001004")).toBe(true);
  });
});

describe("arabic-search", () => {
  it("normalizes harakat and alef variants and matches Uthmani verses offline", () => {
    expect(normalizeArabic("بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ")).toBe("بسم الله الرحمن");
    expect(normalizeArabic("أُنزِلَ إِلَيْكَ ءَامَنَ عَلَىٰ رَحْمَةً")).toBe(
      "انزل اليك ءامن علي رحمه",
    );

    const search = createQuranSearch(
      {
        ayahs: [
          { surah: 1, ayah: 1, words: ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"] },
          { s: 1, a: 2, w: ["ٱلْحَمْدُ", "لِلَّهِ", "رَبِّ", "ٱلْعَـٰلَمِينَ"] },
        ],
      },
      [
        {
          number: 1,
          name: "Al-Fatiha",
          arabicName: "الفاتحة",
          ayahs: 7,
          page: 1,
          location: "mecca",
        },
        {
          number: 2,
          name: "Al-Baqara",
          arabicName: "البقرة",
          ayahs: 286,
          page: 2,
          location: "medina",
        },
      ],
    );

    const hits = search.search("بسم الله");
    expect(hits[0]).toMatchObject({ surah: 1, ayah: 1 });

    const compactHits = search.search("رب العالمين");
    expect(compactHits[0]).toMatchObject({ surah: 1, ayah: 2 });

    const latinSurahHits = search.search("baqara");
    expect(latinSurahHits[0]).toMatchObject({ type: "surah", surah: 2, page: 2 });

    const arabicSurahHits = search.search("الفاتحة");
    expect(arabicSurahHits[0]).toMatchObject({ type: "surah", surah: 1 });

    expect(search.getAyahWords(1, 1)).toHaveLength(4);
    expect(search.getAyahWords(1, 2)).toEqual(["ٱلْحَمْدُ", "لِلَّهِ", "رَبِّ", "ٱلْعَـٰلَمِينَ"]);
    expect(search.getAyahWords(999, 1)).toEqual([]);
  });
});
