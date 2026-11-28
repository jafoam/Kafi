import type { SurahInfo } from "../data/types";
import { SURAH_MEANINGS_EN, SURAH_NAMES_EN } from "../data/surah-names";

export interface RefV2CompactAyah {
  s: number;
  a: number;
  w: string[];
  p?: string;
  o?: number[];
  iso?: string[];
}

export interface RefV2VerboseAyah {
  surah: number;
  ayah: number;
  words: string[];
}

export type RefV2Ayah = RefV2CompactAyah | RefV2VerboseAyah;

export interface RefV2Data {
  version?: string;
  ayahs: RefV2Ayah[];
}

export type SearchHit =
  | {
      type: "surah";
      surah: number;
      name: string;
      arabicName: string;
      page: number;
    }
  | {
      type: "ayah";
      surah: number;
      ayah: number;
      text: string;
      surahName: string;
    };

export interface QuranSearch {
  search(query: string, limit?: number): SearchHit[];
  getAyahWords(surah: number, ayah: number): string[];
}

const ARABIC_DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ALEF_VARIANTS_RE = /[أإآٱ]/g;

export function normalizeArabic(text: string): string {
  return text
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(ALEF_VARIANTS_RE, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArabicWithDaggerAlef(text: string): string {
  // Expand Uthmani superscript alef (e.g. ٱلْعَـٰلَمِينَ -> العالمين) except after ى (e.g. عَلَىٰ)
  const expanded = text.replace(/(?<!ى)\u0640?\u0670/g, "ا");
  return normalizeArabic(expanded);
}

/** Latin surah name folded for matching: "Al-Baqarah", "al baqarah" and "albaqarah" are equal. */
function foldLatin(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when `query` names the surah in its Indonesian, English transliteration, or English meaning. */
export function matchesSurahName(info: SurahInfo, query: string): boolean {
  const q = foldLatin(query);
  if (!q) return false;
  const enName = SURAH_NAMES_EN[info.number];
  const enMeaning = SURAH_MEANINGS_EN[info.number];
  return (
    foldLatin(info.name).includes(q) ||
    (info.nameAlt ? foldLatin(info.nameAlt).includes(q) : false) ||
    (enName ? foldLatin(enName).includes(q) : false) ||
    (enMeaning ? foldLatin(enMeaning).includes(q) : false)
  );
}

export function createQuranSearch(
  refData: RefV2Data,
  surahs: SurahInfo[],
): QuranSearch {
  const surahByNumber = new Map<number, SurahInfo>();
  const surahEntries = surahs.map((info) => {
    surahByNumber.set(info.number, info);
    return {
      info,
      nameLower: info.name.toLowerCase(),
      arabicNorm: normalizeArabic(info.arabicName),
    };
  });

  const wordsByKey = new Map<string, string[]>();
  const ayahEntries = refData.ayahs.map((entry) => {
    const surah = "s" in entry ? entry.s : entry.surah;
    const ayah = "a" in entry ? entry.a : entry.ayah;
    const words = "w" in entry ? entry.w : entry.words;
    const text = words.join(" ");
    wordsByKey.set(`${surah}:${ayah}`, words);
    return {
      surah,
      ayah,
      text,
      norm: normalizeArabic(text),
      normExpanded: normalizeArabicWithDaggerAlef(text),
    };
  });

  function search(query: string, limit = 30): SearchHit[] {
    const trimmed = query.trim();
    if (!trimmed || limit <= 0) return [];

    const qLower = trimmed.toLowerCase();
    const qArabic = normalizeArabic(trimmed);
    const hits: SearchHit[] = [];

    for (const s of surahEntries) {
      if (hits.length >= limit) return hits;
      const matchesLatin = s.nameLower.includes(qLower) || matchesSurahName(s.info, trimmed);
      const matchesArabic = qArabic.length > 0 && s.arabicNorm.includes(qArabic);
      const matchesNum = String(s.info.number) === trimmed;
      if (matchesLatin || matchesArabic || matchesNum) {
        hits.push({
          type: "surah",
          surah: s.info.number,
          name: s.info.name,
          arabicName: s.info.arabicName,
          page: s.info.page,
        });
      }
    }

    if (qArabic.length > 0) {
      for (const a of ayahEntries) {
        if (hits.length >= limit) break;
        if (a.norm.includes(qArabic) || a.normExpanded.includes(qArabic)) {
          hits.push({
            type: "ayah",
            surah: a.surah,
            ayah: a.ayah,
            text: a.text,
            surahName: surahByNumber.get(a.surah)?.name ?? `Surah ${a.surah}`,
          });
        }
      }
    }

    return hits;
  }

  function getAyahWords(surah: number, ayah: number): string[] {
    return wordsByKey.get(`${surah}:${ayah}`) ?? [];
  }

  return { search, getAyahWords };
}
