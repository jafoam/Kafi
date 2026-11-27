import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBackClose } from "./state/useBackClose";
import { useKeepAwake } from "./state/useKeepAwake";
import type { EngineEvent, LoadProgress } from "@tilawa/core";
import catalogJson from "./data/catalog.json";
import mushafMapJson from "./data/mushaf-map.json";
import type {
  AyahKey,
  Catalog,
  HifzBlurLevel,
  HighlightColor,
  MistakeBadge,
  MushafMap,
  SpreadMode,
  SyncConfig,
  TasmiSessionKind,
  TasmiSessionRecord,
  ThemeMode,
  UserData,
} from "./data/types";
import { getPlatform } from "./platform";
import { createQuranSearch, type RefV2Data } from "./services/arabic-search";
import { createSilenceAnalyzer } from "./services/audio-trim";
import { backupFileName, buildBackup, mergeBackup, saveBackupFile } from "./services/backup";
import {
  compareAyahKeys,
  createAudioController,
  DEFAULT_SCOPE,
  parseAyahKey,
  REPEAT_OPTIONS,
  SPEED_OPTIONS,
  type AudioState,
  type PlaybackScope,
} from "./services/audio-controller";
import { isSurahComplete } from "./services/audio-downloads";
import { juzRange, pageRange } from "./services/playback-ranges";
import { useAudioDownloads } from "./state/useAudioDownloads";
import { useTextDownloads } from "./state/useTextDownloads";
import { createQuranApi } from "./services/quran-api";
import {
  buildMistakeBadges,
  cleanlyRecitedAyahs,
  computeBlurMask,
  countRecitedAyahs,
  createTasmiState,
  recordPeekMistake,
  pickRandomChallenge,
  reduceTilawaEvent,
  resolvePromptAudio,
  type DeclaredPassage,
  type RandomChallenge,
  type RandomPool,
  type TasmiLiveState,
} from "./services/tasmi-logic";
import { createTilawaController } from "./services/tilawa-controller";
import {
  parseSyncConfig,
  mergeUserData,
  SYNC_CONFIG_KEY,
  syncUserData,
} from "./services/sync-service";
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
import { AudioDownloadsPanel, type DownloadsTab } from "./components/AudioDownloadsPanel";
import { TasmiLauncher } from "./components/TasmiLauncher";
import { AyahPopover } from "./components/AyahPopover";
import { MushafSpread } from "./components/MushafSpread";
import { MushafScroll } from "./components/MushafScroll";
import { NavPalette, type PaletteTab } from "./components/NavPalette";
import { createGlyphPageLoader } from "./services/glyph-pages";
import {
  createWordSegmentLoader,
  findActiveWordRange,
  type WordSegment,
} from "./services/word-segments";
import type { SelectedWord } from "./services/word-translations";
import { useOfflinePages } from "./state/useOfflinePages";
import { useTajweedPages } from "./state/useTajweedPages";
import { usePwaInstall } from "./state/usePwaInstall";
import {
  RecitationRibbon,
  type ErrorDrillInfo,
  type RandomPromptInfo,
} from "./components/RecitationRibbon";
import { StudyDrawer } from "./components/StudyDrawer";
import { TranslationReader } from "./components/TranslationReader";
import { SyncModal } from "./components/SyncModal";
import { TasmiSheet } from "./components/TasmiSheet";
import { TasmiGuide } from "./components/TasmiGuide";
import { TajweedGuide } from "./components/TajweedGuide";
import { AboutSources } from "./components/AboutSources";
import { TasmiSummaryModal } from "./components/TasmiSummaryModal";
import { TopBar } from "./components/TopBar";

const catalog = catalogJson as unknown as Catalog;
const mushafMap = mushafMapJson as unknown as MushafMap;
const TASMI_HINT_KEY = "kafi:hint:tasmi";

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

