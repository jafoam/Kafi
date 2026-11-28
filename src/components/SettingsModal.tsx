import { useEffect } from "react";
import { SOURCE_CODE_URL } from "../data/acknowledgements";
import type {
  AppLanguage,
  HifzBlurLevel,
  LetterStyle,
  PageNavMode,
  ReadingMode,
  SpreadMode,
  ThemeMode,
} from "../data/types";
import { useI18n } from "../i18n";

const RELEASES_URL = `${SOURCE_CODE_URL}/releases/latest`;

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  language?: AppLanguage;
  onChangeLanguage?: (language: AppLanguage) => void;
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
  syncError?: string | null;
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

const LANGUAGE_OPTIONS: { value: AppLanguage; label: string }[] = [
  { value: "id", label: "Indonesia" },
  { value: "en", label: "English" },
];

const LETTER_STYLE_OPTIONS: { value: LetterStyle; label: string }[] = [
  { value: "1405", label: "1405" },
  { value: "1441", label: "1441" },
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
  language = "id",
  onChangeLanguage,
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
  syncError = null,
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
  const { tr } = useI18n();

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

  const readingModeOptions: { value: ReadingMode; label: string }[] = [
    { value: "mushaf", label: "Mushaf" },
    { value: "translation", label: tr("Terjemahan", "Translation") },
    { value: "reading", label: tr("Bacaan", "Reading") },
  ];

  const pageNavOptions: { value: PageNavMode; label: string }[] = [
    { value: "swipe", label: tr("Geser", "Swipe") },
    { value: "scroll", label: tr("Gulir", "Scroll") },
    { value: "scroll-page", label: tr("Per hal.", "Snap") },
  ];

  const spreadOptions: { value: SpreadMode; label: string }[] = [
    { value: "auto", label: tr("Otomatis", "Auto") },
    { value: "single", label: tr("1 Hal.", "1 Page") },
    { value: "double", label: tr("2 Hal.", "2 Pages") },
  ];

  const themeOptions: { value: ThemeMode; label: string; ariaLabel: string }[] = [
    { value: "light", label: tr("Terang", "Light"), ariaLabel: tr("Tema Kertas Terang", "Light Paper Theme") },
    { value: "sepia", label: "Sepia", ariaLabel: tr("Tema Sepia Hangat", "Warm Sepia Theme") },
    { value: "dark", label: tr("Gelap", "Dark"), ariaLabel: tr("Tema Malam Gelap", "Dark Night Theme") },
  ];

  return (
    <div
      className="settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Pengaturan", "Settings")}
      onClick={onClose}
    >
      <div className="settings-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="settings-sheet__header">
          <h2 className="settings-sheet__title">{tr("Pengaturan", "Settings")}</h2>
          <button
            type="button"
            className="ayah-popover__close settings-sheet__close"
            aria-label={tr("Tutup pengaturan", "Close settings")}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="settings-sheet__body">
          {/* Group 1: Tampilan & Mushaf */}
          <section className="settings-group" aria-labelledby="settings-grp-display">
            <h3 id="settings-grp-display" className="settings-group__title">
              {tr("Tampilan & Mushaf", "Display & Mushaf")}
            </h3>
            <div className="settings-card">
              {onChangeLanguage && (
                <div className="settings-control-row">
                  <span className="settings-row__title">{tr("Bahasa", "Language")}</span>
                  <div className="app-menu__seg-compact">
                    <Segmented
                      label={tr("Pilih bahasa", "Choose language")}
                      value={language}
                      options={LANGUAGE_OPTIONS}
                      onChange={onChangeLanguage}
                    />
                  </div>
                </div>
              )}

              <div className="settings-control-row settings-control-row--stack">
                <span className="settings-row__title">{tr("Mode baca", "Reading mode")}</span>
                <Segmented
                  label={tr("Mode baca", "Reading mode")}
                  value={readingMode}
                  options={readingModeOptions}
                  onChange={onChangeReadingMode}
                />
              </div>

              {readingMode !== "mushaf" && (
                <div className="settings-control-row">
                  <span className="settings-row__title">{tr("Ukuran huruf", "Font size")}</span>
                  <div className="flow-font-stepper" role="group" aria-label={tr("Ukuran huruf", "Font size")}>
                    <button
                      type="button"
                      className="flow-font-stepper__btn"
                      aria-label={tr("Perkecil huruf", "Decrease font size")}
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
                      aria-label={tr("Perbesar huruf", "Increase font size")}
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
                <span className="settings-row__title">{tr("Tema", "Theme")}</span>
                <div className="app-menu__swatches" role="group" aria-label={tr("Tema warna", "Color theme")}>
                  {themeOptions.map((option) => (
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
                <span className="settings-row__title">{tr("Huruf Madinah", "Madinah Script")}</span>
                <div className="app-menu__seg-compact">
                  <Segmented
                    label={tr("Gaya huruf", "Script style")}
                    value={letterStyle}
                    options={LETTER_STYLE_OPTIONS}
                    onChange={onChangeLetterStyle}
                  />
                </div>
              </div>

              {readingMode === "mushaf" && (
                <>
                  <div className="settings-control-row">
                    <span className="settings-row__title">{tr("Pindah halaman", "Page nav")}</span>
                    <div className="app-menu__seg-compact">
                      <Segmented
                        label={tr("Pindah halaman", "Page navigation")}
                        value={pageNav}
                        options={pageNavOptions}
                        onChange={onChangePageNav}
                      />
                    </div>
                  </div>

                  <div className="settings-control-row settings-control-row--spread">
                    <span className="settings-row__title">{tr("Tata halaman", "Page layout")}</span>
                    <div className="app-menu__seg-compact">
                      <Segmented
                        label={tr("Mode halaman", "Page spread")}
                        value={spreadMode}
                        options={spreadOptions}
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
                <span className="settings-row__title">{tr("Tajwid Warna (1441)", "Color Tajweed (1441)")}</span>
                <span className={`settings-switch ${tajweed ? "settings-switch--on" : ""}`} aria-hidden="true" />
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={wordTranslation}
                className="settings-row"
                onClick={onToggleWordTranslation}
              >
                <span className="settings-row__title">{tr("Terjemah Kata", "Word-by-Word")}</span>
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
                <span className="settings-row__title">{tr("Sembunyikan Ayat", "Hide Ayahs")}</span>
                <span className={`settings-switch ${hifzBlur ? "settings-switch--on" : ""}`} aria-hidden="true" />
              </button>

              {hifzBlur && (
                <div className="settings-control-row settings-control-row--sub">
                  <Segmented
                    label={tr("Tingkat sembunyi", "Blur level")}
                    value={hifzBlurLevel}
                    options={[
                      { value: "full", label: tr("Sembunyi penuh", "Full blur") },
                      { value: "first-word", label: tr("Tampil kata pertama", "Show first word") },
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
              {tr("Hafalan & Belajar", "Memorization & Study")}
            </h3>
            <div className="settings-card">
              <button type="button" className="settings-row" onClick={openAndClose(onOpenProgress)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19h16M7 15v-4M12 15V7M17 15v-6" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">{tr("Progres & Streak", "Progress & Streak")}</span>
                  <span className="settings-row__sub">
                    {tr("Peta 30 Juz, 114 Surah, 604 halaman & streak harian", "30 Juz, 114 Surahs, 604 pages map & daily streak")}
                  </span>
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
                  <span className="settings-row__title">{tr("Jadwal Muraja'ah", "Muraja'ah Schedule")}</span>
                  <span className="settings-row__sub">
                    {tr("Atur sendiri target ziyadah & muraja'ah", "Manage your own ziyadah & revision targets")}
                  </span>
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
                  <span className="settings-row__title">{tr("Kuis Teks Offline", "Offline Text Quiz")}</span>
                  <span className="settings-row__sub">
                    {tr("Sambung & urutkan ayat tanpa suara", "Continue & order ayahs silently offline")}
                  </span>
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
                  <span className="settings-row__sub">
                    {tr("Grup setoran tanpa login (kode grup)", "No-login study circle via group code")}
                  </span>
                </span>
                {halaqahConnected && <span className="settings-row__status">{tr("Aktif", "Active")}</span>}
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
                  <span className="settings-row__title">{tr("Baca Tafsir", "Read Tafsir")}</span>
                  <span className="settings-row__sub">
                    {tr("Buka terjemahan & tafsir layar penuh", "Open full-screen translation & tafsir reader")}
                  </span>
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
                  <span className="settings-row__title">{tr("Hukum Tajwid", "Tajweed Guide")}</span>
                  <span className="settings-row__sub">
                    {tr("Panduan warna hukum bacaan", "Color legend for recitation rules")}
                  </span>
                </span>
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>
            </div>
          </section>

          {/* Group 3: Data & Offline */}
          <section className="settings-group" aria-labelledby="settings-grp-data">
            <h3 id="settings-grp-data" className="settings-group__title">
              {tr("Data & Offline", "Data & Offline")}
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
                  <span className="settings-row__title">{tr("Kelola Data", "Manage Data")}</span>
                  <span className="settings-row__sub">
                    {tr("Arsipkan atau hapus riwayat, jadwal, catatan & bookmark", "Archive or delete history, schedules, notes & bookmarks")}
                  </span>
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
                  <span className="settings-row__title">{tr("Unduh Offline", "Offline Downloads")}</span>
                  <span className="settings-row__sub">
                    {tr("Audio murottal, halaman mushaf, terjemah & tafsir", "Recitation audio, mushaf pages, translations & tafsir")}
                  </span>
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
                  <span className="settings-row__title">{tr("Sync Perangkat", "Device Sync")}</span>
                  <span className="settings-row__sub">
                    {syncError
                      ? tr("Sinkronisasi gagal, ketuk untuk memeriksa", "Sync failed, tap to review")
                      : tr("Sinkronisasi terenkripsi antar perangkat tanpa login", "Encrypted no-login sync across devices")}
                  </span>
                </span>
                {syncError ? (
                  <span className="settings-row__status settings-row__status--warn">
                    {tr("Perlu cek", "Check sync")}
                  </span>
                ) : syncConnected ? (
                  <span className="settings-row__status">{tr("Aktif", "Active")}</span>
                ) : null}
                <span className="settings-row__trail" aria-hidden="true">›</span>
              </button>
            </div>
          </section>

          {/* Group 4: Aplikasi */}
          <section className="settings-group" aria-labelledby="settings-grp-app">
            <h3 id="settings-grp-app" className="settings-group__title">
              {tr("Aplikasi", "App")}
            </h3>
            <div className="settings-card">
              <button type="button" className="settings-row" onClick={openAndClose(onOpenAbout)}>
                <span className="settings-row__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
                  </svg>
                </span>
                <span className="settings-row__text">
                  <span className="settings-row__title">{tr("Tentang & Sumber", "About & Sources")}</span>
                  <span className="settings-row__sub">
                    {tr("Lisensi & sumber data mushaf", "Licenses & mushaf data attributions")}
                  </span>
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
                  <span className="settings-row__title">{tr("Aplikasi (GitHub)", "App Releases (GitHub)")}</span>
                  <span className="settings-row__sub">
                    {tr("Unduh APK Android & versi Desktop", "Download Android APK & Desktop builds")}
                  </span>
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
