import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformAdapter } from "../platform/types";
import {
  PAGE_COUNT,
  countOfflinePages,
  countPlatformV1Pages,
  downloadAllPages,
  downloadPlatformV1Pages,
  hasBundledV1Fonts,
  offlineSupported,
} from "../services/offline-pages";

export type OfflineStatus = "idle" | "running" | "done" | "error";

export interface OfflinePages {
  supported: boolean;
  /** True only when the 604 v1 fonts are genuinely bundled inside the app package. */
  bundled?: boolean;
  status: OfflineStatus;
  done: number;
  total: number;
  /** Starts the download, or cancels it while it is running. */
  toggle: () => void;
}

/**
 * Download-all-pages state for v1 (Madinah 1405) fonts:
 * - Web: stores in the service worker's CacheStorage.
 * - Desktop/Android Tauri: probes whether v1 fonts are actually bundled; lightweight APKs omit
 *   them, so this downloads them into the platform's disk `font` cache just like v4 tajweed fonts.
 */
export function useOfflinePages(platform: PlatformAdapter): OfflinePages {
  const isNative = platform.isDesktop;
  const supported = isNative || offlineSupported();
  const [bundled, setBundled] = useState(false);
  const [status, setStatus] = useState<OfflineStatus>("idle");
  const [done, setDone] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    if (isNative) {
      void (async () => {
        const isBundled = await hasBundledV1Fonts();
        if (cancelled) return;
        if (isBundled) {
          setBundled(true);
          setDone(PAGE_COUNT);
          setStatus("done");
          return;
        }
        setBundled(false);
        const count = await countPlatformV1Pages(platform).catch(() => 0);
        if (cancelled) return;
        setDone(count);
        if (count >= PAGE_COUNT) setStatus("done");
      })();
    } else {
      countOfflinePages()
        .then((count) => {
          if (cancelled) return;
          setDone(count);
          if (count >= PAGE_COUNT) setStatus("done");
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [supported, isNative, platform]);

  useEffect(() => () => abort.current?.abort(), []);

  const toggle = useCallback(() => {
    if (bundled) return;
    if (abort.current) {
      abort.current.abort();
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStatus("running");
    const run = isNative
      ? downloadPlatformV1Pages(platform, {
          signal: controller.signal,
          onProgress: (count) => setDone(count),
        })
      : downloadAllPages({
          signal: controller.signal,
          onProgress: (count) => setDone(count),
        });
    run
      .then((result) => {
        if (controller.signal.aborted) setStatus("idle");
        else setStatus(result.failed > 0 ? "error" : "done");
      })
      .catch(() => setStatus(controller.signal.aborted ? "idle" : "error"))
      .finally(() => {
        abort.current = null;
      });
  }, [bundled, isNative, platform]);

  return { supported, bundled, status, done, total: PAGE_COUNT, toggle };
}
