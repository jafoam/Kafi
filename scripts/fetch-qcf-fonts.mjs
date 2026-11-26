#!/usr/bin/env node
/**
 * Downloads the 604 QCF v1 page fonts (King Fahd Complex glyph fonts, as served by Quran.com) into
 * public/fonts/qcf-v1/, so the reader works offline. About 47 MB, so they are not committed.
 *
 *   node scripts/fetch-qcf-fonts.mjs [outDir]
 *
 * Files already present are skipped, so it is safe to re-run.
 */
import fs from "node:fs";

const BASE = "https://verses.quran.com/fonts/quran/hafs/v1/woff2";
const PAGES = 604;
const out = process.argv[2] ?? "public/fonts/qcf-v1";
fs.mkdirSync(out, { recursive: true });

async function download(page) {
  const file = `${out}/p${page}.woff2`;
  if (fs.existsSync(file)) return;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(`${BASE}/p${page}.woff2`, { headers: { "User-Agent": "kafi-data-build" } });
      if (response.ok) {
        fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
        return;
      }
    } catch {
      // retry below
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  throw new Error(`font for page ${page}: download failed`);
}

let next = 1;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (;;) {
      const page = next++;
      if (page > PAGES) return;
      await download(page);
    }
  }),
);
console.log(`${PAGES} fonts in ${out}`);
