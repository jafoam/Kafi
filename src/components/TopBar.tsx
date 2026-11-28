import { useEffect, useState } from "react";
import { useBackClose } from "../state/useBackClose";
import { SOURCE_CODE_URL } from "../data/acknowledgements";
import type { AppLanguage, HifzBlurLevel, LetterStyle, PageNavMode, ReadingMode, SpreadMode, ThemeMode } from "../data/types";
import type { PwaInstall } from "../state/usePwaInstall";
import { useI18n } from "../i18n";

const RELEASES_URL = `${SOURCE_CODE_URL}/releases/latest`;
const RELEASES_API_URL = "https://api.github.com/repos/jafoam/Kafi/releases/latest";

interface DirectAsset {
  label: string;
  url: string;
  kind: "android" | "mac" | "windows" | "linux";
}

interface LatestReleaseInfo {
  tag: string;
  assets: DirectAsset[];
}

let cachedReleasePromise: Promise<LatestReleaseInfo | null> | null = null;

function fetchLatestRelease(): Promise<LatestReleaseInfo | null> {
  if (!cachedReleasePromise) {
    cachedReleasePromise = fetch(RELEASES_API_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then((res) => (res.ok ? (res.json() as Promise<{ tag_name?: string; assets?: Array<{ name?: string; browser_download_url?: string }> }>) : null))
      .then((data) => {
        if (!data || !Array.isArray(data.assets)) return null;
        const assets: DirectAsset[] = [];
        const pick = (kind: DirectAsset["kind"], label: string, re: RegExp) => {
          const found = data.assets!.find((a) => typeof a.name === "string" && re.test(a.name) && typeof a.browser_download_url === "string");
          if (found?.browser_download_url) assets.push({ kind, label, url: found.browser_download_url });
        };
        pick("android", "Unduh Android (.apk)", /\.apk$/i);
        pick("mac", "Unduh macOS (.dmg)", /\.dmg$/i);
        pick("windows", "Unduh Windows (.exe)", /\.(exe|msi)$/i);
        pick("linux", "Unduh Linux", /\.(AppImage|deb)$/i);
        return assets.length > 0 ? { tag: data.tag_name ?? "", assets } : null;
      })
      .catch(() => null);
  }
  return cachedReleasePromise;
}

export interface TopBarProps {
  surahLabel: string;
  juzNumber: number;
  pageLabel: string;
  spreadMode: SpreadMode;
  pageNav: PageNavMode;
  readingMode?: ReadingMode;
  flowFontScale?: number;
  hifzBlur: boolean;
  hifzBlurLevel?: HifzBlurLevel;
  focusMode: boolean;
  wordTranslation: boolean;
  tajweed: boolean;
  letterStyle: LetterStyle;
  onChangeLetterStyle: (style: LetterStyle) => void;
  theme: ThemeMode;
  /** PWA install control; shown on web when not yet installed to Home Screen. */
  pwaInstall?: PwaInstall;
  onOpenPalette: (tab?: "surah" | "search") => void;
  onChangeSpreadMode: (mode: SpreadMode) => void;
  onChangePageNav: (mode: PageNavMode) => void;
  onChangeReadingMode?: (mode: ReadingMode) => void;
  onChangeFlowFontScale?: (scale: number) => void;
  onToggleHifzBlur: () => void;
  onChangeHifzBlurLevel?: (level: HifzBlurLevel) => void;
  onToggleFocusMode: () => void;
  onToggleWordTranslation: () => void;
  onToggleTajweed: () => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onOpenTasmi: () => void;
  onOpenTajweedGuide: () => void;
  onOpenAbout: () => void;
  onOpenDownloads: () => void;
  onOpenSync?: () => void;
  onOpenReader?: () => void;
  onOpenProgress?: () => void;
  onOpenSchedule?: () => void;
  onOpenQuiz?: () => void;
  onOpenHalaqah?: () => void;
  onOpenManageData?: () => void;
  onOpenSettings?: () => void;
  language?: AppLanguage;
  onChangeLanguage?: (language: AppLanguage) => void;
  /** True only when there is an actionable alert (e.g., failed sync) that the user can resolve. */
  hasActionableAlert?: boolean;
  halaqahConnected?: boolean;
  syncConnected?: boolean;
  /** Told when the ☰ menu opens or closes, so other popups can step aside. */
  onMenuOpenChange?: (open: boolean) => void;
}

/** Both keep the same pages and lines; only the calligraphy changes. */
const LETTER_STYLE_OPTIONS: { value: LetterStyle; label: string }[] = [
  { value: "1405", label: "1405" },
  { value: "1441", label: "1441" },
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Tema Kertas Terang" },
  { value: "sepia", label: "Tema Sepia Hangat" },
  { value: "dark", label: "Tema Malam Gelap" },
];

export function TopBar({
  surahLabel,
  juzNumber,
  pageLabel,
  spreadMode,
  pageNav,
  readingMode = "mushaf",
  flowFontScale = 1,
  hifzBlur,
  hifzBlurLevel = "full",
  focusMode,
  wordTranslation,
  tajweed,
  letterStyle,
  onChangeLetterStyle,
  theme,
  pwaInstall,
  onOpenPalette,
  onChangeSpreadMode,
  onChangePageNav,
  onChangeReadingMode,
  onChangeFlowFontScale,
  onToggleHifzBlur,
  onChangeHifzBlurLevel,
  onToggleFocusMode,
  onToggleWordTranslation,
  onToggleTajweed,
  onChangeTheme,
  onOpenTasmi,
  onOpenTajweedGuide,
  onOpenAbout,
  onOpenDownloads,
  onOpenSync,
  onOpenReader,
  onOpenProgress,
  onOpenSchedule,
  onOpenQuiz,
  onOpenHalaqah,
  onOpenManageData,
  onOpenSettings,
  language = "id",
  onChangeLanguage,
  hasActionableAlert = false,
  onMenuOpenChange,
}: TopBarProps) {
  const { tr } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  useEffect(() => {
    onMenuOpenChange?.(menuOpen);
  }, [menuOpen, onMenuOpenChange]);
  useBackClose(menuOpen, () => setMenuOpen(false));
  useBackClose(installGuideOpen, () => setInstallGuideOpen(false));
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !menuOpen && !installGuideOpen) {
        onToggleFocusMode();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode, menuOpen, installGuideOpen, onToggleFocusMode]);
  return (
    <div className={`topbar-zone ${menuOpen || installGuideOpen ? "topbar-zone--menu-open" : ""}`}>
      {focusMode && !menuOpen && (
        <button
          type="button"
          className="focus-exit-btn"
          onClick={onToggleFocusMode}
          aria-label={tr("Keluar Mode Fokus", "Exit Focus Mode")}
          title={tr("Keluar Mode Fokus (F / Esc)", "Exit Focus Mode (F / Esc)")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          </svg>
          <span>{tr("Keluar Fokus", "Exit Focus")}</span>
        </button>
      )}
      <header className={`topbar ${focusMode ? "topbar--hidden" : ""}`}>
        <div className="topbar__left">
          <span className="topbar__brand">Kafi</span>
          <button
            type="button"
            className="topbar__location-pill"
            onClick={() => onOpenPalette("surah")}
            title={tr("Buka navigasi Surah, Juz, dan Halaman", "Open Surah, Juz, and Page navigation")}
          >
            <span className="topbar__location-name">{surahLabel}</span>
            <span className="topbar__location-meta">
              <span className="topbar__location-juz">Juz {juzNumber} · </span>
              {tr("Hal.", "Pg.")} {pageLabel}
            </span>
          </button>
        </div>

        <div className="topbar__right">
          {pwaInstall?.canShow && (
            <button
              type="button"
              className="topbar__btn topbar__install"
              onClick={() => {
                setMenuOpen(false);
                void pwaInstall.prompt().then((result) => {
                  if (result === "guide") setInstallGuideOpen(true);
                });
              }}
              aria-label={tr("Instal aplikasi ke layar utama", "Install app to home screen")}
              title={tr("Instal Kafi ke layar utama agar halaman baca lebih lega", "Install Kafi to home screen for a fuller reading view")}
            >
              <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <span className="topbar__label">{tr("Instal", "Install")}</span>
            </button>
          )}

          <button
            type="button"
            className="topbar__btn"
            onClick={() => onOpenPalette("search")}
            title={tr("Cari Ayat atau Surah (Cmd/Ctrl+K)", "Search Ayah or Surah (Cmd/Ctrl+K)")}
            aria-label={tr("Cari Ayat", "Search Ayah")}
          >
            <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="topbar__label">{tr("Cari Ayat", "Search")}</span>
            <span className="topbar__kbd">⌘K</span>
          </button>

          <button
            type="button"
            className={`topbar__btn topbar__desk ${hifzBlur ? "topbar__btn--active" : ""}`}
            aria-pressed={hifzBlur}
            onClick={onToggleHifzBlur}
            title={tr("Mode Hafalan: sembunyikan ayat dan ketuk untuk mengintip", "Memorization mode: blur ayahs and tap to peek")}
            aria-label={tr("Sembunyikan Ayat", "Hide Ayahs")}
          >
            <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3l18 18" />
              <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg>
            <span className="topbar__label">{tr("Sembunyikan Ayat", "Hide Ayahs")}</span>
          </button>

          <button
            type="button"
            className={`topbar__btn topbar__desk ${focusMode ? "topbar__btn--active" : ""}`}
            aria-pressed={focusMode}
            onClick={onToggleFocusMode}
            title={tr("Mode Fokus (F)", "Focus Mode (F)")}
            aria-label={tr("Mode Fokus", "Focus Mode")}
          >
            <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
            <span className="topbar__label">{tr("Mode Fokus", "Focus")}</span>
          </button>

          <button
            type="button"
            className={`topbar__btn topbar__btn--icon ${menuOpen ? "topbar__btn--active" : ""}`}
            onClick={() => {
              setInstallGuideOpen(false);
              setMenuOpen((open) => !open);
            }}
            aria-label={tr("Opsi tampilan cepat: mode baca, tema, dan tajwid", "Quick display options: reading mode, theme, and tajweed")}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            title={tr("Opsi tampilan cepat", "Quick display options")}
          >
            <svg className="topbar__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          {onOpenSettings && (
            <button
              type="button"
              className="topbar__btn topbar__btn--icon topbar__settings-btn"
              onClick={() => {
                setMenuOpen(false);
                setInstallGuideOpen(false);
                onOpenSettings();
              }}
              aria-label={tr("Pengaturan", "Settings")}
              title={tr("Pengaturan: tampilan, bahasa, hafalan & data", "Settings: display, language, memorization & data")}
            >
              <svg className="topbar__icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
              {hasActionableAlert && (
                <span className="topbar__status-dot" aria-hidden="true" />
              )}
            </button>
          )}

          <button
            type="button"
            className="topbar__tasmi topbar__desk"
            onClick={onOpenTasmi}
            title={tr("Tasmi': bacakan hafalanmu, aplikasi menyimak dan menandai kesalahan", "Tasmi': recite from memory and detect mistakes on-device")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
            </svg>
            <span>{tr("Mulai Tasmi'", "Start Tasmi'")}</span>
          </button>
        </div>
      </header>

      {menuOpen && (
        <AppMenu
          spreadMode={spreadMode}
          pageNav={pageNav}
          readingMode={readingMode}
          flowFontScale={flowFontScale}
          hifzBlur={hifzBlur}
          hifzBlurLevel={hifzBlurLevel}
          focusMode={focusMode}
          wordTranslation={wordTranslation}
          tajweed={tajweed}
          letterStyle={letterStyle}
          onChangeLetterStyle={onChangeLetterStyle}
          theme={theme}
          onChangeSpreadMode={onChangeSpreadMode}
          onChangePageNav={onChangePageNav}
          onChangeReadingMode={onChangeReadingMode}
          onChangeFlowFontScale={onChangeFlowFontScale}
          onOpenTajweedGuide={onOpenTajweedGuide}
          onOpenAbout={onOpenAbout}
          onToggleHifzBlur={onToggleHifzBlur}
          onChangeHifzBlurLevel={onChangeHifzBlurLevel}
          onToggleFocusMode={onToggleFocusMode}
          onToggleWordTranslation={onToggleWordTranslation}
          onToggleTajweed={onToggleTajweed}
          onChangeTheme={onChangeTheme}
          onOpenDownloads={onOpenDownloads}
          onOpenSync={onOpenSync}
          onOpenReader={onOpenReader}
          onOpenProgress={onOpenProgress}
          onOpenSchedule={onOpenSchedule}
          onOpenQuiz={onOpenQuiz}
          onOpenHalaqah={onOpenHalaqah}
          onOpenManageData={onOpenManageData}
          onOpenSettings={onOpenSettings}
          language={language}
          onChangeLanguage={onChangeLanguage}
          hasActionableAlert={hasActionableAlert}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {installGuideOpen && pwaInstall?.canShow && (
        <InstallGuide
          platform={pwaInstall.platform}
          onClose={() => setInstallGuideOpen(false)}
        />
      )}
    </div>
  );
}

function InstallGuide({
  platform,
  onClose,
}: {
  platform: PwaInstall["platform"];
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const [release, setRelease] = useState<LatestReleaseInfo | null>(null);

  useEffect(() => {
    let live = true;
    void fetchLatestRelease().then((info) => {
      if (live && info) setRelease(info);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const assetLabel = (asset: DirectAsset) => {
    switch (asset.kind) {
      case "android":
        return tr("Unduh Android (.apk)", "Download Android (.apk)");
      case "mac":
        return tr("Unduh macOS (.dmg)", "Download macOS (.dmg)");
      case "windows":
        return tr("Unduh Windows (.exe)", "Download Windows (.exe)");
      case "linux":
        return tr("Unduh Linux", "Download Linux");
    }
  };

  return (
    <>
      <button
        type="button"
        className="app-menu__backdrop"
        aria-label={tr("Tutup panduan instal", "Close install guide")}
        onClick={onClose}
      />
      <div className="app-menu install-guide" role="dialog" aria-label={tr("Instal Kafi", "Install Kafi")}>
        <div className="install-guide__head">
          <strong className="install-guide__title">
            {tr("Instal Kafi ke Layar Utama", "Install Kafi to Home Screen")}
          </strong>
          <p className="install-guide__sub">
            {tr(
              "Buka layar penuh tanpa bilah browser agar halaman mushaf tampil lebih besar dan lega.",
              "Open fullscreen without browser bars so mushaf pages have more room.",
            )}
          </p>
        </div>

        {platform === "ios" ? (
          <ol className="install-guide__steps">
            <li>
              {tr("Ketuk ikon", "Tap the")} <strong>{tr("Bagikan", "Share")}</strong>{" "}
              <svg className="install-guide__share-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12m0-12 4 4m-4-4-4 4" />
                <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              </svg>{" "}
              {tr("di bilah bawah Safari.", "icon in Safari's bottom bar.")}
            </li>
            <li>
              {tr("Geser ke bawah lalu pilih", "Scroll down and choose")}{" "}
              <strong>{tr("Tambahkan ke Layar Utama", "Add to Home Screen")}</strong>.
            </li>
            <li>
              {tr("Ketuk", "Tap")} <strong>{tr("Tambah", "Add")}</strong>{" "}
              {tr("di pojok kanan atas.", "in the top-right corner.")}
            </li>
          </ol>
        ) : (
          <ol className="install-guide__steps">
            <li>
              {tr("Buka menu browser (ikon", "Open the browser menu (")} <strong>⋮</strong>{" "}
              {tr("atau", "or")} <strong>⋯</strong>).
            </li>
            <li>
              {tr("Pilih", "Select")} <strong>{tr("Tambahkan ke Layar Utama", "Add to Home Screen")}</strong>{" "}
              {tr("atau", "or")} <strong>{tr("Instal Aplikasi", "Install App")}</strong>.
            </li>
          </ol>
        )}

        <div className="install-guide__app-box">
          <div className="install-guide__app-head">
            <strong className="install-guide__app-title">
              {tr("Atau unduh versi aplikasi", "Or download the native app")}
              {release?.tag ? ` (${release.tag})` : ""}
            </strong>
            <p className="install-guide__sub">
              {release
                ? tr(
                    "Langsung unduh file installer tanpa perlu mencari di GitHub.",
                    "Download the installer directly without browsing GitHub.",
                  )
                : tr(
                    "Tersedia untuk Android & Desktop. Di halaman rilis, gulir ke bagian Assets lalu pilih file perangkatmu.",
                    "Available for Android & Desktop. On the releases page, scroll to Assets and pick your installer.",
                  )}
            </p>
          </div>
          {release ? (
            <div className="install-guide__assets">
              {release.assets.map((asset) => (
                <a
                  key={asset.kind}
                  className="install-guide__asset-btn"
                  href={asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{assetLabel(asset)}</span>
                  <span aria-hidden="true">↓</span>
                </a>
              ))}
              <a
                className="install-guide__releases-link"
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {tr("Lihat semua rilis di GitHub ↗", "View all releases on GitHub ↗")}
              </a>
            </div>
          ) : (
            <a
              className="install-guide__asset-btn"
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{tr("Buka Halaman Unduhan (GitHub)", "Open Downloads Page (GitHub)")}</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>

        <button type="button" className="install-guide__close" onClick={onClose}>
          {tr("Mengerti", "Got it")}
        </button>
      </div>
    </>
  );
}


interface AppMenuProps {
  spreadMode: SpreadMode;
  pageNav: PageNavMode;
  readingMode: ReadingMode;
  flowFontScale: number;
  onChangePageNav: (mode: PageNavMode) => void;
  onChangeReadingMode?: (mode: ReadingMode) => void;
  onChangeFlowFontScale?: (scale: number) => void;
  onOpenTajweedGuide: () => void;
  onOpenAbout: () => void;
  hifzBlur: boolean;
  hifzBlurLevel: HifzBlurLevel;
  focusMode: boolean;
  wordTranslation: boolean;
  tajweed: boolean;
  letterStyle: LetterStyle;
  onChangeLetterStyle: (style: LetterStyle) => void;
  theme: ThemeMode;
  onChangeSpreadMode: (mode: SpreadMode) => void;
  onToggleHifzBlur: () => void;
  onChangeHifzBlurLevel?: (level: HifzBlurLevel) => void;
  onToggleFocusMode: () => void;
  onToggleWordTranslation: () => void;
  onToggleTajweed: () => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onOpenDownloads: () => void;
  onOpenSync?: () => void;
  onOpenReader?: () => void;
  onOpenProgress?: () => void;
  onOpenSchedule?: () => void;
  onOpenQuiz?: () => void;
  onOpenHalaqah?: () => void;
  onOpenManageData?: () => void;
  onOpenSettings?: () => void;
  language?: AppLanguage;
  onChangeLanguage?: (language: AppLanguage) => void;
  hasActionableAlert?: boolean;
  onClose: () => void;
}

/** The menu behind the ☰ button: everything the bar has no room for, in big touch-sized rows. */
function AppMenu({
  spreadMode,
  pageNav,
  readingMode,
  flowFontScale,
  onChangePageNav,
  onChangeReadingMode,
  onChangeFlowFontScale,
  onOpenTajweedGuide,
  onOpenAbout,
  hifzBlur,
  hifzBlurLevel,
  focusMode,
  wordTranslation,
  tajweed,
  letterStyle,
  onChangeLetterStyle,
  theme,
  onChangeSpreadMode,
  onToggleHifzBlur,
  onChangeHifzBlurLevel,
  onToggleFocusMode,
  onToggleWordTranslation,
  onToggleTajweed,
  onChangeTheme,
  onOpenDownloads,
  onOpenSync,
  onOpenReader,
  onOpenProgress,
  onOpenSchedule,
  onOpenQuiz,
  onOpenHalaqah,
  onOpenManageData,
  onOpenSettings,
  language = "id",
  onChangeLanguage,
  hasActionableAlert = false,
  onClose,
}: AppMenuProps) {
  const { tr } = useI18n();
  const [submenu, setSubmenu] = useState<"root" | "hafalan" | "data">("root");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (submenu !== "root") {
          setSubmenu("root");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submenu, onClose]);

  const toggleChip = (title: string, hint: string, on: boolean, onClick: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={hint}
      className={`app-menu__chip ${on ? "app-menu__chip--on" : ""}`}
      onClick={onClick}
    >
      <span className="app-menu__chip-label">{title}</span>
      <span className="app-menu__chip-dot" aria-hidden="true" />
    </button>
  );

  const linkChip = (title: string, onClick: () => void, badge?: boolean) => (
    <button
      type="button"
      className="app-menu__link-chip"
      onClick={() => {
        onClick();
        onClose();
      }}
    >
      <span className="app-menu__link-chip-label">
        {title}
        {badge && <span className="app-menu__status-dot" aria-hidden="true" />}
      </span>
      <span className="app-menu__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );

  const submenuRow = (title: string, subtitle: string, onClick: () => void, badge?: boolean) => (
    <button
      type="button"
      className="app-menu__subrow"
      onClick={() => {
        onClick();
        onClose();
      }}
    >
      <span className="app-menu__subrow-text">
        <span className="app-menu__subrow-title">
          {title}
          {badge && <span className="app-menu__status-dot" aria-hidden="true" />}
        </span>
        <span className="app-menu__subrow-sub">{subtitle}</span>
      </span>
      <span className="app-menu__subrow-trail" aria-hidden="true">
        ›
      </span>
    </button>
  );

  return (
    <>
      <button type="button" className="app-menu__backdrop" aria-label={tr("Tutup menu", "Close menu")} onClick={onClose} />
      <div className="app-menu" role="dialog" aria-label={tr("Menu", "Menu")}>
        {submenu !== "root" ? (
          <div className="app-menu__submenu">
            <div className="app-menu__subhead">
              <button
                type="button"
                className="app-menu__back-btn"
                onClick={() => setSubmenu("root")}
              >
                <span aria-hidden="true">‹</span>
                <span>{tr("Kembali", "Back")}</span>
              </button>
              <span className="app-menu__subtitle">
                {submenu === "hafalan" ? tr("Hafalan", "Memorization") : tr("Data & Aplikasi", "Data & App")}
              </span>
            </div>

            {submenu === "hafalan" ? (
              <div className="app-menu__sublist">
                {onOpenProgress &&
                  submenuRow(tr("Progres & Streak", "Progress & Streak"), tr("Peta Juz, Surah, 604 halaman & streak", "Juz, Surah, 604 pages map & streak"), onOpenProgress)}
                {onOpenSchedule &&
                  submenuRow(tr("Jadwal Muraja'ah", "Muraja'ah Schedule"), tr("Atur sendiri target ziyadah & muraja'ah", "Manage your ziyadah & revision targets"), onOpenSchedule)}
                {onOpenQuiz &&
                  submenuRow(tr("Kuis Teks Offline", "Offline Text Quiz"), tr("Sambung & urutkan ayat tanpa suara", "Continue & order ayahs silently"), onOpenQuiz)}
                {onOpenHalaqah &&
                  submenuRow("Halaqah", tr("Grup setoran tanpa login (kode grup)", "No-login study circle via group code"), onOpenHalaqah)}
              </div>
            ) : (
              <div className="app-menu__sublist">
                {onOpenManageData &&
                  submenuRow(tr("Kelola Data", "Manage Data"), tr("Arsipkan atau hapus riwayat, jadwal, catatan, bookmark", "Archive or delete history, schedules, notes, bookmarks"), onOpenManageData)}
                {submenuRow(tr("Unduh Offline", "Offline Downloads"), tr("Audio murottal, halaman, terjemah & tafsir", "Audio, mushaf pages, translations & tafsir"), onOpenDownloads)}
                {onOpenSync &&
                  submenuRow(tr("Sync Perangkat", "Device Sync"), tr("Sinkronisasi terenkripsi tanpa login", "Encrypted no-login sync"), onOpenSync, hasActionableAlert)}
                {submenuRow(tr("Tentang & Sumber", "About & Sources"), tr("Lisensi & sumber data mushaf", "Licenses & mushaf data attributions"), onOpenAbout)}
                <a
                  className="app-menu__subrow app-menu__subrow--ext"
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  title={tr("Unduh versi aplikasi Android/Desktop di GitHub", "Download Android/Desktop app releases on GitHub")}
                >
                  <span className="app-menu__subrow-text">
                    <span className="app-menu__subrow-title">{tr("Aplikasi (GitHub)", "App Releases (GitHub)")}</span>
                    <span className="app-menu__subrow-sub">{tr("Unduh APK Android & Desktop", "Download Android APK & Desktop")}</span>
                  </span>
                  <span className="app-menu__subrow-trail app-menu__subrow-trail--ext" aria-hidden="true">
                    ↗
                  </span>
                </a>
              </div>
            )}
          </div>
        ) : (
          <>
        {onChangeReadingMode && (
          <div className="app-menu__field">
            <span className="app-menu__label">{tr("Mode baca", "Reading mode")}</span>
            <Segmented
              label={tr("Mode baca", "Reading mode")}
              value={readingMode}
              options={[
                { value: "mushaf", label: "Mushaf" },
                { value: "translation", label: tr("Terjemahan", "Translation") },
                { value: "reading", label: tr("Bacaan", "Reading") },
              ]}
              onChange={(next) => {
                onChangeReadingMode(next);
                onClose();
              }}
            />
          </div>
        )}

        {readingMode !== "mushaf" && onChangeFlowFontScale && (
          <div className="app-menu__field app-menu__field--row">
            <span className="app-menu__label">{tr("Ukuran huruf", "Font size")}</span>
            <div className="flow-font-stepper" role="group" aria-label={tr("Ukuran huruf", "Font size")}>
              <button
                type="button"
                className="flow-font-stepper__btn"
                aria-label={tr("Perkecil huruf", "Decrease font size")}
                disabled={flowFontScale <= 0.85}
                onClick={() => onChangeFlowFontScale(Math.max(0.85, Math.round((flowFontScale - 0.15) * 100) / 100))}
              >
                A−
              </button>
              <span className="flow-font-stepper__val">{Math.round(flowFontScale * 100)}%</span>
              <button
                type="button"
                className="flow-font-stepper__btn"
                aria-label={tr("Perbesar huruf", "Increase font size")}
                disabled={flowFontScale >= 1.6}
                onClick={() => onChangeFlowFontScale(Math.min(1.6, Math.round((flowFontScale + 0.15) * 100) / 100))}
              >
                A+
              </button>
            </div>
          </div>
        )}

        <div className="app-menu__grid" role="group" aria-label={tr("Opsi cepat", "Quick options")}>
          {toggleChip(tr("Mode Fokus", "Focus Mode"), tr("Sembunyikan bilah atas & bawah", "Hide top & bottom bars"), focusMode, () => {
            onToggleFocusMode();
            onClose();
          })}
          {toggleChip(tr("Sembunyikan Ayat", "Hide Ayahs"), tr("Mode hafalan, ketuk untuk mengintip", "Memorization blur, tap to peek"), hifzBlur, onToggleHifzBlur)}
          {toggleChip(tr("Terjemah Kata", "Word-by-Word"), tr("Arti kata saat diketuk", "Word meaning on tap"), wordTranslation, onToggleWordTranslation)}
          {toggleChip(tr("Tajwid Warna", "Color Tajweed"), tr("Warna hukum tajwid (Madinah 1441)", "Tajweed colors (Madinah 1441)"), tajweed, onToggleTajweed)}
        </div>

        {hifzBlur && onChangeHifzBlurLevel && (
          <div className="app-menu__inline">
            <Segmented
              label={tr("Tingkat sembunyi", "Blur level")}
              value={hifzBlurLevel}
              options={[
                { value: "full", label: tr("Sembunyi penuh", "Full blur") },
                { value: "first-word", label: tr("Tampil kata pertama", "First word") },
              ]}
              onChange={onChangeHifzBlurLevel}
            />
          </div>
        )}

        {!onOpenSettings && (
          <>
            <div className="app-menu__field app-menu__field--row">
              <span className="app-menu__label">{tr("Huruf Madinah", "Madinah Script")}</span>
              <div className="app-menu__seg-compact">
                <Segmented label={tr("Gaya huruf", "Script style")} value={letterStyle} options={LETTER_STYLE_OPTIONS} onChange={onChangeLetterStyle} />
              </div>
            </div>

            {readingMode === "mushaf" && (
              <>
                <div className="app-menu__field app-menu__field--row">
                  <span className="app-menu__label">{tr("Pindah", "Turn")}</span>
                  <div className="app-menu__seg-compact">
                    <Segmented
                      label={tr("Pindah halaman", "Page turn")}
                      value={pageNav}
                      options={[
                        { value: "swipe", label: tr("Geser", "Swipe") },
                        { value: "scroll", label: tr("Gulir", "Scroll") },
                        { value: "scroll-page", label: tr("Per hal.", "By page") },
                      ]}
                      onChange={onChangePageNav}
                    />
                  </div>
                </div>

                <div className="app-menu__field app-menu__field--row app-menu__group--spread">
                  <span className="app-menu__label">{tr("Halaman", "Layout")}</span>
                  <div className="app-menu__seg-compact">
                    <Segmented
                      label={tr("Mode halaman", "Spread mode")}
                      value={spreadMode}
                      options={[
                        { value: "auto", label: tr("Otomatis", "Auto") },
                        { value: "single", label: tr("1 Halaman", "1 Page") },
                        { value: "double", label: tr("2 Halaman", "2 Pages") },
                      ]}
                      onChange={onChangeSpreadMode}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div className="app-menu__field app-menu__field--row">
          <span className="app-menu__label">{tr("Tema", "Theme")}</span>
          <div className="app-menu__swatches" role="group" aria-label={tr("Tema warna", "Color theme")}>
            {THEME_OPTIONS.map((option) => {
              const shortName =
                option.value === "light"
                  ? tr("Terang", "Light")
                  : option.value === "dark"
                    ? tr("Gelap", "Dark")
                    : "Sepia";
              const ariaLabel =
                option.value === "light"
                  ? tr("Tema Kertas Terang", "Light Paper Theme")
                  : option.value === "dark"
                    ? tr("Tema Malam Gelap", "Dark Night Theme")
                    : tr("Tema Sepia Hangat", "Warm Sepia Theme");
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`app-menu__swatch ${theme === option.value ? "app-menu__swatch--active" : ""}`}
                  aria-pressed={theme === option.value}
                  aria-label={ariaLabel}
                  title={shortName}
                  onClick={() => onChangeTheme(option.value)}
                >
                  <span className={`theme-dot theme-dot--${option.value}`} aria-hidden="true" />
                  <span className="app-menu__swatch-name">{shortName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {onChangeLanguage && (
          <div className="app-menu__field app-menu__field--row">
            <span className="app-menu__label">{tr("Bahasa", "Language")}</span>
            <div className="app-menu__seg-compact">
              <Segmented
                label={tr("Pilih bahasa", "Choose language")}
                value={language}
                options={[
                  { value: "id", label: "ID" },
                  { value: "en", label: "EN" },
                ]}
                onChange={onChangeLanguage}
              />
            </div>
          </div>
        )}

        <span className="app-menu__divider" aria-hidden="true" />

        {onOpenSettings ? (
          <div className="app-menu__settings-footer">
            <button
              type="button"
              className="app-menu__link-chip app-menu__link-chip--full"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              <span className="app-menu__link-chip-label">
                {tr("Semua Pengaturan", "All Settings")}
                {hasActionableAlert && (
                  <span className="app-menu__status-dot" aria-hidden="true" />
                )}
              </span>
              <span className="app-menu__chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
        ) : (
        <div className="app-menu__links">
          {(onOpenProgress || onOpenSchedule || onOpenQuiz || onOpenHalaqah) && (
            <button
              type="button"
              className="app-menu__link-chip"
              onClick={() => setSubmenu("hafalan")}
            >
              <span className="app-menu__link-chip-label">
                {tr("Hafalan", "Memorization")}
              </span>
              <span className="app-menu__chevron" aria-hidden="true">
                ›
              </span>
            </button>
          )}
          <button
            type="button"
            className="app-menu__link-chip"
            onClick={() => setSubmenu("data")}
          >
            <span className="app-menu__link-chip-label">
              {tr("Data & Aplikasi", "Data & App")}
              {hasActionableAlert && <span className="app-menu__status-dot" aria-hidden="true" />}
            </span>
            <span className="app-menu__chevron" aria-hidden="true">
              ›
            </span>
          </button>
          {onOpenReader && linkChip(tr("Baca Tafsir", "Read Tafsir"), onOpenReader)}
          {linkChip(tr("Hukum Tajwid", "Tajweed Guide"), onOpenTajweedGuide)}
        </div>
        )}
          </>
        )}
      </div>
    </>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="app-menu__segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`app-menu__seg ${value === option.value ? "app-menu__seg--active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
