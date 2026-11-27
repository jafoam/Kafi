import { describe, it, expect, vi } from "vitest";
import {
  deleteReciterSegments,
  downloadAllReciterSegments,
  parseSurahSegments,
  findActiveWordRange,
  readSegmentDownloadStatus,
} from "../src/services/word-segments";
import { buildAyahPagesIndex, parsePage } from "../src/services/glyph-pages";

describe("word-segments", () => {
  it("parses valid 4-tuple segments and locates the active word range by millisecond", () => {
    const map = parseSurahSegments({
      audio_files: [
        {
          verse_key: "1:1",
          segments: [
            [0, 1, 60, 610],
            [1, 2, 620, 1310],
            [2, 3, 1320, 2450],
            [99], // malformed pause entry ignored
          ],
        },
      ],
    });

    const segs = map.get("1:1")!;
    expect(segs).toHaveLength(3);
    expect(findActiveWordRange(segs, 50)).toBeNull();
    expect(findActiveWordRange(segs, 60)).toEqual([0, 1]);
    expect(findActiveWordRange(segs, 900)).toEqual([1, 2]);
    expect(findActiveWordRange(segs, 2450)).toBeNull();
  });

  it("downloads, counts, and deletes offline word segments for a reciter", async () => {
    const store = new Map<string, Uint8Array>();
    const platform = {
      cacheHas: async (b: string, k: string) => store.has(`${b}:${k}`),
      cachePut: async (b: string, k: string, v: Uint8Array) => {
        store.set(`${b}:${k}`, v);
      },
      cacheDelete: async (b: string, k: string) => {
        store.delete(`${b}:${k}`);
      },
      cacheList: async (b: string) => {
        const prefix = `${b}:`;
        return Array.from(store.entries())
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, v]) => ({ key: k.slice(prefix.length), size: v.byteLength }));
      },
    };
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            audio_files: [{ verse_key: "1:1", segments: [[0, 1, 10, 500]] }],
          }),
          { status: 200 },
        ),
    );

    const { failed } = await downloadAllReciterSegments({
      platform,
      reciterId: "Alafasy_128kbps",
      totalSurahs: 3,
      onProgress: () => {},
      fetcher: mockFetch as unknown as typeof fetch,
    });
    expect(failed).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const status = await readSegmentDownloadStatus(platform, "Alafasy_128kbps", 3);
    expect(status.supported).toBe(true);
    expect(status.cachedSurahs).toBe(3);
    expect(status.bytes).toBeGreaterThan(0);

    await deleteReciterSegments(platform, "Alafasy_128kbps", 3);
    const afterDelete = await readSegmentDownloadStatus(platform, "Alafasy_128kbps", 3);
    expect(afterDelete.cachedSurahs).toBe(0);
  });
});

describe("QCF ayah page index and wordIndex offsets", () => {
  it("tracks split ayahs across pages and offsets wordIndex on continuation pages", () => {
    const pages = {
      "14": [{ l: 15, t: "a", w: [["2:94", ["a", "b"]]] }],
      "15": [{ l: 1, t: "a", w: [["2:94", ["c", "d"]], ["2:95", ["e"]]] }],
    };

    const idx = buildAyahPagesIndex(pages);
    expect(idx.get("2:94")).toEqual([14, 15]);
    expect(idx.get("2:95")).toEqual([15]);

    const p15 = parsePage(15, pages["15"], new Map([["2:94", 2]]));
    expect(p15?.lines[0].words.map((w) => [w.ayah, w.wordIndex])).toEqual([
      ["2:94", 2],
      ["2:94", 3],
      ["2:95", 0],
    ]);
  });
});
