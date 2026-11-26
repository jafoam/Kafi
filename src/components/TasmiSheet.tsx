import { useEffect, useMemo, useState } from "react";
import type { LoadProgress } from "@tilawa/core";
import type { AyahKey, HifzBlurLevel, PageEntry, SurahInfo } from "../data/types";
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
  loadingProgress: LoadProgress | null;
  isStarting: boolean;
  error: string | null;
  hifzBlurLevel?: HifzBlurLevel;
  onChangeHifzBlurLevel?: (level: HifzBlurLevel) => void;
  onClose: () => void;
  onCancelLoad: () => void;
  onStartFree: () => void;
  onStartMemorization: (passage: DeclaredPassage, enableBlur: boolean) => void;
  onStartRandom?: (pool: RandomPool, enableBlur: boolean) => void;
  onOpenHistory: () => void;
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
}: TasmiSheetProps) {
  const candidates = useMemo(
    () => buildPageTasmiCandidates(visiblePages, surahs, glyphAyahs),
    [visiblePages, surahs, glyphAyahs],
  );

  const surahByNum = useMemo(() => {
    const map = new Map<number, SurahInfo>();
    for (const s of surahs) map.set(s.number, s);
    return map;
  }, [surahs]);

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
        setSelectedOptionId(match.id);
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
            <h2 className="tasmi-sheet__title">Tasmi&apos; &amp; Baca Bebas</h2>
            <p className="tasmi-sheet__subtitle">Audio diproses 100% di perangkat</p>
          </div>
          <div className="tasmi-sheet__header-actions">
            <button
              type="button"
              className="tasmi-sheet__history-btn"
              onClick={onOpenHistory}
              disabled={isBusy}
              aria-label={`Riwayat Tasmi'${historyCount > 0 ? ` (${historyCount})` : ""}`}
            >
              Riwayat{historyCount > 0 ? ` (${historyCount})` : ""}
            </button>
            <button
              type="button"
              className="ayah-popover__close"
              aria-label="Tutup"
              disabled={isBusy}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className="tasmi-sheet__modes" role="tablist" aria-label="Mode Tasmi'">
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
            Tasmi&apos; Hafalan
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
            Uji Acak
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
            Baca Bebas
          </button>
        </div>

        <div className="tasmi-sheet__body">
          {mode === "memorization" ? (
            <>
              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">Pilih cakupan di halaman ini</span>
                <div className="tasmi-sheet__options">
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
                      <span className="tasmi-sheet__option-name">
                        1 Surah Penuh · {activeSurahInfo.name}
                      </span>
                      <span className="tasmi-sheet__option-scope">
                        Ayat 1–{activeSurahInfo.ayahs}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">Atau sesuaikan rentang ayat</span>
                <div className="tasmi-sheet__range-row">
                  <label className="tasmi-sheet__field">
                    <span>Surah</span>
                    <select
                      value={selectedSurah}
                      disabled={isBusy}
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        const info = surahByNum.get(s);
                        setSelectedOptionId("custom");
                        setSelectedSurah(s);
                        setFromAyah(1);
                        setToAyah(info?.ayahs ?? 1);
                      }}
                    >
                      {surahs.map((s) => (
                        <option key={s.number} value={s.number}>
                          {s.number}. {s.name}
                        </option>
                      ))}
                    </select>
                  </label>

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

              <label className="tasmi-sheet__toggle">
                <input
                  type="checkbox"
                  checked={enableBlur}
                  disabled={isBusy}
                  onChange={(e) => setEnableBlur(e.target.checked)}
                />
                <span>
                  <strong>Sembunyikan ayat (Hifz Blur)</strong>
                  <small>Ayat terbuka otomatis saat dibaca; ketuk ayat untuk mengintip.</small>
                </span>
              </label>

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
                  <div className="tasmi-sheet__range-row">
                    <label className="tasmi-sheet__field">
                      <span>Dari Juz</span>
                      <select
                        value={randomFromJuz}
                        disabled={isBusy}
                        onChange={(e) => {
                          const j = Number(e.target.value);
                          setRandomFromJuz(j);
                          if (j > randomToJuz) setRandomToJuz(j);
                        }}
                      >
                        {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                          <option key={j} value={j}>
                            Juz {j}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="tasmi-sheet__field">
                      <span>Sampai Juz</span>
                      <select
                        value={randomToJuz}
                        disabled={isBusy}
                        onChange={(e) => {
                          const j = Number(e.target.value);
                          setRandomToJuz(j);
                          if (j < randomFromJuz) setRandomFromJuz(j);
                        }}
                      >
                        {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                          <option key={j} value={j}>
                            Juz {j}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="tasmi-sheet__range-row">
                      <label className="tasmi-sheet__field">
                        <span>Dari Surah</span>
                        <select
                          value={randomFromSurah}
                          disabled={isBusy}
                          onChange={(e) => {
                            const s = Number(e.target.value);
                            setRandomFromSurah(s);
                            if (s > randomToSurah) setRandomToSurah(s);
                            const info = surahByNum.get(s);
                            setRandomFromAyah(1);
                            setRandomToAyah(info?.ayahs ?? 1);
                          }}
                        >
                          {surahs.map((s) => (
                            <option key={s.number} value={s.number}>
                              {s.number}. {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="tasmi-sheet__field">
                        <span>Sampai Surah</span>
                        <select
                          value={randomToSurah}
                          disabled={isBusy}
                          onChange={(e) => {
                            const s = Number(e.target.value);
                            setRandomToSurah(s);
                            if (s < randomFromSurah) setRandomFromSurah(s);
                            const info = surahByNum.get(s);
                            setRandomFromAyah(1);
                            setRandomToAyah(info?.ayahs ?? 1);
                          }}
                        >
                          {surahs.map((s) => (
                            <option key={s.number} value={s.number}>
                              {s.number}. {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {randomFromSurah === randomToSurah && (
                      <div className="tasmi-sheet__range-row">
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

              <label className="tasmi-sheet__toggle">
                <input
                  type="checkbox"
                  checked={enableBlur}
                  disabled={isBusy}
                  onChange={(e) => setEnableBlur(e.target.checked)}
                />
                <span>
                  <strong>Sembunyikan ayat lanjutan (Hifz Blur)</strong>
                  <small>Ayat setelah pemicu disamarkan dan terbuka saat dibaca.</small>
                </span>
              </label>

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
