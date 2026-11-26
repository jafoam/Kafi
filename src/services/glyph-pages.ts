import type { AyahKey } from "../data/types";
import quranPagesUrl from "../data/quran-pages.json?url";

export interface GlyphWord {
  /** Glyph code point(s) from the page's QCF v1 font. */
  code: string;
  ayah: AyahKey;
  /** 0-based index of this glyph within its ayah (across page breaks). */
  wordIndex?: number;
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

export function glyphFontFamily(page: number): string {
  return `QCFv1-p${page}`;
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
  return { page, fontFamily: glyphFontFamily(page), lines, rows };
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
 * the service worker), so nothing is requested from Quran.com while reading.
 */
export function createGlyphPageLoader(): GlyphPageLoader {
  const pending = new Map<number, Promise<GlyphPageData>>();
  let bundledPages: Promise<Record<string, unknown>> | null = null;
  let ayahPagesIndex: Promise<Map<AyahKey, number[]>> | null = null;

  function loadBundledPages(): Promise<Record<string, unknown>> {
    bundledPages ??= fetch(quranPagesUrl).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} loading mushaf pages`);
      return response.json() as Promise<Record<string, unknown>>;
    });
    return bundledPages.catch((err) => {
      bundledPages = null;
      throw err;
    });
  }

  async function loadData(page: number): Promise<GlyphPageData> {
    const pages = await loadBundledPages();
    const parsed = parsePage(page, pages[String(page)], countPriorWords(pages, page));
    if (!parsed) throw new Error(`Unusable data for page ${page}`);
    return parsed;
  }

  async function ensureFont(page: number): Promise<void> {
    if (typeof document === "undefined" || typeof FontFace === "undefined") {
      throw new Error("FontFace unavailable");
    }
    const family = glyphFontFamily(page);
    if (hasFont(family)) return;
    const face = new FontFace(family, `url(${glyphFontUrl(page)}) format("woff2")`, {
      display: "block",
    });
    await face.load();
    document.fonts.add(face);
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
    const promise = Promise.all([loadData(page), ensureFont(page)])
      .then(([data]) => data)
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
