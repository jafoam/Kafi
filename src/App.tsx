import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EngineEvent, LoadProgress } from "@tilawa/core";
import catalogJson from "./data/catalog.json";
import mushafMapJson from "./data/mushaf-map.json";
import type {
  AyahKey,
  Catalog,
  HighlightColor,
  MistakeBadge,
  MushafMap,
  SpreadMode,
  TasmiSessionRecord,
  ThemeMode,
  UserData,
} from "./data/types";
import { getPlatform } from "./platform";
import { createQuranSearch, type RefV2Data } from "./services/arabic-search";
import {
  createAudioController,
  parseAyahKey,
  REPEAT_OPTIONS,
  SPEED_OPTIONS,
  type AudioState,
} from "./services/audio-controller";
import { createQuranApi } from "./services/quran-api";
import {
  buildMistakeBadges,
  computeBlurMask,
  createTasmiState,
  reduceTilawaEvent,
  type DeclaredPassage,
  type TasmiLiveState,
} from "./services/tasmi-logic";
import { createTilawaController } from "./services/tilawa-controller";
import { createUserStore, DEFAULT_USER_DATA } from "./services/user-store";
import {
  clampPage,
  getVisiblePages,
  MAX_PAGE,
  MIN_PAGE,
  resolveEffectiveSpread,
  turnPage,
} from "./state/reader-logic";
import { AudioDock } from "./components/AudioDock";
import { AyahPopover } from "./components/AyahPopover";
import { MushafSpread } from "./components/MushafSpread";
import { NavPalette, type PaletteTab } from "./components/NavPalette";
import { RecitationRibbon } from "./components/RecitationRibbon";
import { StudyDrawer } from "./components/StudyDrawer";
import { TasmiSheet } from "./components/TasmiSheet";
import { TasmiSummaryModal } from "./components/TasmiSummaryModal";
import { TopBar } from "./components/TopBar";

const catalog = catalogJson as unknown as Catalog;
const mushafMap = mushafMapJson as unknown as MushafMap;

type WordLookupFn = (surah: number, ayah: number) => string[];
const EMPTY_WORD_LOOKUP: WordLookupFn = () => [];
let cachedWordLookupPromise: Promise<WordLookupFn> | null = null;

function loadWordLookup(): Promise<WordLookupFn> {
  if (!cachedWordLookupPromise) {
    cachedWordLookupPromise = import("@tilawa/core/assets/ref-v2.json")
      .then((mod) => {
        const refData = (mod.default ?? mod) as unknown as RefV2Data;
        const search = createQuranSearch(refData, catalog.surahs);
        return search.getAyahWords;
      })
      .catch((err) => {
        cachedWordLookupPromise = null;
        throw err;
      });
  }
  return cachedWordLookupPromise;
}

export interface AppProps {
  playingAyah?: AyahKey | null;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  onPlayAyah?: (ayah: AyahKey) => void;
  onOpenStudy?: (ayah: AyahKey) => void;
  onStartTasmi?: (ayah: AyahKey) => void;
}

