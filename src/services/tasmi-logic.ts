import type { EngineEvent, TrackerState, WordRef } from "@tilawa/core";
import type {
  AyahKey,
  Catalog,
  MistakeBadge,
  PageEntry,
  ReciterInfo,
  SurahInfo,
  TasmiMistakeRecord,
} from "../data/types";
import type { PlatformAdapter } from "../platform/types";
import { prevAyah } from "./audio-controller";
import { audioCacheKey, type QuranApi } from "./quran-api";

export interface DeclaredPassage {
  surah: number;
  fromAyah: number;
  toAyah: number;
}

export type RandomPool =
  | { kind: "juz"; fromJuz: number; toJuz: number }
  | { kind: "surah"; fromSurah: number; toSurah: number; fromAyah?: number; toAyah?: number };

export interface RandomChallenge {
  promptAyah: AyahKey;
  /** Blurred continuation passage immediately after `promptAyah`, checked by Tasmi'. */
  passage: DeclaredPassage;
}

export interface PromptAudioMatch {
  url: string;
  reciter: ReciterInfo;
  fromCache: boolean;
}

export interface TasmiPassageOption {
  id: string;
  surah: number;
  surahName: string;
  arabicName: string;
  fromAyah: number;
  toAyah: number;
  scopeLabel: string;
}

export interface TasmiLiveState {
  mode: "free" | "memorization";
  passage: DeclaredPassage | null;
  trackerState: TrackerState;
  activeWord: WordRef | null;
  activeAyah: AyahKey | null;
  expectedWord: WordRef | null;
  revealedAyahs: Set<AyahKey>;
  recitedWords: Set<string>;
  mistakesById: Map<string, TasmiMistakeRecord>;
  confirmedMistakes: TasmiMistakeRecord[];
  lastErrorAt: number | null;
}

export const ERROR_CLASS_LABELS: Record<string, string> = {
  wrong_word: "Kata salah",
  omitted_word: "Kata terlewat",
  added_word: "Kata berlebih",
  skipped_passage: "Ayat terloncat",
  peeked: "Mengintip ayat",
};

export function formatErrorClass(errorClass: string): string {
  return ERROR_CLASS_LABELS[errorClass] ?? errorClass;
}

