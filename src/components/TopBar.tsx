import { useEffect, useState } from "react";
import { useBackClose } from "../state/useBackClose";
import { SOURCE_CODE_URL } from "../data/acknowledgements";
import type { HifzBlurLevel, LetterStyle, PageNavMode, ReadingMode, SpreadMode, ThemeMode } from "../data/types";
import type { PwaInstall } from "../state/usePwaInstall";

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
  halaqahConnected?: boolean;
  syncConnected?: boolean;
  /** Told when the ☰ menu opens or closes, so other popups can step aside. */
  onMenuOpenChange?: (open: boolean) => void;
}

const SPREAD_OPTIONS: { value: SpreadMode; label: string }[] = [
  { value: "auto", label: "Otomatis" },
  { value: "single", label: "1 Halaman" },
  { value: "double", label: "2 Halaman" },
];

const PAGE_NAV_OPTIONS: { value: PageNavMode; label: string }[] = [
  { value: "swipe", label: "Geser" },
  { value: "scroll", label: "Gulir" },
  { value: "scroll-page", label: "Per hal." },
];

const READING_MODE_OPTIONS: { value: ReadingMode; label: string }[] = [
  { value: "mushaf", label: "Mushaf" },
  { value: "translation", label: "Terjemahan" },
  { value: "reading", label: "Bacaan" },
];

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
  halaqahConnected = false,
  syncConnected = false,
  onMenuOpenChange,
}: TopBarProps) {
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
          aria-label="Keluar Mode Fokus"
          title="Keluar Mode Fokus (F / Esc)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          </svg>
          <span>Keluar Fokus</span>
        </button>
      )}
      <header className={`topbar ${focusMode ? "topbar--hidden" : ""}`}>
        <div className="topbar__left">
          <span className="topbar__brand">Kafi</span>
          <button
            type="button"
            className="topbar__location-pill"
            onClick={() => onOpenPalette("surah")}
            title="Buka navigasi Surah, Juz, dan Halaman"
          >
            <span className="topbar__location-name">{surahLabel}</span>
            <span className="topbar__location-meta">
              <span className="topbar__location-juz">Juz {juzNumber} · </span>
              Hal. {pageLabel}
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
              aria-label="Instal aplikasi ke layar utama"
              title="Instal Kafi ke layar utama agar halaman baca lebih lega"
            >
              <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <span className="topbar__label">Instal</span>
            </button>
          )}

          <button
            type="button"
            className="topbar__btn"
            onClick={() => onOpenPalette("search")}
            title="Cari Ayat atau Surah (Cmd/Ctrl+K)"
            aria-label="Cari Ayat"
          >
            <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="topbar__label">Cari Ayat</span>
            <span className="topbar__kbd">⌘K</span>
          </button>

          <button
            type="button"
            className={`topbar__btn topbar__desk ${hifzBlur ? "topbar__btn--active" : ""}`}
            aria-pressed={hifzBlur}
            onClick={onToggleHifzBlur}
            title="Mode Hafalan: sembunyikan ayat dan ketuk untuk mengintip"
            aria-label="Sembunyikan Ayat"
          >
            <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3l18 18" />
              <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg>
            <span className="topbar__label">Sembunyikan Ayat</span>
          </button>

          <button
            type="button"
            className={`topbar__btn topbar__desk ${focusMode ? "topbar__btn--active" : ""}`}
            aria-pressed={focusMode}
            onClick={onToggleFocusMode}
            title="Mode Fokus (F)"
            aria-label="Mode Fokus"
          >
            <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
            <span className="topbar__label">Mode Fokus</span>
          </button>

          <button
            type="button"
            className={`topbar__btn topbar__btn--icon ${menuOpen ? "topbar__btn--active" : ""}`}
            onClick={() => {
              setInstallGuideOpen(false);
              setMenuOpen((open) => !open);
            }}
            aria-label="Menu: mode halaman, tema, dan unduh offline"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            title="Menu: mode halaman, tema, dan unduh offline"
          >
            <svg className="topbar__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <button
            type="button"
            className="topbar__tasmi topbar__desk"
            onClick={onOpenTasmi}
            title="Tasmi': bacakan hafalanmu, aplikasi menyimak dan menandai kesalahan"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
            </svg>
            <span>Mulai Tasmi&apos;</span>
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
          halaqahConnected={halaqahConnected}
          syncConnected={syncConnected}
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

  return (
    <>
      <button type="button" className="app-menu__backdrop" aria-label="Tutup panduan instal" onClick={onClose} />
      <div className="app-menu install-guide" role="dialog" aria-label="Instal Kafi">
        <div className="install-guide__head">
          <strong className="install-guide__title">Instal Kafi ke Layar Utama</strong>
          <p className="install-guide__sub">
            Buka layar penuh tanpa bilah browser agar halaman mushaf tampil lebih besar dan lega.
          </p>
        </div>

        {platform === "ios" ? (
          <ol className="install-guide__steps">
            <li>
              Ketuk ikon <strong>Bagikan</strong>{" "}
              <svg className="install-guide__share-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12m0-12 4 4m-4-4-4 4" />
                <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              </svg>{" "}
              di bilah bawah Safari.
            </li>
            <li>
              Geser ke bawah lalu pilih <strong>Tambahkan ke Layar Utama</strong>.
            </li>
            <li>
              Ketuk <strong>Tambah</strong> di pojok kanan atas.
            </li>
          </ol>
        ) : (
          <ol className="install-guide__steps">
            <li>
              Buka menu browser (ikon <strong>⋮</strong> atau <strong>⋯</strong>).
            </li>
            <li>
              Pilih <strong>Tambahkan ke Layar Utama</strong> atau <strong>Instal Aplikasi</strong>.
            </li>
          </ol>
        )}

        <div className="install-guide__app-box">
          <div className="install-guide__app-head">
            <strong className="install-guide__app-title">
              Atau unduh versi aplikasi{release?.tag ? ` (${release.tag})` : ""}
            </strong>
            <p className="install-guide__sub">
              {release
                ? "Langsung unduh file installer tanpa perlu mencari di GitHub."
                : "Tersedia untuk Android & Desktop. Di halaman rilis, gulir ke bagian Assets lalu pilih file perangkatmu."}
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
                  <span>{asset.label}</span>
                  <span aria-hidden="true">↓</span>
                </a>
              ))}
              <a
                className="install-guide__releases-link"
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Lihat semua rilis di GitHub ↗
              </a>
            </div>
          ) : (
            <a
              className="install-guide__asset-btn"
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Buka Halaman Unduhan (GitHub)</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>

        <button type="button" className="install-guide__close" onClick={onClose}>
          Mengerti
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
  halaqahConnected?: boolean;
  syncConnected?: boolean;
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
  halaqahConnected = false,
  syncConnected = false,
  onClose,
}: AppMenuProps) {
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
        <span className="app-menu__link-chip-label">
          {title}
          {badge && <span className="app-menu__status-dot" aria-hidden="true" />}
        </span>
        <span className="app-menu__subrow-sub">{subtitle}</span>
      </span>
      <span className="app-menu__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );

  return (
    <>
      <button type="button" className="app-menu__backdrop" aria-label="Tutup menu" onClick={onClose} />
      <div className="app-menu" role="dialog" aria-label="Menu">
        {submenu !== "root" ? (
          <div className="app-menu__submenu">
            <div className="app-menu__subhead">
              <button
                type="button"
                className="app-menu__back-btn"
                onClick={() => setSubmenu("root")}
              >
                ‹ Kembali
              </button>
              <span className="app-menu__subtitle">
                {submenu === "hafalan" ? "Hafalan" : "Data & Aplikasi"}
              </span>
            </div>

            {submenu === "hafalan" ? (
              <div className="app-menu__sublist">
                {onOpenProgress &&
                  submenuRow("Progres & Streak", "Peta Juz, Surah, 604 halaman & streak", onOpenProgress)}
                {onOpenSchedule &&
                  submenuRow("Jadwal Muraja'ah", "Atur sendiri target ziyadah & muraja'ah", onOpenSchedule)}
                {onOpenQuiz &&
                  submenuRow("Kuis Teks Offline", "Sambung & urutkan ayat tanpa suara", onOpenQuiz)}
                {onOpenHalaqah &&
                  submenuRow("Halaqah", "Grup setoran tanpa login (kode grup)", onOpenHalaqah, halaqahConnected)}
              </div>
            ) : (
              <div className="app-menu__sublist">
                {onOpenManageData &&
                  submenuRow("Kelola Data", "Arsipkan atau hapus riwayat, jadwal, catatan, bookmark", onOpenManageData)}
                {submenuRow("Unduh Offline", "Audio murottal, halaman, terjemah & tafsir", onOpenDownloads)}
                {onOpenSync &&
                  submenuRow("Sync Perangkat", "Sinkronisasi terenkripsi tanpa login", onOpenSync, syncConnected)}
                {submenuRow("Tentang & Sumber", "Lisensi & sumber data mushaf", onOpenAbout)}
                <a
                  className="app-menu__subrow app-menu__link-chip--ext"
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  title="Unduh versi aplikasi Android/Desktop di GitHub"
                >
                  <span className="app-menu__subrow-text">
                    <span className="app-menu__link-chip-label">Aplikasi (GitHub)</span>
                    <span className="app-menu__subrow-sub">Unduh APK Android &amp; Desktop</span>
                  </span>
                  <span className="app-menu__ext-icon" aria-hidden="true">
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
            <span className="app-menu__label">Mode baca</span>
            <Segmented
              label="Mode baca"
              value={readingMode}
              options={READING_MODE_OPTIONS}
              onChange={(next) => {
                onChangeReadingMode(next);
                onClose();
              }}
            />
          </div>
        )}

        {readingMode !== "mushaf" && onChangeFlowFontScale && (
          <div className="app-menu__field app-menu__field--row">
            <span className="app-menu__label">Ukuran huruf</span>
            <div className="flow-font-stepper" role="group" aria-label="Ukuran huruf">
              <button
                type="button"
                className="flow-font-stepper__btn"
                aria-label="Perkecil huruf"
                disabled={flowFontScale <= 0.85}
                onClick={() => onChangeFlowFontScale(Math.max(0.85, Math.round((flowFontScale - 0.15) * 100) / 100))}
              >
                A−
              </button>
              <span className="flow-font-stepper__val">{Math.round(flowFontScale * 100)}%</span>
              <button
                type="button"
                className="flow-font-stepper__btn"
                aria-label="Perbesar huruf"
                disabled={flowFontScale >= 1.6}
                onClick={() => onChangeFlowFontScale(Math.min(1.6, Math.round((flowFontScale + 0.15) * 100) / 100))}
              >
                A+
              </button>
            </div>
          </div>
        )}

        <div className="app-menu__grid" role="group" aria-label="Opsi cepat">
          {toggleChip("Mode Fokus", "Sembunyikan bilah atas & bawah", focusMode, () => {
            onToggleFocusMode();
            onClose();
          })}
          {toggleChip("Sembunyikan Ayat", "Mode hafalan, ketuk untuk mengintip", hifzBlur, onToggleHifzBlur)}
          {toggleChip("Terjemah Kata", "Arti kata saat diketuk", wordTranslation, onToggleWordTranslation)}
          {toggleChip("Tajwid Warna", "Warna hukum tajwid (Madinah 1441)", tajweed, onToggleTajweed)}
        </div>

        {hifzBlur && onChangeHifzBlurLevel && (
          <div className="app-menu__inline">
            <Segmented
              label="Tingkat sembunyi"
              value={hifzBlurLevel}
              options={[
                { value: "full", label: "Sembunyi penuh" },
                { value: "first-word", label: "Tampil kata pertama" },
              ]}
              onChange={onChangeHifzBlurLevel}
            />
          </div>
        )}

        <div className="app-menu__field app-menu__field--row">
          <span className="app-menu__label">Huruf Madinah</span>
          <div className="app-menu__seg-compact">
            <Segmented label="Gaya huruf" value={letterStyle} options={LETTER_STYLE_OPTIONS} onChange={onChangeLetterStyle} />
          </div>
        </div>

        {readingMode === "mushaf" && (
          <>
            <div className="app-menu__field app-menu__field--row">
              <span className="app-menu__label">Pindah</span>
              <div className="app-menu__seg-compact">
                <Segmented label="Pindah halaman" value={pageNav} options={PAGE_NAV_OPTIONS} onChange={onChangePageNav} />
              </div>
            </div>

            <div className="app-menu__field app-menu__field--row app-menu__group--spread">
              <span className="app-menu__label">Halaman</span>
              <div className="app-menu__seg-compact">
                <Segmented label="Mode halaman" value={spreadMode} options={SPREAD_OPTIONS} onChange={onChangeSpreadMode} />
              </div>
            </div>
          </>
        )}

        <div className="app-menu__field app-menu__field--row">
          <span className="app-menu__label">Tema</span>
          <div className="app-menu__swatches" role="group" aria-label="Tema warna">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`app-menu__swatch ${theme === option.value ? "app-menu__swatch--active" : ""}`}
                aria-pressed={theme === option.value}
                aria-label={option.label}
                title={THEME_SHORT[option.value]}
                onClick={() => onChangeTheme(option.value)}
              >
                <span className={`theme-dot theme-dot--${option.value}`} aria-hidden="true" />
                <span className="app-menu__swatch-name">{THEME_SHORT[option.value]}</span>
              </button>
            ))}
          </div>
        </div>

        <span className="app-menu__divider" aria-hidden="true" />

        <div className="app-menu__links">
          {(onOpenProgress || onOpenSchedule || onOpenQuiz || onOpenHalaqah) && (
            <button
              type="button"
              className="app-menu__link-chip"
              onClick={() => setSubmenu("hafalan")}
            >
              <span className="app-menu__link-chip-label">
                Hafalan
                {halaqahConnected && <span className="app-menu__status-dot" aria-hidden="true" />}
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
              Data &amp; Aplikasi
              {syncConnected && <span className="app-menu__status-dot" aria-hidden="true" />}
            </span>
            <span className="app-menu__chevron" aria-hidden="true">
              ›
            </span>
          </button>
          {onOpenReader && linkChip("Baca Tafsir", onOpenReader)}
          {linkChip("Hukum Tajwid", onOpenTajweedGuide)}
        </div>
          </>
        )}
      </div>
    </>
  );
}

const THEME_SHORT: Record<ThemeMode, string> = {
  light: "Terang",
  sepia: "Sepia",
  dark: "Gelap",
};

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
