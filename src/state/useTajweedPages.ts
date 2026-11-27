import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformAdapter } from "../platform/types";
import { TAJWEED_PAGE_COUNT, countTajweedPages, downloadTajweedPages } from "../services/tajweed-download";
import type { OfflinePages } from "./useOfflinePages";

/** Download-all state for the colored tajweed pages; works on every platform (the fonts are never bundled). */
export function useTajweedPages(platform: PlatformAdapter): OfflinePages {
  const [status, setStatus] = useState<OfflinePages["status"]>("idle");
  const [done, setDone] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    countTajweedPages(platform)
      .then((count) => {
        if (cancelled) return;
        setDone(count);
        if (count >= TAJWEED_PAGE_COUNT) setStatus("done");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [platform]);

  useEffect(() => () => abort.current?.abort(), []);

  const toggle = useCallback(() => {
    if (abort.current) {
      abort.current.abort();
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStatus("running");
    downloadTajweedPages(platform, {
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
  }, [platform]);

  return { supported: true, status, done, total: TAJWEED_PAGE_COUNT, toggle };
}