export function buildPageTasmiCandidates(
  pages: PageEntry[],
  surahs: SurahInfo[],
  glyphAyahs?: Record<number, AyahKey[]>,
): TasmiPassageOption[] {
  const surahByNum = new Map<number, SurahInfo>();
  for (const s of surahs) surahByNum.set(s.number, s);

  const options: TasmiPassageOption[] = [];
  const spreadRanges = new Map<
    number,
    { pages: Set<number>; fromAyah: number; toAyah: number }
  >();

  for (const page of pages) {
    const perPageRanges = new Map<number, { fromAyah: number; toAyah: number }>();
    const printed = glyphAyahs?.[page.page];

    if (printed && printed.length > 0) {
      for (const key of printed) {
        const [sStr, aStr] = key.split(":");
        const surah = Number(sStr);
        const ayah = Number(aStr);
        if (!Number.isFinite(surah) || !Number.isFinite(ayah)) continue;
        const existing = perPageRanges.get(surah);
        if (existing) {
          existing.fromAyah = Math.min(existing.fromAyah, ayah);
          existing.toAyah = Math.max(existing.toAyah, ayah);
        } else {
          perPageRanges.set(surah, { fromAyah: ayah, toAyah: ayah });
        }
      }
    } else {
      for (const seg of page.ayahs) {
        const key: AyahKey = `${seg.surah}:${seg.ayah}`;
        if (page.leadingSplitAyah === key) continue;

        const existing = perPageRanges.get(seg.surah);
        if (existing) {
          existing.fromAyah = Math.min(existing.fromAyah, seg.ayah);
          existing.toAyah = Math.max(existing.toAyah, seg.ayah);
        } else {
          perPageRanges.set(seg.surah, { fromAyah: seg.ayah, toAyah: seg.ayah });
        }
      }
    }

    for (const [surahNum, range] of perPageRanges) {
      const info = surahByNum.get(surahNum);
      options.push({
        id: `p${page.page}-s${surahNum}`,
        surah: surahNum,
        surahName: info?.name ?? `Surah ${surahNum}`,
        arabicName: info?.arabicName ?? "",
        fromAyah: range.fromAyah,
        toAyah: range.toAyah,
        scopeLabel: `Hal. ${page.page} (${range.fromAyah}–${range.toAyah})`,
      });

      const spread = spreadRanges.get(surahNum);
      if (spread) {
        spread.pages.add(page.page);
        spread.fromAyah = Math.min(spread.fromAyah, range.fromAyah);
        spread.toAyah = Math.max(spread.toAyah, range.toAyah);
      } else {
        spreadRanges.set(surahNum, {
          pages: new Set([page.page]),
          fromAyah: range.fromAyah,
          toAyah: range.toAyah,
        });
      }
    }
  }

  if (pages.length >= 2) {
    const firstPage = pages[0].page;
    const lastPage = pages[pages.length - 1].page;
    for (const [surahNum, spread] of spreadRanges) {
      if (spread.pages.size < 2) continue;
      const info = surahByNum.get(surahNum);
      options.unshift({
        id: `spread-${firstPage}-${lastPage}-s${surahNum}`,
        surah: surahNum,
        surahName: info?.name ?? `Surah ${surahNum}`,
        arabicName: info?.arabicName ?? "",
        fromAyah: spread.fromAyah,
        toAyah: spread.toAyah,
        scopeLabel: `2 Halaman · Hal. ${firstPage}–${lastPage} (${spread.fromAyah}–${spread.toAyah})`,
      });
    }
  }

  // Prioritize surahs that start on the visible page(s) over the trailing tail of a previous surah.
  options.sort((a, b) => Number(b.fromAyah === 1) - Number(a.fromAyah === 1));

  return options;
}

export function createTasmiState(
  mode: "free" | "memorization",
  passage: DeclaredPassage | null,
): TasmiLiveState {
  return {
    mode,
    passage,
    trackerState: "acquiring",
    activeWord: null,
    activeAyah: null,
    expectedWord: null,
    revealedAyahs: new Set<AyahKey>(),
    recitedWords: new Set<string>(),
    mistakesById: new Map<string, TasmiMistakeRecord>(),
    confirmedMistakes: [],
    lastErrorAt: null,
  };
}

export function countRecitedAyahs(state: TasmiLiveState): number {
  const uniqueAyahs = new Set<AyahKey>();
  for (const wKey of state.recitedWords) {
    const [sStr, aStr] = wKey.split(":");
    const s = Number(sStr);
    const a = Number(aStr);
    if (
      !state.passage ||
      (s === state.passage.surah && a >= state.passage.fromAyah && a <= state.passage.toAyah)
    ) {
      uniqueAyahs.add(`${s}:${a}`);
    }
  }
  return uniqueAyahs.size;
}

function compareAyah(a: AyahKey, b: AyahKey): number {
  const [sa, aa] = a.split(":").map(Number);
  const [sb, ab] = b.split(":").map(Number);
  return sa - sb || aa - ab;
}

/** Records a mistake when the user taps a blurred ayah to peek without reciting it. */
export function recordPeekMistake(state: TasmiLiveState, ayah: AyahKey): TasmiLiveState {
  const id = `peek-${ayah}`;
  if (state.mistakesById.has(id)) return state;
  const [surah, ayahNum] = ayah.split(":").map(Number);
  const nextMap = new Map(state.mistakesById);
  nextMap.set(id, {
    id,
    errorClass: "peeked",
    surah,
    ayah: ayahNum,
  });
  // Once an ayah has been opened it stays open for the rest of the session.
  const nextRevealed = new Set(state.revealedAyahs);
  nextRevealed.add(ayah);
  return {
    ...state,
    revealedAyahs: nextRevealed,
    mistakesById: nextMap,
    confirmedMistakes: Array.from(nextMap.values()),
  };
}

