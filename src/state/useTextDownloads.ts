import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResourceInfo, TafsirInfo } from "../data/types";
import type { PlatformAdapter } from "../platform/types";
import type { QuranApi } from "../services/quran-api";
import {
  deleteTextResource,
  downloadAllTextSurahs,
  readTextDownloadStatus,
  type TextResourceKind,
  type TextResourceStatus,
} from "../services/text-downloads";

export interface TextDownloadJob {
  phase: "running" | "error";
  kind: TextResourceKind;
  resourceId: string;
  done: number;
  total: number;
  failed: number[];
}

export interface TextDownloadCompleted {
  kind: TextResourceKind;
  resourceId: string;
  seq: number;
}

export interface TextDownloads {
  /** Active or errored download jobs keyed by `${kind}:${resourceId}`. */
  jobs: Record<string, TextDownloadJob>;
  lastCompleted: TextDownloadCompleted | null;
  translations: Map<string, TextResourceStatus> | null;
  tafsirs: Map<string, TextResourceStatus> | null;
  start: (kind: TextResourceKind, resourceId: string) => void;
  cancel: (kind: TextResourceKind, resourceId: string) => void;
  dismissError: (kind: TextResourceKind, resourceId: string) => void;
  remove: (kind: TextResourceKind, resourceId: string) => Promise<void>;
  refresh: () => void;
}

export function textJobKey(kind: TextResourceKind, resourceId: string): string {
  return `${kind}:${resourceId}`;
}

interface Options {
  platform: PlatformAdapter;
  api: Pick<QuranApi, "downloadSurahTranslation" | "downloadSurahTafsir">;
  translations: readonly ResourceInfo[];
  tafsirs: readonly TafsirInfo[];
}

export function useTextDownloads({ platform, api, translations, tafsirs }: Options): TextDownloads {
  const [jobs, setJobs] = useState<Record<string, TextDownloadJob>>({});
  const [lastCompleted, setLastCompleted] = useState<TextDownloadCompleted | null>(null);
  const [translationStatus, setTranslationStatus] = useState<Map<string, TextResourceStatus> | null>(null);
  const [tafsirStatus, setTafsirStatus] = useState<Map<string, TextResourceStatus> | null>(null);

  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const seqRef = useRef(0);

  const translationIds = useMemo(() => translations.map((t) => String(t.id)), [translations]);
  const tafsirIds = useMemo(() => tafsirs.map((t) => t.id), [tafsirs]);

  const refresh = useCallback(() => {
    void readTextDownloadStatus(platform, "translation", translationIds)
      .then(setTranslationStatus)
      .catch(() => undefined);
    void readTextDownloadStatus(platform, "tafsir", tafsirIds)
      .then(setTafsirStatus)
      .catch(() => undefined);
  }, [platform, translationIds, tafsirIds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const map = controllersRef.current;
    return () => {
      for (const controller of map.values()) controller.abort();
      map.clear();
    };
  }, []);

  const start = useCallback(
    (kind: TextResourceKind, resourceId: string) => {
      const key = textJobKey(kind, resourceId);
      if (controllersRef.current.has(key)) return;
      const controller = new AbortController();
      controllersRef.current.set(key, controller);

      setJobs((prev) => ({
        ...prev,
        [key]: { phase: "running", kind, resourceId, done: 0, total: 114, failed: [] },
      }));

      void (async () => {
        const endBg = await platform
          .beginBackgroundTask?.(kind === "translation" ? "Mengunduh terjemahan" : "Mengunduh tafsir")
          .catch(() => undefined);
        try {
          const { failed } = await downloadAllTextSurahs({
            downloadSurah: (surah, signal) =>
              kind === "translation"
                ? api.downloadSurahTranslation(Number(resourceId), surah, signal)
                : api.downloadSurahTafsir(resourceId, surah, signal),
            onProgress: (done, total) => {
              if (!controller.signal.aborted) {
                setJobs((prev) => {
                  const cur = prev[key];
                  if (!cur || cur.phase !== "running") return prev;
                  return { ...prev, [key]: { ...cur, done, total } };
                });
              }
            },
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            if (failed.length > 0) {
              setJobs((prev) => ({
                ...prev,
                [key]: { phase: "error", kind, resourceId, done: 114, total: 114, failed },
              }));
            } else {
              setJobs((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
              seqRef.current += 1;
              setLastCompleted({ kind, resourceId, seq: seqRef.current });
            }
          }
        } catch {
          if (!controller.signal.aborted) {
            setJobs((prev) => {
              const cur = prev[key];
              return {
                ...prev,
                [key]: {
                  phase: "error",
                  kind,
                  resourceId,
                  done: cur?.done ?? 0,
                  total: cur?.total ?? 114,
                  failed: cur?.failed ?? [],
                },
              };
            });
          }
        } finally {
          if (controllersRef.current.get(key) === controller) {
            controllersRef.current.delete(key);
          }
          refresh();
          await endBg?.().catch(() => undefined);
        }
      })();
    },
    [platform, api, refresh],
  );

  const cancel = useCallback(
    (kind: TextResourceKind, resourceId: string) => {
      const key = textJobKey(kind, resourceId);
      const controller = controllersRef.current.get(key);
      controller?.abort();
      controllersRef.current.delete(key);
      setJobs((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      refresh();
    },
    [refresh],
  );

  const dismissError = useCallback((kind: TextResourceKind, resourceId: string) => {
    const key = textJobKey(kind, resourceId);
    setJobs((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const remove = useCallback(
    async (kind: TextResourceKind, resourceId: string) => {
      const key = textJobKey(kind, resourceId);
      const controller = controllersRef.current.get(key);
      if (controller) {
        controller.abort();
        controllersRef.current.delete(key);
      }
      setJobs((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await deleteTextResource(platform, kind, resourceId);
      refresh();
    },
    [platform, refresh],
  );

  return {
    jobs,
    lastCompleted,
    translations: translationStatus,
    tafsirs: tafsirStatus,
    start,
    cancel,
    dismissError,
    remove,
    refresh,
  };
}
