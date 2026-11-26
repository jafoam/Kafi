import { describe, it, expect, vi } from "vitest";
import {
  AUDIO_BUCKET,
  formatBytes,
  createAudioDownloadManager,
  deleteSurahAudio,
  isSurahComplete,
  readAudioStatus,
  type DownloadState,
} from "../src/services/audio-downloads";
import { audioCacheKey } from "../src/services/quran-api";
import type { SurahInfo } from "../src/data/types";

const SURAHS: SurahInfo[] = [
  { number: 1, name: "Al-Fatiha", arabicName: "الفاتحة", ayahs: 3, page: 1, location: "mecca" },
  { number: 2, name: "Al-Baqara", arabicName: "البقرة", ayahs: 4, page: 2, location: "medina" },
  { number: 3, name: "Al-Imran", arabicName: "آل عمران", ayahs: 2, page: 50, location: "medina" },
];

const FOLDER = "Alafasy_128kbps";

function listing(entries: [string, number][]) {
  return { cacheList: async () => entries.map(([key, size]) => ({ key, size })) };
}

describe("readAudioStatus", () => {
  it("counts stored ayahs and bytes per surah for one reciter", async () => {
    const status = await readAudioStatus(
      listing([
        [audioCacheKey(FOLDER, 1, 1), 100],
        [audioCacheKey(FOLDER, 1, 2), 150],
        [audioCacheKey(FOLDER, 1, 3), 50],
        [audioCacheKey(FOLDER, 2, 1), 200],
        [audioCacheKey("Husary_128kbps", 2, 2), 999], // another reciter
        [audioCacheKey(FOLDER, 2, 9), 999], // an ayah the surah does not have
        [`${FOLDER}_junk`, 999],
      ]),
      FOLDER,
      SURAHS,
    );
    expect(status.bySurah.get(1)).toEqual({ surah: 1, cached: 3, total: 3, bytes: 300 });
    expect(status.bySurah.get(2)).toEqual({ surah: 2, cached: 1, total: 4, bytes: 200 });
    expect(status.bySurah.get(3)?.cached).toBe(0);
    expect(status).toMatchObject({ cachedAyahs: 4, totalAyahs: 9, bytes: 500 });
    expect(isSurahComplete(status.bySurah.get(1))).toBe(true);
    expect(isSurahComplete(status.bySurah.get(2))).toBe(false);
    expect(isSurahComplete(undefined)).toBe(false);
  });

  it("does not mix up reciters whose folder names share a start", async () => {
    const status = await readAudioStatus(
      listing([[audioCacheKey("Alafasy_128kbps_extra", 1, 1), 10]]),
      "Alafasy_128kbps",
      SURAHS,
    );
    expect(status.cachedAyahs).toBe(0);
  });
});

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(48 * 1024)).toBe("48 KB");
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12,4 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2,5 GB");
    expect(formatBytes(Number.NaN)).toBe("0 KB");
  });
});

describe("deleteSurahAudio", () => {
  it("removes every ayah of the surah for that reciter", async () => {
    const cacheDelete = vi.fn(async () => undefined);
    await deleteSurahAudio({ cacheDelete }, FOLDER, SURAHS[1]);
    expect(cacheDelete).toHaveBeenCalledTimes(4);
    expect(cacheDelete).toHaveBeenCalledWith(AUDIO_BUCKET, audioCacheKey(FOLDER, 2, 1));
    expect(cacheDelete).toHaveBeenCalledWith(AUDIO_BUCKET, audioCacheKey(FOLDER, 2, 4));
  });
});

type Api = Parameters<typeof createAudioDownloadManager>[0]["api"];

