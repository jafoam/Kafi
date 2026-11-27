import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformAdapter } from "../platform/types";
import {
  deleteReciterSegments,
  downloadAllReciterSegments,
  hasWordSegments,
  readSegmentDownloadStatus,
  type SegmentDownloadStatus,
} from "../services/word-segments";

export interface SegmentDownloads {
  status: SegmentDownloadStatus | null;
  phase: "idle" | "running" | "error";
  done: number;
  total: number;
  failed: number[];
  start: () => void;
  cancel: () => void;
  remove: () => Promise<void>;
  refresh: () => void;
}

interface Options {
  platform: PlatformAdapter;
  reciterId: string;
}

export function useSegmentDownloads({ platform, reciterId }: Options): SegmentDownloads {
  const [status, setStatus] = useState<SegmentDownloadStatus | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "error">("idle");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(114);
  const [failed, setFailed] = useState<number[]>([]);

  const reciterRef = useRef(reciterId);
  reciterRef.current = reciterId;
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const refresh = useCallback(() => {
    const wanted = reciterRef.current;
    void readSegmentDownloadStatus(platform, wanted)
      .then((next) => {
        if (reciterRef.current === wanted) setStatus(next);
      })
      .catch(() => undefined);
  }, [platform]);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setPhase("idle");
    setDone(0);
    setFailed([]);
    refresh();
  }, [reciterId, refresh]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(() => {
    if (runningRef.current || !hasWordSegments(reciterRef.current)) return;
    runningRef.current = true;
    const targetReciter = reciterRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("running");
    setDone(0);
    setTotal(114);
    setFailed([]);

    void (async () => {
      const endBg = await platform
        .beginBackgroundTask?.("Mengunduh highlight per kata")
        .catch(() => undefined);
      try {
        const result = await downloadAllReciterSegments({
          platform,
          reciterId: targetReciter,
          onProgress: (d, t) => {
            if (!controller.signal.aborted && reciterRef.current === targetReciter) {
              setDone(d);
              setTotal(t);
            }
          },
          signal: controller.signal,
        });
        if (!controller.signal.aborted && reciterRef.current === targetReciter) {
          setFailed(result.failed);
          setPhase(result.failed.length > 0 ? "error" : "idle");
        }
      } catch {
        if (!controller.signal.aborted && reciterRef.current === targetReciter) {
          setPhase("error");
        }
      } finally {
        runningRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        refresh();
        await endBg?.().catch(() => undefined);
      }
    })();
  }, [platform, refresh]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setPhase("idle");
    refresh();
  }, [refresh]);

  const remove = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setPhase("idle");
    await deleteReciterSegments(platform, reciterRef.current);
    refresh();
  }, [platform, refresh]);

  return {
    status,
    phase,
    done,
    total,
    failed,
    start,
    cancel,
    remove,
    refresh,
  };
}
