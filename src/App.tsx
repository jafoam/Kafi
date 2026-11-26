import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import catalogJson from "./data/catalog.json";
import mushafMapJson from "./data/mushaf-map.json";
import type {
  AyahKey,
  Catalog,
  HighlightColor,
  MistakeBadge,
  MushafMap,
  SpreadMode,
  ThemeMode,
  UserData,
} from "./data/types";
import { getPlatform } from "./platform";
import { createUserStore, DEFAULT_USER_DATA } from "./services/user-store";
import {
  clampPage,
  getVisiblePages,
  MAX_PAGE,
  MIN_PAGE,
  resolveEffectiveSpread,
  turnPage,
} from "./state/reader-logic";
import { AyahPopover } from "./components/AyahPopover";
import { MushafSpread } from "./components/MushafSpread";
import { NavPalette, type PaletteTab } from "./components/NavPalette";
import { TopBar } from "./components/TopBar";

const catalog = catalogJson as unknown as Catalog;
const mushafMap = mushafMapJson as unknown as MushafMap;

export interface AppProps {
  playingAyah?: AyahKey | null;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  onPlayAyah?: (ayah: AyahKey) => void;
  onOpenStudy?: (ayah: AyahKey) => void;
  onStartTasmi?: (ayah: AyahKey) => void;
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
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const requestedPagesRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    });
    return () => {
      active = false;
    };
  }, [userStore]);

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
  }, [rightPage, leftPage]);

  const navigateToPage = useCallback(
    (page: number) => {
      const clamped = clampPage(page);
      setCurrentPage(clamped);
      void userStore.setLastPage(clamped).then(setUserData);
    },
    [userStore],
  );

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

  const handlePeekAyah = useCallback((ayah: AyahKey) => {
    setRevealedSet((prev) => {
      const next = new Set(prev);
      next.add(ayah);
      return next;
    });
  }, []);

  const handleSelectAyah = useCallback((ayah: AyahKey, anchorRect: DOMRect) => {
    setSelected((prev) => (prev?.ayah === ayah ? null : { ayah, rect: anchorRect }));
  }, []);

  const bookmarkSet = useMemo(() => new Set(userData.bookmarks), [userData.bookmarks]);

  const blurSet = useMemo(() => {
    if (!userData.settings.hifzBlur) return undefined;
    const set = new Set<AyahKey>();
    for (const seg of rightPageEntry.ayahs) {
      set.add(`${seg.surah}:${seg.ayah}`);
    }
    if (leftPageEntry) {
      for (const seg of leftPageEntry.ayahs) {
        set.add(`${seg.surah}:${seg.ayah}`);
      }
    }
    return set;
  }, [userData.settings.hifzBlur, rightPageEntry, leftPageEntry]);

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

  const getPageImageUrl = useCallback(
    (page: number) => platform.getPageImageUrl(page),
    [platform],
  );

  return (
    <div className={`app-shell ${focusMode ? "app-shell--focus" : ""}`}>
      <TopBar
        surahLabel={surahLabel}
        juzNumber={juzNumber}
        pageLabel={pageLabel}
        spreadMode={userData.settings.spreadMode}
        hifzBlur={userData.settings.hifzBlur}
        focusMode={focusMode}
        theme={userData.settings.theme}
        onOpenPalette={(tab = "surah") => {
          setPaletteTab(tab);
          setPaletteOpen(true);
        }}
        onChangeSpreadMode={handleChangeSpreadMode}
        onToggleHifzBlur={handleToggleHifzBlur}
        onToggleFocusMode={() => setFocusMode((prev) => !prev)}
        onChangeTheme={handleChangeTheme}
      />

      <MushafSpread
        rightPageEntry={rightPageEntry}
        leftPageEntry={leftPageEntry}
        pageUrls={pageUrls}
        selectedAyah={selected?.ayah ?? null}
        playingAyah={playingAyah}
        highlights={userData.highlights}
        bookmarks={bookmarkSet}
        blurSet={blurSet}
        revealedSet={revealedSet}
        mistakeAyahs={mistakeAyahs}
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
            if (onPlayAyah) {
              onPlayAyah(ayah);
            } else {
              showToast(`Murottal ${selectedSurahName} : ${ayah.split(":")[1]}`);
            }
            setSelected(null);
          }}
          onOpenStudy={(ayah) => {
            if (onOpenStudy) {
              onOpenStudy(ayah);
            } else {
              showToast(`Tafsir & Terjemahan ${selectedSurahName} : ${ayah.split(":")[1]}`);
            }
            setSelected(null);
          }}
          onStartTasmi={(ayah) => {
            if (onStartTasmi) {
              onStartTasmi(ayah);
            } else {
              showToast(`Tasmi' mulai dari ${selectedSurahName} : ${ayah.split(":")[1]}`);
            }
            setSelected(null);
          }}
          onToggleBookmark={handleToggleBookmark}
          onSetHighlight={handleSetHighlight}
        />
      )}

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

      {toast && (
        <div className="reader-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
