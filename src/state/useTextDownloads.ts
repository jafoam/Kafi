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

export interface TextDownloadState {
  phase: "idle" | "running" | "error";
  kind: TextResourceKind | null;
  resourceId: string | null;
  done: number;
  total: number;
  failed: number[];
}

export interface TextDownloads {
  state: TextDownloadState;
  translations: Map<string, TextResourceStatus> | null;
  tafsirs: Map<string, TextResourceStatus> | null;
  start: (kind: TextResourceKind, resourceId: string) => void;
  cancel: () => void;
  remove: (kind: TextResourceKind, resourceId: string) => Promise<void>;
  refresh: () => void;
}

const IDLE: TextDownloadState = {
  phase: "idle",
  kind: null,
  resourceId: null,
  done: 0,
  total: 0,
  failed: [],
};

interface Options {
  platform: PlatformAdapter;
  api: Pick<QuranApi, "downloadSurahTranslation" | "downloadSurahTafsir">;
  translations: readonly ResourceInfo[];
  tafsirs: readonly TafsirInfo[];
}

export function useTextDownloads({ platform, api, translations, tafsirs }: Options): TextDownloads {
  const [state, setState] = useState<TextDownloadState>(IDLE);
  const [translationStatus, setTranslationStatus] = useState<Map<string, TextResourceStatus> | null>(null);
  const [tafsirStatus, setTafsirStatus] = useState<Map<string, TextResourceStatus> | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

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
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    (kind: TextResourceKind, resourceId: string) => {
      if (runningRef.current) return;
      runningRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ phase: "running", kind, resourceId, done: 0, total: 114, failed: [] });

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
                setState((prev) => ({ ...prev, done, total }));
              }
            },
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            setState({
              phase: failed.length > 0 ? "error" : "idle",
              kind,
              resourceId,
              done: 114,
              total: 114,
              failed,
            });
          }
        } catch {
          if (!controller.signal.aborted) {
            setState((prev) => ({ ...prev, phase: "error" }));
          }
        } finally {
          runningRef.current = false;
          if (abortRef.current === controller) abortRef.current = null;
          refresh();
          await endBg?.().catch(() => undefined);
        }
      })();
    },
    [platform, api, refresh],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(IDLE);
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (kind: TextResourceKind, resourceId: string) => {
      await deleteTextResource(platform, kind, resourceId);
      refresh();
    },
    [platform, refresh],
  );

  return {
    state,
    translations: translationStatus,
    tafsirs: tafsirStatus,
    start,
    cancel,
    remove,
    refresh,
  };
}
