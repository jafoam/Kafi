import type { AyahKey } from "../data/types";
import type { PlatformAdapter } from "../platform/types";
import quranPagesUrl from "../data/quran-pages.json?url";
import { TAJWEED_RULES } from "../data/tajweed-rules";
import quranPagesV2Url from "../data/quran-pages-v2.json?url";

export const REMOTE_QCF_FONT_BASE = "https://verses.quran.com/fonts/quran/hafs/v1/woff2";
/** COLRv1 fonts with the tajweed colors built in; they draw QCF v2 glyph codes (1441 layout). */
export const REMOTE_TAJWEED_FONT_BASE = "https://verses.quran.com/fonts/quran/hafs/v4/colrv1/woff2";

/**
 * `v1`: the 1405 Madinah print in plain QCF v1 fonts (bundled or cached).
 * `tajweed`: the same 1405 pages and lines, each word drawn with its colored glyph from the QCF v4
 * COLRv1 fonts (made for the 1441 print), so switching tajweed on never moves a word to another
 * page or line.
 */
export type GlyphVariant = "v1" | "tajweed";

export interface GlyphWord {
  /** Glyph code point(s) from the page's font. */
  code: string;
  /** The word's QCF v1 code when `code` comes from another font; word translations are keyed by it. */
  v1Code?: string;
  ayah: AyahKey;
  /** 0-based index of this glyph within its ayah (across page breaks). */
  wordIndex?: number;
  /** The font that draws `code` when it is not the page's own font. */
  fontFamily?: string;
}

export interface GlyphLine {
  line: number;
  words: GlyphWord[];
}

/** One numbered row of a mushaf page, in the order the page prints them. */
export type GlyphRow =
  | {
      kind: "text";
      line: number;
      words: GlyphWord[];
      /** A short line printed centered at its natural width, not stretched to the page. */
      centered?: boolean;
    }
  | { kind: "header"; line: number; surah: number }
  | { kind: "bismillah"; line: number };

export interface GlyphPageData {
  page: number;
  fontFamily: string;
  variant?: GlyphVariant;
  /** Every font the page's words use, its own included. */
  fontFamilies?: string[];
  lines: GlyphLine[];
  rows: GlyphRow[];
}

export interface GlyphPageLoader {
  load(page: number): Promise<GlyphPageData>;
  /** Fire-and-forget warm-up; errors are swallowed. */
  prefetch(page: number): void;
  /** Maps every AyahKey to the QCF v1 page number(s) where it is printed. */
  loadAyahPages(): Promise<Map<AyahKey, number[]>>;
}

export function glyphFontFamily(page: number, variant: GlyphVariant = "v1"): string {
  return variant === "tajweed" ? `QCFv4T-p${page}` : `QCFv1-p${page}`;
}

/** Where the page font is served from: scripts/fetch-qcf-fonts.mjs puts them in public/fonts/qcf-v1/. */
export function glyphFontUrl(page: number): string {
  return `${import.meta.env.BASE_URL}fonts/qcf-v1/p${page}.woff2`;
}

interface PageRow {
  l: number;
  t: "s" | "b" | "a";
  n?: number;
  c?: number;
  w?: [string, string[]][];
}

/** Builds a page from the bundled mushaf data. Returns null when the page is missing or malformed. */
export function parsePage(
  page: number,
  raw: unknown,
  priorWordCounts?: ReadonlyMap<AyahKey, number>,
  variant: GlyphVariant = "v1",
): GlyphPageData | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows: GlyphRow[] = [];
  const lines: GlyphLine[] = [];
  const counts = new Map<AyahKey, number>(priorWordCounts);
  for (const row of raw as PageRow[]) {
    if (row.t === "s" && typeof row.n === "number") {
      rows.push({ kind: "header", line: row.l, surah: row.n });
    } else if (row.t === "b") {
      rows.push({ kind: "bismillah", line: row.l });
    } else if (row.t === "a" && Array.isArray(row.w)) {
      const words: GlyphWord[] = row.w.flatMap(([ayah, codes]) => {
        const key = ayah as AyahKey;
        return codes.map((code) => {
          const wordIndex = counts.get(key) ?? 0;
          counts.set(key, wordIndex + 1);
          return { code, ayah: key, wordIndex };
        });
      });
      if (words.length === 0) return null;
      rows.push({ kind: "text", line: row.l, words, centered: row.c === 1 });
      lines.push({ line: row.l, words });
    } else {
      return null;
    }
  }
  if (lines.length === 0) return null;
  return { page, fontFamily: glyphFontFamily(page, variant), variant, lines, rows };
}

