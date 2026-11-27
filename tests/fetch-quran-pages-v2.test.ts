import { describe, it, expect } from "vitest";
// @ts-expect-error plain .mjs build script, no type declarations
import { regroupByV2Page } from "../scripts/fetch-quran-pages-v2.mjs";
import { buildAyahCodesIndex, parsePage } from "../src/services/glyph-pages";

describe("tajweed (v2) page data", () => {
  const w = (id: number, position: number, code: string, page: number, line: number) => ({
    id,
    position,
    code_v2: code,
    v2_page: page,
    line_v2: line,
  });

  it("moves words to the page the 1441 print puts them on, without duplicates", () => {
    const grouped = regroupByV2Page([
      { verses: [{ verse_key: "5:77", words: [w(1, 1, "a", 120, 15), w(2, 2, "b", 120, 15)] }] },
      {
        verses: [
          { verse_key: "5:77", words: [w(2, 2, "b", 120, 15)] },
          { verse_key: "5:78", words: [w(3, 1, "c", 121, 1)] },
        ],
      },
    ]);
    expect(grouped[120].verses).toEqual([
      {
        verse_key: "5:77",
        words: [
          { id: 1, position: 1, code_v1: "a", line_number: 15 },
          { id: 2, position: 2, code_v1: "b", line_number: 15 },
        ],
      },
    ]);
    expect(grouped[121].verses.map((v: { verse_key: string }) => v.verse_key)).toEqual(["5:78"]);
  });

  it("parses with the tajweed font family and indexes v1 codes per ayah across pages", () => {
    const data = parsePage(3, [{ l: 1, t: "a", w: [["2:6", ["x", "y"]]] }], new Map(), "tajweed");
    expect(data?.fontFamily).toBe("QCFv4T-p3");
    expect(data?.variant).toBe("tajweed");
    const codes = buildAyahCodesIndex({
      "1": [{ l: 15, t: "a", w: [["2:6", ["p"]]] }],
      "2": [{ l: 1, t: "a", w: [["2:6", ["q", "r"]]] }],
    });
    expect(codes.get("2:6")).toEqual(["p", "q", "r"]);
  });
});
