import type { EngineEvent, TrackerState, WordRef } from "@tilawa/core";
import type {
  AyahKey,
  MistakeBadge,
  PageEntry,
  SurahInfo,
  TasmiMistakeRecord,
} from "../data/types";

export interface DeclaredPassage {
  surah: number;
  fromAyah: number;
  toAyah: number;
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

function hasMistakeOnAyah(
  mistakesById: ReadonlyMap<string, TasmiMistakeRecord>,
  ayahKey: AyahKey,
): boolean {
  const [s, a] = ayahKey.split(":").map(Number);
  for (const m of mistakesById.values()) {
    if (m.surah === s && m.ayah === a) return true;
  }
  return false;
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
  const nextRevealed = new Set(state.revealedAyahs);
  nextRevealed.delete(ayah);
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

      // Only reveal an ayah once it is completed cleanly with zero mistakes on that ayah.
      const nextRevealed = new Set(state.revealedAyahs);
      if (
        prevAyah &&
        prevAyah !== activeAyah &&
        compareAyah(prevAyah, activeAyah) < 0 &&
        !hasMistakeOnAyah(state.mistakesById, prevAyah)
      ) {
        nextRevealed.add(prevAyah);
      }
      const wordsInActive = getAyahWords(top.word.surah, top.word.ayah);
      if (
        wordsInActive.length > 0 &&
        top.word.word >= wordsInActive.length &&
        !hasMistakeOnAyah(state.mistakesById, activeAyah)
      ) {
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
    const flaggedAyah: AyahKey = `${event.location.surah}:${event.location.ayah}`;
    if (nextRevealed.has(flaggedAyah)) {
      nextRevealed = new Set(nextRevealed);
      nextRevealed.delete(flaggedAyah);
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