/** Builds an AyahKey -> ascending page numbers index directly from bundled QCF page rows. */
export function buildAyahPagesIndex(pages: Record<string, unknown>): Map<AyahKey, number[]> {
  const index = new Map<AyahKey, number[]>();
  const pageNums = Object.keys(pages)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  for (const p of pageNums) {
    const rows = pages[String(p)];
    if (!Array.isArray(rows)) continue;
    for (const row of rows as PageRow[]) {
      if (row.t !== "a" || !Array.isArray(row.w)) continue;
      for (const [ayah] of row.w) {
        const key = ayah as AyahKey;
        const list = index.get(key);
        if (!list) index.set(key, [p]);
        else if (list[list.length - 1] !== p) list.push(p);
      }
    }
  }
  return index;
}

/** Maps every AyahKey to its words' QCF v1 codes, in reading order across pages. */
export function buildAyahCodesIndex(pages: Record<string, unknown>): Map<AyahKey, string[]> {
  const index = new Map<AyahKey, string[]>();
  for (let p = 1; pages[String(p)] !== undefined; p++) {
    const rows = pages[String(p)];
    if (!Array.isArray(rows)) continue;
    for (const row of rows as PageRow[]) {
      if (row.t !== "a" || !Array.isArray(row.w)) continue;
      for (const [ayah, codes] of row.w) {
        const key = ayah as AyahKey;
        const list = index.get(key) ?? [];
        list.push(...codes);
        index.set(key, list);
      }
    }
  }
  return index;
}

/** Maps every AyahKey to each of its words' glyph code and the page whose font draws it. */
export function buildAyahGlyphIndex(
  pages: Record<string, unknown>,
): Map<AyahKey, { page: number; code: string }[]> {
  const index = new Map<AyahKey, { page: number; code: string }[]>();
  for (let p = 1; pages[String(p)] !== undefined; p++) {
    const rows = pages[String(p)];
    if (!Array.isArray(rows)) continue;
    for (const row of rows as PageRow[]) {
      if (row.t !== "a" || !Array.isArray(row.w)) continue;
      for (const [ayah, codes] of row.w) {
        const key = ayah as AyahKey;
        const list = index.get(key) ?? [];
        for (const code of codes) list.push({ page: p, code });
        index.set(key, list);
      }
    }
  }
  return index;
}

/**
 * Redraws a v1 page with the tajweed glyphs: same rows, same words, each word's code swapped for its
 * v4 glyph (found by ayah and word position) and the font of the v4 page that holds it. An ayah whose
 * word count differs between the prints keeps its v1 glyphs.
 */
export function applyTajweedGlyphs(
  data: GlyphPageData,
  glyphs: ReadonlyMap<AyahKey, { page: number; code: string }[]>,
  v1Codes: ReadonlyMap<AyahKey, string[]>,
): GlyphPageData {
  const v1Family = data.fontFamily;
  const counts = new Map<string, number>();
  const words = (list: GlyphWord[]): GlyphWord[] =>
    list.map((word) => {
      const all = glyphs.get(word.ayah);
      const glyph = typeof word.wordIndex === "number" ? all?.[word.wordIndex] : undefined;
      if (!glyph || all?.length !== v1Codes.get(word.ayah)?.length) return { ...word, fontFamily: v1Family };
      const family = glyphFontFamily(glyph.page, "tajweed");
      counts.set(family, (counts.get(family) ?? 0) + 1);
      return { ...word, code: glyph.code, v1Code: word.code, fontFamily: family };
    });
  const rows = data.rows.map((row) => (row.kind === "text" ? { ...row, words: words(row.words) } : row));
  const lines = rows.flatMap((row) => (row.kind === "text" ? [{ line: row.line, words: row.words }] : []));
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? v1Family;
  const families = new Set<string>();
  for (const line of lines) for (const word of line.words) families.add(word.fontFamily ?? main);
  for (const line of lines) {
    for (const word of line.words) if (word.fontFamily === main) delete word.fontFamily;
  }
  return { ...data, variant: "tajweed", fontFamily: main, fontFamilies: [...families], lines, rows };
}

function countPriorWords(pages: Record<string, unknown>, page: number): Map<AyahKey, number> {
  const counts = new Map<AyahKey, number>();
  if (page <= 1) return counts;
  const prevRows = pages[String(page - 1)];
  if (!Array.isArray(prevRows)) return counts;
  for (const row of prevRows as PageRow[]) {
    if (row.t !== "a" || !Array.isArray(row.w)) continue;
    for (const [ayah, codes] of row.w) {
      const key = ayah as AyahKey;
      counts.set(key, (counts.get(key) ?? 0) + codes.length);
    }
  }
  return counts;
}

/**
 * Loads pages from the text bundled with the app and the page fonts served next to it (cached by
 * the service worker), so nothing is requested from Quran.com while reading. The tajweed variant
 * fetches its color fonts from Quran.com once per page and keeps them in the platform cache.
 */
