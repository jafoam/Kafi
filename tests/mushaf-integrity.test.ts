import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error plain ESM script without types
import { checkPages, checkFonts, woff2Outlines, V2_PAGE_START_EXCEPTIONS } from "../scripts/verify-mushaf.mjs";
import reference from "./fixtures/tanzil-reference.json";
import v1Pages from "../src/data/quran-pages.json";
import v2Pages from "../src/data/quran-pages-v2.json";

const FONT_DIR = path.resolve(__dirname, "../public/fonts/qcf-v1");
type Row = { t: string; w?: [string, string[]][] };
const clone = <T,>(value: T): T => structuredClone(value);
const textRows = (pages: Record<string, Row[]>, page: number) => pages[String(page)].filter((r) => r.t === "a");

describe("mushaf data against Tanzil", () => {
  it("has 114 surahs, 6236 ayahs and 604 page starts in the reference", () => {
    expect(reference.ayahsPerSurah).toHaveLength(114);
    expect(Object.keys(reference.words)).toHaveLength(6236);
    expect(reference.pageStarts).toHaveLength(604);
  });

  it("finds no problem in the 1405 pages", () => {
    expect(checkPages(v1Pages, reference)).toEqual([]);
  });

  it("finds no problem in the 1441 pages beyond the known page moves", () => {
    expect(checkPages(v2Pages, reference, { pageStartExceptions: V2_PAGE_START_EXCEPTIONS })).toEqual([]);
  });

  it("reports a dropped word", () => {
    const pages = clone(v1Pages) as Record<string, Row[]>;
    textRows(pages, 2)[0].w![0][1].shift();
    expect(checkPages(pages, reference)).toEqual(["2:1: 0 words, Tanzil has 1"]);
  });

  it("reports a missing ayah and a page that opens on the wrong ayah", () => {
    const pages = clone(v1Pages) as Record<string, Row[]>;
    for (const row of textRows(pages, 3)) row.w = row.w!.filter(([key]) => key !== "2:6");
    const problems = checkPages(pages, reference);
    expect(problems).toContain("missing ayahs: 2:6");
    expect(problems).toContain("page 3: opens on 2:7, expected 2:6");
  });

  it("reports ayahs out of order", () => {
    const pages = clone(v1Pages) as Record<string, Row[]>;
    pages["604"].push({ t: "a", w: [["114:5", ["x"]]] });
    expect(checkPages(pages, reference)).toContain("114:5: appears again on page 604 after 114:6");
  });
});

// The fonts are not committed (npm run fetch:fonts); CI downloads them before the tests.
describe.skipIf(!fs.existsSync(FONT_DIR))("page fonts", () => {
  it("reads which code points of a page font have outlines", () => {
    const outlines = woff2Outlines(fs.readFileSync(path.join(FONT_DIR, "p300.woff2")));
    expect(outlines.get(0xfb51)).toBeGreaterThan(0);
    expect(outlines.get(0x20)).toBe(0);
    expect(outlines.get(0xfb50)).toBe(0);
  });

  it("can draw every glyph on every 1405 page", () => {
    expect(checkFonts(v1Pages, FONT_DIR)).toEqual([]);
  });

  it("reports a glyph the page font lacks or draws blank", () => {
    const pages = clone(v1Pages) as Record<string, Row[]>;
    const codes = textRows(pages, 300)[0].w![0][1];
    codes[0] = "";
    codes[1] = "ﭐ";
    expect(checkFonts(pages, FONT_DIR)).toEqual(["page 300: font has no outline for U+E000, U+FB50"]);
  });
}, 60_000);
