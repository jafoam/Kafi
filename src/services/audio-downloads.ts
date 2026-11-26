import type { SurahInfo } from "../data/types";
import { browserNetworkKind } from "../platform/network";
import type { NetworkKind, PlatformAdapter } from "../platform/types";
import { audioCacheKey, type QuranApi } from "./quran-api";

/** The platform cache bucket that holds recitation audio, one entry per ayah. */
export const AUDIO_BUCKET = "audio";

/** Cache keys end in the surah and ayah as three digits each. */
const KEY_TAIL = /^\d{6}$/;

export interface SurahAudioStatus {
  surah: number;
  cached: number;
  total: number;
  bytes: number;
}

export interface AudioStatus {
  bySurah: Map<number, SurahAudioStatus>;
  cachedAyahs: number;
  totalAyahs: number;
  bytes: number;
}

/** "12,4 MB" style size, with the decimal comma used in Indonesian. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit <= 1 ? String(Math.round(value)) : value.toFixed(1).replace(".", ",");
  return `${text} ${units[unit]}`;
}

export function isSurahComplete(status: SurahAudioStatus | undefined): boolean {
  return !!status && status.total > 0 && status.cached >= status.total;
}

/** Which ayahs of one reciter are stored, read from the platform's cache listing. */
export async function readAudioStatus(
  platform: Pick<PlatformAdapter, "cacheList">,
  reciterFolder: string,
  surahs: readonly SurahInfo[],
): Promise<AudioStatus> {
  const prefix = audioCacheKey(reciterFolder, 1, 1).slice(0, -6);
  const bySurah = new Map<number, SurahAudioStatus>(
    surahs.map((s) => [s.number, { surah: s.number, cached: 0, total: s.ayahs, bytes: 0 }]),
  );

  for (const { key, size } of await platform.cacheList(AUDIO_BUCKET)) {
    if (!key.startsWith(prefix)) continue;
    const tail = key.slice(prefix.length);
    if (!KEY_TAIL.test(tail)) continue;
    const entry = bySurah.get(Number(tail.slice(0, 3)));
    const ayah = Number(tail.slice(3));
    if (!entry || ayah < 1 || ayah > entry.total) continue;
    entry.cached += 1;
    entry.bytes += size;
  }

  let cachedAyahs = 0;
  let totalAyahs = 0;
  let bytes = 0;
  for (const entry of bySurah.values()) {
    cachedAyahs += entry.cached;
    totalAyahs += entry.total;
    bytes += entry.bytes;
  }
  return { bySurah, cachedAyahs, totalAyahs, bytes };
}

/** Removes every stored ayah of a surah for one reciter. */
export async function deleteSurahAudio(
  platform: Pick<PlatformAdapter, "cacheDelete">,
  reciterFolder: string,
  surah: SurahInfo,
): Promise<void> {
  for (let ayah = 1; ayah <= surah.ayahs; ayah++) {
    await platform.cacheDelete(AUDIO_BUCKET, audioCacheKey(reciterFolder, surah.number, ayah));
  }
}

export type DownloadPhase = "idle" | "running" | "waiting-wifi" | "error";

export interface DownloadState {
  phase: DownloadPhase;
  reciterId: string | null;
  /** The surah being downloaded, with its progress in ayahs. */
  current: number | null;
  done: number;
  total: number;
  /** Surahs still to come, not counting the current one. */
  queue: number[];
  finished: number[];
  failed: number[];
}

export interface DownloadRequest {
  reciterId: string;
  /** The reciter's folder on the audio server, which also names its cache keys. */
  folder: string;
  surahs: number[];
}

export interface AudioDownloadManager {
  getState(): DownloadState;
  subscribe(listener: (state: DownloadState) => void): () => void;
  /** Queues surahs; adds to the queue when a download is already running for the same reciter. */
  start(request: DownloadRequest): void;
  /** Continues a download that is waiting for Wi-Fi, on mobile data this time. */
  resume(): void;
  cancel(): void;
}

