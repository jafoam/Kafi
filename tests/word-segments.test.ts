import { describe, it, expect } from "vitest";
import { parseSurahSegments, findActiveWordRange } from "../src/services/word-segments";
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
