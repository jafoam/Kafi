#!/usr/bin/env node
/**
 * Downloads word-by-word Indonesian glosses + transliteration for all 604 pages from the Quran.com
 * API (v4) once and writes src/data/word-translations.json, so the tooltip works offline.
 *
 *   node scripts/fetch-word-translations.mjs [out.json]
 *
 * Output: { "<page>": { "<QCF v1 glyph>": [translation, transliteration], ... } }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? path.join(root, "src/data/word-translations.json");
const result = {};
for (let page = 1; page <= 604; page++) {
  const url = `https://api.quran.com/api/v4/verses/by_page/${page}?words=true&language=id&word_fields=code_v1,transliteration&per_page=50&mushaf=2`;
  let data;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      if (attempt >= 4) throw new Error(`page ${page}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  const words = {};
  for (const v of data.verses ?? [])
    for (const w of v.words ?? [])
      if (w.char_type_name === "word" && w.code_v1)
        words[w.code_v1] = [w.translation?.text ?? "", w.transliteration?.text ?? ""];
  result[page] = words;
  if (page % 50 === 0) console.log(`page ${page}/604`);
}
fs.writeFileSync(out, JSON.stringify(result));
console.log(`wrote ${out}`);