export function reduceTilawaEvent(
  state: TasmiLiveState,
  event: EngineEvent,
  getAyahWords: (surah: number, ayah: number) => string[],
): TasmiLiveState {
  if (event.type === "capabilities") {
    return state;
  }

  if (event.type === "position") {
    const top = event.observed[0];
    let activeWord = state.activeWord;
    let activeAyah = state.activeAyah;
    let revealedAyahs = state.revealedAyahs;
    let recitedWords = state.recitedWords;

    if (top && event.state === "locked") {
      const prevAyah = state.activeAyah;
      activeWord = top.word;
      activeAyah = `${top.word.surah}:${top.word.ayah}`;

      const { start, end } = top.span;
      const nextWords = new Set(state.recitedWords);
      nextWords.add(`${top.word.surah}:${top.word.ayah}:${top.word.word}`);
      nextWords.add(`${start.surah}:${start.ayah}:${start.word}`);
      nextWords.add(`${end.surah}:${end.ayah}:${end.word}`);
      if (start.surah === end.surah && start.ayah === end.ayah && end.word >= start.word) {
        for (let w = start.word; w <= end.word; w += 1) {
          nextWords.add(`${start.surah}:${start.ayah}:${w}`);
        }
      }
      recitedWords = nextWords;

      // An ayah opens once it has been recited to its end (or left for the next one), and stays open.
      const nextRevealed = new Set(state.revealedAyahs);
      if (prevAyah && prevAyah !== activeAyah && compareAyah(prevAyah, activeAyah) < 0) {
        nextRevealed.add(prevAyah);
      }
      const wordsInActive = getAyahWords(top.word.surah, top.word.ayah);
      if (wordsInActive.length > 0 && top.word.word >= wordsInActive.length) {
        nextRevealed.add(activeAyah);
      }
      revealedAyahs = nextRevealed;
    }

    return {
      ...state,
      trackerState: event.state,
      activeWord,
      activeAyah,
      expectedWord: event.expected,
      revealedAyahs,
      recitedWords,
    };
  }

  // event.type === "checker"
  const nextMap = new Map(state.mistakesById);
  let nextRevealed = state.revealedAyahs;
  let lastErrorAt = state.lastErrorAt;

  if (event.state === "confirmed") {
    const words = getAyahWords(event.location.surah, event.location.ayah);
    const wordText = words[event.location.word - 1] ?? event.expected;
    nextMap.set(event.id, {
      id: event.id,
      errorClass: event.errorClass,
      surah: event.location.surah,
      ayah: event.location.ayah,
      word: event.location.word,
      wordText,
      confidence: event.confidence,
    });
    // A mistake opens its ayah so the correct text shows, and it stays open for the session.
    const flaggedAyah: AyahKey = `${event.location.surah}:${event.location.ayah}`;
    if (!nextRevealed.has(flaggedAyah)) {
      nextRevealed = new Set(nextRevealed);
      nextRevealed.add(flaggedAyah);
    }
    lastErrorAt = event.timeMs;
  } else if (event.state === "uncertain") {
    nextMap.delete(event.id);
  }

  return {
    ...state,
    revealedAyahs: nextRevealed,
    mistakesById: nextMap,
    confirmedMistakes: Array.from(nextMap.values()),
    lastErrorAt,
  };
}

export function computeBlurMask(
  pageEntry: PageEntry,
  mode: "off" | "all" | "tasmi",
  passage: DeclaredPassage | null,
  revealedAyahs: Set<AyahKey>,
  peekedAyah: AyahKey | null,
  /**
   * Ayahs the printed page actually shows when that differs from the scanned-image map (the glyph
   * layout moves a few ayahs across a page break); masked by the same rules as the mapped ones.
   */
  extraAyahs: readonly AyahKey[] = [],
): Set<AyahKey> {
  const masked = new Set<AyahKey>();
  if (mode === "off") return masked;

  const segs = [...pageEntry.ayahs];
  const mapped = new Set(segs.map((seg) => `${seg.surah}:${seg.ayah}`));
  for (const key of extraAyahs) {
    if (mapped.has(key)) continue;
    const [surah, ayah] = key.split(":").map(Number);
    segs.push({ surah, ayah, boxes: [] });
  }

  for (const seg of segs) {
    const key: AyahKey = `${seg.surah}:${seg.ayah}`;
    if (pageEntry.leadingSplitAyah === key) continue;
    if (revealedAyahs.has(key) || peekedAyah === key) continue;

    if (mode === "all") {
      masked.add(key);
    } else if (
      mode === "tasmi" &&
      passage &&
      seg.surah === passage.surah &&
      seg.ayah >= passage.fromAyah &&
      seg.ayah <= passage.toAyah
    ) {
      masked.add(key);
    }
  }

  return masked;
}