function setup(options: {
  api?: Api;
  network?: "wifi" | "cellular" | "unknown";
  wifiOnly?: boolean;
  background?: { begin: () => Promise<() => Promise<void>> };
} = {}) {
  const downloaded: number[] = [];
  const api: Api =
    options.api ??
    ({
      downloadSurahAudio: async (_folder, surah, count, onProgress) => {
        for (let i = 1; i <= count; i++) onProgress(i, count);
        downloaded.push(surah);
      },
    } as Api);
  const states: DownloadState[] = [];
  const manager = createAudioDownloadManager({
    platform: {
      getNetworkKind: async () => options.network ?? "unknown",
      beginBackgroundTask: options.background ? () => options.background!.begin() : undefined,
    },
    api,
    surahs: SURAHS,
    wifiOnly: () => options.wifiOnly ?? false,
  });
  manager.subscribe((s) => states.push(s));
  return { manager, downloaded, states };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("audio download manager", () => {
  it("downloads the queued surahs in order and reports progress", async () => {
    const { manager, downloaded, states } = setup();
    manager.start({ reciterId: "r", folder: FOLDER, surahs: [2, 1] });
    await settle();
    expect(downloaded).toEqual([2, 1]);
    expect(manager.getState()).toMatchObject({ phase: "idle", finished: [2, 1], failed: [], queue: [] });
    expect(states.some((s) => s.current === 2 && s.done === 4 && s.total === 4)).toBe(true);
  });

  it("keeps going when one surah fails, then reports the error", async () => {
    const api = {
      downloadSurahAudio: async (_f: string, surah: number) => {
        if (surah === 2) throw new Error("HTTP 500");
      },
    } as Api;
    const { manager } = setup({ api });
    manager.start({ reciterId: "r", folder: FOLDER, surahs: [1, 2, 3] });
    await settle();
    expect(manager.getState()).toMatchObject({ phase: "error", finished: [1, 3], failed: [2] });
  });

  it("cancels: aborts the running surah and drops the queue", async () => {
    let release: () => void = () => undefined;
    let seenSignal: AbortSignal | undefined;
    const api = {
      downloadSurahAudio: (_f: string, _s: number, _c: number, _p: unknown, signal?: AbortSignal) => {
        seenSignal = signal;
        return new Promise<void>((resolve, reject) => {
          release = resolve;
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      },
    } as Api;
    const { manager } = setup({ api });
    manager.start({ reciterId: "r", folder: FOLDER, surahs: [1, 2, 3] });
    await settle();
    expect(manager.getState()).toMatchObject({ phase: "running", current: 1, queue: [2, 3] });
    manager.cancel();
    await settle();
    release();
    expect(seenSignal?.aborted).toBe(true);
    expect(manager.getState()).toMatchObject({ phase: "idle", current: null, queue: [] });
  });

  it("waits for Wi-Fi when set to, and continues on mobile data when told to", async () => {
    const { manager, downloaded } = setup({ network: "cellular", wifiOnly: true });
    manager.start({ reciterId: "r", folder: FOLDER, surahs: [1, 2] });
    await settle();
    expect(downloaded).toEqual([]);
    expect(manager.getState()).toMatchObject({ phase: "waiting-wifi", queue: [1, 2] });
    manager.resume();
    await settle();
    expect(downloaded).toEqual([1, 2]);
    expect(manager.getState().phase).toBe("idle");
  });

  it("ignores the Wi-Fi setting when the connection is not mobile data", async () => {
    const { manager, downloaded } = setup({ network: "wifi", wifiOnly: true });
    manager.start({ reciterId: "r", folder: FOLDER, surahs: [3] });
    await settle();
    expect(downloaded).toEqual([3]);
  });

  it("adds to the queue while running, without repeating a surah", async () => {
    let release: () => void = () => undefined;
    const order: number[] = [];
    const api = {
      downloadSurahAudio: (_f: string, surah: number) =>
        new Promise<void>((resolve) => {
          order.push(surah);
          release = resolve;
        }),
    } as Api;
    const { manager } = setup({ api });
    manager.start({ reciterId: "r", folder: FOLDER, surahs: [1] });
    await settle();
    manager.start({ reciterId: "r", folder: FOLDER, surahs: [1, 2] });
    expect(manager.getState().queue).toEqual([2]);
    release();
    await settle();
    release();
    await settle();
    expect(order).toEqual([1, 2]);
  });

  it("ignores a request for another reciter while one is running", async () => {
    let release: () => void = () => undefined;
    const api = {
      downloadSurahAudio: () => new Promise<void>((resolve) => (release = resolve)),
    } as Api;
    const { manager } = setup({ api });
    manager.start({ reciterId: "a", folder: "A", surahs: [1] });
    await settle();
    manager.start({ reciterId: "b", folder: "B", surahs: [2] });
    expect(manager.getState()).toMatchObject({ reciterId: "a", queue: [] });
    release();
    await settle();
  });

  it("holds a background task for the whole download and releases it after", async () => {
    const end = vi.fn(async () => undefined);
    const begin = vi.fn(async () => end);
    const { manager } = setup({ background: { begin } });
    manager.start({ reciterId: "r", folder: FOLDER, surahs: [1, 2] });
    await settle();
    expect(begin).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
