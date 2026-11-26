export interface TasmiLauncherProps {
  /** False while something else owns the screen (focus mode, an open Tasmi' session, a drawer). */
  visible: boolean;
  /** Show the one-time introduction to Tasmi'. */
  showHint: boolean;
  onStart: () => void;
  onDismissHint: () => void;
}

/** One-time introduction card for Tasmi'; the trigger itself now lives inside AudioDock. */
export function TasmiLauncher({ visible, showHint, onStart, onDismissHint }: TasmiLauncherProps) {
  if (!visible || !showHint) return null;
  return (
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
  );
}
