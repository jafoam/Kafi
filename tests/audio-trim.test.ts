import { describe, expect, it, vi } from "vitest";
import { findSilenceBounds } from "../src/services/audio-trim";
import { createAudioController } from "../src/services/audio-controller";

const SURAHS = [
  { number: 1, name: "Al-Fatiha", arabicName: "الفاتحة", ayahs: 7, page: 1, location: "mecca" as const },
];

describe("findSilenceBounds", () => {
  it("finds the audible span inside padded audio", () => {
    const rate = 1000;
    const samples = new Float32Array(3000); // 3s
    for (let i = 500; i < 2000; i++) samples[i] = Math.sin(i) * 0.5;
    const b = findSilenceBounds(samples, rate)!;
    expect(b.duration).toBe(3);
    expect(b.start).toBeGreaterThan(0.4);
    expect(b.start).toBeLessThan(0.5);
    expect(b.end).toBeGreaterThan(2);
    expect(b.end).toBeLessThan(2.2);
  });

  it("returns null for silence", () => {
    expect(findSilenceBounds(new Float32Array(1000), 1000)).toBeNull();
  });
});

describe("audio-controller with silence bounds", () => {
  it("moves on when the recitation ends, before the file's trailing silence", async () => {
    vi.useFakeTimers();
    const decks: any[] = [];
    const make = () => {
      const d: any = {
        src: "",
        playbackRate: 1,
        paused: true,
        currentTime: 0,
        onended: null,
        ontimeupdate: null,
        play: vi.fn(async function (this: any) { this.paused = false; }),
        pause: vi.fn(function (this: any) { this.paused = true; }),
      };
      decks.push(d);
      return d;
    };
    const ctrl = createAudioController({
      surahs: SURAHS,
      reciterId: "r",
      getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
      createElement: make,
      analyzeSilence: async () => ({ start: 0.3, end: 2, duration: 3 }),
    });
    const states: string[] = [];
    ctrl.subscribe((s) => states.push(s.currentAyah ?? ""));
    await ctrl.playAyah(1, 1);
    await vi.runAllTimersAsync();
    const active = decks.find((d) => d.src === "blob:1:1");
    expect(active.currentTime).toBe(0.3);
    active.currentTime = 1.8;
    active.ontimeupdate();
    await vi.advanceTimersByTimeAsync(250);
    expect(states.at(-1)).toBe("1:2");
    const next = decks.find((d) => d.src === "blob:1:2");
    expect(next.paused).toBe(false);
    expect(active.paused).toBe(true);
    vi.useRealTimers();
  });

  it("starts the next ayah early on files without a silent tail", async () => {
    vi.useFakeTimers();
    const decks: any[] = [];
    const make = () => {
      const d: any = {
        src: "",
        playbackRate: 1,
        paused: true,
        currentTime: 0,
        onended: null,
        ontimeupdate: null,
        play: vi.fn(async function (this: any) { this.paused = false; }),
        pause: vi.fn(function (this: any) { this.paused = true; }),
      };
      decks.push(d);
      return d;
    };
    const ctrl = createAudioController({
      surahs: SURAHS,
      reciterId: "r",
      getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
      createElement: make,
      // Audible up to the last sample: nothing to trim at either end.
      analyzeSilence: async () => ({ start: 0, end: 3, duration: 3 }),
      handoverLeadS: 0.12,
    });
    const states: string[] = [];
    ctrl.subscribe((s) => states.push(s.currentAyah ?? ""));
    await ctrl.playAyah(1, 1);
    await vi.runAllTimersAsync();
    const active = decks.find((d) => d.src === "blob:1:1");
    active.currentTime = 2.8;
    active.ontimeupdate();
    // 3 - 0.12 - 2.8 = 0.08 s left before the handover; `ended` has not fired.
    await vi.advanceTimersByTimeAsync(100);
    expect(states.at(-1)).toBe("1:2");
    expect(decks.find((d) => d.src === "blob:1:2").paused).toBe(false);
    vi.useRealTimers();
  });

  it("waits for ended on files without a silent tail when there is no lead", async () => {
    vi.useFakeTimers();
    const decks: any[] = [];
    const make = () => {
      const d: any = {
        src: "",
        playbackRate: 1,
        paused: true,
        currentTime: 0,
        onended: null,
        ontimeupdate: null,
        play: vi.fn(async function (this: any) { this.paused = false; }),
        pause: vi.fn(function (this: any) { this.paused = true; }),
      };
      decks.push(d);
      return d;
    };
    const ctrl = createAudioController({
      surahs: SURAHS,
      reciterId: "r",
      getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
      createElement: make,
      analyzeSilence: async () => ({ start: 0, end: 3, duration: 3 }),
      handoverLeadS: 0,
    });
    const states: string[] = [];
    ctrl.subscribe((s) => states.push(s.currentAyah ?? ""));
    await ctrl.playAyah(1, 1);
    await vi.runAllTimersAsync();
    const active = decks.find((d) => d.src === "blob:1:1");
    active.currentTime = 2.9;
    active.ontimeupdate();
    await vi.advanceTimersByTimeAsync(500);
    expect(states.at(-1)).toBe("1:1");
    await active.onended();
    await vi.runAllTimersAsync();
    expect(states.at(-1)).toBe("1:2");
    vi.useRealTimers();
  });
});
