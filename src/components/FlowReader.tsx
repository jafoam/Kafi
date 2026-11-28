import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  AyahKey,
  HifzBlurLevel,
  HighlightColor,
  JuzInfo,
  MistakeBadge,
  PageEntry,
  ReadingMode,
  SurahInfo,
} from "../data/types";
import type { GlyphPageData, GlyphPageLoader, GlyphWord } from "../services/glyph-pages";
import type { QuranApi } from "../services/quran-api";
import {
  createWordTranslationLoader,
  type PageWords,
  type SelectedWord,
} from "../services/word-translations";
import { useLongPress } from "../state/useLongPress";
import { useI18n } from "../i18n";

const wordLoader = createWordTranslationLoader();
const BISMILLAH = "\uFDFD";
const MAX_WINDOW_PAGES = 10;

export interface FlowWord extends GlyphWord {
  fontFamily: string;
  page: number;
}

export type TranslationItem =
  | { kind: "header"; surah: number }
  | { kind: "bismillah" }
  | { kind: "ayah"; ayah: AyahKey; surah: number; ayahNumber: number; words: FlowWord[] };

export type ReadingBlock =
  | { kind: "header"; surah: number }
  | { kind: "bismillah" }
  | { kind: "bismillah-ayah"; ayah: AyahKey; endWord: FlowWord | null }
  | { kind: "paragraph"; words: FlowWord[] };

export function getJuzForPageNumber(juzs: readonly JuzInfo[], page: number): number {
  let current = 1;
  for (const juz of juzs) {
    if (juz.page <= page) current = juz.number;
    else break;
  }
  return current;
}

/**
 * Builds verse-by-verse items for a page in Translation mode.
 * Skips ayahs that started on the previous page (wordIndex > 0) and appends continuation words
 * from `nextData` so every ayah renders whole and once. Strips the trailing ayah-number glyph
 * because Translation mode displays the verse number medallion on the left.
 */
export function buildTranslationItems(
  data: GlyphPageData,
  nextData?: GlyphPageData | null,
): TranslationItem[] {
  const items: TranslationItem[] = [];
  let activeAyah: Extract<TranslationItem, { kind: "ayah" }> | null = null;
  const skippedContinuations = new Set<AyahKey>();

  for (const row of data.rows) {
    if (row.kind === "header") {
      activeAyah = null;
      items.push({ kind: "header", surah: row.surah });
    } else if (row.kind === "bismillah") {
      activeAyah = null;
      items.push({ kind: "bismillah" });
    } else {
      for (const word of row.words) {
        if (skippedContinuations.has(word.ayah)) continue;
        const flowWord: FlowWord = {
          ...word,
          fontFamily: word.fontFamily ?? data.fontFamily,
          page: data.page,
        };
        if (activeAyah && activeAyah.ayah === word.ayah) {
          activeAyah.words.push(flowWord);
          continue;
        }
        if (typeof word.wordIndex === "number" && word.wordIndex > 0) {
          skippedContinuations.add(word.ayah);
          continue;
        }
        const [surah, ayahNumber] = word.ayah.split(":").map(Number);
        activeAyah = { kind: "ayah", ayah: word.ayah, surah, ayahNumber, words: [flowWord] };
        items.push(activeAyah);
      }
    }
  }

  // If the last ayah on this page spills onto the next page, stitch its remaining words here.
  if (activeAyah && nextData) {
    for (const row of nextData.rows) {
      if (row.kind !== "text") break;
      let matchedAny = false;
      for (const word of row.words) {
        if (word.ayah !== activeAyah.ayah) {
          matchedAny = false;
          break;
        }
        if (typeof word.wordIndex === "number" && word.wordIndex > 0) {
          activeAyah.words.push({
            ...word,
            fontFamily: word.fontFamily ?? nextData.fontFamily,
            page: nextData.page,
          });
          matchedAny = true;
        }
      }
      if (!matchedAny) break;
    }
  }

  // Drop the trailing QCF ayah-end marker glyph when the verse has words, since the medallion shows the number.
  for (const item of items) {
    if (item.kind === "ayah" && item.words.length > 1) {
      item.words = item.words.slice(0, -1);
    }
  }

  return items;
}

/**
 * Builds continuous flowing blocks for a page in Reading mode: surah headers, bismillah,
 * Al-Fatihah's ayah 1:1 as a calligraphic bismillah with its verse-end marker,
 * and merged inline RTL paragraphs keeping the inline ornamental ayah-end glyphs.
 */