const INITIAL_AUDIO_STATE: AudioState = {
  currentAyah: null,
  isPlaying: false,
  isLoading: false,
  reciterId: DEFAULT_USER_DATA.settings.reciterId,
  repeatCount: 1,
  speed: 1,
  fromCache: false,
  error: null,
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function getJuzForPage(page: number): number {
  let current = 1;
  for (const juz of catalog.juzs) {
    if (juz.page <= page) {
      current = juz.number;
    } else {
      break;
    }
  }
  return current;
}

export function App({
  playingAyah = null,
  mistakeAyahs,
  onPlayAyah,
  onOpenStudy,
  onStartTasmi,
}: AppProps) {
  const platform = useMemo(() => getPlatform(), []);
  const userStore = useMemo(() => createUserStore(platform), [platform]);
  const quranApi = useMemo(() => createQuranApi(platform), [platform]);
  const tilawaController = useMemo(() => createTilawaController(platform), [platform]);

  const reciterById = useMemo(() => {
    const map = new Map<string, Catalog["reciters"][number]>();
    for (const r of catalog.reciters) map.set(r.id, r);
    return map;
  }, []);

  const audioController = useMemo(
    () =>
      createAudioController({
        surahs: catalog.surahs,
        reciterId: DEFAULT_USER_DATA.settings.reciterId,
        getAudioBlobUrl: (reciterId, surah, ayah, signal) => {
          const folder = reciterById.get(reciterId)?.subfolder ?? reciterId;
          return quranApi.getAudioBlobUrl(folder, surah, ayah, signal);
        },
      }),
    [quranApi, reciterById],
  );

  const [userData, setUserData] = useState<UserData>(DEFAULT_USER_DATA);
  const [currentPage, setCurrentPage] = useState<number>(DEFAULT_USER_DATA.lastPage);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [pageUrls, setPageUrls] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<{ ayah: AyahKey; rect: DOMRect } | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteTab, setPaletteTab] = useState<PaletteTab>("surah");
  const [revealedSet, setRevealedSet] = useState<Set<AyahKey>>(() => new Set());
  const [audioState, setAudioState] = useState<AudioState>(INITIAL_AUDIO_STATE);
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyAyah, setStudyAyah] = useState<AyahKey | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [downloadedSurahs, setDownloadedSurahs] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  const [tasmiSheetOpen, setTasmiSheetOpen] = useState(false);
  const [tasmiInitialAyah, setTasmiInitialAyah] = useState<AyahKey | null>(null);
  const [tasmiActive, setTasmiActive] = useState(false);
  const [tasmiState, setTasmiState] = useState<TasmiLiveState | null>(null);
  const [tasmiBlurEnabled, setTasmiBlurEnabled] = useState(true);
  const [peekedAyah, setPeekedAyah] = useState<AyahKey | null>(null);
  const [modelLoading, setModelLoading] = useState<LoadProgress | null>(null);
  const [tasmiStarting, setTasmiStarting] = useState(false);
  const [tasmiError, setTasmiError] = useState<string | null>(null);
  const [wordLookup, setWordLookup] = useState<WordLookupFn>(() => EMPTY_WORD_LOOKUP);
  const [summaryModal, setSummaryModal] = useState<{
    open: boolean;
    tab: "summary" | "history";
    record: TasmiSessionRecord | null;
  }>({ open: false, tab: "summary", record: null });

  const toastTimerRef = useRef<number | null>(null);
  const peekTimerRef = useRef<number | null>(null);
  const requestedPagesRef = useRef<Set<number>>(new Set());
  const downloadAbortRef = useRef<AbortController | null>(null);
  const tilawaAbortRef = useRef<AbortController | null>(null);
  const lastAutoTurnAyahRef = useRef<AyahKey | null>(null);
  const lastTasmiTurnAyahRef = useRef<AyahKey | null>(null);
  const lastSyncedStudyAyahRef = useRef<AyahKey | null>(null);
  const tasmiStateRef = useRef<TasmiLiveState | null>(null);
  const tasmiStartedAtRef = useRef<number>(0);
  const tasmiStartingRef = useRef<boolean>(false);
  const wordLookupRef = useRef<WordLookupFn>(EMPTY_WORD_LOOKUP);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = audioController.subscribe(setAudioState);
    return () => {
      mountedRef.current = false;
      unsubscribe();
      downloadAbortRef.current?.abort();
      tilawaAbortRef.current?.abort();
      if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      audioController.dispose();
      quranApi.dispose();
      tilawaController.dispose();
    };
  }, [audioController, quranApi, tilawaController]);

  const surahByNumber = useMemo(() => {
    const map = new Map<number, Catalog["surahs"][number]>();
    for (const s of catalog.surahs) map.set(s.number, s);
    return map;
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  // Load persisted user data on mount
  useEffect(() => {
    let active = true;
    void userStore.load().then((loaded) => {
      if (!active) return;
      setUserData(loaded);
      setCurrentPage(loaded.lastPage);
      audioController.setReciter(loaded.settings.reciterId);
    });
    return () => {
      active = false;
    };
  }, [userStore, audioController]);

  // Sync theme attribute on <html>
  useEffect(() => {
    document.documentElement.dataset.theme = userData.settings.theme;
  }, [userData.settings.theme]);

  // Track viewport width for responsive Auto spread
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effectiveSpread = resolveEffectiveSpread(userData.settings.spreadMode, viewportWidth);
  const { rightPage, leftPage } = getVisiblePages(currentPage, effectiveSpread);

  const rightPageEntry = mushafMap.pages[rightPage - 1];
  const leftPageEntry = leftPage ? mushafMap.pages[leftPage - 1] : null;

  // Resolve image URLs for visible pages without cancelling in-flight sibling loads
  useEffect(() => {
    const pagesToLoad = leftPage ? [rightPage, leftPage] : [rightPage];
    for (const p of pagesToLoad) {
      if (requestedPagesRef.current.has(p)) continue;
      requestedPagesRef.current.add(p);
      void platform
        .getPageImageUrl(p)
        .then((url) => {
          if (!mountedRef.current) return;
          setPageUrls((prev) => (prev[p] ? prev : { ...prev, [p]: url }));
        })
        .catch(() => {
          requestedPagesRef.current.delete(p);
        });
    }
  }, [rightPage, leftPage, platform]);

  // Clear temporary Hifz peeks and selection when navigating pages
  useEffect(() => {
    setSelected(null);
    setRevealedSet(new Set());
    setPeekedAyah(null);
  }, [rightPage, leftPage]);

  const navigateToPage = useCallback(
    (page: number) => {
      const clamped = clampPage(page);
      setCurrentPage(clamped);
      void userStore.setLastPage(clamped).then(setUserData);
    },
    [userStore],
  );

  // Auto-turn mushaf page when active playing ayah moves outside the visible spread
  useEffect(() => {
    if (!audioState.currentAyah) {
      lastAutoTurnAyahRef.current = null;
      return;
    }
    if (audioState.currentAyah === lastAutoTurnAyahRef.current) return;
    lastAutoTurnAyahRef.current = audioState.currentAyah;

    const targetPage = mushafMap.ayahToPage[audioState.currentAyah];
    if (targetPage && targetPage !== rightPage && targetPage !== leftPage) {
      navigateToPage(targetPage);
    }
  }, [audioState.currentAyah, rightPage, leftPage, navigateToPage]);

  // Auto-turn mushaf page when active Tasmi' / Baca Bebas ayah moves outside visible spread
  useEffect(() => {
    const tasmiAyah = tasmiActive ? tasmiState?.activeAyah ?? null : null;
    if (!tasmiAyah) {
      lastTasmiTurnAyahRef.current = null;
      return;
    }
    if (tasmiAyah === lastTasmiTurnAyahRef.current) return;
    lastTasmiTurnAyahRef.current = tasmiAyah;

    const targetPage = mushafMap.ayahToPage[tasmiAyah];
    if (targetPage && targetPage !== rightPage && targetPage !== leftPage) {
      navigateToPage(targetPage);
    }
  }, [tasmiActive, tasmiState?.activeAyah, rightPage, leftPage, navigateToPage]);

  // Sync open StudyDrawer only when active playing ayah actually changes
  useEffect(() => {
    if (!audioState.currentAyah) {
      lastSyncedStudyAyahRef.current = null;
      return;
    }
    if (audioState.currentAyah === lastSyncedStudyAyahRef.current) return;
    lastSyncedStudyAyahRef.current = audioState.currentAyah;
    if (studyOpen) {
      setStudyAyah(audioState.currentAyah);
    }
  }, [studyOpen, audioState.currentAyah]);

  const fallbackAyah = useMemo<AyahKey>(() => {
    const first = rightPageEntry.ayahs[0];
    return first ? (`${first.surah}:${first.ayah}` as AyahKey) : "1:1";
  }, [rightPageEntry]);

  const effectivePlayingAyah =
    playingAyah ?? (tasmiActive ? (tasmiState?.activeAyah ?? null) : audioState.currentAyah);
  const activeAyah: AyahKey = effectivePlayingAyah ?? selected?.ayah ?? fallbackAyah;
  const activeSurahNum = parseAyahKey(activeAyah).surah;
  const activeSurah = surahByNumber.get(activeSurahNum);

  const ensureWordLookup = useCallback(async () => {
    if (wordLookupRef.current !== EMPTY_WORD_LOOKUP) return wordLookupRef.current;
    try {
      const fn = await loadWordLookup();
      wordLookupRef.current = fn;
      if (mountedRef.current) setWordLookup(() => fn);
      return fn;
    } catch {
      return EMPTY_WORD_LOOKUP;
    }
  }, []);

  const handlePlayAyah = useCallback(
    (ayah: AyahKey) => {
      if (onPlayAyah) {
        onPlayAyah(ayah);
        return;
      }
      const { surah, ayah: ayahNum } = parseAyahKey(ayah);
      void audioController.playAyah(surah, ayahNum);
    },
    [onPlayAyah, audioController],
  );

  const handleTogglePlay = useCallback(() => {
    if (audioState.currentAyah) {
      audioController.togglePlay();
    } else {
      handlePlayAyah(activeAyah);
    }
  }, [audioState.currentAyah, audioController, handlePlayAyah, activeAyah]);

  const handleTurnPage = useCallback(
    (direction: "next" | "prev") => {
      const target = turnPage(currentPage, direction, effectiveSpread);
      if (target !== currentPage) {
        navigateToPage(target);
      }
    },
    [currentPage, effectiveSpread, navigateToPage],
  );

  const handleJumpToAyah = useCallback(
    (ayah: AyahKey) => {
      const targetPage = mushafMap.ayahToPage[ayah];
      if (targetPage) {
        navigateToPage(targetPage);
      }
    },
    [navigateToPage],
  );

  const handleChangeSpreadMode = useCallback(
    (spreadMode: SpreadMode) => {
      void userStore.updateSettings({ spreadMode }).then(setUserData);
    },
    [userStore],
  );

  const handleChangeTheme = useCallback(
    (theme: ThemeMode) => {
      void userStore.updateSettings({ theme }).then(setUserData);
    },
    [userStore],
  );

  const handleChangeReciter = useCallback(
    (reciterId: string) => {
      audioController.setReciter(reciterId);
      void userStore.updateSettings({ reciterId }).then(setUserData);
    },
    [audioController, userStore],
  );

  const handleChangeTranslation = useCallback(
    (translationId: number) => {
      void userStore.updateSettings({ translationId }).then(setUserData);
    },
    [userStore],
  );

  const handleChangeTafsir = useCallback(
    (tafsirId: string) => {
      void userStore.updateSettings({ tafsirId }).then(setUserData);
    },
    [userStore],
  );

  const handleCycleRepeat = useCallback(() => {
    const idx = REPEAT_OPTIONS.indexOf(audioState.repeatCount);
    const next = REPEAT_OPTIONS[(idx + 1) % REPEAT_OPTIONS.length];
    audioController.setRepeat(next);
  }, [audioState.repeatCount, audioController]);

  const handleCycleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(audioState.speed as (typeof SPEED_OPTIONS)[number]);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    audioController.setSpeed(next);
  }, [audioState.speed, audioController]);

  const handleDownloadSurah = useCallback(() => {
    if (!activeSurah || downloadProgress !== null) return;
    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;

    const reciterId = audioState.reciterId;
    const folder = reciterById.get(reciterId)?.subfolder ?? reciterId;
    const downloadKey = `${reciterId}:${activeSurah.number}`;

    setDownloadProgress({ done: 0, total: activeSurah.ayahs });
    void quranApi
      .downloadSurahAudio(
        folder,
        activeSurah.number,
        activeSurah.ayahs,
        (done, total) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          setDownloadProgress({ done, total });
        },
        controller.signal,
      )
      .then(() => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setDownloadProgress(null);
        setDownloadedSurahs((prev) => {
          const next = new Set(prev);
          next.add(downloadKey);
          return next;
        });
        showToast(`${activeSurah.name} tersimpan offline`);
      })
      .catch(() => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setDownloadProgress(null);
        showToast(`Gagal mengunduh ${activeSurah.name}`);
      });
  }, [activeSurah, audioState.reciterId, downloadProgress, quranApi, reciterById, showToast]);

  const handleToggleHifzBlur = useCallback(() => {
    const next = !userData.settings.hifzBlur;
    setRevealedSet(new Set());
    void userStore.updateSettings({ hifzBlur: next }).then(setUserData);
  }, [userData.settings.hifzBlur, userStore]);

  const handleToggleBookmark = useCallback(
    (ayah: AyahKey) => {
      void userStore.toggleBookmark(ayah).then(setUserData);
    },
    [userStore],
  );

  const handleSetHighlight = useCallback(
    (ayah: AyahKey, color: HighlightColor | null) => {
      void userStore.setHighlight(ayah, color).then(setUserData);
    },
    [userStore],
  );

  const handleSaveNote = useCallback(
    (ayah: AyahKey, text: string) => {
      void userStore.setNote(ayah, text).then(setUserData);
    },
    [userStore],
  );

  const handleOpenStudy = useCallback(
    (ayah: AyahKey) => {
      if (onOpenStudy) {
        onOpenStudy(ayah);
        return;
      }
      setStudyAyah(ayah);
      setStudyOpen(true);
    },
    [onOpenStudy],
  );

  const handleOpenTasmi = useCallback(
    (ayah: AyahKey) => {
      if (onStartTasmi) {
        onStartTasmi(ayah);
        return;
      }
      setTasmiError(null);
      setTasmiInitialAyah(ayah);
      setTasmiSheetOpen(true);
    },
    [onStartTasmi],
  );

  const handleCancelModelLoad = useCallback(() => {
    tilawaAbortRef.current?.abort();
    tilawaAbortRef.current = null;
    setModelLoading(null);
    setTasmiError("Unduhan model dibatalkan.");
  }, []);

  const startTasmiSession = useCallback(
    async (mode: "free" | "memorization", passage: DeclaredPassage | null, enableBlur: boolean) => {
      if (tasmiStartingRef.current) return;
      tasmiStartingRef.current = true;
      setTasmiStarting(true);

      // Pause Murottal automatically before activating Tasmi' mic
      audioController.pause();
      setTasmiError(null);

      tilawaAbortRef.current?.abort();
      const abort = new AbortController();
      tilawaAbortRef.current = abort;

      try {
        const [lookup] = await Promise.all([
          ensureWordLookup(),
          tilawaController.ensureReady((progress) => {
            if (!mountedRef.current || abort.signal.aborted) return;
            setModelLoading(progress);
          }, abort.signal),
        ]);

        if (!mountedRef.current || abort.signal.aborted) return;
        setModelLoading(null);

        const initial = createTasmiState(mode, passage);
        tasmiStateRef.current = initial;
        tasmiStartedAtRef.current = Date.now();
        setTasmiState(initial);
        setTasmiBlurEnabled(mode === "memorization" ? enableBlur : false);
        setPeekedAyah(null);

        const onEvent = (event: EngineEvent) => {
          if (!mountedRef.current) return;
          const base = tasmiStateRef.current ?? initial;
          const next = reduceTilawaEvent(base, event, lookup);
          tasmiStateRef.current = next;
          setTasmiState(next);
        };

        if (mode === "free") {
          await tilawaController.startFree(onEvent);
        } else if (passage) {
          await tilawaController.startMemorization(passage, onEvent);
          const startPage = mushafMap.ayahToPage[`${passage.surah}:${passage.fromAyah}`];
          if (startPage && startPage !== rightPage && startPage !== leftPage) {
            navigateToPage(startPage);
          }
        }

        if (!mountedRef.current) return;
        setTasmiActive(true);
        setTasmiSheetOpen(false);
      } catch (err) {
        if (!mountedRef.current) return;
        setModelLoading(null);
        if (abort.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Gagal memulai Tasmi'.";
        setTasmiError(message);
      } finally {
        tasmiStartingRef.current = false;
        if (mountedRef.current) setTasmiStarting(false);
      }
    },
    [audioController, ensureWordLookup, tilawaController, rightPage, leftPage, navigateToPage],
  );

  const handleStopTasmi = useCallback(async () => {
    setTasmiActive(false);
    setPeekedAyah(null);
    const durationSec = Math.max(1, Math.round((Date.now() - tasmiStartedAtRef.current) / 1000));
    try {
      await tilawaController.stop();
    } catch {
      // Ignore drain errors on stop
    }

    const finalState = tasmiStateRef.current;
    tasmiStateRef.current = null;
    setTasmiState(null);

    if (finalState?.mode === "memorization" && finalState.passage) {
      const record: TasmiSessionRecord = {
        id: `tasmi-${Date.now()}`,
        startedAt: new Date(tasmiStartedAtRef.current || Date.now()).toISOString(),
        durationSec,
        surah: finalState.passage.surah,
        fromAyah: finalState.passage.fromAyah,
        toAyah: finalState.passage.toAyah,
        mistakes: finalState.confirmedMistakes,
      };
      void userStore.addTasmiHistory(record).then(setUserData);
      setSummaryModal({ open: true, tab: "summary", record });
    } else if (finalState) {
      showToast("Sesi Baca Bebas selesai");
    }
  }, [tilawaController, userStore, showToast]);

  const handleOpenTasmiHistory = useCallback(() => {
    void ensureWordLookup();
    setTasmiSheetOpen(false);
    setSummaryModal({
      open: true,
      tab: "history",
      record: userData.tasmiHistory[0] ?? null,
    });
  }, [ensureWordLookup, userData.tasmiHistory]);

  const handlePeekAyah = useCallback(
    (ayah: AyahKey) => {
      if (tasmiActive && tasmiState?.mode === "memorization" && tasmiBlurEnabled) {
        setPeekedAyah(ayah);
        if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current);
        peekTimerRef.current = window.setTimeout(() => {
          setPeekedAyah((prev) => (prev === ayah ? null : prev));
        }, 3500);
        return;
      }
      setRevealedSet((prev) => {
        const next = new Set(prev);
        next.add(ayah);
        return next;
      });
    },
    [tasmiActive, tasmiState?.mode, tasmiBlurEnabled],
  );

  // Bind Space (play/pause), M (Tasmi'), and H (Hifz blur) when not typing in an editable control
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (paletteOpen || summaryModal.open) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "m") {
        event.preventDefault();
        if (tasmiActive) {
          void handleStopTasmi();
        } else {
          setTasmiError(null);
          setTasmiInitialAyah(activeAyah);
          setTasmiSheetOpen((prev) => !prev);
        }
        return;
      }

      if (tasmiSheetOpen) return;

      if (key === "h") {
        event.preventDefault();
        if (tasmiActive && tasmiState?.mode === "memorization") {
          setTasmiBlurEnabled((prev) => !prev);
        } else {
          handleToggleHifzBlur();
        }
        return;
      }

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        handleTogglePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    paletteOpen,
    summaryModal.open,
    tasmiSheetOpen,
    tasmiActive,
    tasmiState?.mode,
    activeAyah,
    handleStopTasmi,
    handleToggleHifzBlur,
    handleTogglePlay,
  ]);

  const handleSelectAyah = useCallback(
    (ayah: AyahKey, anchorRect: DOMRect) => {
      setSelected((prev) => (prev?.ayah === ayah ? null : { ayah, rect: anchorRect }));
      if (studyOpen) {
        setStudyAyah(ayah);
      }
    },
    [studyOpen],
  );

  const bookmarkSet = useMemo(() => new Set(userData.bookmarks), [userData.bookmarks]);

  const visiblePages = useMemo(
    () => (leftPageEntry ? [rightPageEntry, leftPageEntry] : [rightPageEntry]),
    [rightPageEntry, leftPageEntry],
  );

  const isTasmiBlurActive = Boolean(
    tasmiActive && tasmiState?.mode === "memorization" && tasmiBlurEnabled,
  );

  const blurSet = useMemo(() => {
    const mode = isTasmiBlurActive ? "tasmi" : userData.settings.hifzBlur ? "all" : "off";
    if (mode === "off") return undefined;

    const passage = isTasmiBlurActive ? (tasmiState?.passage ?? null) : null;
    const revealed = isTasmiBlurActive ? (tasmiState?.revealedAyahs ?? new Set<AyahKey>()) : revealedSet;

    const merged = new Set<AyahKey>();
    for (const page of visiblePages) {
      const pageMask = computeBlurMask(page, mode, passage, revealed, peekedAyah);
      for (const k of pageMask) merged.add(k);
    }
    return merged;
  }, [
    isTasmiBlurActive,
    userData.settings.hifzBlur,
    tasmiState?.passage,
    tasmiState?.revealedAyahs,
    revealedSet,
    visiblePages,
    peekedAyah,
  ]);

  const effectiveMistakeAyahs = useMemo(() => {
    if (mistakeAyahs) return mistakeAyahs;
    if (tasmiState && tasmiState.confirmedMistakes.length > 0) {
      return buildMistakeBadges(tasmiState.confirmedMistakes);
    }
    return undefined;
  }, [mistakeAyahs, tasmiState]);

  const surahLabel = useMemo(() => {
    const ids = new Set<number>(rightPageEntry.surahs);
    if (leftPageEntry) {
      for (const s of leftPageEntry.surahs) ids.add(s);
    }
    const names = Array.from(ids)
      .map((id) => surahByNumber.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return "Al-Qur'an";
    return names.length <= 2 ? names.join(" · ") : `${names[0]} – ${names[names.length - 1]}`;
  }, [rightPageEntry, leftPageEntry, surahByNumber]);

  const juzNumber = getJuzForPage(rightPage);
  const pageLabel = leftPage ? `${rightPage}–${leftPage}` : `${rightPage}`;
  const canGoPrev = rightPage > MIN_PAGE;
  const canGoNext = (leftPage ?? rightPage) < MAX_PAGE;

  const selectedSurahName = selected
    ? surahByNumber.get(Number(selected.ayah.split(":")[0]))?.name ?? "Surah"
    : "";

  const effectiveStudyAyah = studyAyah ?? activeAyah;
  const studySurah = surahByNumber.get(parseAyahKey(effectiveStudyAyah).surah);

  const isSurahDownloaded = downloadedSurahs.has(`${audioState.reciterId}:${activeSurahNum}`);
  const hideAudioDock =
    focusMode && !audioState.isPlaying && !audioState.isLoading && downloadProgress === null;

  const getPageImageUrl = useCallback(
    (page: number) => platform.getPageImageUrl(page),
    [platform],
  );

  return (
    <div
      className={`app-shell ${focusMode ? "app-shell--focus" : ""} ${studyOpen ? "app-shell--drawer-open" : ""}`}
    >
      <TopBar
        surahLabel={surahLabel}
        juzNumber={juzNumber}
        pageLabel={pageLabel}
        spreadMode={userData.settings.spreadMode}
        hifzBlur={
          tasmiActive && tasmiState?.mode === "memorization"
            ? tasmiBlurEnabled
            : userData.settings.hifzBlur
        }
        focusMode={focusMode}
        theme={userData.settings.theme}
        onOpenPalette={(tab = "surah") => {
          setPaletteTab(tab);
          setPaletteOpen(true);
        }}
        onChangeSpreadMode={handleChangeSpreadMode}
        onToggleHifzBlur={() => {
          if (tasmiActive && tasmiState?.mode === "memorization") {
            setTasmiBlurEnabled((prev) => !prev);
          } else {
            handleToggleHifzBlur();
          }
        }}
        onToggleFocusMode={() => setFocusMode((prev) => !prev)}
        onChangeTheme={handleChangeTheme}
      />

      <MushafSpread
        rightPageEntry={rightPageEntry}
        leftPageEntry={leftPageEntry}
        pageUrls={pageUrls}
        selectedAyah={selected?.ayah ?? null}
        playingAyah={effectivePlayingAyah}
        highlights={userData.highlights}
        bookmarks={bookmarkSet}
        blurSet={blurSet}
        revealedSet={isTasmiBlurActive ? tasmiState?.revealedAyahs : revealedSet}
        mistakeAyahs={effectiveMistakeAyahs}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        isPaletteOpen={paletteOpen}
        getPageImageUrl={getPageImageUrl}
        onTurnPage={handleTurnPage}
        onSelectAyah={handleSelectAyah}
        onPeekAyah={handlePeekAyah}
        onClearSelection={() => setSelected(null)}
        onToggleFocus={() => setFocusMode((prev) => !prev)}
        onTogglePalette={() => {
          setPaletteTab("search");
          setPaletteOpen((prev) => !prev);
        }}
      />

      {selected && (
        <AyahPopover
          ayah={selected.ayah}
          surahName={selectedSurahName}
          anchorRect={selected.rect}
          isBookmarked={bookmarkSet.has(selected.ayah)}
          highlightColor={userData.highlights[selected.ayah] ?? null}
          onClose={() => setSelected(null)}
          onPlayAyah={(ayah) => {
            handlePlayAyah(ayah);
            setSelected(null);
          }}
          onOpenStudy={(ayah) => {
            handleOpenStudy(ayah);
            setSelected(null);
          }}
          onStartTasmi={(ayah) => {
            handleOpenTasmi(ayah);
            setSelected(null);
          }}
          onToggleBookmark={handleToggleBookmark}
          onSetHighlight={handleSetHighlight}
        />
      )}

      <AudioDock
        audioState={audioState}
        activeAyah={activeAyah}
        surahName={activeSurah?.name ?? "Surah"}
        reciters={catalog.reciters}
        hidden={hideAudioDock}
        downloadProgress={downloadProgress}
        isSurahDownloaded={isSurahDownloaded}
        onTogglePlay={handleTogglePlay}
        onPrev={() => {
          void audioController.prev();
        }}
        onNext={() => {
          void audioController.next();
        }}
        onChangeReciter={handleChangeReciter}
        onCycleRepeat={handleCycleRepeat}
        onCycleSpeed={handleCycleSpeed}
        onDownloadSurah={handleDownloadSurah}
        onOpenStudy={() => handleOpenStudy(activeAyah)}
        onOpenTasmi={() => handleOpenTasmi(activeAyah)}
      />

      <StudyDrawer
        open={studyOpen}
        ayah={effectiveStudyAyah}
        surahName={studySurah?.name ?? "Surah"}
        surahArabicName={studySurah?.arabicName ?? ""}
        quranApi={quranApi}
        translations={catalog.translations}
        tafsirs={catalog.tafsirs}
        translationId={userData.settings.translationId}
        tafsirId={userData.settings.tafsirId}
        isBookmarked={bookmarkSet.has(effectiveStudyAyah)}
        highlightColor={userData.highlights[effectiveStudyAyah] ?? null}
        note={userData.notes[effectiveStudyAyah] ?? ""}
        onClose={() => setStudyOpen(false)}
        onChangeTranslation={handleChangeTranslation}
        onChangeTafsir={handleChangeTafsir}
        onToggleBookmark={handleToggleBookmark}
        onSetHighlight={handleSetHighlight}
        onSaveNote={handleSaveNote}
        onPlayAyah={handlePlayAyah}
      />

      <NavPalette
        open={paletteOpen}
        initialTab={paletteTab}
        catalog={catalog}
        mushafMap={mushafMap}
        currentPage={currentPage}
        bookmarks={userData.bookmarks}
        notes={userData.notes}
        onClose={() => setPaletteOpen(false)}
        onJumpToPage={navigateToPage}
        onJumpToAyah={handleJumpToAyah}
        onToggleBookmark={handleToggleBookmark}
      />

      {tasmiActive && tasmiState && (
        <RecitationRibbon
          state={tasmiState}
          surahs={catalog.surahs}
          blurActive={isTasmiBlurActive}
          isPeeking={peekedAyah !== null}
          getAyahWords={wordLookup}
          onStop={() => {
            void handleStopTasmi();
          }}
        />
      )}

      <TasmiSheet
        open={tasmiSheetOpen}
        visiblePages={visiblePages}
        surahs={catalog.surahs}
        initialAyah={tasmiInitialAyah}
        historyCount={userData.tasmiHistory.length}
        loadingProgress={modelLoading}
        isStarting={tasmiStarting}
        error={tasmiError}
        onClose={() => setTasmiSheetOpen(false)}
        onCancelLoad={handleCancelModelLoad}
        onStartFree={() => {
          void startTasmiSession("free", null, false);
        }}
        onStartMemorization={(passage, enableBlur) => {
          void startTasmiSession("memorization", passage, enableBlur);
        }}
        onOpenHistory={handleOpenTasmiHistory}
      />

      <TasmiSummaryModal
        open={summaryModal.open}
        initialTab={summaryModal.tab}
        record={summaryModal.record}
        history={userData.tasmiHistory}
        surahs={catalog.surahs}
        getAyahWords={wordLookup}
        onClose={() => setSummaryModal((prev) => ({ ...prev, open: false }))}
        onPlayAyah={(ayah) => {
          setSummaryModal((prev) => ({ ...prev, open: false }));
          handleJumpToAyah(ayah);
          handlePlayAyah(ayah);
        }}
        onJumpToAyah={(ayah) => {
          setSummaryModal((prev) => ({ ...prev, open: false }));
          handleJumpToAyah(ayah);
        }}
      />

      {toast && (
        <div className="reader-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
