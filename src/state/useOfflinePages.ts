import { useCallback, useEffect, useRef, useState } from "react";
import {
  PAGE_COUNT,
  countOfflinePages,
  downloadAllPages,
  offlineSupported,
} from "../services/offline-pages";

export type OfflineStatus = "idle" | "running" | "done" | "error";

export interface OfflinePages {
  supported: boolean;
  status: OfflineStatus;
  done: number;
  total: number;
  /** Starts the download, or cancels it while it is running. */
  toggle: () => void;
}

/** Download-all-pages state for the web build; `enabled` is false on the desktop app, which bundles them. */
export function useOfflinePages(enabled: boolean): OfflinePages {
  const supported = enabled && offlineSupported();
  const [status, setStatus] = useState<OfflineStatus>("idle");
  const [done, setDone] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    countOfflinePages()
      .then((count) => {
        if (cancelled) return;
        setDone(count);
        if (count >= PAGE_COUNT) setStatus("done");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [supported]);

  useEffect(() => () => abort.current?.abort(), []);

  const toggle = useCallback(() => {
    if (abort.current) {
      abort.current.abort();
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStatus("running");
    downloadAllPages({
      signal: controller.signal,
      onProgress: (count) => setDone(count),
    })
      .then((result) => {
        if (controller.signal.aborted) setStatus("idle");
        else setStatus(result.failed > 0 ? "error" : "done");
      })
      .catch(() => setStatus(controller.signal.aborted ? "idle" : "error"))
      .finally(() => {
        abort.current = null;
      });
  }, []);

  return { supported, status, done, total: PAGE_COUNT, toggle };
}