function getAyahArabicText(ayah: AyahKey): Promise<string> {
  const [surah, num] = ayah.split(":").map(Number);
  return loadWordLookup().then((lookup) => lookup(surah, num).join(" "));
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
  isBismillah: false,
  reciterId: DEFAULT_USER_DATA.settings.reciterId,
  repeatCount: 1,
  scope: DEFAULT_SCOPE,
  speed: 1,
  talaqqi: false,
  isTalaqqiPause: false,
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
  const tilawaStorage = useMemo(() => platform.createTilawaStorage(), [platform]);
  const v1GlyphLoader = useMemo(() => createGlyphPageLoader(platform), [platform]);
  const tajweedGlyphLoader = useMemo(() => createGlyphPageLoader(platform, "tajweed"), [platform]);
  const segmentLoader = useMemo(() => createWordSegmentLoader(platform), [platform]);
  const [ayahPages, setAyahPages] = useState<Map<AyahKey, number[]> | null>(null);
  const [surahSegments, setSurahSegments] = useState<Map<AyahKey, WordSegment[]> | null>(null);
  const [playingWordRange, setPlayingWordRange] = useState<[number, number] | null>(null);

  useEffect(() => {
    let live = true;
    v1GlyphLoader.loadAyahPages().then(
      (idx) => {
        if (live) setAyahPages(idx);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [v1GlyphLoader]);

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
        analyzeSilence: createSilenceAnalyzer(),
        resolveRange: (kind, ayah) =>
          kind === "page" ? pageRange(mushafMap, ayah) : juzRange(catalog, ayah),
      }),
    [quranApi, reciterById],
  );

  const [userData, setUserData] = useState<UserData>(DEFAULT_USER_DATA);
  const [currentPage, setCurrentPage] = useState<number>(DEFAULT_USER_DATA.lastPage);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [pageUrls, setPageUrls] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<{
    ayah: AyahKey;
    rect: DOMRect;
    word?: SelectedWord;
  } | null>(null);
  const [lastSelectedAyah, setLastSelectedAyah] = useState<AyahKey | null>(null);
  const [glyphAyahs, setGlyphAyahs] = useState<Record<number, AyahKey[]>>({});
  // The 1441 letters come from the tajweed fonts; without tajweed they are drawn in plain ink.
  const uses1441Letters = userData.settings.tajweed || userData.settings.letterStyle === "1441";
  const glyphLoader = uses1441Letters ? tajweedGlyphLoader : v1GlyphLoader;
  const [focusMode, setFocusMode] = useState(false);
  const [tasmiHint, setTasmiHint] = useState(false);
  const [tasmiGuideOpen, setTasmiGuideOpen] = useState(false);
  const [tajweedGuideOpen, setTajweedGuideOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const [dockPopupOpen, setDockPopupOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteTab, setPaletteTab] = useState<PaletteTab>("surah");
  const [revealedSet, setRevealedSet] = useState<Set<AyahKey>>(() => new Set());
  const [audioState, setAudioState] = useState<AudioState>(INITIAL_AUDIO_STATE);
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyAyah, setStudyAyah] = useState<AyahKey | null>(null);
  const [readerAyah, setReaderAyah] = useState<AyahKey | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadsTab, setDownloadsTab] = useState<DownloadsTab>("audio");
  const [toast, setToast] = useState<string | null>(null);

  const [tasmiSheetOpen, setTasmiSheetOpen] = useState(false);
  const [tasmiInitialAyah, setTasmiInitialAyah] = useState<AyahKey | null>(null);
  const [tasmiActive, setTasmiActive] = useState(false);
  const [tasmiState, setTasmiState] = useState<TasmiLiveState | null>(null);
  const [tasmiBlurEnabled, setTasmiBlurEnabled] = useState(true);
  const [randomPool, setRandomPool] = useState<RandomPool | null>(null);
  const [randomPrompt, setRandomPrompt] = useState<RandomPromptInfo | null>(null);
  const [errorDrill, setErrorDrill] = useState<(ErrorDrillInfo & { ayahs: AyahKey[] }) | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [peekedAyah, setPeekedAyah] = useState<AyahKey | null>(null);
  const [modelLoading, setModelLoading] = useState<LoadProgress | null>(null);
  const [tasmiStarting, setTasmiStarting] = useState(false);
  const [tasmiError, setTasmiError] = useState<string | null>(null);
  const [wordLookup, setWordLookup] = useState<WordLookupFn>(() => EMPTY_WORD_LOOKUP);
  const [summaryModal, setSummaryModal] = useState<{
    open: boolean;
    tab: "summary" | "history" | "schedule";
    record: TasmiSessionRecord | null;
  }>({ open: false, tab: "summary", record: null });

  const toastTimerRef = useRef<number | null>(null);
  const peekTimerRef = useRef<number | null>(null);
  const requestedPagesRef = useRef<Set<number>>(new Set());
  const tilawaAbortRef = useRef<AbortController | null>(null);
  const promptAbortRef = useRef<AbortController | null>(null);
  const promptAudioRef = useRef<HTMLAudioElement | null>(null);
  const randomRoundSeqRef = useRef<number>(0);
  const tasmiSessionKindRef = useRef<TasmiSessionKind>("murajaah");
  const tasmiPeekedAyahsRef = useRef<Set<AyahKey>>(new Set());
  const syncInFlightRef = useRef(false);
  const skipNextAutoSyncRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const userDataRef = useRef<UserData>(DEFAULT_USER_DATA);
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
      tilawaAbortRef.current?.abort();
      promptAbortRef.current?.abort();
      if (promptAudioRef.current) {
        promptAudioRef.current.onended = null;
        promptAudioRef.current.onerror = null;
        promptAudioRef.current.pause();
        promptAudioRef.current.src = "";
        promptAudioRef.current = null;
      }
      if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
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

  const persistUser = useCallback(
    (promise: Promise<UserData>) => {
      void promise
        .then((next) => {
          if (mountedRef.current) setUserData(next);
        })
        .catch(() => {
          if (mountedRef.current) showToast("Gagal menyimpan data lokal");
        });
    },
    [showToast],
  );

  useEffect(() => {
    userDataRef.current = userData;
  }, [userData]);

  const executeSync = useCallback(
    async (cfg: SyncConfig, data: UserData, silent: boolean) => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      if (!silent) {
        setSyncing(true);
        setSyncError(null);
      }
      try {
        const result = await syncUserData({
          code: cfg.code,
          workerUrl: cfg.workerUrl,
          localData: data,
        });
        if (!mountedRef.current) return;
        // Merge into what is stored now, so a change made while the request was
        // in flight (e.g. removing a bookmark) is not overwritten.
        const saved = await userStore.replaceWith((current) => mergeUserData(current, result.merged));
        skipNextAutoSyncRef.current = true;
        setUserData(saved);
        setCurrentPage(saved.lastPage);
        audioController.setReciter(saved.settings.reciterId);

        const nextCfg: SyncConfig = { ...cfg, lastSyncedAt: result.updatedAt };
        setSyncConfig(nextCfg);
        await platform.kvSet(SYNC_CONFIG_KEY, JSON.stringify(nextCfg));
        if (!silent) {
          showToast(result.pulled ? "Data tersinkron antar perangkat" : "Data terunggah ke sync");
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : "Gagal menyinkronkan data.";
        if (!silent) setSyncError(message);
      } finally {
        syncInFlightRef.current = false;
        if (mountedRef.current && !silent) setSyncing(false);
      }
    },
    [userStore, audioController, platform, showToast],
  );

  // Load persisted user data & sync config on mount
  useEffect(() => {
    let active = true;
    void Promise.all([userStore.load(), platform.kvGet(SYNC_CONFIG_KEY).catch(() => null)])
      .then(([loaded, rawSync]) => {
        if (!active) return;
        userDataRef.current = loaded;
        setUserData(loaded);
        setCurrentPage(loaded.lastPage);
        audioController.setReciter(loaded.settings.reciterId);

        const cfg = parseSyncConfig(rawSync);
        if (cfg) {
          setSyncConfig(cfg);
          if (typeof navigator === "undefined" || navigator.onLine !== false) {
            void executeSync(cfg, loaded, true);
          }
        }
      })
      .catch(() => {
        if (active) showToast("Gagal memuat data lokal");
      });
    return () => {
      active = false;
    };
  }, [userStore, platform, audioController, showToast, executeSync]);

  // Debounced background sync whenever local userData changes while connected
  useEffect(() => {
    if (!syncConfig || !userData.updatedAt) return;
    if (skipNextAutoSyncRef.current) {
      skipNextAutoSyncRef.current = false;
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void executeSync(syncConfig, userDataRef.current, true);
    }, 4000);
    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [syncConfig, userData.updatedAt, executeSync]);

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

  const scrollMode = userData.settings.pageNav !== "swipe";
  const effectiveSpread = scrollMode
    ? "single"
    : resolveEffectiveSpread(userData.settings.spreadMode, viewportWidth);
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

  const handleRetryPage = useCallback(
    (page: number) => {
      requestedPagesRef.current.delete(page);
      requestedPagesRef.current.add(page);
      void platform
        .getPageImageUrl(page)
        .then((url) => {
          if (!mountedRef.current) return;
          setPageUrls((prev) => ({ ...prev, [page]: url }));
        })
        .catch(() => {
          requestedPagesRef.current.delete(page);
        });
    },
    [platform],
  );

  // Clear temporary Hifz peeks and selection when navigating pages
  useEffect(() => {
    setSelected(null);
    setLastSelectedAyah(null);
    setRevealedSet(new Set());
    setPeekedAyah(null);
  }, [rightPage, leftPage]);

  const navigateToPage = useCallback(
    (page: number) => {
      const clamped = clampPage(page);
      setCurrentPage(clamped);
      persistUser(userStore.setLastPage(clamped));
    },
    [userStore, persistUser],
  );

  const getPagesForAyah = useCallback(
    (ayah: AyahKey): number[] => {
      const qcfPages = ayahPages?.get(ayah);
      if (qcfPages && qcfPages.length > 0) return qcfPages;
      const fallback = mushafMap.ayahToPage[ayah];
      return fallback ? [fallback] : [];
    },
    [ayahPages],
  );

  // Auto-turn mushaf page when active playing ayah moves outside the visible spread
  useEffect(() => {
    if (!audioState.currentAyah) {
      lastAutoTurnAyahRef.current = null;
      return;
    }
    if (!audioState.isPlaying && !audioState.isLoading) return;
    if (audioState.currentAyah === lastAutoTurnAyahRef.current) return;
    lastAutoTurnAyahRef.current = audioState.currentAyah;

    const pages = getPagesForAyah(audioState.currentAyah);
    const isVisible = pages.includes(rightPage) || (leftPage !== null && pages.includes(leftPage));
    if (!isVisible && pages[0]) {
      navigateToPage(pages[0]);
    }
  }, [
    audioState.currentAyah,
    audioState.isPlaying,
    audioState.isLoading,
    rightPage,
    leftPage,
    getPagesForAyah,
    navigateToPage,
  ]);

  // Auto-turn mushaf page when active Tasmi' / Baca Bebas ayah moves outside visible spread
  useEffect(() => {
    const tasmiAyah = tasmiActive ? tasmiState?.activeAyah ?? null : null;
    if (!tasmiAyah) {
      lastTasmiTurnAyahRef.current = null;
      return;
    }
    if (tasmiAyah === lastTasmiTurnAyahRef.current) return;
    lastTasmiTurnAyahRef.current = tasmiAyah;

    const pages = getPagesForAyah(tasmiAyah);
    const isVisible = pages.includes(rightPage) || (leftPage !== null && pages.includes(leftPage));
    if (!isVisible && pages[0]) {
      navigateToPage(pages[0]);
    }
  }, [tasmiActive, tasmiState?.activeAyah, rightPage, leftPage, getPagesForAyah, navigateToPage]);

  // Load word-level audio timing segments for the currently playing surah & reciter
  const playingSurahNum = audioState.currentAyah ? parseAyahKey(audioState.currentAyah).surah : null;
  useEffect(() => {
    if (!playingSurahNum) {
      setSurahSegments(null);
      return;
    }
    let live = true;
    setSurahSegments(null);
    segmentLoader.load(audioState.reciterId, playingSurahNum).then(
      (map) => {
        if (live) setSurahSegments(map);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [segmentLoader, audioState.reciterId, playingSurahNum]);

  // Sync per-glyph highlight with audio.currentTime while playing
  useEffect(() => {
    const ayah = audioState.currentAyah;
    const segments =
      audioState.isPlaying && !audioState.isBismillah && ayah ? surahSegments?.get(ayah) : null;
    if (!segments || segments.length === 0) {
      setPlayingWordRange(null);
      return;
    }

    let rafId = 0;
    const tick = () => {
      const next = findActiveWordRange(segments, audioController.getCurrentTimeMs());
      setPlayingWordRange((prev) =>
        prev?.[0] === next?.[0] && prev?.[1] === next?.[1] ? prev : next,
      );
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [audioState.isPlaying, audioState.isBismillah, audioState.currentAyah, surahSegments, audioController]);


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
    const printedFirst = glyphAyahs[rightPage]?.[0];
    if (printedFirst) return printedFirst;
    const first = rightPageEntry.ayahs[0];
    return first ? (`${first.surah}:${first.ayah}` as AyahKey) : "1:1";
  }, [glyphAyahs, rightPage, rightPageEntry]);

  const isAyahOnVisiblePages = useCallback(
    (ayah: AyahKey | null): boolean => {
      if (!ayah) return false;
      const rightPrinted = glyphAyahs[rightPage];
      const leftPrinted = leftPage ? glyphAyahs[leftPage] : undefined;
      if (rightPrinted || leftPrinted) {
        return Boolean(rightPrinted?.includes(ayah) || leftPrinted?.includes(ayah));
      }
      const p = mushafMap.ayahToPage[ayah];
      return p === rightPage || (leftPage !== null && p === leftPage);
    },
    [glyphAyahs, rightPage, leftPage],
  );

  const effectivePlayingAyah =
    playingAyah ??
    (tasmiActive
      ? (tasmiState?.activeAyah ?? errorDrill?.ayah ?? randomPrompt?.ayah ?? null)
      : audioState.currentAyah);
  const isAudioOnVisiblePage = isAyahOnVisiblePages(audioState.currentAyah);

  const playTargetAyah = useMemo<AyahKey>(() => {
    const picked = selected?.ayah ?? (isAyahOnVisiblePages(lastSelectedAyah) ? lastSelectedAyah : null);
    let candidate: AyahKey =
      picked ?? (isAudioOnVisiblePage && audioState.currentAyah ? audioState.currentAyah : fallbackAyah);

    if (audioState.scope.kind === "custom" && audioState.scope.from && audioState.scope.to) {
      const inRange =
        compareAyahKeys(candidate, audioState.scope.from) >= 0 &&
        compareAyahKeys(candidate, audioState.scope.to) <= 0;
      if (!inRange) candidate = audioState.scope.from;
    }
    return candidate;
  }, [
    selected?.ayah,
    lastSelectedAyah,
    isAyahOnVisiblePages,
    isAudioOnVisiblePage,
    audioState.currentAyah,
    audioState.scope,
    fallbackAyah,
  ]);

  const activeAyah: AyahKey =
    playingAyah ??
    (tasmiActive ? (tasmiState?.activeAyah ?? null) : null) ??
    (audioState.isPlaying || audioState.isLoading || audioState.isTalaqqiPause
      ? (audioState.currentAyah ?? playTargetAyah)
      : playTargetAyah);
  const isAudioRelevant = Boolean(
    audioState.currentAyah && (audioState.isPlaying || isAudioOnVisiblePage),
  );
  const tasmiContextAyah: AyahKey | null =
    playingAyah ?? (isAudioRelevant ? audioState.currentAyah! : (selected?.ayah ?? null));
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
      setLastSelectedAyah(ayah);
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
    if (audioState.isPlaying || audioState.isLoading || audioState.isTalaqqiPause) {
      audioController.togglePlay();
      return;
    }
    if (audioState.currentAyah && playTargetAyah === audioState.currentAyah) {
      audioController.togglePlay();
    } else {
      handlePlayAyah(playTargetAyah);
    }
  }, [
    audioState.isPlaying,
    audioState.isLoading,
    audioState.isTalaqqiPause,
    audioState.currentAyah,
    playTargetAyah,
    audioController,
    handlePlayAyah,
  ]);

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
      const targetPage = getPagesForAyah(ayah)[0];
      if (targetPage) {
        navigateToPage(targetPage);
      }
    },
    [getPagesForAyah, navigateToPage],
  );

  const handleChangeSpreadMode = useCallback(
    (spreadMode: SpreadMode) => {
      persistUser(userStore.updateSettings({ spreadMode }));
    },
    [userStore, persistUser],
  );

  const handleChangeTheme = useCallback(
    (theme: ThemeMode) => {
      persistUser(userStore.updateSettings({ theme }));
    },
    [userStore, persistUser],
  );

  const handleChangeReciter = useCallback(
    (reciterId: string) => {
      audioController.setReciter(reciterId);
      persistUser(userStore.updateSettings({ reciterId }));
    },
    [audioController, userStore, persistUser],
  );

  const handleChangeTranslation = useCallback(
    (translationId: number) => {
      persistUser(userStore.updateSettings({ translationId }));
    },
    [userStore, persistUser],
  );

  const handleChangeTafsir = useCallback(
    (tafsirId: string) => {
      persistUser(userStore.updateSettings({ tafsirId }));
    },
    [userStore, persistUser],
  );

  const handleCycleRepeat = useCallback(() => {
    const idx = REPEAT_OPTIONS.indexOf(audioState.repeatCount);
    const next = REPEAT_OPTIONS[(idx + 1) % REPEAT_OPTIONS.length];
    audioController.setRepeat(next);
  }, [audioState.repeatCount, audioController]);

  const handleChangeScope = useCallback(
    (scope: PlaybackScope) => audioController.setScope(scope),
    [audioController],
  );

  const handleToggleTalaqqi = useCallback(
    (enabled: boolean) => audioController.setTalaqqi(enabled),
    [audioController],
  );

  const handleChangeHifzBlurLevel = useCallback(
    (hifzBlurLevel: HifzBlurLevel) => {
      persistUser(userStore.updateSettings({ hifzBlurLevel }));
    },
    [userStore, persistUser],
  );

  const handleCycleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(audioState.speed as (typeof SPEED_OPTIONS)[number]);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    audioController.setSpeed(next);
  }, [audioState.speed, audioController]);

  const downloads = useAudioDownloads({
    platform,
    api: quranApi,
    surahs: catalog.surahs,
    reciterId: audioState.reciterId,
    folder: reciterById.get(audioState.reciterId)?.subfolder ?? audioState.reciterId,
  });

  const textDownloads = useTextDownloads({
    platform,
    api: quranApi,
    translations: catalog.translations,
    tafsirs: catalog.tafsirs,
  });

  const openDownloads = useCallback((tab: DownloadsTab = "audio") => {
    setDownloadsTab(tab);
    setDownloadsOpen(true);
  }, []);

  // One tap on the player's button saves the surah being read; when it is saved or already
  // downloading, the same button opens the download screen to manage it.
  const handleDockDownload = useCallback(() => {
    if (!activeSurah) return;
    const saved = isSurahComplete(downloads.status?.bySurah.get(activeSurah.number));
    const downloading = downloads.state.phase !== "idle";
    if (saved || downloading) {
      openDownloads("audio");
      return;
    }
    downloads.start([activeSurah.number]);
  }, [activeSurah, downloads, openDownloads]);

  // Tell the reader when a text download finishes.
  const prevTextPhaseRef = useRef(textDownloads.state.phase);
  useEffect(() => {
    const was = prevTextPhaseRef.current;
    prevTextPhaseRef.current = textDownloads.state.phase;
    if (was !== "running" || textDownloads.state.phase !== "idle") return;
    const label = textDownloads.state.kind === "tafsir" ? "Tafsir" : "Terjemahan";
    showToast(`${label} tersimpan offline`);
  }, [textDownloads.state.phase, textDownloads.state.kind, showToast]);

  // Tell the reader when a download finishes.
  const previousPhaseRef = useRef(downloads.state.phase);
  useEffect(() => {
    const was = previousPhaseRef.current;
    previousPhaseRef.current = downloads.state.phase;
    if (was !== "running" || downloads.state.phase !== "idle") return;
    const done = downloads.state.finished;
    if (done.length === 1) {
      const name = catalog.surahs.find((s) => s.number === done[0])?.name;
      showToast(`${name ?? "Surah"} tersimpan offline`);
    } else if (done.length > 1) {
      showToast(`${done.length} surah tersimpan offline`);
    }
  }, [downloads.state.phase, downloads.state.finished, showToast]);

  const handleToggleHifzBlur = useCallback(() => {
    const next = !userData.settings.hifzBlur;
    setRevealedSet(new Set());
    persistUser(userStore.updateSettings({ hifzBlur: next }));
  }, [userData.settings.hifzBlur, userStore, persistUser]);

  const handleToggleBookmark = useCallback(
    (ayah: AyahKey) => {
      persistUser(userStore.toggleBookmark(ayah));
    },
    [userStore, persistUser],
  );

  const handleSetHighlight = useCallback(
    (ayah: AyahKey, color: HighlightColor | null) => {
      persistUser(userStore.setHighlight(ayah, color));
    },
    [userStore, persistUser],
  );

  const handleSaveNote = useCallback(
    (ayah: AyahKey, text: string) => {
      persistUser(userStore.setNote(ayah, text));
    },
    [userStore, persistUser],
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

  // Tasmi' is the app's signature feature: introduce it once, a moment after the first launch.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    platform
      .kvGet(TASMI_HINT_KEY)
      .then((seen) => {
        if (!seen && !cancelled) timer = window.setTimeout(() => setTasmiHint(true), 1800);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [platform]);

  const dismissTasmiHint = useCallback(() => {
    setTasmiHint(false);
    void platform.kvSet(TASMI_HINT_KEY, "1").catch(() => undefined);
  }, [platform]);

  // Pre-warm the Tasmi' WASM engine in the background if the model is already cached on device
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void tilawaController.warmupIfCached();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [tilawaController]);

  useEffect(() => {
    if (tasmiSheetOpen) {
      void tilawaController.warmupIfCached();
    }
  }, [tasmiSheetOpen, tilawaController]);

  const handleOpenTasmi = useCallback(
    (ayah: AyahKey | null) => {
      if (onStartTasmi) {
        onStartTasmi(ayah ?? fallbackAyah);
        return;
      }
      setTasmiError(null);
      setTasmiInitialAyah(ayah);
      setTasmiSheetOpen(true);
    },
    [onStartTasmi, fallbackAyah],
  );

  const handleCancelModelLoad = useCallback(() => {
    tilawaAbortRef.current?.abort();
    tilawaAbortRef.current = null;
    setModelLoading(null);
    setTasmiError("Unduhan model dibatalkan.");
  }, []);

  const stopPromptAudio = useCallback(() => {
    randomRoundSeqRef.current += 1;
    promptAbortRef.current?.abort();
    promptAbortRef.current = null;
    const audio = promptAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
      promptAudioRef.current = null;
    }
  }, []);

  const playSinglePromptAudio = useCallback(
    (url: string, speed: number, signal: AbortSignal): Promise<void> =>
      new Promise((resolve, reject) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        const audio = new Audio(url);
        audio.playbackRate = speed;
        promptAudioRef.current = audio;

        const cleanup = () => {
          audio.onended = null;
          audio.onerror = null;
          signal.removeEventListener("abort", onAbort);
          if (promptAudioRef.current === audio) promptAudioRef.current = null;
        };
        const onAbort = () => {
          cleanup();
          audio.pause();
          audio.src = "";
          resolve();
        };

        signal.addEventListener("abort", onAbort, { once: true });
        audio.onended = () => {
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error("Gagal memutar audio pemicu"));
        };
        void audio.play().catch((err) => {
          cleanup();
          reject(err);
        });
      }),
    [],
  );

  const startTasmiSession = useCallback(
    async (
      mode: "free" | "memorization",
      passage: DeclaredPassage | null,
      enableBlur: boolean,
      kind: TasmiSessionKind = "murajaah",
    ) => {
      if (tasmiStartingRef.current) return;
      tasmiStartingRef.current = true;
      setTasmiStarting(true);

      // Pause Murottal and any Uji Acak / Error Drill audio before activating Tasmi' mic
      stopPromptAudio();
      setRandomPool(null);
      setRandomPrompt(null);
      setErrorDrill(null);
      tasmiSessionKindRef.current = kind;
      tasmiPeekedAyahsRef.current = new Set();
      audioController.pause();
      setTasmiError(null);

      tilawaAbortRef.current?.abort();
      const abort = new AbortController();
      tilawaAbortRef.current = abort;

      // Close sheet immediately and show the live ribbon + blur so startup feels responsive.
      const initial = createTasmiState(mode, passage);
      tasmiStateRef.current = initial;
      tasmiStartedAtRef.current = Date.now();
      setTasmiState(initial);
      setTasmiBlurEnabled(mode === "memorization" ? enableBlur : false);
      setPeekedAyah(null);
      setTasmiSheetOpen(false);
      if (mode === "memorization" && passage) {
        const startPage = getPagesForAyah(`${passage.surah}:${passage.fromAyah}`)[0];
        if (startPage && startPage !== rightPage && startPage !== leftPage) {
          navigateToPage(startPage);
        }
      }

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
        }

        if (!mountedRef.current || abort.signal.aborted) return;
        setTasmiActive(true);
      } catch (err) {
        if (!mountedRef.current) return;
        setModelLoading(null);
        tasmiStateRef.current = null;
        setTasmiState(null);
        if (abort.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Gagal memulai Tasmi'.";
        setTasmiError(message);
        setTasmiSheetOpen(true);
      } finally {
        tasmiStartingRef.current = false;
        if (mountedRef.current) setTasmiStarting(false);
      }
    },
    [
      stopPromptAudio,
      audioController,
      ensureWordLookup,
      tilawaController,
      getPagesForAyah,
      rightPage,
      leftPage,
      navigateToPage,
    ],
  );

  const startRandomChallenge = useCallback(
    async (challenge: RandomChallenge, pool: RandomPool, enableBlur: boolean) => {
      if (tasmiStartingRef.current) return;
      tasmiStartingRef.current = true;
      setTasmiStarting(true);

      stopPromptAudio();
      const seq = randomRoundSeqRef.current;
      setErrorDrill(null);
      tasmiSessionKindRef.current = "murajaah";
      tasmiPeekedAyahsRef.current = new Set();
      audioController.pause();
      setTasmiError(null);

      tilawaAbortRef.current?.abort();
      const abort = new AbortController();
      tilawaAbortRef.current = abort;

      try {
        // Stop any active mic before reciting the prompt ayah so the mic doesn't hear the speaker.
        await tilawaController.stop().catch(() => {});

        const [lookup] = await Promise.all([
          ensureWordLookup(),
          tilawaController.ensureReady((progress) => {
            if (!mountedRef.current || abort.signal.aborted) return;
            setModelLoading(progress);
          }, abort.signal),
        ]);

        if (!mountedRef.current || abort.signal.aborted || seq !== randomRoundSeqRef.current) return;
        setModelLoading(null);

        const initial = createTasmiState("memorization", challenge.passage);
        tasmiStateRef.current = initial;
        tasmiStartedAtRef.current = Date.now();
        setRandomPool(pool);
        setRandomPrompt({ ayah: challenge.promptAyah, playing: true });
        setTasmiState(initial);
        setTasmiBlurEnabled(enableBlur);
        setPeekedAyah(null);
        setTasmiActive(true);
        setTasmiSheetOpen(false);

        const promptPage = mushafMap.ayahToPage[challenge.promptAyah];
        if (promptPage && promptPage !== rightPage && promptPage !== leftPage) {
          navigateToPage(promptPage);
        }

        // Release sheet busy lock now that the session is live on screen.
        tasmiStartingRef.current = false;
        setTasmiStarting(false);

        const promptAbort = new AbortController();
        promptAbortRef.current = promptAbort;
        const { surah: pSurah, ayah: pAyah } = parseAyahKey(challenge.promptAyah);
        const match = await resolvePromptAudio(
          pSurah,
          pAyah,
          audioState.reciterId,
          catalog.reciters,
          platform,
          quranApi,
          { signal: promptAbort.signal },
        );

        if (!mountedRef.current || promptAbort.signal.aborted || seq !== randomRoundSeqRef.current) {
          return;
        }

        if (match) {
          setRandomPrompt({
            ayah: challenge.promptAyah,
            playing: true,
            reciterName: match.reciter.name,
          });
          try {
            await playSinglePromptAudio(match.url, audioState.speed, promptAbort.signal);
          } catch {
            if (mountedRef.current && !promptAbort.signal.aborted && seq === randomRoundSeqRef.current) {
              showToast("Gagal memutar audio pemicu — lanjutkan bacaan");
            }
          }
        } else {
          showToast("Audio pemicu tidak tersedia offline — lanjutkan bacaan");
        }

        if (!mountedRef.current || promptAbort.signal.aborted || seq !== randomRoundSeqRef.current) {
          return;
        }

        setRandomPrompt({
          ayah: challenge.promptAyah,
          playing: false,
          reciterName: match?.reciter.name,
        });

        const onEvent = (event: EngineEvent) => {
          if (!mountedRef.current || seq !== randomRoundSeqRef.current) return;
          const base = tasmiStateRef.current ?? initial;
          const next = reduceTilawaEvent(base, event, lookup);
          tasmiStateRef.current = next;
          setTasmiState(next);
        };

        await tilawaController.startMemorization(challenge.passage, onEvent);
      } catch (err) {
        if (!mountedRef.current || seq !== randomRoundSeqRef.current) return;
        setModelLoading(null);
        if (abort.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Gagal memulai Uji Acak.";
        setTasmiError(message);
        showToast(message);
      } finally {
        tasmiStartingRef.current = false;
        if (mountedRef.current) setTasmiStarting(false);
      }
    },
    [
      stopPromptAudio,
      audioController,
      tilawaController,
      ensureWordLookup,
      rightPage,
      leftPage,
      navigateToPage,
      audioState.reciterId,
      audioState.speed,
      platform,
      quranApi,
      playSinglePromptAudio,
      showToast,
    ],
  );

  const runDrillStep = useCallback(
    async (ayahs: AyahKey[], index: number, skipListen = false) => {
      const targetAyah = ayahs[index];
      if (!targetAyah) return;
      if (tasmiStartingRef.current) return;
      tasmiStartingRef.current = true;
      setTasmiStarting(true);

      stopPromptAudio();
      const seq = randomRoundSeqRef.current;
      setRandomPool(null);
      setRandomPrompt(null);
      setSummaryModal((prev) => ({ ...prev, open: false }));
      tasmiSessionKindRef.current = "murajaah";
      tasmiPeekedAyahsRef.current = new Set();
      audioController.pause();
      setTasmiError(null);

      tilawaAbortRef.current?.abort();
      const abort = new AbortController();
      tilawaAbortRef.current = abort;

      const { surah, ayah } = parseAyahKey(targetAyah);
      const passage: DeclaredPassage = { surah, fromAyah: ayah, toAyah: ayah };
      const totalLoops = 2;

      try {
        await tilawaController.stop().catch(() => {});

        const [lookup] = await Promise.all([
          ensureWordLookup(),
          tilawaController.ensureReady((progress) => {
            if (!mountedRef.current || abort.signal.aborted) return;
            setModelLoading(progress);
          }, abort.signal),
        ]);

        if (!mountedRef.current || abort.signal.aborted || seq !== randomRoundSeqRef.current) return;
        setModelLoading(null);

        const initial = createTasmiState("memorization", passage);
        tasmiStateRef.current = initial;
        tasmiStartedAtRef.current = Date.now();
        setTasmiState(initial);
        setPeekedAyah(null);
        setTasmiActive(true);
        setTasmiSheetOpen(false);

        const page = mushafMap.ayahToPage[targetAyah];
        if (page && page !== rightPage && page !== leftPage) {
          navigateToPage(page);
        }

        tasmiStartingRef.current = false;
        setTasmiStarting(false);

        if (!skipListen) {
          // Keep the ayah visible while looping murottal so the reader reinforces the right text.
          setTasmiBlurEnabled(false);
          const promptAbort = new AbortController();
          promptAbortRef.current = promptAbort;

          const match = await resolvePromptAudio(
            surah,
            ayah,
            audioState.reciterId,
            catalog.reciters,
            platform,
            quranApi,
            { signal: promptAbort.signal },
          );

          if (!mountedRef.current || promptAbort.signal.aborted || seq !== randomRoundSeqRef.current) {
            return;
          }

          if (match) {
            for (let loop = 1; loop <= totalLoops; loop += 1) {
              if (!mountedRef.current || promptAbort.signal.aborted || seq !== randomRoundSeqRef.current) {
                return;
              }
              setErrorDrill({
                ayahs,
                ayah: targetAyah,
                index,
                total: ayahs.length,
                phase: "listen",
                loop,
                totalLoops,
              });
              try {
                await playSinglePromptAudio(match.url, audioState.speed, promptAbort.signal);
              } catch {
                break;
              }
            }
          } else {
            showToast("Audio murottal tidak tersedia offline — langsung Tasmi' ulang");
          }

          if (!mountedRef.current || promptAbort.signal.aborted || seq !== randomRoundSeqRef.current) {
            return;
          }
        }

        setTasmiBlurEnabled(true);
        setErrorDrill({
          ayahs,
          ayah: targetAyah,
          index,
          total: ayahs.length,
          phase: "recite",
          loop: totalLoops,
          totalLoops,
        });

        const onEvent = (event: EngineEvent) => {
          if (!mountedRef.current || seq !== randomRoundSeqRef.current) return;
          const base = tasmiStateRef.current ?? initial;
          const next = reduceTilawaEvent(base, event, lookup);
          tasmiStateRef.current = next;
          setTasmiState(next);
        };

        await tilawaController.startMemorization(passage, onEvent);
      } catch (err) {
        if (!mountedRef.current || seq !== randomRoundSeqRef.current) return;
        setModelLoading(null);
        if (abort.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Gagal memulai Latih Kesalahan.";
        setTasmiError(message);
        showToast(message);
      } finally {
        tasmiStartingRef.current = false;
        if (mountedRef.current) setTasmiStarting(false);
      }
    },
    [
      stopPromptAudio,
      audioController,
      tilawaController,
      ensureWordLookup,
      rightPage,
      leftPage,
      navigateToPage,
      audioState.reciterId,
      audioState.speed,
      platform,
      quranApi,
      playSinglePromptAudio,
      showToast,
    ],
  );

  const handleStopTasmi = useCallback(async () => {
    stopPromptAudio();
    const wasDrill = errorDrill !== null;
    setTasmiActive(false);
    setRandomPool(null);
    setRandomPrompt(null);
    setErrorDrill(null);
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

    if (wasDrill) {
      showToast("Latih Kesalahan selesai");
      return;
    }

    if (finalState?.mode === "memorization" && finalState.passage) {
      const peekedList = Array.from(tasmiPeekedAyahsRef.current);
      const record: TasmiSessionRecord = {
        id: `tasmi-${Date.now()}`,
        startedAt: new Date(tasmiStartedAtRef.current || Date.now()).toISOString(),
        durationSec,
        surah: finalState.passage.surah,
        fromAyah: finalState.passage.fromAyah,
        toAyah: finalState.passage.toAyah,
        mistakes: finalState.confirmedMistakes,
        recitedAyahs: countRecitedAyahs(finalState),
        recitedWords: finalState.recitedWords.size,
        ...(peekedList.length > 0 ? { peekedAyahs: peekedList } : {}),
        kind: tasmiSessionKindRef.current,
      };
      persistUser(userStore.addTasmiHistory(record));
      setSummaryModal({ open: true, tab: "summary", record });
    } else if (finalState) {
      showToast("Sesi Baca Bebas selesai");
    }
  }, [stopPromptAudio, errorDrill, tilawaController, userStore, persistUser, showToast]);

  const handleDrillNext = useCallback(() => {
    if (!errorDrill) return;
    const hasMistake = (tasmiStateRef.current?.confirmedMistakes.length ?? 0) > 0;
    const wasPeeked = tasmiPeekedAyahsRef.current.has(errorDrill.ayah);
    if (hasMistake || wasPeeked) {
      showToast("Masih ada catatan/intipan — ulangi ayat ini sampai bersih");
      void runDrillStep(errorDrill.ayahs, errorDrill.index, false);
      return;
    }
    if (errorDrill.index + 1 < errorDrill.ayahs.length) {
      void runDrillStep(errorDrill.ayahs, errorDrill.index + 1, false);
    } else {
      showToast("Alhamdulillah, semua ayat kesalahan sudah bersih!");
      void handleStopTasmi();
    }
  }, [errorDrill, runDrillStep, handleStopTasmi, showToast]);

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
      if ((tasmiActive || tasmiStarting) && tasmiState?.mode === "memorization" && tasmiBlurEnabled) {
        tasmiPeekedAyahsRef.current.add(ayah);
        // Peeking a blurred ayah without reciting it counts as a mistake.
        if (tasmiActive && tasmiStateRef.current) {
          const next = recordPeekMistake(tasmiStateRef.current, ayah);
          tasmiStateRef.current = next;
          setTasmiState(next);
        }
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
    [tasmiActive, tasmiStarting, tasmiState?.mode, tasmiBlurEnabled],
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
          setTasmiInitialAyah(tasmiContextAyah);
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
    tasmiContextAyah,
    handleStopTasmi,
    handleToggleHifzBlur,
    handleTogglePlay,
  ]);

  const handleSelectAyah = useCallback(
    (ayah: AyahKey, anchorRect: DOMRect, word?: SelectedWord) => {
      setLastSelectedAyah(ayah);
      if (studyOpen) {
        setStudyAyah(ayah);
      }
      setSelected((prev) =>
        prev?.ayah === ayah && prev.word?.key === word?.key
          ? null
          : { ayah, rect: anchorRect, word },
      );
    },
    [studyOpen],
  );

  // Touch: a tap on the page toggles focus mode (the ayah menu opens on a hold). A tap while a
  // popover is open only closes it. Mouse clicks keep selecting ayahs and only clear selection.
  const lastPointerRef = useRef<string>("mouse");
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      lastPointerRef.current = event.pointerType || "mouse";
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);
  const handleTapPage = useCallback(() => {
    if (selected) {
      setSelected(null);
      return;
    }
    if (lastPointerRef.current === "mouse" || tasmiActive) return;
    setFocusMode((prev) => !prev);
  }, [selected, tasmiActive]);

  // Dismiss ayah/word popover when entering focus mode
  useEffect(() => {
    if (focusMode) setSelected(null);
  }, [focusMode]);

  const bookmarkSet = useMemo(() => new Set(userData.bookmarks), [userData.bookmarks]);

  const visiblePages = useMemo(
    () => (leftPageEntry ? [rightPageEntry, leftPageEntry] : [rightPageEntry]),
    [rightPageEntry, leftPageEntry],
  );

  const isTasmiBlurActive = Boolean(
    (tasmiActive || tasmiStarting) && tasmiState?.mode === "memorization" && tasmiBlurEnabled,
  );

  useBackClose(paletteOpen, () => setPaletteOpen(false));
  useBackClose(studyOpen, () => setStudyOpen(false));
  useBackClose(readerAyah !== null, () => setReaderAyah(null));
  useBackClose(downloadsOpen, () => setDownloadsOpen(false));
  useBackClose(syncOpen, () => setSyncOpen(false));
  useBackClose(tasmiSheetOpen, () => setTasmiSheetOpen(false));
  useBackClose(summaryModal.open, () => setSummaryModal((prev) => ({ ...prev, open: false })));
  useBackClose(selected !== null, () => setSelected(null));
  useBackClose(focusMode, () => setFocusMode(false));
  useBackClose(tajweedGuideOpen, () => setTajweedGuideOpen(false));
  useBackClose(aboutOpen, () => setAboutOpen(false));

  // Only one popup at a time: anything that opens on top of the page closes the ayah popover and
  // hides the Tasmi' card and button.
  const overlayOpen =
    paletteOpen ||
    tasmiSheetOpen ||
    summaryModal.open ||
    syncOpen ||
    downloadsOpen ||
    tasmiGuideOpen ||
    tajweedGuideOpen ||
    aboutOpen ||
    topMenuOpen ||
    dockPopupOpen;

  useEffect(() => {
    if (overlayOpen) setSelected(null);
  }, [overlayOpen]);

  // On phones the study panel is a bottom sheet under the same screen, so the menu or any other
  // popup replaces it instead of stacking on top of it. On wide screens it stays as a side panel.
  useEffect(() => {
    if (!overlayOpen || !studyOpen) return;
    if (window.matchMedia?.("(max-width: 900px)").matches) setStudyOpen(false);
  }, [overlayOpen, studyOpen]);

  const tasmiLauncherVisible =
    !focusMode && !tasmiActive && !studyOpen && !overlayOpen && selected === null;

  // Switching glyph sets reloads the pages, so what each one prints is read again.
  useEffect(() => {
    setGlyphAyahs({});
  }, [glyphLoader]);

  // Which ayahs each glyph page really prints; the scanned-image map can disagree at page breaks.
  useEffect(() => {
    let live = true;
    for (const entry of visiblePages) {
      glyphLoader.load(entry.page).then(
        (data) => {
          if (!live) return;
          const keys = [...new Set(data.lines.flatMap((line) => line.words.map((w) => w.ayah)))];
          setGlyphAyahs((prev) => (prev[entry.page] ? prev : { ...prev, [entry.page]: keys }));
        },
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, [visiblePages, glyphLoader]);

  // Baca Bebas under Sembunyikan Ayat: an ayah opens only once it was recited whole and right.
  const freeRecitedAyahs = useMemo(() => {
    if (tasmiState?.mode !== "free" || !userData.settings.hifzBlur) return null;
    return cleanlyRecitedAyahs(tasmiState, wordLookup);
  }, [tasmiState, userData.settings.hifzBlur, wordLookup]);

  // Keep what the session opened after it ends, like a tapped peek, until the page changes.
  const freeRecitedRef = useRef<Set<AyahKey> | null>(null);
  useEffect(() => {
    if (freeRecitedAyahs) {
      freeRecitedRef.current = freeRecitedAyahs;
      return;
    }
    const kept = freeRecitedRef.current;
    freeRecitedRef.current = null;
    if (kept && kept.size > 0) {
      setRevealedSet((prev) => new Set([...prev, ...kept]));
    }
  }, [freeRecitedAyahs]);

  const hiddenAyahSet = useMemo(() => {
    const set = new Set<AyahKey>();
    for (const [key, event] of Object.entries(userData.hiddenAyahs ?? {})) {
      if (event.on) set.add(key as AyahKey);
    }
    return set;
  }, [userData.hiddenAyahs]);

  const blurSet = useMemo(() => {
    const mode = isTasmiBlurActive ? "tasmi" : userData.settings.hifzBlur ? "all" : "off";
    if (mode === "off" && hiddenAyahSet.size === 0) return undefined;

    const passage = isTasmiBlurActive ? (tasmiState?.passage ?? null) : null;
    const revealed = isTasmiBlurActive
      ? (tasmiState?.revealedAyahs ?? new Set<AyahKey>())
      : freeRecitedAyahs
        ? new Set([...revealedSet, ...freeRecitedAyahs])
        : revealedSet;

    const merged = new Set<AyahKey>();
    for (const page of visiblePages) {
      const pageMask = computeBlurMask(
        page,
        mode,
        passage,
        revealed,
        peekedAyah,
        glyphAyahs[page.page],
      );
      for (const k of pageMask) merged.add(k);
      // Ayahs hidden one by one stay hidden under any mode, until peeked or shown again.
      if (hiddenAyahSet.size > 0) {
        for (const k of computeBlurMask(page, "all", null, revealed, peekedAyah, glyphAyahs[page.page])) {
          if (hiddenAyahSet.has(k)) merged.add(k);
        }
      }
    }
    return merged.size > 0 ? merged : undefined;
  }, [
    hiddenAyahSet,
    isTasmiBlurActive,
    userData.settings.hifzBlur,
    tasmiState?.passage,
    tasmiState?.revealedAyahs,
    revealedSet,
    freeRecitedAyahs,
    visiblePages,
    peekedAyah,
    glyphAyahs,
  ]);

  const handleToggleAyahHidden = useCallback(
    (ayah: AyahKey) => {
      if (blurSet?.has(ayah)) {
        // Show it: drop its own hide, and open it for this page when Sembunyikan Ayat hides everything.
        if (hiddenAyahSet.has(ayah)) persistUser(userStore.setAyahHidden(ayah, false));
        setRevealedSet((prev) => new Set(prev).add(ayah));
      } else {
        persistUser(userStore.setAyahHidden(ayah, true));
        setRevealedSet((prev) => {
          if (!prev.has(ayah)) return prev;
          const next = new Set(prev);
          next.delete(ayah);
          return next;
        });
        setPeekedAyah((prev) => (prev === ayah ? null : prev));
      }
    },
    [blurSet, hiddenAyahSet, userStore, persistUser],
  );

  const effectiveMistakeAyahs = useMemo(() => {
    if (mistakeAyahs) return mistakeAyahs;
    if (tasmiState && tasmiState.confirmedMistakes.length > 0) {
      return buildMistakeBadges(tasmiState.confirmedMistakes);
    }
    return undefined;
  }, [mistakeAyahs, tasmiState]);

  const surahLabel = useMemo(() => {
    const ids = new Set<number>();
    for (const entry of visiblePages) {
      const printed = glyphAyahs[entry.page];
      if (printed && printed.length > 0) {
        for (const key of printed) ids.add(Number(key.split(":")[0]));
      } else {
        for (const s of entry.surahs) ids.add(s);
      }
    }
    const names = Array.from(ids)
      .map((id) => surahByNumber.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return "Al-Qur'an";
    return names.length <= 2 ? names.join(" · ") : `${names[0]} – ${names[names.length - 1]}`;
  }, [visiblePages, glyphAyahs, surahByNumber]);

  const juzNumber = getJuzForPage(rightPage);
  const pageLabel = leftPage ? `${rightPage}–${leftPage}` : `${rightPage}`;
  const canGoPrev = rightPage > MIN_PAGE;
  const canGoNext = (leftPage ?? rightPage) < MAX_PAGE;

  const selectedSurahName = selected
    ? surahByNumber.get(Number(selected.ayah.split(":")[0]))?.name ?? "Surah"
    : "";

  const effectiveStudyAyah = studyAyah ?? activeAyah;
  const studySurah = surahByNumber.get(parseAyahKey(effectiveStudyAyah).surah);

  const isSurahDownloaded = isSurahComplete(downloads.status?.bySurah.get(activeSurahNum));
  const downloadProgress =
    downloads.state.phase === "running" && downloads.state.current === activeSurahNum
      ? { done: downloads.state.done, total: downloads.state.total }
      : null;
  const activeJuzRange = juzRange(catalog, activeAyah);
  const activeJuzSurahs = activeJuzRange
    ? Array.from(
        { length: Number(activeJuzRange.to.split(":")[0]) - Number(activeJuzRange.from.split(":")[0]) + 1 },
        (_, i) => Number(activeJuzRange.from.split(":")[0]) + i,
      )
    : [activeSurahNum];
  // Listening, talaqqi and Tasmi' all run without touching the screen; keep it from turning off.
  useKeepAwake(
    audioState.isPlaying ||
      audioState.isLoading ||
      audioState.isTalaqqiPause ||
      tasmiActive ||
      tasmiStarting ||
      errorDrill !== null ||
      randomPrompt !== null,
  );

  const hideAudioDock =
    focusMode && !audioState.isPlaying && !audioState.isLoading && downloads.state.phase === "idle";

  const offlinePages = useOfflinePages(!platform.isDesktop);
  const tajweedPages = useTajweedPages(platform);
  const pwaInstall = usePwaInstall(!platform.isDesktop);

  const getPageImageUrl = useCallback(
    (page: number) => platform.getPageImageUrl(page),
    [platform],
  );

  const tasmiStartingStatus = useMemo(() => {
    if (!tasmiStarting) return null;
    if (modelLoading) {
      const pct = Math.round(modelLoading.fraction * 100);
      if (modelLoading.stage === "model") {
        return modelLoading.fromCache
          ? `Memuat model dari cache (${pct}%)…`
          : `Mengunduh model suara (${pct}%)…`;
      }
      if (modelLoading.stage === "warmup") return "Menyiapkan mesin Tasmi'…";
      return "Menyiapkan teks Al-Qur'an…";
    }
    return "Membuka mikrofon…";
  }, [tasmiStarting, modelLoading]);

  return (
    <div
      className={`app-shell ${focusMode ? "app-shell--focus" : ""} ${studyOpen ? "app-shell--drawer-open" : ""} ${scrollMode ? "" : "app-shell--swipe"} ${uses1441Letters && !userData.settings.tajweed ? "app-shell--plain-1441" : ""} ${tasmiActive || tasmiStarting ? "app-shell--tasmi" : ""}`}
    >
      <TopBar
        surahLabel={surahLabel}
        juzNumber={juzNumber}
        pageLabel={pageLabel}
        spreadMode={userData.settings.spreadMode}
        pageNav={userData.settings.pageNav}
        onChangePageNav={(pageNav) => persistUser(userStore.updateSettings({ pageNav }))}
        onOpenTajweedGuide={() => setTajweedGuideOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
        hifzBlur={
          tasmiActive && tasmiState?.mode === "memorization"
            ? tasmiBlurEnabled
            : userData.settings.hifzBlur
        }
        hifzBlurLevel={userData.settings.hifzBlurLevel}
        focusMode={focusMode}
        wordTranslation={userData.settings.wordTranslation && !focusMode}
        tajweed={userData.settings.tajweed}
        theme={userData.settings.theme}
        pwaInstall={pwaInstall}
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
        onChangeHifzBlurLevel={handleChangeHifzBlurLevel}
        onToggleFocusMode={() => setFocusMode((prev) => !prev)}
        onToggleWordTranslation={() =>
          persistUser(userStore.updateSettings({ wordTranslation: !userData.settings.wordTranslation }))
        }
        letterStyle={uses1441Letters ? "1441" : "1405"}
        onChangeLetterStyle={(letterStyle) =>
          persistUser(
            userStore.updateSettings(letterStyle === "1405" ? { letterStyle, tajweed: false } : { letterStyle }),
          )
        }
        onToggleTajweed={() =>
          persistUser(
            userStore.updateSettings(
              userData.settings.tajweed ? { tajweed: false } : { tajweed: true, letterStyle: "1441" },
            ),
          )
        }
        onChangeTheme={handleChangeTheme}
        onOpenTasmi={() => handleOpenTasmi(tasmiContextAyah)}
        onOpenDownloads={() => openDownloads("audio")}
        onOpenSync={() => {
          setSyncError(null);
          setSyncOpen(true);
        }}
        onOpenReader={() => setReaderAyah(selected?.ayah ?? activeAyah)}
        syncConnected={syncConfig !== null}
        onMenuOpenChange={setTopMenuOpen}
      />

      {downloadsOpen && (
        <AudioDownloadsPanel
          initialTab={downloadsTab}
          surahs={catalog.surahs}
          reciters={catalog.reciters}
          reciterId={audioState.reciterId}
          onChangeReciter={handleChangeReciter}
          activeSurah={activeSurahNum}
          juzNumber={juzNumber}
          juzSurahs={activeJuzSurahs}
          downloads={downloads}
          translations={catalog.translations}
          tafsirs={catalog.tafsirs}
          activeTranslationId={userData.settings.translationId}
          activeTafsirId={userData.settings.tafsirId}
          textDownloads={textDownloads}
          offlinePages={offlinePages}
          tajweedPages={tajweedPages}
          isDesktop={platform.isDesktop}
          tilawaStorage={tilawaStorage}
          onDownloadTilawa={(onProgress, signal) => tilawaController.ensureReady(onProgress, signal)}
          onClose={() => setDownloadsOpen(false)}
        />
      )}


      <TasmiLauncher
        visible={tasmiLauncherVisible}
        showHint={tasmiHint && !overlayOpen && selected === null}
        onDismissHint={dismissTasmiHint}
        onOpenGuide={() => setTasmiGuideOpen(true)}
      />

      {!scrollMode && (
        <div className="page-chrome" aria-hidden="true">
          <span>{surahLabel}</span>
          <span>Juz {juzNumber}</span>
        </div>
      )}

      {scrollMode ? (
        <MushafScroll
          snap={userData.settings.pageNav === "scroll-page"}
          pages={mushafMap.pages}
          currentPage={currentPage}
          selectedAyah={selected?.ayah ?? null}
          playingAyah={effectivePlayingAyah}
          playingWordRange={tasmiActive ? null : playingWordRange}
          highlights={userData.highlights}
          bookmarks={bookmarkSet}
          blurSet={blurSet}
          blurLevel={userData.settings.hifzBlurLevel}
          revealedSet={isTasmiBlurActive ? tasmiState?.revealedAyahs : revealedSet}
          mistakeAyahs={effectiveMistakeAyahs}
          wordTranslation={userData.settings.wordTranslation && !focusMode}
          isModalOpen={paletteOpen || tasmiSheetOpen || summaryModal.open}
          getPageImageUrl={getPageImageUrl}
          glyphLoader={glyphLoader}
          onRetryPage={handleRetryPage}
          onPageChange={navigateToPage}
          onSelectAyah={handleSelectAyah}
          onPeekAyah={handlePeekAyah}
          onClearSelection={() => setSelected(null)}
          onTapPage={handleTapPage}
          onToggleFocus={() => setFocusMode((prev) => !prev)}
          onTogglePalette={() => {
            if (tasmiSheetOpen || summaryModal.open) return;
            setPaletteTab("search");
            setPaletteOpen((prev) => !prev);
          }}
        />
      ) : (
        <MushafSpread
          rightPageEntry={rightPageEntry}
          leftPageEntry={leftPageEntry}
          pageUrls={pageUrls}
          selectedAyah={selected?.ayah ?? null}
          playingAyah={effectivePlayingAyah}
          playingWordRange={tasmiActive ? null : playingWordRange}
          highlights={userData.highlights}
          bookmarks={bookmarkSet}
          blurSet={blurSet}
          blurLevel={userData.settings.hifzBlurLevel}
          revealedSet={isTasmiBlurActive ? tasmiState?.revealedAyahs : revealedSet}
          mistakeAyahs={effectiveMistakeAyahs}
          wordTranslation={userData.settings.wordTranslation && !focusMode}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          isModalOpen={paletteOpen || tasmiSheetOpen || summaryModal.open}
          getPageImageUrl={getPageImageUrl}
          glyphLoader={glyphLoader}
          onRetryPage={handleRetryPage}
          onTurnPage={handleTurnPage}
          onSelectAyah={handleSelectAyah}
          onPeekAyah={handlePeekAyah}
          onClearSelection={() => setSelected(null)}
          onTapPage={handleTapPage}
          onToggleFocus={() => setFocusMode((prev) => !prev)}
          onTogglePalette={() => {
            if (tasmiSheetOpen || summaryModal.open) return;
            setPaletteTab("search");
            setPaletteOpen((prev) => !prev);
          }}
        />
      )}

      {selected && (
        <AyahPopover
          ayah={selected.ayah}
          surahName={selectedSurahName}
          anchorRect={selected.rect}
          quranApi={quranApi}
          translationId={userData.settings.translationId}
          getArabicText={getAyahArabicText}
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
          isHidden={blurSet?.has(selected.ayah) ?? false}
          onToggleHidden={handleToggleAyahHidden}
        />
      )}

      <AudioDock
        onPopupChange={setDockPopupOpen}
        audioState={audioState}
        activeAyah={activeAyah}
        surahs={catalog.surahs}
        surahName={activeSurah?.name ?? "Surah"}
        surahNumber={activeSurah?.number ?? 1}
        surahAyahCount={activeSurah?.ayahs ?? 1}
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
        onChangeScope={handleChangeScope}
        onToggleTalaqqi={handleToggleTalaqqi}
        onDownloadSurah={handleDockDownload}
        onOpenStudy={() => handleOpenStudy(activeAyah)}
        onOpenTasmi={() => handleOpenTasmi(tasmiContextAyah)}
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
        onOpenDownloads={(tab) => openDownloads(tab)}
        onOpenReader={(ayah) => {
          setStudyOpen(false);
          setReaderAyah(ayah);
        }}
      />

      <TranslationReader
        open={readerAyah !== null}
        startAyah={readerAyah ?? activeAyah}
        playingAyah={audioState.isPlaying ? audioState.currentAyah : null}
        surahs={catalog.surahs}
        quranApi={quranApi}
        glyphLoader={glyphLoader}
        ayahPages={ayahPages}
        translations={catalog.translations}
        tafsirs={catalog.tafsirs}
        translationId={userData.settings.translationId}
        tafsirId={userData.settings.tafsirId}
        onChangeTranslation={handleChangeTranslation}
        onChangeTafsir={handleChangeTafsir}
        onPlayAyah={handlePlayAyah}
        onClose={(last) => {
          setReaderAyah(null);
          const page = getPagesForAyah(last)[0];
          if (page) navigateToPage(page);
        }}
      />

      <NavPalette
        open={paletteOpen}
        initialTab={paletteTab}
        catalog={catalog}
        mushafMap={mushafMap}
        currentPage={currentPage}
        recentPages={userData.recentPages}
        bookmarks={userData.bookmarks}
        notes={userData.notes}
        onClose={() => setPaletteOpen(false)}
        onJumpToPage={navigateToPage}
        onJumpToAyah={handleJumpToAyah}
        onToggleBookmark={handleToggleBookmark}
      />

      {(tasmiActive || tasmiStarting) && tasmiState && (
        <RecitationRibbon
          state={tasmiState}
          surahs={catalog.surahs}
          blurActive={isTasmiBlurActive}
          isPeeking={peekedAyah !== null}
          startingStatus={tasmiStartingStatus}
          getAyahWords={wordLookup}
          glyphLoader={glyphLoader}
          ayahToPage={mushafMap.ayahToPage}
          randomPrompt={randomPrompt}
          errorDrill={errorDrill}
          onReplayPrompt={
            randomPrompt && randomPool && tasmiState.passage
              ? () => {
                  void startRandomChallenge(
                    { promptAyah: randomPrompt.ayah, passage: tasmiState.passage! },
                    randomPool,
                    tasmiBlurEnabled,
                  );
                }
              : undefined
          }
          onNextRandom={
            randomPool
              ? () => {
                  const next = pickRandomChallenge(randomPool, catalog, {
                    excludePrompt: randomPrompt?.ayah ?? null,
                  });
                  if (next) {
                    void startRandomChallenge(next, randomPool, tasmiBlurEnabled);
                  }
                }
              : undefined
          }
          onDrillSkipListen={
            errorDrill
              ? () => {
                  void runDrillStep(errorDrill.ayahs, errorDrill.index, true);
                }
              : undefined
          }
          onDrillRepeat={
            errorDrill
              ? () => {
                  void runDrillStep(errorDrill.ayahs, errorDrill.index, false);
                }
              : undefined
          }
          onDrillNext={errorDrill ? handleDrillNext : undefined}
          onStop={() => {
            if (tasmiStarting) {
              tilawaAbortRef.current?.abort();
              tilawaAbortRef.current = null;
              setModelLoading(null);
              tasmiStateRef.current = null;
              setTasmiState(null);
              setTasmiStarting(false);
              tasmiStartingRef.current = false;
            } else {
              void handleStopTasmi();
            }
          }}
        />
      )}

      <TasmiSheet
        open={tasmiSheetOpen}
        visiblePages={visiblePages}
        glyphAyahs={glyphAyahs}
        surahs={catalog.surahs}
        currentJuz={juzNumber}
        initialAyah={tasmiInitialAyah}
        historyCount={userData.tasmiHistory.length}
        murajaahCards={userData.murajaahCards}
        loadingProgress={modelLoading}
        isStarting={tasmiStarting}
        error={tasmiError}
        hifzBlurLevel={userData.settings.hifzBlurLevel}
        onChangeHifzBlurLevel={handleChangeHifzBlurLevel}
        onClose={() => setTasmiSheetOpen(false)}
        onCancelLoad={handleCancelModelLoad}
        onStartFree={() => {
          void startTasmiSession("free", null, false);
        }}
        onStartMemorization={(passage, enableBlur, kind) => {
          void startTasmiSession("memorization", passage, enableBlur, kind);
        }}
        onStartRandom={(pool, enableBlur) => {
          const challenge = pickRandomChallenge(pool, catalog);
          if (challenge) {
            void startRandomChallenge(challenge, pool, enableBlur);
          }
        }}
        onOpenHistory={handleOpenTasmiHistory}
        onOpenGuide={() => setTasmiGuideOpen(true)}
      />

      {tajweedGuideOpen && <TajweedGuide onClose={() => setTajweedGuideOpen(false)} />}
      {aboutOpen && <AboutSources onClose={() => setAboutOpen(false)} />}

      {tasmiGuideOpen && (
        <TasmiGuide
          onClose={() => setTasmiGuideOpen(false)}
          onStart={() => {
            setTasmiGuideOpen(false);
            if (!tasmiSheetOpen) handleOpenTasmi(tasmiContextAyah);
          }}
        />
      )}

      <TasmiSummaryModal
        open={summaryModal.open}
        initialTab={summaryModal.tab}
        record={summaryModal.record}
        history={userData.tasmiHistory}
        murajaahCards={userData.murajaahCards}
        surahs={catalog.surahs}
        getAyahWords={wordLookup}
        glyphLoader={glyphLoader}
        ayahToPage={mushafMap.ayahToPage}
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
        onStartDrill={(ayahs) => {
          void runDrillStep(ayahs, 0, false);
        }}
        onStartMurajaahCard={(card) => {
          setSummaryModal((prev) => ({ ...prev, open: false }));
          void startTasmiSession(
            "memorization",
            { surah: card.surah, fromAyah: card.fromAyah, toAyah: card.toAyah },
            true,
            card.kind,
          );
        }}
      />

      <SyncModal
        open={syncOpen}
        config={syncConfig}
        syncing={syncing}
        error={syncError}
        onClose={() => setSyncOpen(false)}
        onConnect={async (code, workerUrl) => {
          const cfg: SyncConfig = { code, workerUrl };
          await executeSync(cfg, userDataRef.current, false);
        }}
        onSyncNow={async () => {
          if (!syncConfig) return;
          await executeSync(syncConfig, userDataRef.current, false);
        }}
        onDisconnect={() => {
          setSyncConfig(null);
          setSyncError(null);
          void platform.kvSet(SYNC_CONFIG_KEY, "").catch(() => undefined);
          showToast("Sync antar perangkat diputus");
        }}
        onExportBackup={async () => {
          const now = new Date();
          await saveBackupFile(buildBackup(userDataRef.current, now), backupFileName(now));
        }}
        onImportBackup={async (data) => {
          const saved = await userStore.replaceWith((current) => mergeBackup(current, data));
          if (mountedRef.current) setUserData(saved);
          showToast("Cadangan digabungkan");
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
