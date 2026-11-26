export interface TasmiLauncherProps {
  /** False while something else owns the screen (focus mode, an open Tasmi' session, a drawer). */
  visible: boolean;
  /** Show the one-time introduction to Tasmi'. */
  showHint: boolean;
  onStart: () => void;
  onDismissHint: () => void;
}

const MIC_PATH =
  "M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z";

/**
 * Tasmi' (the app's listening feature) made hard to miss: a large floating button on phones, and a
 * one-time card that says what it does.
 */
export function TasmiLauncher({ visible, showHint, onStart, onDismissHint }: TasmiLauncherProps) {
  if (!visible) return null;
  return (
    <>
      {showHint && (
        <div className="tasmi-hint" role="dialog" aria-label="Kenalan dengan Tasmi'">
          <strong className="tasmi-hint__title">Tasmi&apos;: setor hafalan</strong>
          <p className="tasmi-hint__text">
            Bacakan ayat dengan suaramu. Aplikasi menyimak bacaanmu, lalu menandai ayat yang salah atau terlewat.
          </p>
          <div className="tasmi-hint__actions">
            <button
              type="button"
              className="tasmi-hint__primary"
              onClick={() => {
                onDismissHint();
                onStart();
              }}
            >
              Coba Tasmi&apos;
            </button>
            <button type="button" className="tasmi-hint__later" onClick={onDismissHint}>
              Nanti
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="tasmi-fab"
        onClick={() => {
          if (showHint) onDismissHint();
          onStart();
        }}
        aria-label="Mulai Tasmi': simak bacaan hafalan"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={MIC_PATH} />
        </svg>
        <span className="tasmi-fab__text">
          <span className="tasmi-fab__title">Tasmi&apos;</span>
          <span className="tasmi-fab__sub">Simak bacaanmu</span>
        </span>
      </button>
    </>
  );
}
