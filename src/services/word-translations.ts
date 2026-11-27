import wordsUrl from "../data/word-translations.json?url";

export interface WordInfo {
  /** Indonesian gloss of the word. */
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
  load(page: number): Promise<PageWords>;
}

/** Fetches word-by-word glosses per mushaf page (QCF v1 codes) and keeps them in memory. */
export function createWordTranslationLoader(
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): WordTranslationLoader {
  const cache = new Map<number, Promise<PageWords>>();
  let bundled: Promise<Record<string, Record<string, [string, string]>> | null> | null = null;
  const loadBundled = () =>
    (bundled ??= fetch(wordsUrl)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null));
  return {
    load(page) {
      const hit = cache.get(page);
      if (hit) return hit;
      const p = loadBundled().then((all): PageWords | Promise<PageWords> => {
        const entry: Record<string, [string, string]> | undefined = all?.[String(page)];
        if (!entry) return fetchPage(page);
        const out: PageWords = new Map();
        for (const [code, [translation, transliteration]] of Object.entries(entry)) {
          out.set(code, { translation, transliteration, position: 0 });
        }
        return out;
      });
      cache.set(page, p);
      return p;
    },
  };

  function fetchPage(page: number): Promise<PageWords> {
    const url = `https://api.quran.com/api/v4/verses/by_page/${page}?words=true&language=id&word_fields=code_v1,transliteration&per_page=50&mushaf=2`;
    return fetcher(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching word translations`);
        return res.json();
      })
      .then(parsePageWords)
      .catch((err) => {
        cache.delete(page);
        throw err;
      });
  }
}
