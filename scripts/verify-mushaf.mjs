#!/usr/bin/env node
/**
 * Checks the bundled mushaf against an independent source (Tanzil, tanzil.net, CC BY 3.0) and the page fonts.
 *
 *   node scripts/verify-mushaf.mjs            check src/data/quran-pages*.json and public/fonts/qcf-v1
 *   node scripts/verify-mushaf.mjs --refresh  rebuild tests/fixtures/tanzil-reference.json from tanzil.net first
 *
 * The page data comes from Quran.com and draws each word with a King Fahd Complex (QCF) glyph, so there is no
 * Arabic text to diff. What can go wrong in our pipeline is a lost, doubled, reordered or misplaced word or ayah,
 * or a glyph its page font cannot draw. So every ayah must appear once, in order, with Tanzil's word count; every
 * 1405 page must open on Tanzil's first ayah for that page; and every v1 glyph must have
 * a visible outline in its page font.
 *
 * Exits 1 and lists each problem when any check fails.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REFERENCE_FILE = path.join(ROOT, "tests/fixtures/tanzil-reference.json");
const TANZIL_META = "https://tanzil.net/res/text/metadata/quran-data.js";
const TANZIL_TEXT =
  "https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true&marks=true&sajdah=true&tatweel=true";

/**
 * Ayahs where Quran.com draws two Tanzil words as one glyph: «بَعْدَ مَا» and «إِلْ يَاسِينَ». The letters are the
 * same; only the word split differs. Value: Quran.com word count.
 */
export const WORD_SPLIT_EXCEPTIONS = { "2:181": 13, "8:6": 11, "13:37": 19, "37:130": 3 };

/**
 * Pages where the 1441 print (v2, used for colored tajweed) opens on a later ayah than the 1405 print, because the
 * 1441 layout moved one or two ayahs back a page. Value: the 1441 page's first ayah.
 */
export const V2_PAGE_START_EXCEPTIONS = {
  121: "5:78", 122: "5:84", 123: "5:91", 532: "55:19", 533: "55:42", 534: "55:70",
  565: "68:17", 568: "69:36", 570: "70:41", 576: "74:19", 584: "79:17",
};

