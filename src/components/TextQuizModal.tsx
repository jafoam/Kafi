import { useCallback, useEffect, useMemo, useState } from "react";
import type { AyahKey, Catalog } from "../data/types";
import type { RandomPool } from "../services/tasmi-logic";
import {
  buildContinueQuestion,
  buildOrderQuestion,
  type TextQuizMode,
  type TextQuizQuestion,
} from "../services/text-quiz";
import { GlassSelect } from "./GlassSelect";

export interface TextQuizModalProps {
  open: boolean;
  catalog: Catalog;
  currentJuz: number;
  ensureWordLookup: () => Promise<(surah: number, ayah: number) => string[]>;
  onClose: () => void;
  onJumpToAyah: (ayah: AyahKey) => void;
}

export function TextQuizModal({
  open,
  catalog,
  currentJuz,
  ensureWordLookup,
  onClose,
  onJumpToAyah,
}: TextQuizModalProps) {
  const [mode, setMode] = useState<TextQuizMode>("continue");
  const [scopeKind, setScopeKind] = useState<"juz" | "surah">("juz");
  const [juzNum, setJuzNum] = useState<number>(Math.max(1, Math.min(30, currentJuz)));
  const [surahNum, setSurahNum] = useState<number>(78);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState<TextQuizQuestion | null>(null);
  const [pickedOption, setPickedOption] = useState<AyahKey | null>(null);
  const [pickedOrder, setPickedOrder] = useState<number[]>([]);
  const [orderChecked, setOrderChecked] = useState<boolean | null>(null);
  const [score, setScore] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const buildPool = useCallback((): RandomPool => {
    if (scopeKind === "juz") {
      return { kind: "juz", fromJuz: juzNum, toJuz: juzNum };
    }
    return { kind: "surah", fromSurah: surahNum, toSurah: surahNum };
  }, [scopeKind, juzNum, surahNum]);

  const loadNextQuestion = useCallback(
    async (excludeKey?: AyahKey | null) => {
      setLoading(true);
      setError(null);
      setPickedOption(null);
      setPickedOrder([]);
      setOrderChecked(null);
      try {
        const lookup = await ensureWordLookup();
        const pool = buildPool();
        const next =
          mode === "continue"
            ? buildContinueQuestion(pool, catalog, lookup, { excludePrompt: excludeKey })
            : buildOrderQuestion(pool, catalog, lookup, { excludeAyah: excludeKey });
        if (!next) {
          setError("Rentang ini belum cukup untuk membuat soal. Coba pilih surah atau juz lain.");
          setQuestion(null);
        } else {
          setQuestion(next);
        }
      } catch {
        setError("Gagal memuat teks ayat untuk kuis.");
      } finally {
        setLoading(false);
      }
    },
    [ensureWordLookup, buildPool, mode, catalog],
  );

  useEffect(() => {
    if (!open) return;
    setJuzNum(Math.max(1, Math.min(30, currentJuz)));
  }, [open, currentJuz]);

  useEffect(() => {
    if (!open) return;
    void loadNextQuestion(null);
  }, [open, mode, scopeKind, juzNum, surahNum, loadNextQuestion]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const juzOptions = useMemo(
    () => catalog.juzs.map((j) => ({ value: String(j.number), label: `Juz ${j.number}` })),
    [catalog.juzs],
  );
  const surahOptions = useMemo(
    () => catalog.surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` })),
    [catalog.surahs],
  );

  if (!open) return null;

  const handlePickContinue = (ayah: AyahKey, correct: boolean) => {
    if (pickedOption !== null) return;
    setPickedOption(ayah);
    setScore((prev) => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
    }));
  };

  const handleToggleChunk = (id: number) => {
    if (orderChecked !== null || question?.kind !== "order") return;
    setPickedOrder((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      if (next.length === question.chunks.length) {
        const isCorrect = next.every((val, idx) => val === idx);
        setOrderChecked(isCorrect);
        setScore((s) => ({
          correct: s.correct + (isCorrect ? 1 : 0),
          total: s.total + 1,
        }));
      }
      return next;
    });
  };

  const currentAyahKey: AyahKey | null = question
    ? question.kind === "continue"
      ? question.promptAyah
      : question.ayah
    : null;
  const answered =
    (question?.kind === "continue" && pickedOption !== null) ||
    (question?.kind === "order" && orderChecked !== null);

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Kuis Teks Hafalan Offline"
      onClick={onClose}
    >
      <div className="tasmi-summary" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">Kuis Teks Hafalan</h2>
            <p className="tasmi-sheet__subtitle">
              Mode senyap 100% offline · Skor {score.correct}/{score.total}
            </p>
          </div>
          <button type="button" className="ayah-popover__close" aria-label="Tutup" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tasmi-sheet__modes" role="tablist" aria-label="Jenis kuis">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "continue"}
            className={`tasmi-sheet__mode-btn ${mode === "continue" ? "tasmi-sheet__mode-btn--active" : ""}`}
            onClick={() => setMode("continue")}
          >
            Sambung Ayat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "order"}
            className={`tasmi-sheet__mode-btn ${mode === "order" ? "tasmi-sheet__mode-btn--active" : ""}`}
            onClick={() => setMode("order")}
          >
            Urutkan Ayat
          </button>
        </div>

        <div className="tasmi-summary__body">
          <div className="quiz__scope-row">
            <GlassSelect
              ariaLabel="Cakupan kuis"
              value={scopeKind}
              options={[
                { value: "juz", label: "Per Juz" },
                { value: "surah", label: "Per Surah" },
              ]}
              onChange={(val) => setScopeKind(val as "juz" | "surah")}
            />
            {scopeKind === "juz" ? (
              <GlassSelect
                ariaLabel="Pilih Juz"
                value={String(juzNum)}
                options={juzOptions}
                onChange={(val) => setJuzNum(Number(val))}
              />
            ) : (
              <GlassSelect
                ariaLabel="Pilih Surah"
                value={String(surahNum)}
                options={surahOptions}
                onChange={(val) => setSurahNum(Number(val))}
              />
            )}
          </div>

          {loading && <div className="tasmi-summary__empty">Menyiapkan soal…</div>}
          {error && <div className="tasmi-sheet__error">{error}</div>}

          {!loading && question?.kind === "continue" && (
            <div className="quiz__card">
              <div className="quiz__prompt-label">
                Lanjutan dari {question.promptSurahName} : {question.promptAyahNum}
              </div>
              <div className="quiz__prompt-arabic" dir="rtl" lang="ar">
                {question.promptText}
              </div>
              <div className="quiz__options">
                {question.options.map((opt) => {
                  let cls = "quiz__option";
                  if (pickedOption !== null) {
                    if (opt.correct) cls += " quiz__option--correct";
                    else if (pickedOption === opt.ayah) cls += " quiz__option--wrong";
                  }
                  return (
                    <button
                      key={opt.ayah}
                      type="button"
                      className={cls}
                      dir="rtl"
                      lang="ar"
                      onClick={() => handlePickContinue(opt.ayah, opt.correct)}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && question?.kind === "order" && (
            <div className="quiz__card">
              <div className="quiz__prompt-label">
                Susun potongan {question.surahName} : {question.ayahNum} sesuai urutan
              </div>

              <div
                className={`quiz__answer-slots ${
                  orderChecked === true
                    ? "quiz__answer-slots--correct"
                    : orderChecked === false
                      ? "quiz__answer-slots--wrong"
                      : ""
                }`}
                dir="rtl"
                lang="ar"
              >
                {pickedOrder.length === 0 ? (
                  <span className="quiz__placeholder" dir="ltr">
                    Ketuk potongan di bawah dari awal sampai akhir ayat…
                  </span>
                ) : (
                  pickedOrder.map((id) => {
                    const chunk = question.chunks.find((c) => c.id === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className="quiz__chunk quiz__chunk--picked"
                        onClick={() => handleToggleChunk(id)}
                      >
                        {chunk?.text}
                      </button>
                    );
                  })
                )}
              </div>

              {orderChecked === false && (
                <div className="quiz__correct-reveal" dir="rtl" lang="ar">
                  {question.chunks.map((c) => c.text).join(" ")}
                </div>
              )}

              <div className="quiz__chunks" dir="rtl" lang="ar">
                {question.shuffled.map((chunk) => {
                  const used = pickedOrder.includes(chunk.id);
                  return (
                    <button
                      key={chunk.id}
                      type="button"
                      disabled={used || orderChecked !== null}
                      className={`quiz__chunk ${used ? "quiz__chunk--used" : ""}`}
                      onClick={() => handleToggleChunk(chunk.id)}
                    >
                      {chunk.text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {answered && currentAyahKey && (
            <div className="quiz__footer">
              <button
                type="button"
                className="tasmi-sheet__history-btn"
                onClick={() => {
                  onJumpToAyah(currentAyahKey);
                  onClose();
                }}
              >
                Buka di Mushaf
              </button>
              <button
                type="button"
                className="tasmi-sheet__start-btn"
                onClick={() => void loadNextQuestion(currentAyahKey)}
              >
                Soal Berikutnya →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
