import { useEffect } from "react";
import { SOURCE_CODE_URL } from "../data/acknowledgements";
import type {
  HifzBlurLevel,
  LetterStyle,
  PageNavMode,
  ReadingMode,
  SpreadMode,
  ThemeMode,
} from "../data/types";

const RELEASES_URL = `${SOURCE_CODE_URL}/releases/latest`;

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  readingMode: ReadingMode;
  flowFontScale: number;
  spreadMode: SpreadMode;
  pageNav: PageNavMode;
  letterStyle: LetterStyle;
  theme: ThemeMode;
  hifzBlur: boolean;
  hifzBlurLevel: HifzBlurLevel;
  wordTranslation: boolean;
  tajweed: boolean;
  halaqahConnected?: boolean;
  syncConnected?: boolean;
  onChangeReadingMode: (mode: ReadingMode) => void;
  onChangeFlowFontScale: (scale: number) => void;
  onChangeSpreadMode: (mode: SpreadMode) => void;
  onChangePageNav: (mode: PageNavMode) => void;
  onChangeLetterStyle: (style: LetterStyle) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onToggleHifzBlur: () => void;
  onChangeHifzBlurLevel: (level: HifzBlurLevel) => void;
  onToggleWordTranslation: () => void;
  onToggleTajweed: () => void;
  onOpenProgress: () => void;
  onOpenSchedule: () => void;
  onOpenQuiz: () => void;
  onOpenHalaqah: () => void;
  onOpenReader: () => void;
  onOpenTajweedGuide: () => void;
  onOpenManageData: () => void;
  onOpenDownloads: () => void;
  onOpenSync: () => void;
  onOpenAbout: () => void;
}

const READING_MODE_OPTIONS: { value: ReadingMode; label: string }[] = [
  { value: "mushaf", label: "Mushaf" },
  { value: "translation", label: "Terjemahan" },
  { value: "reading", label: "Bacaan" },
];

const LETTER_STYLE_OPTIONS: { value: LetterStyle; label: string }[] = [
  { value: "1405", label: "1405" },
  { value: "1441", label: "1441" },
];

const PAGE_NAV_OPTIONS: { value: PageNavMode; label: string }[] = [
  { value: "swipe", label: "Geser" },
  { value: "scroll", label: "Gulir" },
  { value: "scroll-page", label: "Per hal." },
];

const SPREAD_OPTIONS: { value: SpreadMode; label: string }[] = [
  { value: "auto", label: "Otomatis" },
  { value: "single", label: "1 Hal." },
  { value: "double", label: "2 Hal." },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; ariaLabel: string }[] = [
  { value: "light", label: "Terang", ariaLabel: "Tema Kertas Terang" },
  { value: "sepia", label: "Sepia", ariaLabel: "Tema Sepia Hangat" },
  { value: "dark", label: "Gelap", ariaLabel: "Tema Malam Gelap" },
];

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

