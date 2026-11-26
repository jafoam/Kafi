import { useEffect, useRef } from "react";

/**
 * Lets the system Back gesture/button (Android) or the browser's back button close the topmost open
 * overlay instead of leaving the app. All overlays share one history entry: it is pushed when the first
 * overlay opens, re-pushed while more remain after a Back press, and removed once none is left.
 */
interface Entry {
  close: () => void;
}

const stack: Entry[] = [];
let sentinel = false;
let ignorePops = 0;
let listening = false;

function ensureSentinel(): void {
  if (!sentinel) {
    window.history.pushState({ kafiOverlay: true }, "");
    sentinel = true;
  }
}

function onPop(): void {
  if (ignorePops > 0) {
    ignorePops -= 1;
    return;
  }
  if (!sentinel) return;
  sentinel = false;
  stack.pop()?.close();
  if (stack.length > 0) ensureSentinel();
}

function releaseSentinelIfIdle(): void {
  if (stack.length === 0 && sentinel) {
    sentinel = false;
    ignorePops += 1;
    window.history.back();
  }
}

export function useBackClose(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!listening) {
      window.addEventListener("popstate", onPop);
      listening = true;
    }
    const entry: Entry = { close: () => closeRef.current() };
    stack.push(entry);
    ensureSentinel();
    return () => {
      const index = stack.indexOf(entry);
      if (index === -1) return; // already closed by Back
      stack.splice(index, 1);
      // Wait for the rest of the commit: another overlay may be opening in the same render.
      queueMicrotask(releaseSentinelIfIdle);
    };
  }, [open]);
}

/** Test hook: forget all overlay state. */
export function resetBackCloseForTests(): void {
  stack.length = 0;
  sentinel = false;
  ignorePops = 0;
}
