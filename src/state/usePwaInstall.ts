import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPlatform = "ios" | "other";

export interface PwaInstall {
  canShow: boolean;
  canPrompt: boolean;
  platform: InstallPlatform;
  /** Triggers the native install prompt when available, otherwise signals to open the manual guide. */
  prompt: () => Promise<"prompted" | "guide">;
}

export function isStandaloneMode(win: Window | undefined = typeof window !== "undefined" ? window : undefined): boolean {
  if (!win) return false;
  if (typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }
  return Boolean((win.navigator as Navigator & { standalone?: boolean } | undefined)?.standalone);
}

export function detectInstallPlatform(ua: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  return "other";
}

/** PWA install state for web builds; `enabled` is false inside the native Tauri app. */
export function usePwaInstall(enabled: boolean): PwaInstall {
  const [installed, setInstalled] = useState<boolean>(() => isStandaloneMode());
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const platform: InstallPlatform =
    typeof navigator !== "undefined"
      ? detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints)
      : "other";

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const media = typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)") : null;
    const onDisplayChange = (event: MediaQueryListEvent) => {
      if (event.matches) setInstalled(true);
    };
    media?.addEventListener?.("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      media?.removeEventListener?.("change", onDisplayChange);
    };
  }, [enabled]);

  const prompt = useCallback(async (): Promise<"prompted" | "guide"> => {
    if (!deferred) return "guide";
    const ev = deferred;
    setDeferred(null);
    await ev.prompt();
    const choice = await ev.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (choice.outcome === "accepted") setInstalled(true);
    return "prompted";
  }, [deferred]);

  return {
    canShow: enabled && !installed,
    canPrompt: deferred !== null,
    platform,
    prompt,
  };
}
