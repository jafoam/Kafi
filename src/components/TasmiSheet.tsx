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
  onOpenQuiz?: () => void;
  streakSummary?: { currentStreak: number; todaySessions: number; todayMinutes: number };
}

const STAGE_LABELS: Record<string, string> = {
  model: "Mengunduh model suara offline",
  reference: "Menyiapkan teks rujukan Al-Qur'an",
  warmup: "Menyiapkan mesin Tasmi'",
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
  onOpenQuiz,
  streakSummary,
}: TasmiSheetProps) {
  const { tr } = useI18n();
  const candidates = useMemo(
    () => buildPageTasmiCandidates(visiblePages, surahs, glyphAyahs),
    [visiblePages, surahs, glyphAyahs],
  );

  const surahByNum = useMemo(() => {
    const map = new Map<number, SurahInfo>();
    for (const s of surahs) map.set(s.number, s);
    return map;
  }, [surahs]);

  const dueMurajaah = useMemo(() => getDueMurajaahCards(murajaahCards), [murajaahCards]);
  const nextMurajaah = useMemo(() => getNextMurajaahTarget(murajaahCards), [murajaahCards]);

  const [mode, setMode] = useState<"memorization" | "random" | "free">("memorization");
  const [sessionKind, setSessionKind] = useState<TasmiSessionKind>("murajaah");
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
      aria-label="Mulai Tasmi'"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div className="tasmi-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">Tasmi&apos;</h2>
            <p className="tasmi-sheet__subtitle">
              {tr("Suaramu diproses di perangkat", "Your voice is processed on-device")}
            </p>
          </div>
          <div className="tasmi-sheet__header-actions">
            {onOpenQuiz && (
              <button
                type="button"
                className="tasmi-sheet__history-btn"
                onClick={onOpenQuiz}
                disabled={isBusy}
                title={tr("Kuis teks sambung & urutkan ayat (mode senyap/offline)", "Silent offline ayah continuation & ordering quiz")}
              >
                {tr("Kuis Teks", "Text Quiz")}
              </button>
            )}
            <button
              type="button"
              className="tasmi-sheet__history-btn"
              onClick={onOpenGuide}
              disabled={isBusy}
            >
              {tr("Panduan", "Guide")}
            </button>
            <button
              type="button"
              className="tasmi-sheet__history-btn"
              onClick={onOpenHistory}
              disabled={isBusy}
              aria-label={`${tr("Riwayat Tasmi'", "Tasmi' History")}${historyCount > 0 ? ` (${historyCount})` : ""}`}
            >
              {tr("Riwayat", "History")}{historyCount > 0 ? ` (${historyCount})` : ""}
            </button>
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
              <span>Streak {streakSummary.currentStreak} hari</span>
              <span>
                Hari ini: {streakSummary.todaySessions} sesi ({streakSummary.todayMinutes} mnt)
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
                      Muraja&apos;ah Hari Ini
                      {dueMurajaah.length > 0 ? ` (${dueMurajaah.length})` : ""}
                    </span>
                    <span className="tasmi-sheet__murajaah-sub">
                      {surahByNum.get(nextMurajaah.surah)?.name ?? `Surah ${nextMurajaah.surah}`}{" "}
                      {nextMurajaah.fromAyah}–{nextMurajaah.toAyah} ·{" "}
                      {nextMurajaah.kind === "ziyadah" ? "Ziyadah" : "Muraja'ah"} ·{" "}
                      {formatDueLabel(nextMurajaah.dueAt)}
                    </span>
                  </span>
                  <span className="tasmi-sheet__murajaah-pill">Mulai</span>
                </button>
              )}

              <div className="tasmi-sheet__inline">
                <span className="tasmi-sheet__label">Jenis setoran</span>
                <div className="app-menu__segmented" role="radiogroup" aria-label="Jenis setoran">
                  {(
                    [
                      ["murajaah", "Muraja'ah"],
                      ["ziyadah", "Ziyadah (baru)"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      disabled={isBusy}
                      aria-checked={sessionKind === value}
                      className={`app-menu__seg ${sessionKind === value ? "app-menu__seg--active" : ""}`}
                      onClick={() => setSessionKind(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">Cakupan</span>
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
                      <span className="tasmi-sheet__option-name">Surah penuh</span>
                      <span className="tasmi-sheet__option-scope">
                        Ayat 1–{activeSurahInfo.ayahs}
                      </span>
                    </button>
                  )}
                </div>
                <div className="tasmi-sheet__range-row">
                  <div className="tasmi-sheet__field">
                    <span>Surah</span>
                    <GlassSelect
                      ariaLabel="Pilih Surah"
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
                    <span>Dari ayat</span>
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
                    <span>Sampai</span>
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
                <span className="tasmi-sheet__label">Sembunyikan ayat</span>
                <div className="app-menu__segmented" role="radiogroup" aria-label="Sembunyikan ayat">
                  {(
                    [
                      ["off", "Tidak"],
                      ["full", "Penuh"],
                      ["first-word", "Kata awal"],
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
                  Aplikasi memilih 1 ayat acak lalu membacakannya. Ayat setelahnya disamarkan —
                  lanjutkan bacaannya untuk dicek oleh Tasmi&apos;.
                </p>
              </div>

              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">Rentang uji acak</span>
                <div className="tasmi-sheet__blur-level" role="group" aria-label="Jenis rentang uji acak">
                  <button
                    type="button"
                    disabled={isBusy}
                    className={`app-menu__choice ${randomScopeKind === "juz" ? "app-menu__choice--active" : ""}`}
                    aria-pressed={randomScopeKind === "juz"}
                    onClick={() => setRandomScopeKind("juz")}
                  >
                    Per Juz
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    className={`app-menu__choice ${randomScopeKind === "surah" ? "app-menu__choice--active" : ""}`}
                    aria-pressed={randomScopeKind === "surah"}
                    onClick={() => setRandomScopeKind("surah")}
                  >
                    Per Surah
                  </button>
                </div>

                {randomScopeKind === "juz" ? (
                  <div className="tasmi-sheet__range-row tasmi-sheet__range-row--equal">
                    <div className="tasmi-sheet__field">
                      <span>Dari Juz</span>
                      <GlassSelect
                        ariaLabel="Dari Juz"
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
                      <span>Sampai Juz</span>
                      <GlassSelect
                        ariaLabel="Sampai Juz"
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
                        <span>Dari Surah</span>
                        <GlassSelect
                          ariaLabel="Dari Surah"
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
                        <span>Sampai Surah</span>
                        <GlassSelect
                          ariaLabel="Sampai Surah"
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
                          <span>Dari ayat</span>
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
                          <span>Sampai</span>
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
                  <strong>Sembunyikan ayat lanjutan (Hifz Blur)</strong>
                  <small>Ayat setelah pemicu disamarkan dan terbuka saat dibaca.</small>
                </span>
                <span className={`app-menu__switch ${enableBlur ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
              </button>

              {enableBlur && onChangeHifzBlurLevel && (
                <div className="tasmi-sheet__blur-level" role="group" aria-label="Tingkat sembunyi">
                  <button
                    type="button"
                    className={`app-menu__choice ${hifzBlurLevel === "full" ? "app-menu__choice--active" : ""}`}
                    aria-pressed={hifzBlurLevel === "full"}
                    onClick={() => onChangeHifzBlurLevel("full")}
                  >
                    Sembunyi Penuh
                  </button>
                  <button
                    type="button"
                    className={`app-menu__choice ${hifzBlurLevel === "first-word" ? "app-menu__choice--active" : ""}`}
                    aria-pressed={hifzBlurLevel === "first-word"}
                    onClick={() => onChangeHifzBlurLevel("first-word")}
                  >
                    Tampilkan Kata Pertama
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="tasmi-sheet__free-box">
              <p>
                Mulai membaca dari ayat mana saja. Mushaf akan melacak posisi bacaan dan membalik
                halaman secara otomatis.
              </p>
            </div>
          )}

          {loadingProgress && (
            <div className="tasmi-sheet__progress" role="status" aria-live="polite">
              <div className="tasmi-sheet__progress-head">
                <span>
                  {STAGE_LABELS[loadingProgress.stage] ?? "Memuat model..."}
                  {loadingProgress.fromCache ? " (dari cache)" : ""}
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
                Batalkan
              </button>
            </div>
          )}

          {error && (
            <div className="tasmi-sheet__error" role="alert">
              {error}
            </div>
          )}

          <p className="tasmi-sheet__disclaimer">
            Mengecek ketepatan hafalan/kata; belum menilai tajwid atau makhraj.
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
                  sessionKind,
                );
              }
            }}
          >
            {isBusy
              ? "Menyiapkan..."
              : mode === "free"
                ? "Mulai Baca Bebas"
                : mode === "random"
                  ? "Mulai Uji Acak"
                  : "Mulai Tasmi'"}
          </button>
        </div>
      </div>
    </div>
  );
}
