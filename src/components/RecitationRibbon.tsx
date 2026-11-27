import { useEffect, useState } from "react";
import type { AyahKey, SurahInfo } from "../data/types";
import type { GlyphPageLoader } from "../services/glyph-pages";
import type { TasmiLiveState } from "../services/tasmi-logic";

export interface RandomPromptInfo {
  ayah: AyahKey;
  playing: boolean;
  reciterName?: string;
}

export interface ErrorDrillInfo {
  ayah: AyahKey;
  index: number;
  total: number;
  phase: "listen" | "recite";
  loop: number;
  totalLoops: number;
}

export interface RecitationRibbonProps {
  state: TasmiLiveState;
  surahs: SurahInfo[];
  blurActive: boolean;
  isPeeking: boolean;
  /** Non-null while the Tasmi' engine or microphone is still initializing. */
  startingStatus?: string | null;
  getAyahWords: (surah: number, ayah: number) => string[];
  glyphLoader?: GlyphPageLoader;
  ayahToPage?: Record<AyahKey, number>;
  randomPrompt?: RandomPromptInfo | null;
  errorDrill?: ErrorDrillInfo | null;
  onReplayPrompt?: () => void;
  onNextRandom?: () => void;
  onDrillSkipListen?: () => void;
  onDrillRepeat?: () => void;
  onDrillNext?: () => void;
  onStop: () => void;
}

