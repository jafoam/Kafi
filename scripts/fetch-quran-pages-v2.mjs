#!/usr/bin/env node
/**
 * Downloads the QCF v2 layout (King Fahd 1441 print) from the Quran.com API (v4) and writes it to
 * src/data/quran-pages-v2.json, for the colored tajweed mode that draws pages with the v4 COLRv1 fonts.
 *
 *   node scripts/fetch-quran-pages-v2.mjs [out.json]
 *
 * Same row format as src/data/quran-pages.json, but each glyph is a code_v2 code. `by_page` selects
 * verses by their v1 page, so an ayah the 1441 print moved to a neighboring page comes back with the
 * wrong page; every word is regrouped by its own `v2_page` before the rows are built.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAllPages } from "./fetch-quran-pages.mjs";

const API = "https://api.quran.com/api/v4";
const PAGES = 604;

/** Lines of juz 30 printed at their natural width in the 1441 print, as [page, line]. */
export const NATURAL_WIDTH_LINES_V2 = [];

/** Regroups words from every by_page payload into per-v2-page payloads that buildAllPages accepts. */
export function regroupByV2Page(payloads) {
  /** @type {Map<number, Map<string, {verse_key: string, words: object[]}>>} */
  const pages = new Map();
  for (const payload of payloads) {
    for (const verse of payload?.verses ?? []) {
      for (const word of verse.words ?? []) {
        if (!word.code_v2 || typeof word.v2_page !== "number" || typeof word.line_v2 !== "number") continue;
        const verses = pages.get(word.v2_page) ?? new Map();
        pages.set(word.v2_page, verses);
        const entry = verses.get(verse.verse_key) ?? { verse_key: verse.verse_key, words: [] };
        verses.set(verse.verse_key, entry);
        if (entry.words.some((w) => w.id === word.id)) continue;
        entry.words.push({ id: word.id, position: word.position, code_v1: word.code_v2, line_number: word.line_v2 });
      }
    }
  }
  const out = {};
  for (const [page, verses] of pages) {
    const list = [...verses.values()];
    for (const v of list) v.words.sort((a, b) => a.position - b.position);
    list.sort((a, b) => a.words[0].id - b.words[0].id);
    out[page] = { verses: list };
  }
  return out;
}

async function fetchPage(page, tries = 5) {
  const url = `${API}/verses/by_page/${page}?words=true&word_fields=code_v2,v2_page,line_v2&fields=verse_key&per_page=300&mushaf=1`;
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
  const out = process.argv[2] ?? "src/data/quran-pages-v2.json";
  const payloads = [];
  let next = 1;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const page = next++;
        if (page > PAGES) return;
        payloads[page - 1] = await fetchPage(page);
      }
    }),
  );
  const grouped = regroupByV2Page(payloads);
  const pages = buildAllPages((page) => grouped[page], PAGES, NATURAL_WIDTH_LINES_V2);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(pages));
  console.log(`${PAGES} pages -> ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
