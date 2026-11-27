export interface TasmiLauncherProps {
  /** False while something else owns the screen (focus mode, an open Tasmi' session, a drawer). */
  visible: boolean;
  /** Show the one-time introduction to Tasmi'. */
  showHint: boolean;
  onDismissHint: () => void;
  onOpenGuide: () => void;
}

/** A one-time card above the dock's Tasmi' button that says what Tasmi' does. */
export function TasmiLauncher({
  visible,
  showHint,
  onDismissHint,
  onOpenGuide,
}: TasmiLauncherProps) {
  return (
    <>
      {visible && showHint && (
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
                onOpenGuide();
              }}
            >
              Lihat panduan
            </button>
            <button type="button" className="tasmi-hint__later" onClick={onDismissHint}>
              Nanti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