/** Builds the reference from Tanzil's metadata script and Uthmani text, read as text and never run. */
export function buildReference(metaJs, uthmaniTxt) {
  const block = (name) => {
    const start = metaJs.indexOf(`QuranData.${name} = [`);
    if (start < 0) throw new Error(`Tanzil metadata has no QuranData.${name}`);
    return metaJs.slice(start, metaJs.indexOf("];", start));
  };
  const ayahsPerSurah = [...block("Sura").matchAll(/\[\s*\d+,\s*(\d+),/g)].map((m) => Number(m[1]));
  const pageStarts = [...block("Page").matchAll(/\[(\d+),\s*(\d+)\]/g)].map((m) => `${m[1]}:${m[2]}`).slice(0, 604);
  const words = {};
  for (const line of uthmaniTxt.split("\n")) {
    const m = line.match(/^(\d+)\|(\d+)\|(.*)$/);
    if (!m) continue;
    let tokens = m[3].trim().split(/\s+/);
    const [surah, ayah] = [Number(m[1]), Number(m[2])];
    // Tanzil prefixes the bismillah to ayah 1 of every surah except Al-Fatihah (where it is ayah 1) and At-Tawbah.
    if (ayah === 1 && surah !== 1 && surah !== 9) tokens = tokens.slice(4);
    // Waqf, sajdah and hizb marks stand alone between words; count only tokens with letters.
    words[`${surah}:${ayah}`] = tokens.filter((t) => /[ء-يٱ-ۓ]/.test(t)).length;
  }
  if (ayahsPerSurah.length !== 114) throw new Error(`Tanzil metadata lists ${ayahsPerSurah.length} surahs`);
  if (pageStarts.length !== 604) throw new Error(`Tanzil metadata lists ${pageStarts.length} pages`);
  if (Object.keys(words).length !== 6236) throw new Error(`Tanzil text has ${Object.keys(words).length} ayahs`);
  return { source: "Tanzil Project, tanzil.net (CC BY 3.0)", ayahsPerSurah, pageStarts, words };
}

/** Checks one page set (quran-pages.json or quran-pages-v2.json). Returns a list of problems, empty when clean. */
export function checkPages(pages, reference, { pageStartExceptions = {} } = {}) {
  const problems = [];
  const expected = reference.ayahsPerSurah.flatMap((n, i) => Array.from({ length: n }, (_, a) => `${i + 1}:${a + 1}`));
  const glyphs = new Map();
  const firstPage = new Map();
  const seen = [];
  for (let p = 1; p <= 604; p++) {
    const rows = pages[String(p)];
    if (!Array.isArray(rows)) {
      problems.push(`page ${p}: missing`);
      continue;
    }
    for (const row of rows) {
      if (row.t !== "a") continue;
      for (const [key, codes] of row.w) {
        if (!glyphs.has(key)) {
          glyphs.set(key, 0);
          firstPage.set(key, p);
          seen.push(key);
        } else if (seen[seen.length - 1] !== key) {
          problems.push(`${key}: appears again on page ${p} after ${seen[seen.length - 1]}`);
        }
        glyphs.set(key, glyphs.get(key) + codes.length);
      }
    }
  }

  const missing = expected.filter((k) => !glyphs.has(k));
  const extra = seen.filter((k) => !reference.words[k]);
  if (missing.length) problems.push(`missing ayahs: ${missing.join(", ")}`);
  if (extra.length) problems.push(`unknown ayahs: ${extra.join(", ")}`);
  if (!missing.length && !extra.length) {
    const outOfOrder = seen.findIndex((k, i) => k !== expected[i]);
    if (outOfOrder >= 0) problems.push(`ayah order breaks at ${seen[outOfOrder]} (expected ${expected[outOfOrder]})`);
  }

  for (const [key, count] of glyphs) {
    if (!(key in reference.words)) continue;
    // Each ayah ends with one end-of-ayah marker glyph.
    const want = (WORD_SPLIT_EXCEPTIONS[key] ?? reference.words[key]) + 1;
    if (count !== want) problems.push(`${key}: ${count - 1} words, Tanzil has ${want - 1}`);
  }

  for (let p = 1; p <= 604; p++) {
    const want = pageStartExceptions[p] ?? reference.pageStarts[p - 1];
    if (firstPage.get(want) !== p) {
      const opens = pages[String(p)]?.find((r) => r.t === "a" && r.w?.length)?.w[0][0] ?? "nothing";
      problems.push(`page ${p}: opens on ${opens}, expected ${want}`);
    }
  }
  return problems;
}

/**
 * Reads a WOFF2 font's cmap (formats 4 and 12) and the contour count of each glyph, from the transformed glyf
 * table's nContour stream. Returns code point -> contour count (0: blank glyph, -1: composite).
 */
export function woff2Outlines(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0) !== 0x774f4632) throw new Error("not a WOFF2 file");
  const numTables = view.getUint16(12);
  const compressedLength = view.getUint32(20);
  let pos = 48;
  const readBase128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = buffer[pos++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error("bad UIntBase128");
  };
  const KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep"];
  const tables = new Map();
  let offset = 0;
  for (let i = 0; i < numTables; i++) {
    const flags = buffer[pos++];
    let tag;
    if ((flags & 0x3f) === 0x3f) {
      tag = String.fromCharCode(...buffer.subarray(pos, pos + 4));
      pos += 4;
    } else {
      tag = KNOWN_TAGS[flags & 0x3f] ?? `#${flags & 0x3f}`;
    }
    const version = flags >> 6;
    const origLength = readBase128();
    // glyf and loca are transformed when their version is 0; any other table only when its version is non-zero.
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    const length = transformed ? readBase128() : origLength;
    tables.set(tag, { offset, length, transformed });
    offset += length;
  }
  const cmapInfo = tables.get("cmap");
  const glyfInfo = tables.get("glyf");
  if (!cmapInfo || !glyfInfo) throw new Error("font has no cmap or glyf");
  if (!glyfInfo.transformed) throw new Error("glyf table is not transformed; contour counts unavailable");
  const data = zlib.brotliDecompressSync(buffer.subarray(pos, pos + compressedLength));

  const glyf = new DataView(data.buffer, data.byteOffset + glyfInfo.offset, glyfInfo.length);
  const numGlyphs = glyf.getUint16(4);
  const contours = (gid) => (gid < numGlyphs ? glyf.getInt16(36 + gid * 2) : 0);

  const table = new DataView(data.buffer, data.byteOffset + cmapInfo.offset, cmapInfo.length);
  const outlines = new Map();
  const subtables = table.getUint16(2);
  for (let i = 0; i < subtables; i++) {
    const sub = table.getUint32(4 + i * 8 + 4);
    const format = table.getUint16(sub);
    if (format === 4) {
      const segX2 = table.getUint16(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = table.getUint16(ends + s * 2);
        const start = table.getUint16(starts + s * 2);
        const delta = table.getUint16(deltas + s * 2);
        const rangeOffset = table.getUint16(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            glyph = table.getUint16(ranges + s * 2 + rangeOffset + (c - start) * 2);
            if (glyph) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph) outlines.set(c, contours(glyph));
        }
      }
    } else if (format === 12) {
      const groups = table.getUint32(sub + 12);
      for (let g = 0; g < groups; g++) {
        const start = table.getUint32(sub + 16 + g * 12);
        const end = table.getUint32(sub + 20 + g * 12);
        const glyph = table.getUint32(sub + 24 + g * 12);
        for (let c = start; c <= end; c++) if (glyph + (c - start)) outlines.set(c, contours(glyph + (c - start)));
      }
    }
  }
  return outlines;
}