export function buildReadingBlocks(data: GlyphPageData): ReadingBlock[] {
  const blocks: ReadingBlock[] = [];
  let activeParagraph: Extract<ReadingBlock, { kind: "paragraph" }> | null = null;
  let fatihahBismillah: FlowWord[] | null = null;

  const flushFatihahBismillah = () => {
    if (!fatihahBismillah) return;
    blocks.push({
      kind: "bismillah-ayah",
      ayah: "1:1",
      endWord: fatihahBismillah[fatihahBismillah.length - 1] ?? null,
    });
    fatihahBismillah = null;
  };

  for (const row of data.rows) {
    if (row.kind === "header") {
      flushFatihahBismillah();
      activeParagraph = null;
      blocks.push({ kind: "header", surah: row.surah });
    } else if (row.kind === "bismillah") {
      flushFatihahBismillah();
      activeParagraph = null;
      blocks.push({ kind: "bismillah" });
    } else {
      for (const word of row.words) {
        const flowWord: FlowWord = {
          ...word,
          fontFamily: word.fontFamily ?? data.fontFamily,
          page: data.page,
        };
        if (word.ayah === "1:1") {
          activeParagraph = null;
          (fatihahBismillah ??= []).push(flowWord);
          continue;
        }
        flushFatihahBismillah();
        if (!activeParagraph) {
          activeParagraph = { kind: "paragraph", words: [] };
          blocks.push(activeParagraph);
        }
        activeParagraph.words.push(flowWord);
      }
    }
  }
  flushFatihahBismillah();

  return blocks;
}

type TranslationState = { status: "loading" } | { status: "ready"; html: string } | { status: "error" };

export interface FlowReaderProps {
  mode: "translation" | "reading";
  onChangeMode: (mode: ReadingMode) => void;
  fontScale?: number;
  onChangeFontScale?: (scale: number) => void;
  pages: PageEntry[];
  surahs: SurahInfo[];
  juzs: JuzInfo[];
  currentPage: number;
  focusMode: boolean;
  selectedAyah: AyahKey | null;
  locatedAyah?: AyahKey | null;
  playingAyah: AyahKey | null;
  playingWordRange?: [number, number] | null;
  highlights: Record<AyahKey, HighlightColor>;
  bookmarks: Set<AyahKey>;
  blurSet?: Set<AyahKey>;
  blurLevel?: HifzBlurLevel;
  revealedSet?: Set<AyahKey>;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  wordTranslation?: boolean;
  isModalOpen: boolean;
  glyphLoader: GlyphPageLoader;
  quranApi: QuranApi;
  translationId: number;
  onPageChange: (page: number) => void;
  onSelectAyah: (ayah: AyahKey, anchorRect: DOMRect, word?: SelectedWord) => void;
  onPeekAyah?: (ayah: AyahKey) => void;
  onClearSelection: () => void;
  onTapPage?: () => void;
  onToggleFocus: () => void;
  onTogglePalette: () => void;
}

function FlowSurahHeader({ surah }: { surah: SurahInfo | undefined }) {
  return (
    <div className="flow-surah-header" aria-label={surah?.name ?? "Surah"}>
      <svg
        className="flow-surah-header__frame"
        viewBox="0 0 600 64"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M6 32 L32 8 H568 L594 32 L568 56 H32 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.34"
        />
        <path
          d="M16 32 L38 14 H562 L584 32 L562 50 H38 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
          opacity="0.2"
        />
        <circle cx="300" cy="8" r="2.2" fill="currentColor" opacity="0.45" />
        <circle cx="300" cy="56" r="2.2" fill="currentColor" opacity="0.45" />
      </svg>
      <span className="flow-surah-header__name">{surah?.name ?? "Surah"}</span>
    </div>
  );
}

function VerseMedallion({ number, bookmarked }: { number: number; bookmarked: boolean }) {
  return (
    <span className={`flow-ayah-badge ${bookmarked ? "flow-ayah-badge--bookmarked" : ""}`} aria-hidden="true">
      <svg className="flow-ayah-badge__svg" viewBox="0 0 36 36" fill="none">
        <path
          d="M18 2.5 L22.2 6.8 L28.2 6.8 L28.2 12.8 L32.5 17 L28.2 21.2 L28.2 27.2 L22.2 27.2 L18 31.5 L13.8 27.2 L7.8 27.2 L7.8 21.2 L3.5 17 L7.8 12.8 L7.8 6.8 L13.8 6.8 Z"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.55"
        />
        <circle cx="18" cy="17" r="10.5" stroke="currentColor" strokeWidth="0.9" opacity="0.35" />
      </svg>
      <span className="flow-ayah-badge__num">{number}</span>
    </span>
  );
}

