import type { AppLanguage } from "../data/types";
import wordsIdUrl from "../data/word-translations.json?url";
import wordsEnUrl from "../data/word-translations-en.json?url";

export interface WordInfo {
  /** Word-by-word gloss in the active language. */
  translation: string;
  transliteration: string;
  position: number;
}

export interface SelectedWord {
  key: string;
  translation: string;
  transliteration: string;
}

export type PageWords = Map<string, WordInfo>;

interface ApiWord {
  position: number;
  char_type_name: string;
  code_v1?: string;
  translation?: { text?: string };
  transliteration?: { text?: string | null };
}

export function parsePageWords(raw: unknown): PageWords {
  const out: PageWords = new Map();
  const verses = (raw as { verses?: { words?: ApiWord[] }[] } | null)?.verses;
  if (!Array.isArray(verses)) return out;
  for (const verse of verses) {
    for (const w of verse.words ?? []) {
      if (w.char_type_name !== "word" || !w.code_v1) continue;
      out.set(w.code_v1, {
        translation: w.translation?.text ?? "",
        transliteration: w.transliteration?.text ?? "",
        position: w.position,
      });
    }
  }
  return out;
}

export interface WordTranslationLoader {
  load(page: number, lang?: AppLanguage): Promise<PageWords>;
}

const BUNDLED_URLS: Record<AppLanguage, string> = {
  id: wordsIdUrl,
  en: wordsEnUrl,
};

/** Fetches word-by-word glosses per mushaf page (QCF v1 codes) and keeps them in memory. */
export function createWordTranslationLoader(
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): WordTranslationLoader {
  const cache = new Map<string, Promise<PageWords>>();
  const bundled: Partial<Record<AppLanguage, Promise<Record<string, Record<string, [string, string]>> | null>>> = {};
  const loadBundled = (lang: AppLanguage) =>
    (bundled[lang] ??= fetch(BUNDLED_URLS[lang])
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null));
  return {
    load(page, lang: AppLanguage = "id") {
      const key = `${lang}:${page}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const p = loadBundled(lang).then((all): PageWords | Promise<PageWords> => {
        const entry: Record<string, [string, string]> | undefined = all?.[String(page)];
        if (!entry) return fetchPage(page, lang, key);
        const out: PageWords = new Map();
        for (const [code, [translation, transliteration]] of Object.entries(entry)) {
          out.set(code, { translation, transliteration, position: 0 });
        }
        return out;
      });
      cache.set(key, p);
      return p;
    },
  };

  function fetchPage(page: number, lang: AppLanguage, cacheKey: string): Promise<PageWords> {
    const url = `https://api.quran.com/api/v4/verses/by_page/${page}?words=true&language=${lang}&word_fields=code_v1,transliteration&per_page=50&mushaf=2`;
    return fetcher(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching word translations`);
        return res.json();
      })
      .then(parsePageWords)
      .catch((err) => {
        cache.delete(cacheKey);
        throw err;
      });
  }
}
