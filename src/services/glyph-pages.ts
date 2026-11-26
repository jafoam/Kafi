import type { PlatformAdapter } from "../platform/types";
import type { AyahKey } from "../data/types";

export interface GlyphWord {
  /** Glyph code point(s) from the QPC v2 page font. */
  code: string;
  ayah: AyahKey;
  /** True for the ayah-number marker glyph. */
  isEnd: boolean;
}

export interface GlyphLine {
  line: number;
  words: GlyphWord[];
}

export interface GlyphPageData {
  page: number;
  fontFamily: string;
  lines: GlyphLine[];
}

export interface GlyphPageLoader {
  load(page: number): Promise<GlyphPageData>;
  /** Fire-and-forget warm-up; errors are swallowed. */
  prefetch(page: number): void;
}

const API_BASE = "https://api.quran.com/api/v4";
const FONT_BASE = "https://verses.quran.com/fonts/quran/hafs/v2/woff2";
const DATA_BUCKET = "glyph-data";
const FONT_BUCKET = "glyph-font";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function glyphFontFamily(page: number): string {
  return `QPCv2-p${page}`;
}

export function glyphPageUrl(page: number): string {
  return `${API_BASE}/verses/by_page/${page}?words=true&word_fields=code_v2,line_number&fields=verse_key&per_page=300`;
}

export function glyphFontUrl(page: number): string {
  return `${FONT_BASE}/p${page}.woff2`;
}

interface ApiWord {
  code_v2?: string;
  line_number?: number;
  char_type_name?: string;
}

interface ApiVerse {
  verse_key?: string;
  words?: ApiWord[];
}

/** Groups API words into numbered mushaf lines. Returns null when the payload is unusable. */
export function parseGlyphPage(page: number, payload: unknown): GlyphPageData | null {
  const verses = (payload as { verses?: ApiVerse[] } | null)?.verses;
  if (!Array.isArray(verses) || verses.length === 0) return null;

  const byLine = new Map<number, GlyphWord[]>();
  for (const verse of verses) {
    if (!verse.verse_key || !Array.isArray(verse.words)) continue;
    for (const word of verse.words) {
      if (!word.code_v2 || typeof word.line_number !== "number") continue;
      const list = byLine.get(word.line_number) ?? [];
      list.push({
        code: word.code_v2,
        ayah: verse.verse_key as AyahKey,
        isEnd: word.char_type_name === "end",
      });
      byLine.set(word.line_number, list);
    }
  }
  if (byLine.size === 0) return null;

  const lines = [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, words]) => ({ line, words }));
  return { page, fontFamily: glyphFontFamily(page), lines };
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function createGlyphPageLoader(platform: PlatformAdapter): GlyphPageLoader {
  const pending = new Map<number, Promise<GlyphPageData>>();

  async function loadData(page: number): Promise<GlyphPageData> {
    const key = String(page);
    const cached = await platform.cacheGet(DATA_BUCKET, key).catch(() => null);
    if (cached) {
      try {
        const parsed = parseGlyphPage(page, JSON.parse(decoder.decode(cached)));
        if (parsed) return parsed;
      } catch {
        // fall through to network
      }
    }
    const response = await fetch(glyphPageUrl(page));
    if (!response.ok) throw new Error(`HTTP ${response.status} loading page ${page}`);
    const payload: unknown = await response.json();
    const parsed = parseGlyphPage(page, payload);
    if (!parsed) throw new Error(`Unusable glyph data for page ${page}`);
    await platform
      .cachePut(DATA_BUCKET, key, encoder.encode(JSON.stringify(payload)))
      .catch(() => undefined);
    return parsed;
  }

  async function ensureFont(page: number): Promise<void> {
    const family = glyphFontFamily(page);
    if (typeof document === "undefined" || typeof FontFace === "undefined") {
      throw new Error("FontFace unavailable");
    }
    if (hasFont(family)) return;

    const key = String(page);
    let bytes = await platform.cacheGet(FONT_BUCKET, key).catch(() => null);
    if (!bytes) {
      bytes = await fetchBytes(glyphFontUrl(page));
      await platform.cachePut(FONT_BUCKET, key, bytes).catch(() => undefined);
    }
    const face = new FontFace(family, bytes.slice().buffer, { display: "block" });
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
  };
}