export function buildMistakeBadges(
  mistakes: TasmiMistakeRecord[],
): Map<AyahKey, MistakeBadge> {
  const map = new Map<AyahKey, MistakeBadge>();
  for (const m of mistakes) {
    const key: AyahKey = `${m.surah}:${m.ayah}`;
    const prev = map.get(key);
    if (prev) {
      prev.count += 1;
      if (!prev.wordText && m.wordText) prev.wordText = m.wordText;
    } else {
      map.set(key, {
        errorClass: formatErrorClass(m.errorClass),
        count: 1,
        wordText: m.wordText,
      });
    }
  }
  return map;
}

/** Expands a Juz or Surah random-quiz range into per-surah ayah segments in reading order. */
export function expandRandomPool(
  pool: RandomPool,
  catalog: Pick<Catalog, "surahs" | "juzs">,
): DeclaredPassage[] {
  const surahByNum = new Map<number, SurahInfo>();
  for (const s of catalog.surahs) surahByNum.set(s.number, s);

  if (pool.kind === "juz") {
    const juzs = [...catalog.juzs].sort((a, b) => a.number - b.number);
    if (juzs.length === 0) return [];
    const low = Math.max(1, Math.min(juzs.length, Math.min(pool.fromJuz, pool.toJuz)));
    const high = Math.max(low, Math.min(juzs.length, Math.max(pool.fromJuz, pool.toJuz)));

    const startJuz = juzs[low - 1];
    const afterEndJuz = juzs[high];
    const lastSurah = catalog.surahs[catalog.surahs.length - 1];
    const endPos = afterEndJuz
      ? prevAyah(afterEndJuz.startSurah, afterEndJuz.startAyah, catalog.surahs)
      : lastSurah
        ? { surah: lastSurah.number, ayah: lastSurah.ayahs }
        : null;
    if (!startJuz || !endPos) return [];

    const segments: DeclaredPassage[] = [];
    for (let s = startJuz.startSurah; s <= endPos.surah; s += 1) {
      const info = surahByNum.get(s);
      if (!info) continue;
      const fromAyah = s === startJuz.startSurah ? startJuz.startAyah : 1;
      const toAyah = s === endPos.surah ? endPos.ayah : info.ayahs;
      if (fromAyah <= toAyah) {
        segments.push({ surah: s, fromAyah, toAyah });
      }
    }
    return segments;
  }

  const maxSurah = catalog.surahs.length || 114;
  const low = Math.max(1, Math.min(maxSurah, Math.min(pool.fromSurah, pool.toSurah)));
  const high = Math.max(low, Math.min(maxSurah, Math.max(pool.fromSurah, pool.toSurah)));

  if (low === high) {
    const info = surahByNum.get(low);
    if (!info) return [];
    const rawFrom = pool.fromAyah ?? 1;
    const rawTo = pool.toAyah ?? info.ayahs;
    const fromAyah = Math.max(1, Math.min(info.ayahs, Math.min(rawFrom, rawTo)));
    const toAyah = Math.max(fromAyah, Math.min(info.ayahs, Math.max(rawFrom, rawTo)));
    return [{ surah: low, fromAyah, toAyah }];
  }

  const segments: DeclaredPassage[] = [];
  for (let s = low; s <= high; s += 1) {
    const info = surahByNum.get(s);
    if (info) segments.push({ surah: s, fromAyah: 1, toAyah: info.ayahs });
  }
  return segments;
}