interface QcfGlyph {
  code: string;
  fontFamily: string;
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
  glyphLoader,
  ayahToPage,
  randomPrompt,
  errorDrill,
  onReplayPrompt,
  onNextRandom,
  onDrillSkipListen,
  onDrillRepeat,
  onDrillNext,
  onStop,
}: RecitationRibbonProps) {
  const [manualExpand, setManualExpand] = useState(false);
  const [qcfWords, setQcfWords] = useState<{ ayah: AyahKey; glyphs: QcfGlyph[] } | null>(null);

  const activeWord = state.activeWord;
  const activeAyahKey: AyahKey | null = activeWord ? `${activeWord.surah}:${activeWord.ayah}` : null;
  const cueAyah = errorDrill?.ayah ?? randomPrompt?.ayah ?? null;
  const promptParts = cueAyah ? cueAyah.split(":").map(Number) : null;
  const surahNum = activeWord?.surah ?? promptParts?.[0] ?? state.passage?.surah ?? null;
  const surahName =
    surahNum !== null ? surahs.find((s) => s.number === surahNum)?.name ?? `Surah ${surahNum}` : "";

  const ayahWords =
    activeWord !== null ? getAyahWords(activeWord.surah, activeWord.ayah) : [];

  useEffect(() => {
    if (!activeAyahKey || !glyphLoader || !ayahToPage || ayahWords.length === 0) return;
    const page = ayahToPage[activeAyahKey];
    if (!page) return;
    let live = true;

    const collectFromPage = async (p: number): Promise<QcfGlyph[]> => {
      const data = await glyphLoader.load(p);
      return data.lines
        .flatMap((line) => line.words)
        .filter((w) => w.ayah === activeAyahKey)
        .map((w) => ({ code: w.code, fontFamily: data.fontFamily }));
    };

    void (async () => {
      try {
        const glyphs = await collectFromPage(page);
        if (glyphs.length - 1 < ayahWords.length && page < 604) {
          const nextGlyphs = await collectFromPage(page + 1).catch(() => [] as QcfGlyph[]);
          glyphs.push(...nextGlyphs);
        }
        if (!live) return;
        // Strip the trailing ayah-end ornament glyph when word counts match 1:1 with ref-v2.
        if (glyphs.length - 1 === ayahWords.length) {
          setQcfWords({ ayah: activeAyahKey, glyphs: glyphs.slice(0, -1) });
        } else {
          setQcfWords(null);
        }
      } catch {
        if (live) setQcfWords(null);
      }
    })();

    return () => {
      live = false;
    };
  }, [activeAyahKey, glyphLoader, ayahToPage, ayahWords.length]);

  const activeQcf = qcfWords && qcfWords.ayah === activeAyahKey ? qcfWords.glyphs : null;

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
      {showWords && activeWord && (
        <div className="recitation-ribbon__words" dir="rtl" lang="ar">
          {ayahWords.map((word, idx) => {
            const wordNum = idx + 1;
            const isCurrent = wordNum === activeWord.word;
            const isPassed = wordNum < activeWord.word;
            const isMistake = mistakeWordsInAyah.has(wordNum);

            const qcf = activeQcf?.[idx];
            const classes = [
              "recitation-ribbon__word",
              qcf ? "recitation-ribbon__word--qcf" : "",
              isCurrent ? "recitation-ribbon__word--current" : "",
              isPassed ? "recitation-ribbon__word--passed" : "",
              isMistake ? "recitation-ribbon__word--mistake" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <span
                key={`${activeWord.surah}:${activeWord.ayah}:${wordNum}`}
                className={classes}
                style={qcf ? { fontFamily: `"${qcf.fontFamily}"` } : undefined}
              >
                {qcf ? qcf.code : word}
              </span>
            );
          })}
        </div>
      )}
      <div className="recitation-ribbon" role="status" aria-live="polite">
        <div className="recitation-ribbon__bar">
          <div className="recitation-ribbon__status">
            <span
              className={`recitation-ribbon__dot recitation-ribbon__dot--${
                startingStatus || randomPrompt?.playing || errorDrill?.phase === "listen"
                  ? "acquiring"
                  : state.trackerState
              }`}
              aria-hidden="true"
            />
            <span className="recitation-ribbon__state-text">
              {startingStatus
                ? startingStatus
                : errorDrill
                  ? errorDrill.phase === "listen"
                    ? `Latih Kesalahan (${errorDrill.index + 1}/${errorDrill.total}) · Dengarkan ${errorDrill.loop}/${errorDrill.totalLoops}…`
                    : `Latih Kesalahan (${errorDrill.index + 1}/${errorDrill.total}) · ${TRACKER_LABELS[state.trackerState]}`
                : randomPrompt
                  ? randomPrompt.playing
                    ? "Uji Acak · Membacakan pemicu…"
                    : `Uji Acak · ${TRACKER_LABELS[state.trackerState]}`
                  : `${state.mode === "memorization" ? "Tasmi'" : "Baca Bebas"} · ${TRACKER_LABELS[state.trackerState]}`}
            </span>
            {activeWord ? (
              <span className="recitation-ribbon__loc">
                {surahName} : {activeWord.ayah}
              </span>
            ) : promptParts ? (
              <span className="recitation-ribbon__loc">
                {surahName} : {promptParts[1]}
              </span>
            ) : null}
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
            {errorDrill && errorDrill.phase === "listen" && onDrillSkipListen && (
              <button
                type="button"
                className="recitation-ribbon__toggle-btn"
                onClick={onDrillSkipListen}
              >
                Mulai Tasmi&apos;
              </button>
            )}
            {errorDrill && errorDrill.phase === "recite" && onDrillRepeat && (
              <button
                type="button"
                className="recitation-ribbon__toggle-btn"
                onClick={onDrillRepeat}
              >
                Ulangi
              </button>
            )}
            {errorDrill && errorDrill.phase === "recite" && onDrillNext && (
              <button
                type="button"
                className="recitation-ribbon__toggle-btn"
                onClick={onDrillNext}
              >
                {errorDrill.index + 1 < errorDrill.total ? "Ayat berikut" : "Selesai drill"}
              </button>
            )}
            {onReplayPrompt && (
              <button
                type="button"
                className="recitation-ribbon__toggle-btn"
                onClick={onReplayPrompt}
              >
                Putar lagi
              </button>
            )}
            {onNextRandom && (
              <button
                type="button"
                className="recitation-ribbon__toggle-btn"
                onClick={onNextRandom}
              >
                Acak lagi
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
      </div>
    </div>
  );
}
