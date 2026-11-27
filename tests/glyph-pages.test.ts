import { describe, it, expect } from "vitest";
import { applyTajweedGlyphs, parsePage, glyphFontUrl, glyphFontFamily } from "../src/services/glyph-pages";
import quranPages from "../src/data/quran-pages.json";

const ayahLine = (l: number, runs: [string, string[]][]) => ({ l, t: "a", w: runs });

describe("page parsing", () => {
  it("builds explicit rows and one word per glyph code, tagged with its ayah", () => {
    const data = parsePage(3, [
      { l: 1, t: "s", n: 2 },
      { l: 2, t: "b" },
      ayahLine(3, [["2:1", ["a", "b"]], ["2:2", ["c"]]]),
    ]);
    expect(data?.fontFamily).toBe("QCFv1-p3");
    expect(data?.rows.map((r) => r.kind)).toEqual(["header", "bismillah", "text"]);
    expect(data?.rows[0]).toMatchObject({ kind: "header", surah: 2 });
    expect(data?.lines).toHaveLength(1);
    expect(data?.lines[0].words).toEqual([
      { code: "a", ayah: "2:1", wordIndex: 0 },
      { code: "b", ayah: "2:1", wordIndex: 1 },
      { code: "c", ayah: "2:2", wordIndex: 0 },
    ]);
  });

  it("reads the natural-width flag of a short line", () => {
    const data = parsePage(604, [{ ...ayahLine(14, [["114:5", ["a"]]]), c: 1 }, ayahLine(15, [["114:6", ["b"]]])]);
    const flags = data?.rows.map((r) => (r.kind === "text" ? r.centered : null));
    expect(flags).toEqual([true, false]);
  });

  it("rejects missing or malformed pages", () => {
    expect(parsePage(3, undefined)).toBeNull();
    expect(parsePage(3, [])).toBeNull();
    expect(parsePage(3, [{ l: 1, t: "z" }])).toBeNull();
    expect(parsePage(3, [{ l: 1, t: "s", n: 2 }])).toBeNull();
    expect(parsePage(3, [ayahLine(1, [["2:1", []]])])).toBeNull();
  });

  it("serves fonts from the app's own origin", () => {
    expect(glyphFontUrl(120)).toMatch(/fonts\/qcf-v1\/p120\.woff2$/);
    expect(glyphFontUrl(120)).not.toMatch(/^https?:/);
    expect(glyphFontFamily(120)).toBe("QCFv1-p120");
  });
});

describe("bundled mushaf data", () => {
  it("covers all 604 pages and parses every one", () => {
    const pages = quranPages as Record<string, unknown>;
    expect(Object.keys(pages)).toHaveLength(604);
    let textLines = 0;
    for (let p = 1; p <= 604; p++) {
      const data = parsePage(p, pages[String(p)]);
      expect(data, `page ${p}`).not.toBeNull();
      expect(data!.rows, `page ${p}`).toHaveLength(p <= 2 ? 8 : 15);
      textLines += data!.lines.length;
    }
    expect(textLines).toBe(8820);
  });

  it("centers only the short-surah lines at the end of juz 30", () => {
    const centered: string[] = [];
    for (let p = 1; p <= 604; p++) {
      for (const row of parsePage(p, (quranPages as Record<string, unknown>)[String(p)])!.rows) {
        if (row.kind === "text" && row.centered) centered.push(`${p}:${row.line}`);
      }
    }
    expect(centered).toEqual([
      "600:9", // end of Al-Qari'ah
      "602:3", "602:4", "602:5", // Quraysh
      "602:14", "602:15", // Al-Kawthar
      "603:10", // end of An-Nasr
      "604:9", // end of Al-Falaq
      "604:12", "604:13", "604:14", "604:15", // An-Nas
    ]);
  });

  it("has a banner row for each of the 114 surahs, in order", () => {
    const surahs: number[] = [];
    for (let p = 1; p <= 604; p++) {
      for (const row of parsePage(p, (quranPages as Record<string, unknown>)[String(p)])!.rows) {
        if (row.kind === "header") surahs.push(row.surah);
      }
    }
    expect(surahs).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
  });
});

describe("tajweed glyphs on the v1 layout", () => {
  it("keeps every v1 row and word, swapping in each word's v4 glyph and font", () => {
    const v1 = parsePage(5, [
      { l: 1, t: "a", w: [["2:1", ["a1", "a2"]], ["2:2", ["b1"]]] },
      { l: 2, t: "a", w: [["2:2", ["b2", "b3"]]] },
    ])!;
    const glyphs = new Map([
      ["2:1", [{ page: 4, code: "A1" }, { page: 5, code: "A2" }]],
      ["2:2", [{ page: 5, code: "B1" }, { page: 5, code: "B2" }, { page: 5, code: "B3" }]],
    ]) as Map<`${number}:${number}`, { page: number; code: string }[]>;
    const v1Codes = new Map([
      ["2:1", ["a1", "a2"]],
      ["2:2", ["b1", "b2", "b3"]],
    ]) as Map<`${number}:${number}`, string[]>;

    const out = applyTajweedGlyphs(v1, glyphs, v1Codes);
    expect(out.variant).toBe("tajweed");
    expect(out.rows.map((r) => r.line)).toEqual([1, 2]);
    expect(out.fontFamily).toBe("QCFv4T-p5");
    expect(out.fontFamilies?.sort()).toEqual(["QCFv4T-p4", "QCFv4T-p5"]);
    const first = out.lines[0].words;
    expect(first.map((w) => w.code)).toEqual(["A1", "A2", "B1"]);
    expect(first[0]).toMatchObject({ v1Code: "a1", fontFamily: "QCFv4T-p4" });
    expect(first[1].fontFamily).toBeUndefined();
    expect(out.lines[1].words.map((w) => w.code)).toEqual(["B2", "B3"]);
  });

  it("keeps an ayah's v1 glyphs when the prints split it differently", () => {
    const v1 = parsePage(5, [{ l: 1, t: "a", w: [["2:1", ["a1", "a2"]]] }])!;
    const glyphs = new Map([["2:1", [{ page: 5, code: "A1" }]]]) as Map<
      `${number}:${number}`,
      { page: number; code: string }[]
    >;
    const v1Codes = new Map([["2:1", ["a1", "a2"]]]) as Map<`${number}:${number}`, string[]>;
    const out = applyTajweedGlyphs(v1, glyphs, v1Codes);
    expect(out.lines[0].words.map((w) => w.code)).toEqual(["a1", "a2"]);
    expect(out.fontFamily).toBe("QCFv1-p5");
  });
});