export function createGlyphPageLoader(
  platform?: Pick<PlatformAdapter, "cacheGet" | "cachePut">,
  variant: GlyphVariant = "v1",
): GlyphPageLoader {
  const pending = new Map<number, Promise<GlyphPageData>>();
  let bundledPages: Promise<Record<string, unknown>> | null = null;
  let variantPages: Promise<Record<string, unknown>> | null = null;
  let ayahPagesIndex: Promise<Map<AyahKey, number[]>> | null = null;
  let ayahCodes: Promise<Map<AyahKey, string[]>> | null = null;
  let ayahGlyphs: Promise<Map<AyahKey, { page: number; code: string }[]>> | null = null;

  function fetchJson(url: string): Promise<Record<string, unknown>> {
    return fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} loading mushaf pages`);
      return response.json() as Promise<Record<string, unknown>>;
    });
  }

  function loadBundledPages(): Promise<Record<string, unknown>> {
    bundledPages ??= fetchJson(quranPagesUrl);
    return bundledPages.catch((err) => {
      bundledPages = null;
      throw err;
    });
  }

  function loadVariantPages(): Promise<Record<string, unknown>> {
    if (variant === "v1") return loadBundledPages();
    variantPages ??= fetchJson(quranPagesV2Url);
    return variantPages.catch((err) => {
      variantPages = null;
      throw err;
    });
  }

  function loadAyahCodes(): Promise<Map<AyahKey, string[]>> {
    ayahCodes ??= loadBundledPages().then(buildAyahCodesIndex);
    return ayahCodes.catch((err) => {
      ayahCodes = null;
      throw err;
    });
  }

  function loadAyahGlyphs(): Promise<Map<AyahKey, { page: number; code: string }[]>> {
    ayahGlyphs ??= loadVariantPages().then(buildAyahGlyphIndex);
    return ayahGlyphs.catch((err) => {
      ayahGlyphs = null;
      throw err;
    });
  }

  async function loadData(page: number): Promise<GlyphPageData> {
    const pages = await loadBundledPages();
    const parsed = parsePage(page, pages[String(page)], countPriorWords(pages, page), "v1");
    if (!parsed) throw new Error(`Unusable data for page ${page}`);
    if (variant === "v1") return parsed;
    const [glyphs, codes] = await Promise.all([loadAyahGlyphs(), loadAyahCodes()]);
    return applyTajweedGlyphs(parsed, glyphs, codes);
  }

  async function loadFontFromBytes(family: string, bytes: Uint8Array): Promise<void> {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const face = new FontFace(family, buffer, { display: "block" });
    await face.load();
    document.fonts.add(face);
  }

  async function ensureFont(page: number, fontVariant: GlyphVariant): Promise<void> {
    if (typeof document === "undefined" || typeof FontFace === "undefined") {
      throw new Error("FontFace unavailable");
    }
    const family = glyphFontFamily(page, fontVariant);
    if (hasFont(family)) return;

    const fileName = `p${page}.woff2`;
    const cacheKey = fontVariant === "tajweed" ? `v4t-${fileName}` : fileName;
    if (platform) {
      const cached = await platform.cacheGet("font", cacheKey).catch(() => null);
      if (cached && cached.byteLength > 0) {
        await loadFontFromBytes(family, cached);
        return;
      }
    }

    if (fontVariant === "v1") {
      try {
        const face = new FontFace(family, `url(${glyphFontUrl(page)}) format("woff2")`, {
          display: "block",
        });
        await face.load();
        document.fonts.add(face);
        return;
      } catch {
        // Lightweight mobile APKs omit bundled QCF fonts; fall back to Quran.com CDN and cache on disk.
      }
    }

    const base = fontVariant === "tajweed" ? REMOTE_TAJWEED_FONT_BASE : REMOTE_QCF_FONT_BASE;
    const response = await fetch(`${base}/${fileName}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} loading font ${fileName}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await loadFontFromBytes(family, bytes);
    if (platform) {
      void platform.cachePut("font", cacheKey, bytes).catch(() => undefined);
    }
  }

  function hasFont(family: string): boolean {
    for (const face of document.fonts) {
      if (face.family === family && face.status === "loaded") return true;
    }
    return false;
  }

  function load(page: number): Promise<GlyphPageData> {
    const existing = pending.get(page);
    if (existing) return existing;
    const promise = loadData(page)
      .then(async (data) => {
        const families = data.fontFamilies ?? [data.fontFamily];
        await Promise.all(
          families.map((family) => {
            const match = /^QCFv(1|4T)-p(\d+)$/.exec(family);
            if (!match) return Promise.resolve();
            return ensureFont(Number(match[2]), match[1] === "4T" ? "tajweed" : "v1");
          }),
        );
        for (const family of families) if (family.startsWith("QCFv4T-")) registerTajweedPalette(family);
        return data;
      })
      .catch((err) => {
        pending.delete(page);
        throw err;
      });
    pending.set(page, promise);
    return promise;
  }

  return {
    load,
    prefetch(page: number) {
      void load(page).catch(() => undefined);
    },
    loadAyahPages() {
      // Navigation stays on the v1 page index in every variant, matching the page catalog.
      ayahPagesIndex ??= loadBundledPages()
        .then(buildAyahPagesIndex)
        .catch((err) => {
          ayahPagesIndex = null;
          throw err;
        });
      return ayahPagesIndex;
    },
  };
}

