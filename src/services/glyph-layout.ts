import type { GlyphLine, GlyphPageData } from "./glyph-pages";

export type GlyphRow =
  | { kind: "text"; line: number; words: GlyphLine["words"] }
  | { kind: "header"; line: number; surah: number }
  | { kind: "bismillah"; line: number }
  | { kind: "blank"; line: number };

export const MUSHAF_LINES = 15;

/**
 * Lays a page out as numbered mushaf lines. The API skips surah banner and
 * bismillah lines, so blank lines right above a surah's first ayah become them.
 */
export function buildPageRows(data: GlyphPageData, totalLines: number = MUSHAF_LINES): GlyphRow[] {
  const byLine = new Map(data.lines.map((l) => [l.line, l]));
  const rows: GlyphRow[] = [];
  for (let line = 1; line <= totalLines; line++) {
    const entry = byLine.get(line);
    rows.push(entry ? { kind: "text", line, words: entry.words } : { kind: "blank", line });
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "text") continue;
    const first = row.words[0];
    const [surah, ayah] = first.ayah.split(":").map(Number);
    const startsSurah = ayah === 1 && !seen.has(first.ayah);
    for (const w of row.words) seen.add(w.ayah);
    if (!startsSurah) continue;

    let above = row.line - 1;
    if (surah !== 1 && surah !== 9 && above >= 1 && rows[above - 1].kind === "blank") {
      rows[above - 1] = { kind: "bismillah", line: above };
      above -= 1;
    }
    if (above >= 1 && rows[above - 1].kind === "blank") {
      rows[above - 1] = { kind: "header", line: above, surah };
    }
  }
  return rows;
}