/**
 * Checks that every glyph of every v1 page is drawn by that page's font with a visible outline. A word's code may
 * hold a plain space between two glyphs (a hizb mark and its word, or «إِلْ يَاسِينَ»); spaces are skipped.
 */
export function checkFonts(pages, fontDir) {
  const problems = [];
  for (let p = 1; p <= 604; p++) {
    const file = path.join(fontDir, `p${p}.woff2`);
    if (!fs.existsSync(file)) {
      problems.push(`page ${p}: font ${path.relative(ROOT, file)} missing`);
      continue;
    }
    const outlines = woff2Outlines(fs.readFileSync(file));
    const absent = new Set();
    for (const row of pages[String(p)] ?? []) {
      if (row.t !== "a") continue;
      for (const [, codes] of row.w) {
        for (const code of codes) for (const ch of code) if (ch !== " " && !outlines.get(ch.codePointAt(0))) absent.add(ch);
      }
    }
    if (absent.size) {
      const list = [...absent].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(", ");
      problems.push(`page ${p}: font has no outline for ${list}`);
    }
  }
  return problems;
}

async function download(url) {
  const response = await fetch(url, { headers: { "User-Agent": "kafi-data-build" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function main() {
  if (process.argv.includes("--refresh")) {
    const reference = buildReference(await download(TANZIL_META), await download(TANZIL_TEXT));
    fs.mkdirSync(path.dirname(REFERENCE_FILE), { recursive: true });
    fs.writeFileSync(REFERENCE_FILE, JSON.stringify(reference) + "\n");
    console.log(`wrote ${path.relative(ROOT, REFERENCE_FILE)}`);
  }
  const reference = JSON.parse(fs.readFileSync(REFERENCE_FILE, "utf8"));
  const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const v1 = read("src/data/quran-pages.json");
  const sections = [
    ["Madinah 1405 pages (src/data/quran-pages.json)", checkPages(v1, reference)],
    [
      "Madinah 1441 pages (src/data/quran-pages-v2.json)",
      checkPages(read("src/data/quran-pages-v2.json"), reference, { pageStartExceptions: V2_PAGE_START_EXCEPTIONS }),
    ],
    ["QCF v1 page fonts (public/fonts/qcf-v1)", checkFonts(v1, path.join(ROOT, "public/fonts/qcf-v1"))],
  ];
  let failed = false;
  for (const [title, problems] of sections) {
    console.log(`${problems.length ? "FAIL" : "ok  "} ${title}`);
    for (const p of problems.slice(0, 50)) console.log(`     ${p}`);
    if (problems.length > 50) console.log(`     ...and ${problems.length - 50} more`);
    failed ||= problems.length > 0;
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