/**
 * Picks one prompt ayah uniformly from `pool`, pairing it with the next `continuationAyahs`
 * (default 3) in the same surah as the blurred passage for Tasmi' to check.
 */
export function pickRandomChallenge(
  pool: RandomPool,
  catalog: Pick<Catalog, "surahs" | "juzs">,
  options?: {
    continuationAyahs?: number;
    excludePrompt?: AyahKey | null;
    rng?: () => number;
  },
): RandomChallenge | null {
  const segments = expandRandomPool(pool, catalog);
  if (segments.length === 0) return null;

  const continuation = Math.max(1, options?.continuationAyahs ?? 3);
  const rng = options?.rng ?? Math.random;

  const candidates: Array<{ surah: number; prompt: number; segEnd: number }> = [];
  for (const seg of segments) {
    for (let a = seg.fromAyah; a < seg.toAyah; a += 1) {
      candidates.push({ surah: seg.surah, prompt: a, segEnd: seg.toAyah });
    }
  }

  if (candidates.length === 0) {
    const only = segments[0];
    return {
      promptAyah: `${only.surah}:${only.fromAyah}`,
      passage: { surah: only.surah, fromAyah: only.fromAyah, toAyah: only.toAyah },
    };
  }

  const filtered =
    options?.excludePrompt && candidates.length > 1
      ? candidates.filter((c) => `${c.surah}:${c.prompt}` !== options.excludePrompt)
      : candidates;
  const pickList = filtered.length > 0 ? filtered : candidates;
  const idx = Math.min(pickList.length - 1, Math.floor(rng() * pickList.length));
  const chosen = pickList[idx];

  return {
    promptAyah: `${chosen.surah}:${chosen.prompt}`,
    passage: {
      surah: chosen.surah,
      fromAyah: chosen.prompt + 1,
      toAyah: Math.min(chosen.segEnd, chosen.prompt + continuation),
    },
  };
}

/**
 * Resolves audio for a random-quiz prompt ayah: prefers the selected reciter (immediately if
 * cached offline, or online if available) and falls back to any other reciter cached offline.
 */
export async function resolvePromptAudio(
  surah: number,
  ayah: number,
  preferredReciterId: string,
  reciters: readonly ReciterInfo[],
  platform: Pick<PlatformAdapter, "cacheHas">,
  quranApi: Pick<QuranApi, "getAudioBlobUrl">,
  options?: { signal?: AbortSignal; isOffline?: boolean },
): Promise<PromptAudioMatch | null> {
  if (reciters.length === 0) return null;
  const signal = options?.signal;
  const preferred = reciters.find((r) => r.id === preferredReciterId) ?? reciters[0];
  const others = reciters.filter((r) => r.id !== preferred.id);

  const findCachedOther = async (): Promise<PromptAudioMatch | null> => {
    for (const reciter of others) {
      if (signal?.aborted) return null;
      const cached = await platform.cacheHas("audio", audioCacheKey(reciter.subfolder, surah, ayah));
      if (cached) {
        const { url, fromCache } = await quranApi.getAudioBlobUrl(
          reciter.subfolder,
          surah,
          ayah,
          signal,
        );
        return { url, reciter, fromCache };
      }
    }
    return null;
  };

  if (await platform.cacheHas("audio", audioCacheKey(preferred.subfolder, surah, ayah))) {
    if (signal?.aborted) return null;
    const { url, fromCache } = await quranApi.getAudioBlobUrl(
      preferred.subfolder,
      surah,
      ayah,
      signal,
    );
    return { url, reciter: preferred, fromCache };
  }

  const isOffline =
    options?.isOffline ?? (typeof navigator !== "undefined" && navigator.onLine === false);
  if (isOffline) {
    return findCachedOther();
  }

  try {
    const { url, fromCache } = await quranApi.getAudioBlobUrl(
      preferred.subfolder,
      surah,
      ayah,
      signal,
    );
    return { url, reciter: preferred, fromCache };
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      return null;
    }
    return findCachedOther();
  }
}
