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
            <span>{surahLabel}</span>
            <span className="topbar__location-meta">
              Juz {juzNumber} · Hal. {pageLabel}
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
            <span>Cari Ayat</span>
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
          >
            Sembunyikan Ayat
          </button>

          <button
            type="button"
            className={`topbar__btn ${focusMode ? "topbar__btn--active" : ""}`}
            aria-pressed={focusMode}
            onClick={onToggleFocusMode}
            title="Mode Fokus (F)"
          >
            Mode Fokus
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
