#!/usr/bin/env node
/**
 * Downloads the 15-line Madinah mushaf from the Quran.com API (v4) once and writes it to
 * src/data/quran-pages.json, so the reader works offline with no runtime requests.
 *
 *   node scripts/fetch-quran-pages.mjs [out.json]
 *
 * Each word is its QCF v1 glyph code: it only renders with that page's font (npm run fetch:fonts).
 * v1 is the 1405 Madinah layout; the API's v2 data uses a different line layout and drops a verse on
 * page 120, so v2 is not used.
 *
 * Output: { "<page>": [ {l: line, t: "s", n: surah} | {l, t: "b"} | {l, t: "a", c?: 1, w: [[ayahKey, [glyph, ...]], ...]} (c: keep natural width, centered) ] }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.quran.com/api/v4";
const PAGES = 604;

/**
 * Lines at the end of juz 30 kept at their natural width, centered, instead of being stretched to the
 * page: every line made only of Quraysh (106), Al-Kawthar (108) or An-Nas (114), plus the short last
 * lines of Al-Qari'ah (101), An-Nasr (110) and Al-Falaq (113), as [page, line].
 */
export const NATURAL_WIDTH_SURAHS = [106, 108, 114];
export const NATURAL_WIDTH_LINES = [
  [600, 9],
  [602, 5],
  [602, 15],
  [603, 10],
  [604, 9],
  [604, 14],
  [604, 15],
];

/** Rows of a page in print order: the API skips surah banners and bismillahs, so they are inferred. */
export function buildPage(page, payload) {
  const verses = payload?.verses;
  if (!Array.isArray(verses) || verses.length === 0) throw new Error(`page ${page}: no verses`);
  const totalLines = page <= 2 ? 8 : 15;

  /** @type {Map<number, [string, string[]][]>} */
  const byLine = new Map();
  for (const verse of verses) {
    for (const word of verse.words ?? []) {
      if (!word.code_v1 || typeof word.line_number !== "number") continue;
      const runs = byLine.get(word.line_number) ?? [];
      const last = runs[runs.length - 1];
      if (last && last[0] === verse.verse_key) last[1].push(word.code_v1);
      else runs.push([verse.verse_key, [word.code_v1]]);
      byLine.set(word.line_number, runs);
    }
  }

  const rows = [];
  const seen = new Set();
  for (let line = 1; line <= totalLines; line++) {
    const runs = byLine.get(line);
    rows.push(runs ? { l: line, t: "a", w: runs } : { l: line, t: "blank" });
  }
  for (const row of rows) {
    if (row.t !== "a") continue;
    const [surah, ayah] = row.w[0][0].split(":").map(Number);
    const startsSurah = ayah === 1 && !seen.has(row.w[0][0]);
    for (const [key] of row.w) seen.add(key);
    if (!startsSurah) continue;
    let above = row.l - 1;
    if (surah !== 1 && surah !== 9 && above >= 1 && rows[above - 1].t === "blank") {
      rows[above - 1] = { l: above, t: "b" };
      above -= 1;
    }
    if (above >= 1 && rows[above - 1].t === "blank") rows[above - 1] = { l: above, t: "s", n: surah };
  }
  return rows;
}

/**
 * Builds every page, then resolves banners printed at the very bottom of a page: the surah's first
 * ayah and bismillah start on the next page, so the API gives that last line no words at all.
 * @param {(page: number) => unknown} payloadOf
 */
export function buildAllPages(payloadOf, pageCount = PAGES) {
  /** @type {Record<number, ReturnType<typeof buildPage>>} */
  const pages = {};
  for (let page = 1; page <= pageCount; page++) pages[page] = buildPage(page, payloadOf(page));

  for (let page = 1; page < pageCount; page++) {
    const rows = pages[page];
    const last = rows[rows.length - 1];
    if (last.t !== "blank") continue;
    const first = pages[page + 1].find((r) => r.t === "a");
    const [surah, ayah] = first ? first.w[0][0].split(":").map(Number) : [0, 0];
    if (ayah === 1) rows[rows.length - 1] = { l: last.l, t: "s", n: surah };
  }
  for (const rows of Object.values(pages)) {
    for (const row of rows) {
      if (row.t !== "a") continue;
      if (row.w.every(([key]) => NATURAL_WIDTH_SURAHS.includes(Number(key.split(":")[0])))) row.c = 1;
    }
  }
  for (const [page, line] of NATURAL_WIDTH_LINES) {
    const row = pages[page]?.find((r) => r.l === line);
    if (row?.t === "a") row.c = 1;
  }
  for (const [page, rows] of Object.entries(pages)) {
    const blank = rows.find((r) => r.t === "blank");
    if (blank) throw new Error(`page ${page}: line ${blank.l} has no text and no banner`);
  }
  return pages;
}

async function fetchPage(page, tries = 5) {
  const url = `${API}/verses/by_page/${page}?words=true&word_fields=code_v1,line_number&fields=verse_key&per_page=300`;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "kafi-data-build" } });
      if (response.ok) return await response.json();
    } catch {
      // retry below
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  throw new Error(`page ${page}: download failed`);
}

async function main() {
  const out = process.argv[2] ?? "src/data/quran-pages.json";
  const payloads = {};
  let next = 1;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const page = next++;
        if (page > PAGES) return;
        payloads[page] = await fetchPage(page);
      }
    }),
  );
  const pages = buildAllPages((page) => payloads[page]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(pages));
  console.log(`${PAGES} pages -> ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