/**
 * The v4 fonts carry Quran.com's saturated tajweed colors (CPAL palette 0 light, 1 dark) and draw each
 * ayah number in a pink and teal ring. The overrides draw every rule in the colors of the tajweed guide
 * (data/tajweed-rules.ts) and the ayah numbers in plain ink: 10, 11 ayah-number rings; 12 ayah-number
 * fill, which must be the page color (the theme's --bg-surface) because a solid ink shape sits under it.
 */
function tajweedOverrides(theme: "light" | "sepia" | "dark"): Record<number, string> {
  const ring = { light: "#555555", sepia: "#5a5248", dark: "#b5b5b5" }[theme];
  const page = { light: "#ffffff", sepia: "#f7f0e2", dark: "#14181b" }[theme];
  const colors: Record<number, string> = { 10: ring, 11: ring, 12: page };
  for (const rule of TAJWEED_RULES) for (const index of rule.cpal) colors[index] = rule.colors[theme];
  return colors;
}

const TAJWEED_PALETTE_OVERRIDES = {
  light: tajweedOverrides("light"),
  sepia: tajweedOverrides("sepia"),
  dark: tajweedOverrides("dark"),
} as const;

/** The 1441 letters without tajweed: every rule color, and the ink itself, in the theme's text color. */
function plainOverrides(theme: "light" | "sepia" | "dark"): Record<number, string> {
  const ink = { light: "#1a2220", sepia: "#2b2318", dark: "#e8ecea" }[theme];
  const colors = tajweedOverrides(theme);
  for (const index of [0, 13, 14]) colors[index] = ink;
  for (const rule of TAJWEED_RULES) for (const index of rule.cpal) colors[index] = ink;
  return colors;
}

const PLAIN_PALETTE_OVERRIDES = {
  light: plainOverrides("light"),
  sepia: plainOverrides("sepia"),
  dark: plainOverrides("dark"),
} as const;

/** `font-palette` values for the tajweed fonts in each theme. */
export const TAJWEED_PALETTES = {
  light: "--kafi-tajweed-light",
  sepia: "--kafi-tajweed-sepia",
  dark: "--kafi-tajweed-dark",
} as const;

/** `font-palette` values for the 1441 letters drawn without tajweed colors. */
export const PLAIN_PALETTES = {
  light: "--kafi-plain-light",
  sepia: "--kafi-plain-sepia",
  dark: "--kafi-plain-dark",
} as const;
const tajweedFamilies = new Set<string>();
let paletteStyle: HTMLStyleElement | null = null;

function paletteRule(name: string, families: string, base: number, colors: Record<number, string>): string {
  const overrides = Object.entries(colors)
    .map(([index, color]) => `${index} ${color}`)
    .join(", ");
  return `@font-palette-values ${name} { font-family: ${families}; base-palette: ${base}; override-colors: ${overrides}; }`;
}

/** Palette rules name their font families, so each loaded tajweed font family joins them. */
function registerTajweedPalette(family: string): void {
  if (typeof document === "undefined" || tajweedFamilies.has(family)) return;
  tajweedFamilies.add(family);
  paletteStyle ??= document.head.appendChild(document.createElement("style"));
  const families = [...tajweedFamilies].map((f) => `"${f}"`).join(", ");
  paletteStyle.textContent = [
    paletteRule(TAJWEED_PALETTES.light, families, 0, TAJWEED_PALETTE_OVERRIDES.light),
    paletteRule(TAJWEED_PALETTES.sepia, families, 0, TAJWEED_PALETTE_OVERRIDES.sepia),
    paletteRule(TAJWEED_PALETTES.dark, families, 1, TAJWEED_PALETTE_OVERRIDES.dark),
    paletteRule(PLAIN_PALETTES.light, families, 0, PLAIN_PALETTE_OVERRIDES.light),
    paletteRule(PLAIN_PALETTES.sepia, families, 0, PLAIN_PALETTE_OVERRIDES.sepia),
    paletteRule(PLAIN_PALETTES.dark, families, 1, PLAIN_PALETTE_OVERRIDES.dark),
  ].join("\n");
}