export interface AudioDownloadDeps {
  platform: Pick<PlatformAdapter, "getNetworkKind" | "beginBackgroundTask">;
  api: Pick<QuranApi, "downloadSurahAudio">;
  surahs: readonly SurahInfo[];
  /** Read when each surah starts, so changing the setting applies to a running queue. */
  wifiOnly: () => boolean;
  /** Called after each surah finishes or stops, so the screen can re-read what is stored. */
  onProgress?: () => void;
}

const IDLE: DownloadState = {
  phase: "idle",
  reciterId: null,
  current: null,
  done: 0,
  total: 0,
  queue: [],
  finished: [],
  failed: [],
};

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Downloads recitation audio surah by surah. Every ayah is stored as it arrives and finished ayahs are
 * skipped, so a cancelled or interrupted download picks up where it stopped.
 */
export function createAudioDownloadManager(deps: AudioDownloadDeps): AudioDownloadManager {
  const listeners = new Set<(state: DownloadState) => void>();
  const surahByNumber = new Map(deps.surahs.map((s) => [s.number, s]));
  let state: DownloadState = IDLE;
  let folder = "";
  let running = false;
  let allowCellular = false;
  let abort: AbortController | null = null;

  function set(next: Partial<DownloadState>): void {
    state = { ...state, ...next };
    for (const listener of listeners) listener(state);
  }

  async function networkKind(): Promise<NetworkKind> {
    try {
      return deps.platform.getNetworkKind ? await deps.platform.getNetworkKind() : browserNetworkKind();
    } catch {
      return "unknown";
    }
  }

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    const controller = new AbortController();
    abort = controller;
    const endBackgroundTask = await deps.platform
      .beginBackgroundTask?.("Mengunduh audio murottal")
      .catch(() => undefined);

    try {
      while (state.queue.length > 0 && !controller.signal.aborted) {
        if (!allowCellular && deps.wifiOnly() && (await networkKind()) === "cellular") {
          set({ phase: "waiting-wifi", current: null });
          return;
        }
        const [surahNumber, ...rest] = state.queue;
        const surah = surahByNumber.get(surahNumber);
        if (!surah) {
          set({ queue: rest, failed: [...state.failed, surahNumber] });
          continue;
        }
        set({ phase: "running", current: surahNumber, done: 0, total: surah.ayahs, queue: rest });
        try {
          await deps.api.downloadSurahAudio(
            folder,
            surahNumber,
            surah.ayahs,
            (done, total) => {
              if (!controller.signal.aborted) set({ done, total });
            },
            controller.signal,
          );
          set({ finished: [...state.finished, surahNumber] });
        } catch (error) {
          if (isAbort(error) || controller.signal.aborted) return;
          set({ failed: [...state.failed, surahNumber] });
        }
        deps.onProgress?.();
      }
      if (!controller.signal.aborted) {
        set({ phase: state.failed.length > 0 ? "error" : "idle", current: null });
      }
    } finally {
      running = false;
      if (abort === controller) abort = null;
      deps.onProgress?.();
      await endBackgroundTask?.().catch(() => undefined);
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    start(request) {
      const busy = state.phase === "running" || state.phase === "waiting-wifi";
      if (busy && state.reciterId !== request.reciterId) return;
      const taken = new Set([...state.queue, ...(state.current === null ? [] : [state.current])]);
      const added = request.surahs.filter((s) => !taken.has(s));
      if (added.length === 0 && busy) return;
      folder = request.folder;
      allowCellular = false;
      set({
        reciterId: request.reciterId,
        phase: busy ? state.phase : "running",
        queue: [...state.queue, ...added],
        ...(busy ? {} : { finished: [], failed: [], current: null, done: 0, total: 0 }),
      });
      void run();
    },
    resume() {
      if (state.phase !== "waiting-wifi") return;
      allowCellular = true;
      void run();
    },
    cancel() {
      abort?.abort();
      if (state.phase === "running" || state.phase === "waiting-wifi") {
        set({ phase: "idle", current: null, queue: [] });
      }
      deps.onProgress?.();
    },
  };
}