export function SettingsModal({
  open,
  onClose,
  readingMode,
  flowFontScale,
  spreadMode,
  pageNav,
  letterStyle,
  theme,
  hifzBlur,
  hifzBlurLevel,
  wordTranslation,
  tajweed,
  halaqahConnected = false,
  syncConnected = false,
  onChangeReadingMode,
  onChangeFlowFontScale,
  onChangeSpreadMode,
  onChangePageNav,
  onChangeLetterStyle,
  onChangeTheme,
  onToggleHifzBlur,
  onChangeHifzBlurLevel,
  onToggleWordTranslation,
  onToggleTajweed,
  onOpenProgress,
  onOpenSchedule,
  onOpenQuiz,
  onOpenHalaqah,
  onOpenReader,
  onOpenTajweedGuide,
  onOpenManageData,
  onOpenDownloads,
  onOpenSync,
  onOpenAbout,
}: SettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const openAndClose = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      className="settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan"
      onClick={onClose}
    >
      <div className="settings-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="settings-sheet__header">
          <div className="settings-sheet__heading">
            <h2 className="settings-sheet__title">Pengaturan</h2>
            <p className="settings-sheet__subtitle">Tampilan mushaf, hafalan, dan data offline</p>
          </div>
          <button
            type="button"
            className="ayah-popover__close settings-sheet__close"
            aria-label="Tutup pengaturan"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="settings-sheet__body">
          {/* Group 1: Tampilan & Mushaf */}
          <section className="settings-group" aria-labelledby="settings-grp-display">
            <h3 id="settings-grp-display" className="settings-group__title">
              Tampilan &amp; Mushaf
            </h3>
            <div className="settings-card">
              <div className="settings-control-row settings-control-row--stack">
                <span className="settings-row__title">Mode baca</span>
                <Segmented
                  label="Mode baca"
                  value={readingMode}
                  options={READING_MODE_OPTIONS}
                  onChange={onChangeReadingMode}
                />
              </div>

              {readingMode !== "mushaf" && (
                <div className="settings-control-row">
                  <span className="settings-row__title">Ukuran huruf</span>
                  <div className="flow-font-stepper" role="group" aria-label="Ukuran huruf">
                    <button
                      type="button"
                      className="flow-font-stepper__btn"
                      aria-label="Perkecil huruf"
                      disabled={flowFontScale <= 0.85}
                      onClick={() =>
                        onChangeFlowFontScale(Math.max(0.85, Math.round((flowFontScale - 0.15) * 100) / 100))
                      }
                    >
                      A−
                    </button>
                    <span className="flow-font-stepper__val">{Math.round(flowFontScale * 100)}%</span>
                    <button
                      type="button"
                      className="flow-font-stepper__btn"
                      aria-label="Perbesar huruf"
                      disabled={flowFontScale >= 1.6}
                      onClick={() =>
                        onChangeFlowFontScale(Math.min(1.6, Math.round((flowFontScale + 0.15) * 100) / 100))
                      }
                    >
                      A+
                    </button>
                  </div>
                </div>
              )}

              <div className="settings-control-row">
                <span className="settings-row__title">Tema</span>
                <div className="app-menu__swatches" role="group" aria-label="Tema warna">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`app-menu__swatch ${theme === option.value ? "app-menu__swatch--active" : ""}`}
                      aria-pressed={theme === option.value}
                      aria-label={option.ariaLabel}
                      onClick={() => onChangeTheme(option.value)}
                    >
                      <span className={`theme-dot theme-dot--${option.value}`} aria-hidden="true" />
                      <span className="app-menu__swatch-name">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-control-row">
                <div className="settings-row__text">
                  <span className="settings-row__title">Huruf Madinah</span>
                  <span className="settings-row__sub">Khat cetak 1405 H atau 1441 H</span>
                </div>
                <div className="app-menu__seg-compact">
                  <Segmented
                    label="Gaya huruf"
                    value={letterStyle}
                    options={LETTER_STYLE_OPTIONS}
                    onChange={onChangeLetterStyle}
                  />
                </div>
              </div>

              {readingMode === "mushaf" && (
                <>
                  <div className="settings-control-row">
                    <span className="settings-row__title">Pindah halaman</span>
                    <div className="app-menu__seg-compact">
                      <Segmented
                        label="Pindah halaman"
                        value={pageNav}
                        options={PAGE_NAV_OPTIONS}
                        onChange={onChangePageNav}
                      />
                    </div>
                  </div>

                  <div className="settings-control-row settings-control-row--spread">
                    <span className="settings-row__title">Tata halaman</span>
                    <div className="app-menu__seg-compact">
                      <Segmented
                        label="Mode halaman"
                        value={spreadMode}
                        options={SPREAD_OPTIONS}
                        onChange={onChangeSpreadMode}
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={tajweed}
                className="settings-row"
                onClick={onToggleTajweed}
              >
                <span className="settings-row__text">
                  <span className="settings-row__title">Tajwid Warna</span>
                  <span className="settings-row__sub">Warna hukum tajwid pada khat Madinah 1441</span>
                </span>
                <span className={`settings-switch ${tajweed ? "settings-switch--on" : ""}`} aria-hidden="true" />
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={wordTranslation}
                className="settings-row"
                onClick={onToggleWordTranslation}
              >
                <span className="settings-row__text">
                  <span className="settings-row__title">Terjemah Kata</span>
                  <span className="settings-row__sub">Tampilkan arti kata saat diketuk</span>
                </span>
                <span
                  className={`settings-switch ${wordTranslation ? "settings-switch--on" : ""}`}
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={hifzBlur}
                className="settings-row"
                onClick={onToggleHifzBlur}
              >
                <span className="settings-row__text">
                  <span className="settings-row__title">Sembunyikan Ayat</span>
                  <span className="settings-row__sub">Mode hafalan, ketuk ayat untuk mengintip</span>
                </span>
                <span className={`settings-switch ${hifzBlur ? "settings-switch--on" : ""}`} aria-hidden="true" />
              </button>

              {hifzBlur && (
                <div className="settings-control-row settings-control-row--sub">
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
            </div>
          </section>

          {/* Group 2: Hafalan & Belajar */}
          <section className="settings-group" aria-labelledby="settings-grp-hafalan">
            <h3 id="settings-grp-hafalan" className="settings-group__title">
              Hafalan &amp; Belajar
            </h3>
            <div className="settings-card">
              <button type="button" className="settings-row" onClick={openAndClose(onOpenProgress)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19h16M7 15v-4M12 15V7M17 15v-6" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Progres &amp; Streak</span>
                  <span className="settings-row__sub">Peta 30 Juz, 114 Surah, 604 halaman &amp; streak harian</span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>

              <button type="button" className="settings-row" onClick={openAndClose(onOpenSchedule)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="16" rx="3" />
                    <path d="M8 3v4M16 3v4M3 10h18" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Jadwal Muraja&apos;ah</span>
                  <span className="settings-row__sub">Atur sendiri target ziyadah &amp; muraja&apos;ah</span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>

              <button type="button" className="settings-row" onClick={openAndClose(onOpenQuiz)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3 6-6" />
                    <path d="M20 12a8 8 0 1 1-4-6.9" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Kuis Teks Offline</span>
                  <span className="settings-row__sub">Sambung &amp; urutkan ayat tanpa suara</span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>

              <button type="button" className="settings-row" onClick={openAndClose(onOpenHalaqah)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 19a6 6 0 0 1 12 0" />
                    <circle cx="17" cy="9" r="2.5" />
                    <path d="M16 14.5a5 5 0 0 1 5 4.5" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Halaqah</span>
                  <span className="settings-row__sub">Grup setoran tanpa login (kode grup)</span>
                </span>
                {halaqahConnected && <span className="settings-row__status">Aktif</span>}
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>

              <button type="button" className="settings-row" onClick={openAndClose(onOpenReader)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" />
                    <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5v-13Z" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Baca Tafsir</span>
                  <span className="settings-row__sub">Buka terjemahan &amp; tafsir layar penuh</span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>

              <button type="button" className="settings-row" onClick={openAndClose(onOpenTajweedGuide)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 10v6M12 7h.01" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Hukum Tajwid</span>
                  <span className="settings-row__sub">Panduan warna hukum bacaan</span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>
            </div>
          </section>

          {/* Group 3: Data & Offline */}
          <section className="settings-group" aria-labelledby="settings-grp-data">
            <h3 id="settings-grp-data" className="settings-group__title">
              Data &amp; Offline
            </h3>
            <div className="settings-card">
              <button type="button" className="settings-row" onClick={openAndClose(onOpenManageData)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="6" rx="8" ry="3" />
                    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
                    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Kelola Data</span>
                  <span className="settings-row__sub">Arsipkan atau hapus riwayat, jadwal, catatan &amp; bookmark</span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>

              <button type="button" className="settings-row" onClick={openAndClose(onOpenDownloads)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Unduh Offline</span>
                  <span className="settings-row__sub">Audio murottal, halaman mushaf, terjemah &amp; tafsir</span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>

              <button type="button" className="settings-row" onClick={openAndClose(onOpenSync)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 11a8 8 0 0 0-14.5-4.6M4 4v4h4" />
                    <path d="M4 13a8 8 0 0 0 14.5 4.6M20 20v-4h-4" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Sync Perangkat</span>
                  <span className="settings-row__sub">Sinkronisasi terenkripsi antar perangkat tanpa login</span>
                </span>
                {syncConnected && <span className="settings-row__status">Aktif</span>}
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>
            </div>
          </section>

          {/* Group 4: Aplikasi */}
          <section className="settings-group" aria-labelledby="settings-grp-app">
            <h3 id="settings-grp-app" className="settings-group__title">
              Aplikasi
            </h3>
            <div className="settings-card">
              <button type="button" className="settings-row" onClick={openAndClose(onOpenAbout)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Tentang &amp; Sumber</span>
                  <span className="settings-row__sub">Lisensi &amp; sumber data mushaf</span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>

              <a
                className="settings-row settings-row--ext"
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
              >
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="3" width="12" height="18" rx="2.5" />
                    <path d="M10 17h4" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">Aplikasi (GitHub)</span>
                  <span className="settings-row__sub">Unduh APK Android &amp; versi Desktop</span>
                </span>
                <span className="settings-row__trail settings-row__trail--ext" aria-hidden="true">↗</span>
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
