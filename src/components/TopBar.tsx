import { useEffect, useState } from "react";
import { useBackClose } from "../state/useBackClose";
import type { SpreadMode, ThemeMode } from "../data/types";
import type { PwaInstall } from "../state/usePwaInstall";

export interface TopBarProps {
  surahLabel: string;
  juzNumber: number;
  pageLabel: string;
  spreadMode: SpreadMode;
  hifzBlur: boolean;
  focusMode: boolean;
  wordTranslation: boolean;
  theme: ThemeMode;
  /** PWA install control; shown on web when not yet installed to Home Screen. */
  pwaInstall?: PwaInstall;
  onOpenPalette: (tab?: "surah" | "search") => void;
  onChangeSpreadMode: (mode: SpreadMode) => void;
  onToggleHifzBlur: () => void;
  onToggleFocusMode: () => void;
  onToggleWordTranslation: () => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onOpenTasmi: () => void;
  onOpenDownloads: () => void;
}

const SPREAD_OPTIONS: { value: SpreadMode; label: string }[] = [
  { value: "auto", label: "Otomatis" },
  { value: "single", label: "1 Halaman" },
  { value: "double", label: "2 Halaman" },
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
  hifzBlur,
  focusMode,
  wordTranslation,
  theme,
  pwaInstall,
  onOpenPalette,
  onChangeSpreadMode,
  onToggleHifzBlur,
  onToggleFocusMode,
  onToggleWordTranslation,
  onChangeTheme,
  onOpenTasmi,
  onOpenDownloads,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  useBackClose(menuOpen, () => setMenuOpen(false));
  useBackClose(installGuideOpen, () => setInstallGuideOpen(false));
  return (
    <div className="topbar-zone">
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
          hifzBlur={hifzBlur}
          focusMode={focusMode}
          wordTranslation={wordTranslation}
          theme={theme}
          onChangeSpreadMode={onChangeSpreadMode}
          onToggleHifzBlur={onToggleHifzBlur}
          onToggleFocusMode={onToggleFocusMode}
          onToggleWordTranslation={onToggleWordTranslation}
          onChangeTheme={onChangeTheme}
          onOpenDownloads={onOpenDownloads}
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
      <div className="app-menu install-guide" role="dialog" aria-label="Instal Kafi ke Layar Utama">
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

        <button type="button" className="install-guide__close" onClick={onClose}>
          Mengerti
        </button>
      </div>
    </>
  );
}


interface AppMenuProps {
  spreadMode: SpreadMode;
  hifzBlur: boolean;
  focusMode: boolean;
  wordTranslation: boolean;
  theme: ThemeMode;
  onChangeSpreadMode: (mode: SpreadMode) => void;
  onToggleHifzBlur: () => void;
  onToggleFocusMode: () => void;
  onToggleWordTranslation: () => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onOpenDownloads: () => void;
  onClose: () => void;
}

/** The menu behind the ☰ button: everything the bar has no room for, in big touch-sized rows. */
function AppMenu({
  spreadMode,
  hifzBlur,
  focusMode,
  wordTranslation,
  theme,
  onChangeSpreadMode,
  onToggleHifzBlur,
  onToggleFocusMode,
  onToggleWordTranslation,
  onChangeTheme,
  onOpenDownloads,
  onClose,
}: AppMenuProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <button type="button" className="app-menu__backdrop" aria-label="Tutup menu" onClick={onClose} />
      <div className="app-menu" role="dialog" aria-label="Menu">
        <button
          type="button"
          role="switch"
          aria-checked={focusMode}
          className="app-menu__row"
          onClick={() => {
            onToggleFocusMode();
            onClose();
          }}
        >
          <span className="app-menu__text">
            <span className="app-menu__title">Mode Fokus</span>
            <span className="app-menu__sub">Sembunyikan bilah agar halaman memenuhi layar</span>
          </span>
          <span className={`app-menu__switch ${focusMode ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={hifzBlur}
          className="app-menu__row"
          onClick={onToggleHifzBlur}
        >
          <span className="app-menu__text">
            <span className="app-menu__title">Sembunyikan Ayat</span>
            <span className="app-menu__sub">Mode hafalan: ketuk ayat untuk mengintip</span>
          </span>
          <span className={`app-menu__switch ${hifzBlur ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={wordTranslation}
          className="app-menu__row"
          onClick={onToggleWordTranslation}
        >
          <span className="app-menu__text">
            <span className="app-menu__title">Terjemah Per Kata</span>
            <span className="app-menu__sub">Tampilkan arti tiap kata saat disorot atau diketuk</span>
          </span>
          <span className={`app-menu__switch ${wordTranslation ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
        </button>

        <div className="app-menu__group">
          <span className="app-menu__label">Mode Halaman</span>
          <div className="app-menu__choices" role="group" aria-label="Mode Halaman">
            {SPREAD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`app-menu__choice ${spreadMode === option.value ? "app-menu__choice--active" : ""}`}
                aria-pressed={spreadMode === option.value}
                onClick={() => onChangeSpreadMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="app-menu__group">
          <span className="app-menu__label">Tema</span>
          <div className="app-menu__choices" role="group" aria-label="Tema Warna">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`app-menu__choice ${theme === option.value ? "app-menu__choice--active" : ""}`}
                aria-pressed={theme === option.value}
                onClick={() => onChangeTheme(option.value)}
              >
                <span className={`theme-dot theme-dot--${option.value}`} aria-hidden="true" />
                {THEME_SHORT[option.value]}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="app-menu__row"
          onClick={() => {
            onOpenDownloads();
            onClose();
          }}
        >
          <span className="app-menu__text">
            <span className="app-menu__title">Unduh Offline</span>
            <span className="app-menu__sub">Kelola unduhan murottal, terjemahan, tafsir, mushaf &amp; AI Tasmi&apos;</span>
          </span>
        </button>
      </div>
    </>
  );
}

const THEME_SHORT: Record<ThemeMode, string> = {
  light: "Terang",
  sepia: "Sepia",
  dark: "Gelap",
};
