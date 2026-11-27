import { useEffect } from "react";

interface AndroidBridge {
  setKeepAwake?: (on: boolean) => void;
}

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the screen on while `active` (murottal playing, talaqqi, a Tasmi' session), so the phone
 * does not dim and lock while the user is listening or reciting without touching it.
 * The Android app gets a native bridge; browsers and the installed web app use the Screen Wake Lock
 * API, which the browser drops whenever the page is hidden, so it is asked for again on return.
 */
export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const android = (window as unknown as { KafiAndroid?: AndroidBridge }).KafiAndroid;
    if (android?.setKeepAwake) {
      android.setKeepAwake(true);
      return () => android.setKeepAwake?.(false);
    }

    const wakeLock = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let live = true;

    const acquire = () => {
      if (!live || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      wakeLock.request("screen").then(
        (lock) => {
          if (live) sentinel = lock;
          else void lock.release().catch(() => undefined);
        },
        () => undefined,
      );
    };

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", acquire);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
