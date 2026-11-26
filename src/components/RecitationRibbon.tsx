import { useState } from "react";
import type { SurahInfo } from "../data/types";
import type { TasmiLiveState } from "../services/tasmi-logic";

export interface RecitationRibbonProps {
  state: TasmiLiveState;
  surahs: SurahInfo[];
  blurActive: boolean;
  isPeeking: boolean;
  /** Non-null while the Tasmi' engine or microphone is still initializing. */
  startingStatus?: string | null;
  getAyahWords: (surah: number, ayah: number) => string[];
  onStop: () => void;
}

const TRACKER_LABELS: Record<TasmiLiveState["trackerState"], string> = {
  acquiring: "Mendengarkan…",
  locked: "Terkunci",
  ambiguous: "Mencari posisi…",
  lost: "Mencari ulang…",
};

export function RecitationRibbon({
  state,
  surahs,
  blurActive,
  isPeeking,
  startingStatus = null,
  getAyahWords,
  onStop,
}: RecitationRibbonProps) {
  const [manualExpand, setManualExpand] = useState(false);

  const activeWord = state.activeWord;
  const surahNum = activeWord?.surah ?? state.passage?.surah ?? null;
  const surahName =
    surahNum !== null ? surahs.find((s) => s.number === surahNum)?.name ?? `Surah ${surahNum}` : "";

  const ayahWords =
    activeWord !== null ? getAyahWords(activeWord.surah, activeWord.ayah) : [];

  const mistakeWordsInAyah = new Set<number>();
  if (activeWord) {
    for (const m of state.confirmedMistakes) {
      if (m.surah === activeWord.surah && m.ayah === activeWord.ayah && m.word) {
        mistakeWordsInAyah.add(m.word);
      }
    }
  }

  const hasMistakeInAyah = mistakeWordsInAyah.size > 0;
  // Auto-collapse word strip while Hifz blur is active unless peeking, a mistake occurred, or manually expanded
  const showWords =
    ayahWords.length > 0 && (!blurActive || isPeeking || hasMistakeInAyah || manualExpand);

  return (
    <div className="recitation-ribbon-zone">
      <div className="recitation-ribbon" role="status" aria-live="polite">
        <div className="recitation-ribbon__bar">
          <div className="recitation-ribbon__status">
            <span
              className={`recitation-ribbon__dot recitation-ribbon__dot--${startingStatus ? "acquiring" : state.trackerState}`}
              aria-hidden="true"
            />
            <span className="recitation-ribbon__state-text">
              {startingStatus
                ? startingStatus
                : `${state.mode === "memorization" ? "Tasmi'" : "Baca Bebas"} · ${TRACKER_LABELS[state.trackerState]}`}
            </span>
            {activeWord && (
              <span className="recitation-ribbon__loc">
                {surahName} : {activeWord.ayah}
              </span>
            )}
            {state.confirmedMistakes.length > 0 && (
              <span className="recitation-ribbon__mistake-pill">
                {state.confirmedMistakes.length} catatan
              </span>
            )}
          </div>

          <div className="recitation-ribbon__actions">
            {blurActive && ayahWords.length > 0 && !isPeeking && !hasMistakeInAyah && (
              <button
                type="button"
                className="recitation-ribbon__toggle-btn"
                onClick={() => setManualExpand((prev) => !prev)}
              >
                {manualExpand ? "Sembunyikan kata" : "Tampilkan kata"}
              </button>
            )}
            <button
              type="button"
              className="recitation-ribbon__stop-btn"
              onClick={onStop}
            >
              {startingStatus ? "Batalkan" : "Selesai"}
            </button>
          </div>
        </div>

        {showWords && activeWord && (
          <div className="recitation-ribbon__words" dir="rtl" lang="ar">
            {ayahWords.map((word, idx) => {
              const wordNum = idx + 1;
              const isCurrent = wordNum === activeWord.word;
              const isPassed = wordNum < activeWord.word;
              const isMistake = mistakeWordsInAyah.has(wordNum);

              const classes = [
                "recitation-ribbon__word",
                isCurrent ? "recitation-ribbon__word--current" : "",
                isPassed ? "recitation-ribbon__word--passed" : "",
                isMistake ? "recitation-ribbon__word--mistake" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <span key={`${activeWord.surah}:${activeWord.ayah}:${wordNum}`} className={classes}>
                  {word}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
