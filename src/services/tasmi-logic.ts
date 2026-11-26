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
  mistakesById: Map<string, TasmiMistakeRecord>;
  confirmedMistakes: TasmiMistakeRecord[];
  lastErrorAt: number | null;
}

export const ERROR_CLASS_LABELS: Record<string, string> = {
  wrong_word: "Kata salah",
  omitted_word: "Kata terlewat",
  added_word: "Kata berlebih",
  skipped_passage: "Ayat terloncat",
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
    mistakesById: new Map<string, TasmiMistakeRecord>(),
    confirmedMistakes: [],
    lastErrorAt: null,
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

    if (top && event.state === "locked") {
      activeWord = top.word;
      activeAyah = `${top.word.surah}:${top.word.ayah}`;

      const nextRevealed = new Set(state.revealedAyahs);
      nextRevealed.add(activeAyah);
      const { start, end } = top.span;
      nextRevealed.add(`${start.surah}:${start.ayah}`);
      nextRevealed.add(`${end.surah}:${end.ayah}`);
      if (start.surah === end.surah && end.ayah >= start.ayah) {
        for (let a = start.ayah; a <= end.ayah; a += 1) {
          nextRevealed.add(`${start.surah}:${a}`);
        }
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
    };
  }

  // event.type === "checker"
  const nextMap = new Map(state.mistakesById);
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
    lastErrorAt = event.timeMs;
  } else if (event.state === "resolved" || event.state === "uncertain") {
    nextMap.delete(event.id);
  }

  return {
    ...state,
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
): Set<AyahKey> {
  const masked = new Set<AyahKey>();
  if (mode === "off") return masked;

  for (const seg of pageEntry.ayahs) {
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
