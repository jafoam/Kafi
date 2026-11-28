import { useEffect, useMemo, useState } from "react";
import { GlassSelect } from "./GlassSelect";
import { useI18n } from "../i18n";
import type { LoadProgress } from "@tilawa/core";
import type {
  AyahKey,
  HifzBlurLevel,
  MurajaahCard,
  PageEntry,
  SurahInfo,
  TasmiSessionKind,
} from "../data/types";
import {
  formatDueLabel,
  getDueMurajaahCards,
  getNextMurajaahTarget,
} from "../services/murajaah-srs";
import {
  buildPageTasmiCandidates,
  type DeclaredPassage,
  type RandomPool,
} from "../services/tasmi-logic";

export interface TasmiSheetProps {
  open: boolean;
  visiblePages: PageEntry[];
  glyphAyahs?: Record<number, AyahKey[]>;
  surahs: SurahInfo[];
  currentJuz?: number;
  initialAyah: AyahKey | null;
  historyCount: number;
  murajaahCards?: MurajaahCard[];
  loadingProgress: LoadProgress | null;
  isStarting: boolean;
  error: string | null;
  hifzBlurLevel?: HifzBlurLevel;
  onChangeHifzBlurLevel?: (level: HifzBlurLevel) => void;
  onClose: () => void;
  onCancelLoad: () => void;
  onStartFree: () => void;
  onStartMemorization: (
    passage: DeclaredPassage,
    enableBlur: boolean,
    kind?: TasmiSessionKind,
  ) => void;
  onStartRandom?: (pool: RandomPool, enableBlur: boolean) => void;
  onOpenHistory: () => void;
  onOpenGuide: () => void;
  streakSummary?: { currentStreak: number; todaySessions: number; todayMinutes: number };
}

const STAGE_LABELS_ID: Record<string, string> = {
  model: "Mengunduh model suara offline",
  reference: "Menyiapkan teks rujukan Al-Qur'an",
  warmup: "Menyiapkan mesin Tasmi'",
};

