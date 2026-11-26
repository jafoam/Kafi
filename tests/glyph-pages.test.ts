import { describe, it, expect } from "vitest";
import { parseGlyphPage, glyphFontUrl, glyphPageUrl } from "../src/services/glyph-pages";
import { buildPageRows } from "../src/services/glyph-layout";

const word = (code: string, line: number, type = "word") => ({
  code_v2: code,
  line_number: line,
  char_type_name: type,
});

describe("glyph page parsing", () => {
  it("groups words by line and tags ayah-end markers", () => {
    const data = parseGlyphPage(2, {
      verses: [
        { verse_key: "2:1", words: [word("a", 3), word("b", 3, "end")] },
        { verse_key: "2:2", words: [word("c", 3), word("d", 4)] },
      ],
    });
    expect(data?.fontFamily).toBe("QPCv2-p2");
    expect(data?.lines.map((l) => [l.line, l.words.length])).toEqual([[3, 3], [4, 1]]);
    expect(data?.lines[0].words[1]).toMatchObject({ ayah: "2:1", isEnd: true });
    expect(data?.lines[0].words[2]).toMatchObject({ ayah: "2:2", isEnd: false });
  });

  it("rejects unusable payloads", () => {
    expect(parseGlyphPage(1, null)).toBeNull();
    expect(parseGlyphPage(1, { verses: [] })).toBeNull();
    expect(parseGlyphPage(1, { verses: [{ verse_key: "1:1", words: [{ line_number: 1 }] }] })).toBeNull();
  });

  it("builds quran.com urls", () => {
    expect(glyphFontUrl(300)).toBe("https://verses.quran.com/fonts/quran/hafs/v2/woff2/p300.woff2");
    expect(glyphPageUrl(7)).toContain("/verses/by_page/7?");
  });
});

describe("glyph page layout", () => {
  const page = (verses: { verse_key: string; words: ReturnType<typeof word>[] }[], n = 604) =>
    parseGlyphPage(n, { verses })!;

  it("adds header and bismillah above a new surah", () => {
    const rows = buildPageRows(page([{ verse_key: "112:1", words: [word("a", 3)] }]));
    expect(rows.slice(0, 3).map((r) => r.kind)).toEqual(["header", "bismillah", "text"]);
    expect(rows[0]).toMatchObject({ kind: "header", surah: 112 });
    expect(rows).toHaveLength(15);
  });

  it("omits bismillah for At-Tawbah and Al-Fatihah", () => {
    expect(buildPageRows(page([{ verse_key: "9:1", words: [word("a", 2)] }]))[0]).toMatchObject({ kind: "header", surah: 9 });
    const fatiha = buildPageRows(page([{ verse_key: "1:1", words: [word("a", 2)] }], 1), 8);
    expect(fatiha.map((r) => r.kind).slice(0, 2)).toEqual(["header", "text"]);
  });

  it("does not add a banner for an ayah continuing from the previous page", () => {
    const rows = buildPageRows(page([{ verse_key: "2:6", words: [word("a", 1)] }], 3));
    expect(rows.every((r) => r.kind === "text" || r.kind === "blank")).toBe(true);
  });
});
