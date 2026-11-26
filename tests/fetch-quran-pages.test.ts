import { describe, it, expect } from "vitest";
// @ts-expect-error plain .mjs build script, no type declarations
import { buildPage, buildAllPages } from "../scripts/fetch-quran-pages.mjs";

describe("page building", () => {
  const word = (code: string, line: number) => ({ code_v1: code, line_number: line });

  it("groups glyph codes into one run per ayah on a line", () => {
    const rows = buildPage(300, {
      verses: [
        { verse_key: "5:1", words: [word("a", 1), word("b", 1)] },
        { verse_key: "5:2", words: [word("c", 1), word("d", 2)] },
      ],
    });
    expect(rows[0]).toEqual({ l: 1, t: "a", w: [["5:1", ["a", "b"]], ["5:2", ["c"]]] });
    expect(rows[1]).toEqual({ l: 2, t: "a", w: [["5:2", ["d"]]] });
  });

  it("skips words without a glyph code", () => {
    const rows = buildPage(300, {
      verses: [{ verse_key: "5:1", words: [{ line_number: 1 }, word("a", 1)] }],
    });
    expect(rows[0].w).toEqual([["5:1", ["a"]]]);
  });

  it("infers the banner and bismillah above a new surah, none for Al-Fatihah and At-Tawbah", () => {
    const fill = (from: number, key: string) =>
      Array.from({ length: 15 - from + 1 }, (_, i) => ({ verse_key: key, words: [word("ك", from + i)] }));
    const sura112 = buildPage(604, { verses: fill(3, "112:1") });
    expect(sura112.slice(0, 3).map((r: { t: string }) => r.t)).toEqual(["s", "b", "a"]);
    const tawbah = buildPage(187, { verses: fill(2, "9:1") });
    expect(tawbah[0]).toMatchObject({ t: "s", n: 9 });
    expect(tawbah[1].t).toBe("a");
  });

  it("puts a banner printed on the last line of a page above the next page's bismillah", () => {
    const payloads: Record<number, unknown> = {
      1: { verses: Array.from({ length: 8 }, (_, i) => ({ verse_key: "1:1", words: [word("ك", i + 1)] })) },
      2: {
        verses: [
          { verse_key: "2:1", words: Array.from({ length: 7 }, (_, i) => word("ك", i + 1)) },
        ],
      },
      3: {
        verses: [{ verse_key: "3:1", words: Array.from({ length: 14 }, (_, i) => word("ك", i + 2)) }],
      },
    };
    // Page 2 has 8 rows (lines 1-8) with text on 1-7; line 8 is the banner of the surah starting on page 3.
    const pages = buildAllPages((p: number) => payloads[p], 3);
    expect(pages[2][7]).toMatchObject({ l: 8, t: "s", n: 3 });
    expect(pages[3][0].t).toBe("b");
  });

  it("refuses a page with an unexplained empty line", () => {
    expect(() =>
      buildAllPages(() => ({ verses: [{ verse_key: "2:5", words: [word("ك", 1)] }] }), 1),
    ).toThrow(/line 2 has no text/);
  });
});