export function FlowReader({
  mode,
  onChangeMode,
  fontScale = 1,
  onChangeFontScale,
  pages,
  surahs,
  juzs,
  currentPage,
  focusMode,
  selectedAyah,
  locatedAyah = null,
  playingAyah,
  playingWordRange,
  highlights,
  bookmarks,
  blurSet,
  blurLevel = "full",
  revealedSet,
  mistakeAyahs,
  wordTranslation = true,
  isModalOpen,
  glyphLoader,
  quranApi,
  translationId,
  onPageChange,
  onSelectAyah,
  onPeekAyah,
  onClearSelection,
  onTapPage,
  onToggleFocus,
  onTogglePalette,
}: FlowReaderProps) {
  const { tr } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const reportedRef = useRef(currentPage);
  const recentReportsRef = useRef(new Map<number, number>());
  const pendingScrollPageRef = useRef<number | null>(currentPage);
  const prependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const pointerTypeRef = useRef<string>("mouse");

  const [range, setRange] = useState<{ start: number; end: number }>(() => ({
    start: Math.max(1, currentPage - 1),
    end: Math.min(pages.length, currentPage + 2),
  }));

  const [glyphMap, setGlyphMap] = useState<Record<number, GlyphPageData>>({});
  const [wordMap, setWordMap] = useState<Record<number, PageWords>>({});

  // Scroll an ayah located by search or voice jump into the center of the flow column.
  useEffect(() => {
    if (!locatedAyah) return;
    const container = scrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-ayah="${locatedAyah}"]`);
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [locatedAyah, glyphMap, mode]);
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const requestedTranslationsRef = useRef(new Set<string>());
  const warmedSurahsRef = useRef(new Set<string>());

  const [hoveredAyah, setHoveredAyah] = useState<AyahKey | null>(null);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [pickedWord, setPickedWord] = useState<string | null>(null);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const fontBtnRef = useRef<HTMLButtonElement>(null);
  const fontPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fontMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (fontBtnRef.current?.contains(target) || fontPopoverRef.current?.contains(target)) return;
      setFontMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFontMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fontMenuOpen]);
  const [tip, setTip] = useState<{
    page: number;
    code: string;
    rect: DOMRect;
    word?: string;
    touch?: boolean;
  } | null>(null);

  const surahByNumber = useMemo(() => {
    const map = new Map<number, SurahInfo>();
    for (const s of surahs) map.set(s.number, s);
    return map;
  }, [surahs]);

  // Clear cached glyph pages when switching letter style (1405/1441) or tajweed.
  useEffect(() => {
    setGlyphMap({});
  }, [glyphLoader]);

  // Clear cached translations when switching translation resource.
  useEffect(() => {
    requestedTranslationsRef.current.clear();
    warmedSurahsRef.current.clear();
    setTranslations({});
  }, [translationId]);

  // External navigation (NavPalette, AudioDock, Tasmi'): recenter window and scroll to page.
  useEffect(() => {
    const reportedAt = recentReportsRef.current.get(currentPage);
    if (currentPage === reportedRef.current) return;
    if (reportedAt !== undefined && performance.now() - reportedAt < 1500) return;
    recentReportsRef.current.clear();
    reportedRef.current = currentPage;
    pendingScrollPageRef.current = currentPage;
    setRange({
      start: Math.max(1, currentPage - 1),
      end: Math.min(pages.length, currentPage + 2),
    });
  }, [currentPage, pages.length]);

  // Switching between Translation and Reading keeps the reader anchored on currentPage.
  useEffect(() => {
    pendingScrollPageRef.current = reportedRef.current;
  }, [mode]);

  // Load glyph data for mounted pages (+1 lookahead for split ayahs in translation mode).
  useEffect(() => {
    let live = true;
    const loadEnd = Math.min(pages.length, range.end + 1);
    for (let p = range.start; p <= loadEnd; p++) {
      if (glyphMap[p]) continue;
      glyphLoader
        .load(p)
        .then((data) => {
          if (!live) return;
          setGlyphMap((prev) => (prev[p] ? prev : { ...prev, [p]: data }));
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [range.start, range.end, pages.length, glyphLoader, glyphMap]);

  // Load word-by-word translations for mounted pages when enabled.
  useEffect(() => {
    if (!wordTranslation) return;
    let live = true;
    const loadEnd = Math.min(pages.length, range.end + 1);
    for (let p = range.start; p <= loadEnd; p++) {
      if (wordMap[p]) continue;
      wordLoader
        .load(p)
        .then((w) => {
          if (!live) return;
          setWordMap((prev) => (prev[p] ? prev : { ...prev, [p]: w }));
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [range.start, range.end, pages.length, wordTranslation, wordMap]);

  // Load verse translations for mounted pages when in Translation mode.
  const loadAyahTranslation = useCallback(
    (ayah: AyahKey) => {
      const cacheId = `${translationId}:${ayah}`;
      if (requestedTranslationsRef.current.has(cacheId)) return;
      requestedTranslationsRef.current.add(cacheId);
      const [surah, ayahNo] = ayah.split(":").map(Number);
      setTranslations((prev) => (prev[cacheId] ? prev : { ...prev, [cacheId]: { status: "loading" } }));
      quranApi
        .getTranslation(translationId, surah, ayahNo)
        .then((res) => {
          setTranslations((prev) => ({ ...prev, [cacheId]: { status: "ready", html: res.html } }));
        })
        .catch(() => {
          requestedTranslationsRef.current.delete(cacheId);
          setTranslations((prev) => ({ ...prev, [cacheId]: { status: "error" } }));
        });
    },
    [quranApi, translationId],
  );

  useEffect(() => {
    if (mode !== "translation") return;
    let cancelled = false;
    const surahsToWarm = new Set<number>();
    const ayahsToLoad: AyahKey[] = [];

    for (let p = range.start; p <= range.end; p++) {
      const data = glyphMap[p];
      if (!data) continue;
      const items = buildTranslationItems(data, glyphMap[p + 1]);
      for (const item of items) {
        if (item.kind !== "ayah") continue;
        surahsToWarm.add(item.surah);
        ayahsToLoad.push(item.ayah);
      }
    }

    if (ayahsToLoad.length === 0) return;

    const warmPromises: Promise<void>[] = [];
    for (const s of surahsToWarm) {
      const warmKey = `${translationId}:${s}`;
      if (!warmedSurahsRef.current.has(warmKey)) {
        warmedSurahsRef.current.add(warmKey);
        warmPromises.push(
          quranApi.downloadSurahTranslation(translationId, s).catch(() => {
            warmedSurahsRef.current.delete(warmKey);
          }),
        );
      }
    }

    void Promise.all(warmPromises).then(() => {
      if (cancelled) return;
      for (const ayah of ayahsToLoad) loadAyahTranslation(ayah);
    });

    return () => {
      cancelled = true;
    };
  }, [mode, range.start, range.end, glyphMap, quranApi, translationId, loadAyahTranslation]);

  // Preserve scroll position when prepending earlier pages, and apply pending jump scrolls.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (prependAnchorRef.current) {
      const { prevHeight, prevTop } = prependAnchorRef.current;
      prependAnchorRef.current = null;
      const delta = el.scrollHeight - prevHeight;
      if (delta > 0) el.scrollTop = prevTop + delta;
      return;
    }

    const targetPage = pendingScrollPageRef.current;
    if (targetPage !== null && glyphMap[targetPage]) {
      const pageEl = el.querySelector<HTMLElement>(`[data-flow-page="${targetPage}"]`);
      if (pageEl) {
        pendingScrollPageRef.current = null;
        if (targetPage === 1 && range.start === 1) {
          el.scrollTop = 0;
        } else {
          const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
          el.scrollTop = Math.max(0, pageEl.offsetTop - padTop);
        }
      }
    }
  }, [range.start, range.end, glyphMap, mode]);

  // Keep playing ayah gently in view while audio/tasmi advances.
  useEffect(() => {
    if (!playingAyah) return;
    const el = scrollRef.current;
    if (!el) return;
    const node = el.querySelector<HTMLElement>(`[data-ayah="${playingAyah}"]`);
    if (!node) return;
    const containerRect = el.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    if (nodeRect.top < containerRect.top + 80 || nodeRect.bottom > containerRect.bottom - 90) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [playingAyah]);

  // Track visible page and expand window on scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const containerRect = el.getBoundingClientRect();
        const probeY = containerRect.top + 140;
        const pageEls = el.querySelectorAll<HTMLElement>("[data-flow-page]");
        let bestPage: number | null = null;
        let bestDist = Infinity;

        for (const pageEl of pageEls) {
          const rect = pageEl.getBoundingClientRect();
          const pageNum = Number(pageEl.dataset.flowPage);
          if (rect.top <= probeY && rect.bottom >= probeY) {
            bestPage = pageNum;
            break;
          }
          const dist = Math.min(Math.abs(rect.top - probeY), Math.abs(rect.bottom - probeY));
          if (dist < bestDist) {
            bestDist = dist;
            bestPage = pageNum;
          }
        }

        if (bestPage !== null && bestPage !== reportedRef.current) {
          reportedRef.current = bestPage;
          recentReportsRef.current.set(bestPage, performance.now());
          onPageChange(bestPage);
        }

        // Expand downward near bottom
        if (el.scrollHeight - (el.scrollTop + el.clientHeight) < 700) {
          setRange((prev) => {
            if (prev.end >= pages.length) return prev;
            const nextEnd = Math.min(pages.length, prev.end + 2);
            const nextStart =
              nextEnd - prev.start + 1 > MAX_WINDOW_PAGES ? nextEnd - MAX_WINDOW_PAGES + 1 : prev.start;
            return { start: nextStart, end: nextEnd };
          });
        }

        // Prepend upward near top
        if (el.scrollTop < 320) {
          setRange((prev) => {
            if (prev.start <= 1) return prev;
            prependAnchorRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
            const nextStart = Math.max(1, prev.start - 1);
            const nextEnd =
              prev.end - nextStart + 1 > MAX_WINDOW_PAGES ? nextStart + MAX_WINDOW_PAGES - 1 : prev.end;
            return { start: nextStart, end: nextEnd };
          });
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [onPageChange, pages.length]);

  // Dismiss word tooltip when selection opens or wordTranslation turns off.
  useEffect(() => {
    if (!wordTranslation || selectedAyah) setTip(null);
  }, [wordTranslation, selectedAyah]);

  const touchTip = Boolean(tip?.touch);
  useEffect(() => {
    if (!touchTip) return;
    const close = () => setTip(null);
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && scrollRef.current?.contains(target) && target.closest("[data-word]")) {
        return;
      }
      close();
    };
    const timer = window.setTimeout(close, 6000);
    window.addEventListener("scroll", close, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [touchTip, tip]);

  // Keyboard shortcuts matching MushafScroll.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onTogglePalette();
        return;
      }
      if (isModalOpen) return;
      if (event.key === "Escape") {
        onClearSelection();
        return;
      }
      const t = event.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        onToggleFocus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, onClearSelection, onToggleFocus, onTogglePalette]);

  const selectFromElement = (target: HTMLElement): boolean => {
    const el = target.closest<HTMLElement>("[data-ayah]");
    const ayah = el?.dataset.ayah as AyahKey | undefined;
    if (!el || !ayah) return false;
    const wordKey = el.dataset.word ?? null;
    const code = el.dataset.code;
    const pageNum = Number(el.dataset.wordPage);
    const info = wordTranslation && code && Number.isFinite(pageNum) ? wordMap[pageNum]?.get(code) : undefined;
    const selectedWord: SelectedWord | undefined =
      info && wordKey && info.translation
        ? { key: `${pageNum}:${wordKey}`, translation: info.translation, transliteration: info.transliteration }
        : undefined;
    setTip(null);
    setPickedWord(wordKey);
    onSelectAyah(ayah, el.getBoundingClientRect(), selectedWord);
    return true;
  };
  const longPress = useLongPress(selectFromElement);

  const showTip = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return setTip(null);
    const el = target.closest<HTMLElement>("[data-code]");
    const pageNum = Number(el?.dataset.wordPage);
    const code = el?.dataset.code;
    if (!el || !code || !Number.isFinite(pageNum) || !wordMap[pageNum]?.has(code)) return setTip(null);
    if (el.classList.contains("glyph-word--blurred")) return setTip(null);
    setTip({ page: pageNum, code, rect: el.getBoundingClientRect() });
  };

  const tipInfo = tip ? wordMap[tip.page]?.get(tip.code) : undefined;

  const mountedPages = useMemo(() => {
    const list: number[] = [];
    for (let p = range.start; p <= range.end; p++) list.push(p);
    return list;
  }, [range.start, range.end]);

  const renderWords = (words: FlowWord[], keyPrefix: string) => {
    const seenFirst = new Set<AyahKey>();
    return words.map((word, index) => {
      const ayah = word.ayah;
      const wordKey = `${keyPrefix}-${index}`;
      const isFirst = !seenFirst.has(ayah) && (word.wordIndex === 0 || word.wordIndex === undefined);
      if (isFirst) seenFirst.add(ayah);
      const hl = highlights[ayah];
      const blurred = Boolean(blurSet?.has(ayah) && !revealedSet?.has(ayah));
      const wordBlurred = blurred && !(blurLevel === "first-word" && isFirst);
      const mistake = mistakeAyahs?.get(ayah);
      const isPlayingWord = Boolean(
        playingAyah === ayah &&
          playingWordRange &&
          typeof word.wordIndex === "number" &&
          word.wordIndex >= playingWordRange[0] &&
          word.wordIndex < playingWordRange[1],
      );
      const prevAyah = index > 0 ? words[index - 1].ayah : null;
      const nextAyah = index + 1 < words.length ? words[index + 1].ayah : null;
      const classes = [
        "flow-word",
        prevAyah !== ayah ? "glyph-word--run-start" : "",
        nextAyah !== ayah ? "glyph-word--run-end" : "",
        hl ? `glyph-word--hl-${hl}` : "",
        (wordTranslation ? hoveredWord === wordKey : hoveredAyah === ayah) ? "glyph-word--hovered" : "",
        (wordTranslation ? selectedAyah === ayah && pickedWord === wordKey : selectedAyah === ayah)
          ? "glyph-word--selected"
          : "",
        locatedAyah === ayah ? "glyph-word--located" : "",
        playingAyah === ayah ? "glyph-word--playing" : "",
        isPlayingWord ? "glyph-word--playing-word" : "",
        mistake ? "glyph-word--mistake" : "",
        wordBlurred ? "glyph-word--blurred" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const lookupCode = word.v1Code ?? word.code;
      return (
        <span
          key={wordKey}
          className={classes}
          data-ayah={ayah}
          data-code={lookupCode}
          data-word={wordKey}
          data-word-page={word.page}
          style={{ fontFamily: `"${word.fontFamily}"` }}
        >
          {word.code}{" "}
        </span>
      );
    });
  };

  return (
    <div
      className="flow-shell"
      style={{ "--flow-font-scale": String(fontScale) } as CSSProperties}
    >
      <div className={`flow-mode-bar-wrap ${focusMode ? "flow-mode-bar-wrap--hidden" : ""}`}>
        <div className="flow-mode-bar-row">
          <div className="flow-mode-bar" role="tablist" aria-label={tr("Mode baca", "Reading mode")}>
            {(
              [
                ["mushaf", "Mushaf"],
                ["translation", tr("Terjemahan", "Translation")],
                ["reading", tr("Bacaan", "Reading")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                className={`flow-mode-bar__tab ${mode === value ? "flow-mode-bar__tab--active" : ""}`}
                onClick={() => onChangeMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {onChangeFontScale && (
            <button
              ref={fontBtnRef}
              type="button"
              className={`flow-font-btn ${fontMenuOpen ? "flow-font-btn--active" : ""}`}
              aria-label={tr("Atur ukuran huruf", "Adjust font size")}
              aria-expanded={fontMenuOpen}
              title={tr("Atur ukuran huruf", "Adjust font size")}
              onClick={() => setFontMenuOpen((v) => !v)}
            >
              Aa
            </button>
          )}
        </div>
        {fontMenuOpen && onChangeFontScale && !focusMode && (
          <div ref={fontPopoverRef} className="flow-font-popover" role="group" aria-label={tr("Ukuran huruf", "Font size")}>
            <button
              type="button"
              className="flow-font-stepper__btn"
              aria-label={tr("Perkecil huruf", "Decrease font size")}
              disabled={fontScale <= 0.85}
              onClick={() => onChangeFontScale(Math.max(0.85, Math.round((fontScale - 0.15) * 100) / 100))}
            >
              A−
            </button>
            <span className="flow-font-stepper__val">{Math.round(fontScale * 100)}%</span>
            <button
              type="button"
              className="flow-font-stepper__btn"
              aria-label={tr("Perbesar huruf", "Increase font size")}
              disabled={fontScale >= 1.6}
              onClick={() => onChangeFontScale(Math.min(1.6, Math.round((fontScale + 0.15) * 100) / 100))}
            >
              A+
            </button>
          </div>
        )}
      </div>

      <main
        ref={scrollRef}
        className={`flow-stage flow-stage--${mode}`}
        onPointerDown={(event) => {
          pointerTypeRef.current = event.pointerType || "mouse";
          longPress.handlers.onPointerDown(event);
        }}
        onPointerMove={longPress.handlers.onPointerMove}
        onPointerUp={longPress.handlers.onPointerUp}
        onPointerCancel={longPress.handlers.onPointerCancel}
        onContextMenu={longPress.handlers.onContextMenu}
        onPointerOver={(event) => {
          const target = event.target instanceof HTMLElement ? event.target : null;
          setHoveredAyah((target?.closest<HTMLElement>("[data-ayah]")?.dataset.ayah as AyahKey) ?? null);
          setHoveredWord(target?.closest<HTMLElement>("[data-word]")?.dataset.word ?? null);
          if (event.pointerType === "mouse" && !selectedAyah) showTip(event.target);
        }}
        onPointerLeave={(event) => {
          setHoveredAyah(null);
          setHoveredWord(null);
          if (event.pointerType === "mouse") setTip(null);
        }}
        onClick={(event) => {
          if (longPress.consumeClick()) {
            event.stopPropagation();
            return;
          }
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (target?.closest("button")) return;

          const ayahEl = target?.closest<HTMLElement>("[data-ayah]");
          const ayah = ayahEl?.dataset.ayah as AyahKey | undefined;
          const blurred = Boolean(ayah && blurSet?.has(ayah) && !revealedSet?.has(ayah));
          if (blurred && ayah && onPeekAyah) {
            event.stopPropagation();
            setTip(null);
            onPeekAyah(ayah);
            return;
          }

          if (pointerTypeRef.current !== "mouse") {
            const wordEl = target?.closest<HTMLElement>("[data-word]");
            const wordKey = wordEl?.dataset.word ?? null;
            const code = wordEl?.dataset.code;
            const pageNum = Number(wordEl?.dataset.wordPage);
            if (tip?.touch) {
              event.stopPropagation();
              setTip(null);
              if (tip.word === wordKey) return;
            }
            if (wordTranslation && wordEl && wordKey && code && Number.isFinite(pageNum) && wordMap[pageNum]?.has(code)) {
              event.stopPropagation();
              setHoveredWord(wordKey);
              setTip({ page: pageNum, code, rect: wordEl.getBoundingClientRect(), word: wordKey, touch: true });
              return;
            }
            (onTapPage ?? onClearSelection)();
            return;
          }

          setTip(null);
          if (ayahEl) {
            event.stopPropagation();
            selectFromElement(ayahEl);
          } else {
            (onTapPage ?? onClearSelection)();
          }
        }}
      >
        <div className="flow-column">
          {mountedPages.map((pageNum) => {
            const data = glyphMap[pageNum];
            const juz = getJuzForPageNumber(juzs, pageNum);
            return (
              <section
                key={pageNum}
                className={`flow-page ${pageNum <= 2 ? "flow-page--opening" : ""} ${data?.variant === "tajweed" ? "glyph-page--tajweed" : ""}`}
                data-flow-page={pageNum}
                aria-label={`${tr("Halaman", "Page")} ${pageNum}`}
              >
                {!data ? (
                  <div className="flow-page__skeleton" aria-busy="true">
                    <div className="study-drawer__skeleton-line" />
                    <div className="study-drawer__skeleton-line study-drawer__skeleton-line--short" />
                  </div>
                ) : mode === "translation" ? (
                  <div className="flow-translation-list">
                    {buildTranslationItems(data, glyphMap[pageNum + 1]).map((item, idx) => {
                      if (item.kind === "header") {
                        return <FlowSurahHeader key={`h-${pageNum}-${idx}`} surah={surahByNumber.get(item.surah)} />;
                      }
                      if (item.kind === "bismillah") {
                        return (
                          <div key={`b-${pageNum}-${idx}`} className="flow-bismillah" aria-hidden="true">
                            {BISMILLAH}
                          </div>
                        );
                      }
                      const cacheId = `${translationId}:${item.ayah}`;
                      const tState = translations[cacheId];
                      const isPlaying = playingAyah === item.ayah;
                      const isSelected = selectedAyah === item.ayah;
                      const isLocated = locatedAyah === item.ayah;
                      const isBlurred = Boolean(blurSet?.has(item.ayah) && !revealedSet?.has(item.ayah));
                      return (
                        <article
                          key={item.ayah}
                          className={`flow-ayah-card ${isPlaying ? "flow-ayah-card--playing" : ""} ${isSelected ? "flow-ayah-card--selected" : ""} ${isLocated ? "flow-ayah-card--located" : ""}`}
                          data-ayah={item.ayah}
                        >
                          <div className="flow-ayah-card__top">
                            <VerseMedallion number={item.ayahNumber} bookmarked={bookmarks.has(item.ayah)} />
                            {item.ayah === "1:1" ? (
                              <p
                                className={`flow-ayah-card__arabic flow-ayah-card__bismillah ${isBlurred ? "glyph-word--blurred" : ""}`}
                                dir="rtl"
                                lang="ar"
                              >
                                {BISMILLAH}
                              </p>
                            ) : (
                              <p className="flow-ayah-card__arabic" dir="rtl" lang="ar">
                                {renderWords(item.words, `t-${pageNum}-${idx}`)}
                              </p>
                            )}
                          </div>
                          <div className={`flow-ayah-card__translation ${isBlurred ? "flow-ayah-card__translation--blurred" : ""}`}>
                            {!tState || tState.status === "loading" ? (
                              <div className="flow-ayah-card__skeleton" aria-busy="true">
                                <div className="study-drawer__skeleton-line" />
                              </div>
                            ) : tState.status === "error" ? (
                              <div className="flow-ayah-card__error">
                                <span>{tr("Terjemahan belum termuat.", "Translation not loaded.")}</span>
                                <button
                                  type="button"
                                  className="flow-ayah-card__retry"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    loadAyahTranslation(item.ayah);
                                  }}
                                >
                                  {tr("Coba lagi", "Retry")}
                                </button>
                              </div>
                            ) : (
                              <div
                                className="flow-ayah-card__translation-text"
                                dangerouslySetInnerHTML={{ __html: tState.html }}
                              />
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flow-reading-page">
                    {buildReadingBlocks(data).map((block, idx) => {
                      if (block.kind === "header") {
                        return <FlowSurahHeader key={`rh-${pageNum}-${idx}`} surah={surahByNumber.get(block.surah)} />;
                      }
                      if (block.kind === "bismillah") {
                        return (
                          <div key={`rb-${pageNum}-${idx}`} className="flow-bismillah" aria-hidden="true">
                            {BISMILLAH}
                          </div>
                        );
                      }
                      if (block.kind === "bismillah-ayah") {
                        const hl = highlights[block.ayah];
                        const blurred = Boolean(blurSet?.has(block.ayah) && !revealedSet?.has(block.ayah));
                        const mistake = mistakeAyahs?.get(block.ayah);
                        const classes = [
                          "flow-bismillah",
                          "flow-bismillah--ayah",
                          hl ? `glyph-word--hl-${hl}` : "",
                          selectedAyah === block.ayah ? "glyph-word--selected" : "",
                          locatedAyah === block.ayah ? "glyph-word--located" : "",
                          playingAyah === block.ayah ? "glyph-word--playing" : "",
                          mistake ? "glyph-word--mistake" : "",
                          blurred ? "glyph-word--blurred" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <div
                            key={`rba-${pageNum}-${idx}`}
                            className={classes}
                            data-ayah={block.ayah}
                            dir="rtl"
                            lang="ar"
                          >
                            <span className="flow-bismillah__glyph">{BISMILLAH}</span>
                            {block.endWord && (
                              <span
                                className="flow-bismillah__end"
                                style={{ fontFamily: `"${block.endWord.fontFamily}"` }}
                              >
                                {block.endWord.code}
                              </span>
                            )}
                          </div>
                        );
                      }
                      return (
                        <p key={`rp-${pageNum}-${idx}`} className="flow-reading-paragraph" dir="rtl" lang="ar">
                          {renderWords(block.words, `r-${pageNum}-${idx}`)}
                        </p>
                      );
                    })}
                  </div>
                )}

                <footer className="flow-page-divider" aria-label={`Juz ${juz}, ${tr("Halaman", "Page")} ${pageNum}`}>
                  <div className="flow-page-divider__meta">
                    <span>
                      Juz {juz} · {tr("Hal.", "p.")} {pageNum}
                    </span>
                    <span className="flow-page-divider__num">{String(pageNum).padStart(2, "0")}</span>
                  </div>
                  <div className="flow-page-divider__line" aria-hidden="true" />
                </footer>
              </section>
            );
          })}
        </div>

        {tip && tipInfo && (
          <div
            className="word-tip"
            role="tooltip"
            style={{
              left: Math.max(8, Math.min(window.innerWidth - 168, tip.rect.left + tip.rect.width / 2 - 80)),
              top: tip.rect.top > 90 ? tip.rect.top - 8 : tip.rect.bottom + 8,
              transform: tip.rect.top > 90 ? "translateY(-100%)" : undefined,
            }}
          >
            <span className="word-tip__tr">{tipInfo.transliteration}</span>
            <span className="word-tip__id">{tipInfo.translation}</span>
            {tip.touch && (
              <span className="word-tip__hint">
                {tr("Tahan kata untuk menu ayat", "Hold word for ayah menu")}
              </span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
