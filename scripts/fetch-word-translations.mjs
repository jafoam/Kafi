#!/usr/bin/env node
/**
 * Downloads word-by-word glosses + transliteration for all 604 pages from the Quran.com API (v4)
 * once and writes src/data/word-translations[-en].json, so the tooltip works offline.
 *
 *   node scripts/fetch-word-translations.mjs [--lang=id|en] [out.json]
 *
 * Output: { "<page>": { "<QCF v1 glyph>": [translation, transliteration], ... } }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const langArg = args.find((a) => a.startsWith("--lang="));
const lang = langArg ? langArg.split("=")[1] : "id";
const positionalOut = args.find((a) => !a.startsWith("--"));
const defaultFile = lang === "en" ? "src/data/word-translations-en.json" : "src/data/word-translations.json";
const out = positionalOut ?? path.join(root, defaultFile);
const result = {};
for (let page = 1; page <= 604; page++) {
  const url = `https://api.quran.com/api/v4/verses/by_page/${page}?words=true&language=${lang}&word_fields=code_v1,transliteration&per_page=50&mushaf=2`;
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
