import type { SpreadMode, ThemeMode } from "../data/types";

export interface TopBarProps {
  surahLabel: string;
  juzNumber: number;
  pageLabel: string;
  spreadMode: SpreadMode;
  hifzBlur: boolean;
  focusMode: boolean;
  theme: ThemeMode;
  onOpenPalette: (tab?: "surah" | "search") => void;
  onChangeSpreadMode: (mode: SpreadMode) => void;
  onToggleHifzBlur: () => void;
  onToggleFocusMode: () => void;
  onChangeTheme: (theme: ThemeMode) => void;
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
  theme,
  onOpenPalette,
  onChangeSpreadMode,
  onToggleHifzBlur,
  onToggleFocusMode,
  onChangeTheme,
}: TopBarProps) {
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
          <button
            type="button"
            className="topbar__btn"
            onClick={() => onOpenPalette("search")}
            title="Cari Ayat atau Surah (Cmd/Ctrl+K)"
          >
            <svg className="topbar__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="topbar__label">Cari Ayat</span>
            <span className="topbar__kbd">⌘K</span>
          </button>

          <div className="topbar__segmented" role="group" aria-label="Mode Halaman">
            {SPREAD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`topbar__seg-btn ${
                  spreadMode === option.value ? "topbar__seg-btn--active" : ""
                }`}
                aria-pressed={spreadMode === option.value}
                onClick={() => onChangeSpreadMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`topbar__btn ${hifzBlur ? "topbar__btn--active" : ""}`}
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
            className={`topbar__btn ${focusMode ? "topbar__btn--active" : ""}`}
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

          <div className="theme-dots" role="group" aria-label="Tema Warna">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`theme-dot theme-dot--${opt.value} ${
                  theme === opt.value ? "theme-dot--active" : ""
                }`}
                aria-label={opt.label}
                aria-pressed={theme === opt.value}
                title={opt.label}
                onClick={() => onChangeTheme(opt.value)}
              />
            ))}
          </div>
        </div>
      </header>
    </div>
  );
}
