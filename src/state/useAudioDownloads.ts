import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SurahInfo } from "../data/types";
import type { PlatformAdapter, StorageInfo } from "../platform/types";
import {
  createAudioDownloadManager,
  deleteSurahAudio,
  readAudioStatus,
  type AudioStatus,
  type DownloadState,
} from "../services/audio-downloads";
import type { QuranApi } from "../services/quran-api";

const WIFI_ONLY_KEY = "kafi:audio:wifi-only";

export interface AudioDownloads {
  state: DownloadState;
  /** What is stored for the current reciter; null until first read. */
  status: AudioStatus | null;
  storage: StorageInfo | null;
  wifiOnly: boolean;
  setWifiOnly: (value: boolean) => void;
  start: (surahs: number[]) => void;
  cancel: () => void;
  resume: () => void;
  removeSurahs: (surahs: number[]) => Promise<void>;
  refresh: () => void;
}

interface Options {
  platform: PlatformAdapter;
  api: Pick<QuranApi, "downloadSurahAudio">;
  surahs: readonly SurahInfo[];
  reciterId: string;
  /** The reciter's folder on the audio server, which names the cached files. */
  folder: string;
}

/** Download state for the recitation audio of the selected reciter, shared by the dock and the download screen. */
export function useAudioDownloads({ platform, api, surahs, reciterId, folder }: Options): AudioDownloads {
  const [state, setState] = useState<DownloadState>({
    phase: "idle",
    reciterId: null,
    current: null,
    done: 0,
    total: 0,
    queue: [],
    finished: [],
    failed: [],
  });
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [wifiOnly, setWifiOnlyState] = useState(true);

  const wifiRef = useRef(true);
  const folderRef = useRef(folder);
  folderRef.current = folder;
  const refreshRef = useRef<() => void>(() => undefined);

  const refresh = useCallback(() => {
    const wanted = folderRef.current;
    void readAudioStatus(platform, wanted, surahs)
      .then((next) => {
        if (folderRef.current === wanted) setStatus(next);
      })
      .catch(() => undefined);
    void platform.getStorageInfo?.().then(setStorage).catch(() => undefined);
  }, [platform, surahs]);
  refreshRef.current = refresh;

  const manager = useMemo(
    () =>
      createAudioDownloadManager({
        platform,
        api,
        surahs,
        wifiOnly: () => wifiRef.current,
        onProgress: () => refreshRef.current(),
      }),
    [platform, api, surahs],
  );

  useEffect(() => {
    const unsubscribe = manager.subscribe(setState);
    return () => {
      unsubscribe();
      manager.cancel();
    };
  }, [manager]);

  useEffect(() => {
    refresh();
  }, [refresh, folder]);

  useEffect(() => {
    let cancelled = false;
    void platform
      .kvGet(WIFI_ONLY_KEY)
      .then((stored) => {
        if (cancelled || stored === null) return;
        wifiRef.current = stored !== "0";
        setWifiOnlyState(wifiRef.current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const setWifiOnly = useCallback(
    (value: boolean) => {
      wifiRef.current = value;
      setWifiOnlyState(value);
      void platform.kvSet(WIFI_ONLY_KEY, value ? "1" : "0").catch(() => undefined);
    },
    [platform],
  );

  const start = useCallback(
    (numbers: number[]) => manager.start({ reciterId, folder, surahs: numbers }),
    [manager, reciterId, folder],
  );

  const removeSurahs = useCallback(
    async (numbers: number[]) => {
      for (const number of numbers) {
        const surah = surahs.find((s) => s.number === number);
        if (surah) await deleteSurahAudio(platform, folder, surah);
      }
      refresh();
    },
    [platform, surahs, folder, refresh],
  );

  return {
    state,
    status,
    storage,
    wifiOnly,
    setWifiOnly,
    start,
    cancel: manager.cancel,
    resume: manager.resume,
    removeSurahs,
    refresh,
  };
}