const STAGE_LABELS_EN: Record<string, string> = {
  model: "Downloading offline speech model",
  reference: "Preparing Quran reference text",
  warmup: "Warming up Tasmi' engine",
};

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TasmiSheet({
  open,
  visiblePages,
  glyphAyahs,
  surahs,
  currentJuz = 1,
  initialAyah,
  historyCount,
  murajaahCards = [],
  loadingProgress,
  isStarting,
  error,
  hifzBlurLevel = "full",
  onChangeHifzBlurLevel,
  onClose,
  onCancelLoad,
  onStartFree,
  onStartMemorization,
  onStartRandom,
  onOpenHistory,
  onOpenGuide,
  streakSummary,
}: TasmiSheetProps) {
  const { lang, isEn, tr } = useI18n();
  const stageLabels = isEn ? STAGE_LABELS_EN : STAGE_LABELS_ID;
  const candidates = useMemo(
    () => buildPageTasmiCandidates(visiblePages, surahs, glyphAyahs, lang),
    [visiblePages, surahs, glyphAyahs, lang],
  );

  const surahByNum = useMemo(() => {
    const map = new Map<number, SurahInfo>();
    for (const s of surahs) map.set(s.number, s);
    return map;
  }, [surahs]);

  const dueMurajaah = useMemo(() => getDueMurajaahCards(murajaahCards), [murajaahCards]);
  const nextMurajaah = useMemo(() => getNextMurajaahTarget(murajaahCards), [murajaahCards]);

  const [mode, setMode] = useState<"memorization" | "random" | "free">("memorization");
  const [selectedSurah, setSelectedSurah] = useState<number>(1);
  const [fromAyah, setFromAyah] = useState<number>(1);
  const [toAyah, setToAyah] = useState<number>(7);
  const [enableBlur, setEnableBlur] = useState<boolean>(true);
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");
  const [randomScopeKind, setRandomScopeKind] = useState<"juz" | "surah">("juz");
  const [randomFromJuz, setRandomFromJuz] = useState<number>(currentJuz);
  const [randomToJuz, setRandomToJuz] = useState<number>(currentJuz);
  const [randomFromSurah, setRandomFromSurah] = useState<number>(1);
  const [randomToSurah, setRandomToSurah] = useState<number>(1);
  const [randomFromAyah, setRandomFromAyah] = useState<number>(1);
  const [randomToAyah, setRandomToAyah] = useState<number>(7);

  // Sync defaults whenever the sheet opens
  useEffect(() => {
    if (!open) return;

    const clampedJuz = Math.max(1, Math.min(30, currentJuz));
    setRandomFromJuz(clampedJuz);
    setRandomToJuz(clampedJuz);

    if (initialAyah) {
      const [sStr, aStr] = initialAyah.split(":");
      const s = Number(sStr);
      const a = Number(aStr);
      const match = candidates.find((c) => c.surah === s && a >= c.fromAyah && a <= c.toAyah);
      const info = surahByNum.get(s);
      if (match) {
        setSelectedOptionId(a === match.fromAyah ? match.id : "custom");
        setSelectedSurah(match.surah);
        setFromAyah(a);
        setToAyah(match.toAyah);
        setRandomFromSurah(match.surah);
        setRandomToSurah(match.surah);
        setRandomFromAyah(1);
        setRandomToAyah(info?.ayahs ?? match.toAyah);
        return;
      }
      if (info) {
        const clampedA = Number.isFinite(a) ? Math.max(1, Math.min(a, info.ayahs)) : 1;
        setSelectedOptionId("custom");
        setSelectedSurah(info.number);
        setFromAyah(clampedA);
        setToAyah(info.ayahs);
        setRandomFromSurah(info.number);
        setRandomToSurah(info.number);
        setRandomFromAyah(1);
        setRandomToAyah(info.ayahs);
        return;
      }
    }

    if (candidates.length > 0) {
      const first = candidates[0];
      const info = surahByNum.get(first.surah);
      setSelectedOptionId(first.id);
      setSelectedSurah(first.surah);
      setFromAyah(first.fromAyah);
      setToAyah(first.toAyah);
      setRandomFromSurah(first.surah);
      setRandomToSurah(first.surah);
      setRandomFromAyah(1);
      setRandomToAyah(info?.ayahs ?? first.toAyah);
    }
  }, [open, initialAyah, currentJuz, candidates, surahByNum]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (loadingProgress) {
          onCancelLoad();
        } else if (!isStarting) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loadingProgress, isStarting, onCancelLoad, onClose]);

  if (!open) return null;

  const activeSurahInfo = surahByNum.get(selectedSurah);
  const maxAyah = activeSurahInfo?.ayahs ?? 286;
  const isBusy = loadingProgress !== null || isStarting;

  const clampedFrom = Math.max(1, Math.min(fromAyah, maxAyah));
  const clampedTo = Math.max(clampedFrom, Math.min(toAyah, maxAyah));

  const pct = loadingProgress ? Math.round(loadingProgress.fraction * 100) : 0;

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Mulai Tasmi'", "Start Tasmi'")}
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div className="tasmi-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header tasmi-sheet__header--stacked">
          <div className="tasmi-sheet__header-top">
            <div>
              <h2 className="tasmi-sheet__title">Tasmi&apos;</h2>
              <p className="tasmi-sheet__subtitle">
                {tr("Suaramu diproses di perangkat", "Your voice is processed on-device")}
              </p>
            </div>
            <button
              type="button"
              className="ayah-popover__close"
              aria-label={tr("Tutup", "Close")}
              disabled={isBusy}
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div className="tasmi-sheet__header-actions">
            <button
              type="button"
              className="tasmi-sheet__history-btn"
              onClick={onOpenHistory}
              disabled={isBusy}
              aria-label={tr("Evaluasi Tasmi'", "Tasmi' Evaluation")}
            >
              {tr("Evaluasi Tasmi'", "Tasmi' Evaluation")}{historyCount > 0 ? ` (${historyCount})` : ""}
            </button>
            <button
              type="button"
              className="tasmi-sheet__history-btn"
              onClick={onOpenGuide}
              disabled={isBusy}
            >
              {tr("Panduan", "Guide")}
            </button>
          </div>
        </div>

        <div className="tasmi-sheet__modes" role="tablist" aria-label={tr("Mode Tasmi'", "Tasmi' Mode")}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "memorization"}
            className={`tasmi-sheet__mode-btn ${
              mode === "memorization" ? "tasmi-sheet__mode-btn--active" : ""
            }`}
            disabled={isBusy}
            onClick={() => setMode("memorization")}
          >
            {tr("Hafalan", "Memorization")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "random"}
            className={`tasmi-sheet__mode-btn ${
              mode === "random" ? "tasmi-sheet__mode-btn--active" : ""
            }`}
            disabled={isBusy}
            onClick={() => setMode("random")}
          >
            {tr("Uji Acak", "Random Test")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "free"}
            className={`tasmi-sheet__mode-btn ${
              mode === "free" ? "tasmi-sheet__mode-btn--active" : ""
            }`}
            disabled={isBusy}
            onClick={() => setMode("free")}
          >
            {tr("Baca Bebas", "Free Recite")}
          </button>
        </div>

        <div className="tasmi-sheet__body">
          {streakSummary && (streakSummary.currentStreak > 0 || streakSummary.todaySessions > 0) && (
            <div className="tasmi-sheet__streak-pill">
              <span>
                {tr(
                  `Streak ${streakSummary.currentStreak} hari`,
                  `${streakSummary.currentStreak}-day streak`,
                )}
              </span>
              <span>
                {tr(
                  `Hari ini: ${streakSummary.todaySessions} sesi (${streakSummary.todayMinutes} mnt)`,
                  `Today: ${streakSummary.todaySessions} sessions (${streakSummary.todayMinutes} min)`,
                )}
              </span>
            </div>
          )}
          {mode === "memorization" ? (
            <>
              {nextMurajaah && (
                <button
                  type="button"
                  className="tasmi-sheet__murajaah-cta"
                  disabled={isBusy}
                  onClick={() =>
                    onStartMemorization(
                      {
                        surah: nextMurajaah.surah,
                        fromAyah: nextMurajaah.fromAyah,
                        toAyah: nextMurajaah.toAyah,
                      },
                      true,
                      nextMurajaah.kind,
                    )
                  }
                >
                  <span>
                    <span className="tasmi-sheet__murajaah-title">
                      {tr("Muraja'ah Hari Ini", "Today's Muraja'ah")}
                      {dueMurajaah.length > 0 ? ` (${dueMurajaah.length})` : ""}
                    </span>
                    <span className="tasmi-sheet__murajaah-sub">
                      {surahByNum.get(nextMurajaah.surah)?.name ?? `Surah ${nextMurajaah.surah}`}{" "}
                      {nextMurajaah.fromAyah}–{nextMurajaah.toAyah} ·{" "}
                      {formatDueLabel(nextMurajaah.dueAt, undefined, lang)}
                    </span>
                  </span>
                  <span className="tasmi-sheet__murajaah-pill">{tr("Mulai", "Start")}</span>
                </button>
              )}

              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">{tr("Cakupan", "Passage")}</span>
                <div className="tasmi-sheet__options tasmi-sheet__options--compact">
                  {candidates.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isBusy}
                      className={`tasmi-sheet__option ${
                        selectedOptionId === opt.id ? "tasmi-sheet__option--active" : ""
                      }`}
                      onClick={() => {
                        setSelectedOptionId(opt.id);
                        setSelectedSurah(opt.surah);
                        setFromAyah(opt.fromAyah);
                        setToAyah(opt.toAyah);
                      }}
                    >
                      <span className="tasmi-sheet__option-name">
                        {opt.surah}. {opt.surahName}
                      </span>
                      <span className="tasmi-sheet__option-scope">{opt.scopeLabel}</span>
                    </button>
                  ))}

                  {activeSurahInfo && (
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`tasmi-sheet__option ${
                        selectedOptionId === "full-surah" ? "tasmi-sheet__option--active" : ""
                      }`}
                      onClick={() => {
                        setSelectedOptionId("full-surah");
                        setFromAyah(1);
                        setToAyah(activeSurahInfo.ayahs);
                      }}
                    >
                      <span className="tasmi-sheet__option-name">{tr("Surah penuh", "Full surah")}</span>
                      <span className="tasmi-sheet__option-scope">
                        {tr("Ayat", "Ayah")} 1–{activeSurahInfo.ayahs}
                      </span>
                    </button>
                  )}
                </div>
                <div className="tasmi-sheet__range-row">
                  <div className="tasmi-sheet__field">
                    <span>Surah</span>
                    <GlassSelect
                      ariaLabel={tr("Pilih Surah", "Select Surah")}
                      value={String(selectedSurah)}
                      disabled={isBusy}
                      options={surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` }))}
                      onChange={(val) => {
                        const s = Number(val);
                        const info = surahByNum.get(s);
                        setSelectedOptionId("custom");
                        setSelectedSurah(s);
                        setFromAyah(1);
                        setToAyah(info?.ayahs ?? 1);
                      }}
                    />
                  </div>

                  <label className="tasmi-sheet__field tasmi-sheet__field--num">
                    <span>{tr("Dari ayat", "From ayah")}</span>
                    <input
                      type="number"
                      min={1}
                      max={maxAyah}
                      value={fromAyah}
                      disabled={isBusy}
                      onChange={(e) => {
                        setSelectedOptionId("custom");
                        setFromAyah(Number(e.target.value) || 1);
                      }}
                    />
                  </label>

                  <label className="tasmi-sheet__field tasmi-sheet__field--num">
                    <span>{tr("Sampai", "To")}</span>
                    <input
                      type="number"
                      min={1}
                      max={maxAyah}
                      value={toAyah}
                      disabled={isBusy}
                      onChange={(e) => {
                        setSelectedOptionId("custom");
                        setToAyah(Number(e.target.value) || 1);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="tasmi-sheet__inline">
                <span className="tasmi-sheet__label">{tr("Sembunyikan ayat", "Hide ayahs")}</span>
                <div
                  className="app-menu__segmented"
                  role="radiogroup"
                  aria-label={tr("Sembunyikan ayat", "Hide ayahs")}
                >
                  {(
                    [
                      ["off", tr("Tidak", "Off")],
                      ["full", tr("Penuh", "Full")],
                      ["first-word", tr("Kata awal", "First word")],
                    ] as const
                  ).map(([value, label]) => {
                    const active = value === "off" ? !enableBlur : enableBlur && hifzBlurLevel === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        disabled={isBusy}
                        aria-checked={active}
                        className={`app-menu__seg ${active ? "app-menu__seg--active" : ""}`}
                        onClick={() => {
                          if (value === "off") {
                            setEnableBlur(false);
                            return;
                          }
                          setEnableBlur(true);
                          onChangeHifzBlurLevel?.(value);
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : mode === "random" ? (
            <>
              <div className="tasmi-sheet__free-box">
                <p>
                  {tr(
                    "Aplikasi memilih 1 ayat acak lalu membacakannya. Ayat setelahnya disamarkan; lanjutkan bacaannya untuk dicek oleh Tasmi'.",
                    "The app picks and plays one random ayah. The following ayahs are hidden; continue reciting so Tasmi' can check you.",
                  )}
                </p>
              </div>

              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">{tr("Rentang uji acak", "Random test range")}</span>
                <div
                  className="tasmi-sheet__blur-level"
                  role="group"
                  aria-label={tr("Jenis rentang uji acak", "Random test range type")}
                >
                  <button
                    type="button"
                    disabled={isBusy}
                    className={`app-menu__choice ${randomScopeKind === "juz" ? "app-menu__choice--active" : ""}`}
                    aria-pressed={randomScopeKind === "juz"}
                    onClick={() => setRandomScopeKind("juz")}
                  >
                    {tr("Per Juz", "By Juz")}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    className={`app-menu__choice ${randomScopeKind === "surah" ? "app-menu__choice--active" : ""}`}
                    aria-pressed={randomScopeKind === "surah"}
                    onClick={() => setRandomScopeKind("surah")}
                  >
                    {tr("Per Surah", "By Surah")}
                  </button>
                </div>

                {randomScopeKind === "juz" ? (
                  <div className="tasmi-sheet__range-row tasmi-sheet__range-row--equal">
                    <div className="tasmi-sheet__field">
                      <span>{tr("Dari Juz", "From Juz")}</span>
                      <GlassSelect
                        ariaLabel={tr("Dari Juz", "From Juz")}
                        value={String(randomFromJuz)}
                        disabled={isBusy}
                        options={Array.from({ length: 30 }, (_, i) => ({
                          value: String(i + 1),
                          label: `Juz ${i + 1}`,
                        }))}
                        onChange={(val) => {
                          const j = Number(val);
                          setRandomFromJuz(j);
                          if (j > randomToJuz) setRandomToJuz(j);
                        }}
                      />
                    </div>
                    <div className="tasmi-sheet__field">
                      <span>{tr("Sampai Juz", "To Juz")}</span>
                      <GlassSelect
                        ariaLabel={tr("Sampai Juz", "To Juz")}
                        value={String(randomToJuz)}
                        disabled={isBusy}
                        options={Array.from({ length: 30 }, (_, i) => ({
                          value: String(i + 1),
                          label: `Juz ${i + 1}`,
                        }))}
                        onChange={(val) => {
                          const j = Number(val);
                          setRandomToJuz(j);
                          if (j < randomFromJuz) setRandomFromJuz(j);
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="tasmi-sheet__range-row tasmi-sheet__range-row--equal">
                      <div className="tasmi-sheet__field">
                        <span>{tr("Dari Surah", "From Surah")}</span>
                        <GlassSelect
                          ariaLabel={tr("Dari Surah", "From Surah")}
                          value={String(randomFromSurah)}
                          disabled={isBusy}
                          options={surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` }))}
                          onChange={(val) => {
                            const s = Number(val);
                            setRandomFromSurah(s);
                            if (s > randomToSurah) setRandomToSurah(s);
                            const info = surahByNum.get(s);
                            setRandomFromAyah(1);
                            setRandomToAyah(info?.ayahs ?? 1);
                          }}
                        />
                      </div>
                      <div className="tasmi-sheet__field">
                        <span>{tr("Sampai Surah", "To Surah")}</span>
                        <GlassSelect
                          ariaLabel={tr("Sampai Surah", "To Surah")}
                          value={String(randomToSurah)}
                          disabled={isBusy}
                          options={surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` }))}
                          onChange={(val) => {
                            const s = Number(val);
                            setRandomToSurah(s);
                            if (s < randomFromSurah) setRandomFromSurah(s);
                            const info = surahByNum.get(s);
                            setRandomFromAyah(1);
                            setRandomToAyah(info?.ayahs ?? 1);
                          }}
                        />
                      </div>
                    </div>

                    {randomFromSurah === randomToSurah && (
                      <div className="tasmi-sheet__range-row tasmi-sheet__range-row--equal">
                        <label className="tasmi-sheet__field tasmi-sheet__field--num">
                          <span>{tr("Dari ayat", "From ayah")}</span>
                          <input
                            type="number"
                            min={1}
                            max={surahByNum.get(randomFromSurah)?.ayahs ?? 286}
                            value={randomFromAyah}
                            disabled={isBusy}
                            onChange={(e) => setRandomFromAyah(Number(e.target.value) || 1)}
                          />
                        </label>
                        <label className="tasmi-sheet__field tasmi-sheet__field--num">
                          <span>{tr("Sampai", "To")}</span>
                          <input
                            type="number"
                            min={1}
                            max={surahByNum.get(randomFromSurah)?.ayahs ?? 286}
                            value={randomToAyah}
                            disabled={isBusy}
                            onChange={(e) => setRandomToAyah(Number(e.target.value) || 1)}
                          />
                        </label>
                      </div>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enableBlur}
                disabled={isBusy}
                className="tasmi-sheet__toggle"
                onClick={() => setEnableBlur(!enableBlur)}
              >
                <span className="tasmi-sheet__toggle-text">
                  <strong>{tr("Sembunyikan ayat lanjutan (Hifz Blur)", "Hide following ayahs (Hifz Blur)")}</strong>
                  <small>
                    {tr(
                      "Ayat setelah pemicu disamarkan dan terbuka saat dibaca.",
                      "Ayahs after the prompt stay hidden and reveal as you recite.",
                    )}
                  </small>
                </span>
                <span className={`app-menu__switch ${enableBlur ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
              </button>

              {enableBlur && onChangeHifzBlurLevel && (
                <div
                  className="tasmi-sheet__blur-level"
                  role="group"
                  aria-label={tr("Tingkat sembunyi", "Hide level")}
                >
                  <button
                    type="button"
                    className={`app-menu__choice ${hifzBlurLevel === "full" ? "app-menu__choice--active" : ""}`}
                    aria-pressed={hifzBlurLevel === "full"}
                    onClick={() => onChangeHifzBlurLevel("full")}
                  >
                    {tr("Sembunyi Penuh", "Hide Fully")}
                  </button>
                  <button
                    type="button"
                    className={`app-menu__choice ${hifzBlurLevel === "first-word" ? "app-menu__choice--active" : ""}`}
                    aria-pressed={hifzBlurLevel === "first-word"}
                    onClick={() => onChangeHifzBlurLevel("first-word")}
                  >
                    {tr("Tampilkan Kata Pertama", "Show First Word")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="tasmi-sheet__free-box">
              <p>
                {tr(
                  "Mulai membaca dari ayat mana saja. Mushaf akan melacak posisi bacaan dan membalik halaman secara otomatis.",
                  "Start reciting from any ayah. The mushaf tracks your recitation and turns pages automatically.",
                )}
              </p>
            </div>
          )}

          {loadingProgress && (
            <div className="tasmi-sheet__progress" role="status" aria-live="polite">
              <div className="tasmi-sheet__progress-head">
                <span>
                  {stageLabels[loadingProgress.stage] ?? tr("Memuat model...", "Loading model...")}
                  {loadingProgress.fromCache ? tr(" (dari cache)", " (cached)") : ""}
                </span>
                <span>
                  {loadingProgress.total > 0
                    ? `${pct}% · ${formatMb(loadingProgress.loaded)} / ${formatMb(loadingProgress.total)}`
                    : `${pct}%`}
                </span>
              </div>
              <div className="tasmi-sheet__progress-track">
                <div
                  className="tasmi-sheet__progress-fill"
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
              <button
                type="button"
                className="tasmi-sheet__cancel-btn"
                onClick={onCancelLoad}
              >
                {tr("Batalkan", "Cancel")}
              </button>
            </div>
          )}

          {error && (
            <div className="tasmi-sheet__error" role="alert">
              {error}
            </div>
          )}

          <p className="tasmi-sheet__disclaimer">
            {tr(
              "Mengecek ketepatan hafalan/kata; belum menilai tajwid atau makhraj.",
              "Checks memorization and word accuracy; does not evaluate tajweed or makhraj yet.",
            )}
          </p>
        </div>

        <div className="tasmi-sheet__footer">
          <button
            type="button"
            className="tasmi-sheet__start-btn"
            disabled={isBusy}
            onClick={() => {
              if (mode === "free") {
                onStartFree();
              } else if (mode === "random" && onStartRandom) {
                const pool: RandomPool =
                  randomScopeKind === "juz"
                    ? { kind: "juz", fromJuz: randomFromJuz, toJuz: randomToJuz }
                    : randomFromSurah === randomToSurah
                      ? {
                          kind: "surah",
                          fromSurah: randomFromSurah,
                          toSurah: randomToSurah,
                          fromAyah: randomFromAyah,
                          toAyah: randomToAyah,
                        }
                      : { kind: "surah", fromSurah: randomFromSurah, toSurah: randomToSurah };
                onStartRandom(pool, enableBlur);
              } else {
                onStartMemorization(
                  { surah: selectedSurah, fromAyah: clampedFrom, toAyah: clampedTo },
                  enableBlur,
                  "murajaah",
                );
              }
            }}
          >
            {isBusy
              ? tr("Menyiapkan...", "Preparing...")
              : mode === "free"
                ? tr("Mulai Baca Bebas", "Start Free Recite")
                : mode === "random"
                  ? tr("Mulai Uji Acak", "Start Random Test")
                  : tr("Mulai Tasmi'", "Start Tasmi'")}
          </button>
        </div>
      </div>
    </div>
  );
}
