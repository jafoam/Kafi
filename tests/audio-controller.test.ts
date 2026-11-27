import { describe, it, expect, vi } from "vitest";
import { nextAyah, prevAyah, createAudioController } from "../src/services/audio-controller";

const MINI_SURAHS = [
  { number: 1, name: "Al-Fatiha", arabicName: "الفاتحة", ayahs: 7, page: 1, location: "mecca" as const },
  { number: 2, name: "Al-Baqara", arabicName: "البقرة", ayahs: 286, page: 2, location: "medina" as const },
  { number: 114, name: "An-Nas", arabicName: "الناس", ayahs: 6, page: 604, location: "mecca" as const },
];

describe("audio-controller", () => {
  it("steps across surah boundaries and stops at 114:6", () => {
    expect(nextAyah(1, 7, MINI_SURAHS)).toEqual({ surah: 2, ayah: 1 });
    expect(nextAyah(114, 6, MINI_SURAHS)).toBeNull();
    expect(prevAyah(2, 1, MINI_SURAHS)).toEqual({ surah: 1, ayah: 7 });
    expect(prevAyah(1, 1, MINI_SURAHS)).toBeNull();
  });

  it("ignores stale audio load when user rapidly switches ayahs", async () => {
    let resolveFirst!: (v: { url: string; fromCache: boolean }) => void;
    const playedUrls: string[] = [];
    const getAudioBlobUrl = vi.fn((_r: string, _s: number, ayah: number) => {
      if (ayah === 1) return new Promise<{ url: string; fromCache: boolean }>((res) => { resolveFirst = res; });
      return Promise.resolve({ url: `blob:ayah-${ayah}`, fromCache: false });
    });
    const fakeAudio = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null as (() => void) | null,
      play: vi.fn(async function (this: any) { this.paused = false; playedUrls.push(this.src); }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };

    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl,
      createElement: () => fakeAudio as any,
    });

    const p1 = ctrl.playAyah(1, 1);
    const p2 = ctrl.playAyah(1, 2);
    await p2;
    resolveFirst({ url: "blob:ayah-1", fromCache: false });
    await p1;

    expect(playedUrls).toEqual(["blob:ayah-2"]);
  });

  it("repeats current ayah according to repeatCount before advancing", async () => {
    const played: string[] = [];
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(async function (this: any) { this.paused = false; played.push(this.src); }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
      createElement: () => fakeAudio,
    });
    ctrl.setRepeat(2);
    await ctrl.playAyah(1, 1);
    await fakeAudio.onended(); // repeat 2 of 2
    await fakeAudio.onended(); // advance to 1:2
    expect(played).toEqual(["blob:1:1", "blob:1:1", "blob:1:2"]);
  });

  it("supports infinite repeat without advancing", async () => {
    const played: string[] = [];
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(async function (this: any) { this.paused = false; played.push(this.src); }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
      createElement: () => fakeAudio,
    });
    ctrl.setRepeat(Infinity);
    await ctrl.playAyah(1, 1);
    await fakeAudio.onended();
    await fakeAudio.onended();
    expect(played).toEqual(["blob:1:1", "blob:1:1", "blob:1:1"]);
  });

  it("prefetches next 2 ayahs and applies playback speed", async () => {
    const requested: string[] = [];
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(async function (this: any) { this.paused = false; }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (_r, s, a) => {
        requested.push(`${s}:${a}`);
        return { url: `blob:${s}:${a}`, fromCache: false };
      },
      createElement: () => fakeAudio,
    });
    ctrl.setSpeed(1.25);
    await ctrl.playAyah(1, 6);
    expect(fakeAudio.playbackRate).toBe(1.25);
    expect(requested).toEqual(["1:6", "1:7", "2:1"]);
  });

  it("uses preloaded standby deck for gapless transition without loading state", async () => {
    const decks: any[] = [];
    const makeDeck = () => {
      const deck: any = {
        src: "",
        preload: "",
        playbackRate: 1,
        paused: true,
        onended: null,
        load: vi.fn(),
        play: vi.fn(async function (this: any) {
          this.paused = false;
        }),
        pause: vi.fn(function (this: any) {
          this.paused = true;
        }),
      };
      decks.push(deck);
      return deck;
    };

    const states: boolean[] = [];
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Abu_Bakr_Ash-Shaatree_128kbps",
      getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
      createElement: makeDeck,
    });
    ctrl.subscribe((s) => {
      if (s.currentAyah === "1:2") states.push(s.isLoading);
    });

    await ctrl.playAyah(1, 1);
    // Allow standby preload microtask to settle
    await Promise.resolve();
    expect(decks[1].src).toBe("blob:1:2");
    expect(decks[1].load).toHaveBeenCalled();

    // Ending deck 0 swaps to preloaded deck 1 without emitting isLoading: true
    await decks[0].onended();
    expect(decks[1].play).toHaveBeenCalledTimes(1);
    expect(states).toEqual([false]);
  });

  it("toggles play/pause and aborts on dispose", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(async function (this: any) { this.paused = false; }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    const states: boolean[] = [];
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (_r, s, a, signal) => {
        capturedSignal = signal;
        return { url: `blob:${s}:${a}`, fromCache: true };
      },
      createElement: () => fakeAudio,
    });
    const unsub = ctrl.subscribe((s) => states.push(s.isPlaying));

    await ctrl.playAyah(1, 1);
    expect(fakeAudio.paused).toBe(false);
    ctrl.togglePlay();
    expect(fakeAudio.paused).toBe(true);
    ctrl.togglePlay();
    expect(fakeAudio.paused).toBe(false);

    ctrl.dispose();
    expect(fakeAudio.paused).toBe(true);
    expect(capturedSignal?.aborted).toBe(true);
    unsub();
    expect(states[states.length - 1]).toBe(false);
  });

  it("re-arms cleanly on subscribe after dispose (React StrictMode remount)", async () => {
    const played: string[] = [];
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(async function (this: any) { this.paused = false; played.push(this.src); }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (r, s, a) => ({ url: `blob:${r}:${s}:${a}`, fromCache: true }),
      createElement: () => fakeAudio,
    });

    const unsub1 = ctrl.subscribe(() => {});
    unsub1();
    ctrl.dispose();

    const states: (string | null)[] = [];
    const unsub2 = ctrl.subscribe((s) => states.push(s.currentAyah));
    await ctrl.playAyah(1, 1);

    expect(played).toEqual(["blob:Alafasy_128kbps:1:1"]);
    expect(states[states.length - 1]).toBe("1:1");
    unsub2();
  });

  it("reloads audio on togglePlay after reciter switch while paused", async () => {
    const played: string[] = [];
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(async function (this: any) { this.paused = false; played.push(this.src); }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (r, s, a) => ({ url: `blob:${r}:${s}:${a}`, fromCache: true }),
      createElement: () => fakeAudio,
    });

    await ctrl.playAyah(1, 1);
    ctrl.pause();
    ctrl.setReciter("Husary_128kbps");
    ctrl.togglePlay();
    await new Promise((r) => setTimeout(r, 0));

    expect(played).toEqual(["blob:Alafasy_128kbps:1:1", "blob:Husary_128kbps:1:1"]);
  });

  it("retries loading on togglePlay after a load failure instead of playing stale src", async () => {
    const played: string[] = [];
    let failSecondOnce = true;
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(async function (this: any) { this.paused = false; played.push(this.src); }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (_r, s, a) => {
        if (a === 2 && failSecondOnce) {
          failSecondOnce = false;
          throw new Error("Network offline");
        }
        return { url: `blob:${s}:${a}`, fromCache: false };
      },
      createElement: () => fakeAudio,
    });

    await ctrl.playAyah(1, 1);
    await ctrl.playAyah(1, 2); // fails, leaves stale audio.src = blob:1:1
    ctrl.togglePlay(); // must retry 1:2, not replay 1:1
    await new Promise((r) => setTimeout(r, 0));

    expect(played).toEqual(["blob:1:1", "blob:1:2"]);
  });

  it("ignores stale play() rejection in togglePlay after switching ayahs", async () => {
    let rejectResume!: (err: Error) => void;
    let resumeAttempt = false;
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(function (this: any) {
        this.paused = false;
        if (resumeAttempt) {
          resumeAttempt = false;
          return new Promise<void>((_res, rej) => { rejectResume = rej; });
        }
        return Promise.resolve();
      }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    let latestState: any = null;
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
      createElement: () => fakeAudio,
    });
    ctrl.subscribe((s) => { latestState = s; });

    await ctrl.playAyah(1, 1);
    ctrl.pause();
    resumeAttempt = true;
    ctrl.togglePlay();
    await ctrl.playAyah(1, 2);
    rejectResume(new Error("Interrupted by new load"));
    await new Promise((r) => setTimeout(r, 0));

    expect(latestState.currentAyah).toBe("1:2");
    expect(latestState.isPlaying).toBe(true);
    expect(latestState.error).toBeNull();
  });
});
