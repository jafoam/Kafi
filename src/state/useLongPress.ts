import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

const HOLD_MS = 450;
const MOVE_TOLERANCE_PX = 10;

/**
 * Touch-and-hold on a page. On touch screens a single tap toggles focus mode, so the ayah menu
 * opens on a hold instead. `onHold` gets the element that was pressed; the click that follows
 * the release is swallowed via `consumeClick`.
 */
export function useLongPress(onHold: (target: HTMLElement) => boolean) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const holdRef = useRef(onHold);
  holdRef.current = onHold;

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  };

  useEffect(() => cancel, []);

  return {
    handlers: {
      onPointerDown(event: ReactPointerEvent) {
        firedRef.current = false;
        cancel();
        if (event.pointerType === "mouse" || !event.isPrimary) return;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        startRef.current = { x: event.clientX, y: event.clientY };
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          if (holdRef.current(target)) {
            firedRef.current = true;
            try {
              navigator.vibrate?.(12);
            } catch {
              // Not supported (iOS): the popover itself is the feedback.
            }
          }
        }, HOLD_MS);
      },
      onPointerMove(event: ReactPointerEvent) {
        const start = startRef.current;
        if (!start) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu(event: ReactMouseEvent) {
        // The system menu (copy, look up) would cover the ayah menu after a hold.
        if (firedRef.current || startRef.current) event.preventDefault();
      },
    },
    /** True once for the click that ends a hold, which must not also act as a tap. */
    consumeClick(): boolean {
      if (!firedRef.current) return false;
      firedRef.current = false;
      return true;
    },
  };
}
