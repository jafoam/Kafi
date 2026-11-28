import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";

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
  const { tr } = useI18n();
  const hintRef = useRef<HTMLDivElement>(null);
  const open = visible && showHint;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (hintRef.current?.contains(target)) return;
      onDismissHint();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismissHint();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onDismissHint]);

  return (
    <>
      {open && (
        <div
          ref={hintRef}
          className="tasmi-hint"
          role="dialog"
          aria-label={tr("Kenalan dengan Tasmi'", "Meet Tasmi'")}
        >
          <strong className="tasmi-hint__title">
            {tr("Tasmi': setor hafalan", "Tasmi': memorization check")}
          </strong>
          <p className="tasmi-hint__text">
            {tr(
              "Bacakan ayat dengan suaramu. Aplikasi menyimak bacaanmu, lalu menandai ayat yang salah atau terlewat.",
              "Recite ayahs aloud. The app listens on-device and flags any missed or incorrect words.",
            )}
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
              {tr("Lihat panduan", "View guide")}
            </button>
            <button type="button" className="tasmi-hint__later" onClick={onDismissHint}>
              {tr("Nanti", "Later")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
