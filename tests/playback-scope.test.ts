import { describe, it, expect, vi } from "vitest";
import {
  compareAyahKeys,
  createAudioController,
  type AyahRange,
  type PlaybackScope,
} from "../src/services/audio-controller";
import { customRange, juzRange, pageRange } from "../src/services/playback-ranges";
import type { AyahKey, Catalog, MushafMap } from "../src/data/types";

const SURAHS = [
  { number: 1, name: "Al-Fatiha", arabicName: "الفاتحة", ayahs: 7, page: 1, location: "mecca" as const },
  { number: 2, name: "Al-Baqara", arabicName: "البقرة", ayahs: 286, page: 2, location: "medina" as const },
  { number: 114, name: "An-Nas", arabicName: "الناس", ayahs: 6, page: 604, location: "mecca" as const },
];

function setup(
  resolveRange?: (kind: "page" | "juz", ayah: AyahKey) => AyahRange | null,
  surahs = SURAHS,
) {
  const played: string[] = [];
  const audio: any = {
    src: "",
    playbackRate: 1,
    paused: true,
    onended: null,
    play: vi.fn(async function (this: any) {
      this.paused = false;
      played.push(this.src.replace("blob:", ""));
    }),
    pause: vi.fn(function (this: any) {
      this.paused = true;
    }),
  };
  const ctrl = createAudioController({
    surahs,
    reciterId: "r",
    getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
    resolveRange,
    createElement: () => audio,
  });
  let latest: any;
  ctrl.subscribe((s) => (latest = s));
  return { ctrl, audio, played, state: () => latest };
}

/** The controller advances in the background after onended fires; wait for it to settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const scope = (s: Partial<PlaybackScope> & Pick<PlaybackScope, "kind">): PlaybackScope => ({
  loop: false,
  ...s,
});

describe("playback scope", () => {
  it("orders ayah keys in reading order", () => {
    expect(compareAyahKeys("2:5", "10:1")).toBeLessThan(0);
    expect(compareAyahKeys("2:10", "2:9")).toBeGreaterThan(0);
    expect(compareAyahKeys("3:1", "3:1")).toBe(0);
  });

  it("loops one surah forever instead of moving to the next", async () => {
    const { ctrl, audio, played } = setup();
    ctrl.setScope(scope({ kind: "surah", loop: true }));
    await ctrl.playAyah(1, 6);
    audio.onended();
    await flush(); // 1:7
    audio.onended();
    await flush(); // wraps to 1:1, not 2:1
    audio.onended();
    await flush(); // 1:2
    expect(played).toEqual(["1:6", "1:7", "1:1", "1:2"]);
  });

  it("stops at the end of the surah when not looping", async () => {
    const { ctrl, audio, played, state } = setup();
    ctrl.setScope(scope({ kind: "surah", loop: false }));
    await ctrl.playAyah(114, 5);
    audio.onended();
    await flush(); // 114:6
    audio.onended();
    await flush(); // end of surah
    expect(played).toEqual(["114:5", "114:6"]);
    expect(state().isPlaying).toBe(false);
  });

  it("keeps the default scope playing on into the next surah", async () => {
    const { ctrl, audio, played } = setup();
    await ctrl.playAyah(1, 7);
    audio.onended();
    await flush();
    audio.onended(); // the bismillah ends
    await flush();
    expect(played).toEqual(["1:7", "1:1", "2:1"]);
  });

  it("loops a custom range and ignores the surah around it", async () => {
    const { ctrl, audio, played } = setup();
    ctrl.setScope(scope({ kind: "custom", loop: true, from: "2:3", to: "2:4" }));
    await ctrl.playAyah(2, 3);
    audio.onended();
    await flush(); // 2:4
    audio.onended();
    await flush(); // back to 2:3
    expect(played).toEqual(["2:3", "2:4", "2:3"]);
  });

  it("uses the resolved page or juz range", async () => {
    const resolve = vi.fn((kind: "page" | "juz"): AyahRange | null =>
      kind === "page" ? { from: "2:5", to: "2:6" } : { from: "2:10", to: "2:11" },
    );
    const { ctrl, audio, played } = setup(resolve);
    ctrl.setScope(scope({ kind: "page", loop: true }));
    await ctrl.playAyah(2, 6);
    audio.onended();
    await flush();
    expect(played).toEqual(["2:6", "2:5"]);
    expect(resolve).toHaveBeenCalledWith("page", "2:6");

    ctrl.setScope(scope({ kind: "juz", loop: true }));
    await ctrl.playAyah(2, 11);
    audio.onended();
    await flush();
    expect(played.slice(-2)).toEqual(["2:11", "2:10"]);
  });

  it("repeats each ayah before moving on, inside a looping scope", async () => {
    const { ctrl, audio, played } = setup();
    ctrl.setRepeat(2);
    ctrl.setScope(scope({ kind: "custom", loop: true, from: "1:1", to: "1:2" }));
    await ctrl.playAyah(1, 2);
    audio.onended();
    await flush(); // repeat of 1:2
    audio.onended();
    await flush(); // wraps to 1:1
    expect(played).toEqual(["1:2", "1:2", "1:1"]);
  });

  it("wraps next and previous at the ends of a looping range", async () => {
    const { ctrl, played } = setup();
    ctrl.setScope(scope({ kind: "custom", loop: true, from: "1:2", to: "1:3" }));
    await ctrl.playAyah(1, 3);
    await ctrl.next(); // wraps to 1:2
    await ctrl.prev(); // wraps back to 1:3
    expect(played).toEqual(["1:3", "1:2", "1:3"]);
  });

  it("does not loop under the continue scope even if asked to", () => {
    const { ctrl, state } = setup();
    ctrl.setScope({ kind: "continue", loop: true });
    expect(state().scope).toEqual({ kind: "continue", loop: false });
  });
});

describe("bismillah between surahs", () => {
  const SHORT = [
    { number: 8, name: "Al-Anfal", arabicName: "الأنفال", ayahs: 3, page: 177, location: "medina" as const },
    { number: 9, name: "At-Tawba", arabicName: "التوبة", ayahs: 3, page: 187, location: "medina" as const },
    { number: 10, name: "Yunus", arabicName: "يونس", ayahs: 3, page: 208, location: "mecca" as const },
  ];

  it("recites it before the first ayah of the next surah, using Al-Fatihah's 1:1 audio", async () => {
    const { ctrl, audio, played, state } = setup();
    await ctrl.playAyah(1, 7);
    audio.onended();
    await flush();
    expect(played).toEqual(["1:7", "1:1"]);
    expect(state()).toMatchObject({ currentAyah: "2:1", isBismillah: true });
    audio.onended();
    await flush();
    expect(played).toEqual(["1:7", "1:1", "2:1"]);
    expect(state().isBismillah).toBe(false);
  });

  it("skips it for At-Tawbah, which has none, but not for the surah after it", async () => {
    const { ctrl, audio, played } = setup(undefined, SHORT);
    await ctrl.playAyah(8, 3);
    audio.onended();
    await flush();
    expect(played).toEqual(["8:3", "9:1"]);
    await ctrl.playAyah(9, 3);
    audio.onended();
    await flush();
    expect(played.slice(-2)).toEqual(["9:3", "1:1"]);
  });

  it("recites it each time a looped surah starts over", async () => {
    const { ctrl, audio, played } = setup();
    ctrl.setScope(scope({ kind: "surah", loop: true }));
    await ctrl.playAyah(114, 6);
    audio.onended();
    await flush();
    audio.onended(); // bismillah ends
    await flush();
    expect(played).toEqual(["114:6", "1:1", "114:1"]);
  });

  it("does not recite it when a hand-picked range wraps", async () => {
    const { ctrl, audio, played } = setup();
    ctrl.setScope(scope({ kind: "custom", loop: true, from: "114:1", to: "114:2" }));
    await ctrl.playAyah(114, 2);
    audio.onended();
    await flush();
    expect(played).toEqual(["114:2", "114:1"]);
  });

  it("recites it once even when the ayah repeats", async () => {
    const { ctrl, audio, played } = setup();
    ctrl.setRepeat(2);
    await ctrl.playAyah(1, 7);
    audio.onended(); // repeat of 1:7
    await flush();
    audio.onended(); // moves on: bismillah
    await flush();
    audio.onended(); // bismillah ends: 2:1
    await flush();
    audio.onended(); // repeat of 2:1
    await flush();
    expect(played).toEqual(["1:7", "1:7", "1:1", "2:1", "2:1"]);
  });

  it("recites it when the next button crosses into a surah, but not when going back", async () => {
    const { ctrl, played, state } = setup();
    await ctrl.playAyah(1, 7);
    await ctrl.next();
    expect(played).toEqual(["1:7", "1:1"]);
    expect(state().isBismillah).toBe(true);
    await ctrl.prev();
    expect(played.at(-1)).toBe("1:7");
    expect(state().isBismillah).toBe(false);
  });

  it("plays the ayah itself when started directly", async () => {
    const { ctrl, played } = setup();
    await ctrl.playAyah(2, 1);
    expect(played).toEqual(["2:1"]);
  });
});

describe("playback ranges", () => {
  const catalog = {
    surahs: SURAHS,
    juzs: [
      { number: 1, page: 1, startSurah: 1, startAyah: 1 },
      { number: 2, page: 22, startSurah: 2, startAyah: 142 },
      { number: 30, page: 582, startSurah: 114, startAyah: 1 },
    ],
  } as unknown as Catalog;

  it("finds the juz around an ayah, ending just before the next juz", () => {
    expect(juzRange(catalog, "1:3")).toEqual({ from: "1:1", to: "2:141" });
    expect(juzRange(catalog, "2:142")).toEqual({ from: "2:142", to: "2:286" });
    expect(juzRange(catalog, "114:2")).toEqual({ from: "114:1", to: "114:6" });
  });

  it("finds the ayahs that start on a page", () => {
    const mushaf = {
      pages: [
        { page: 5, ayahs: [{ surah: 2, ayah: 20 }, { surah: 2, ayah: 21 }, { surah: 2, ayah: 22 }] },
      ],
      ayahToPage: { "2:20": 4, "2:21": 5, "2:22": 5 },
    } as unknown as MushafMap;
    expect(pageRange(mushaf, "2:21")).toEqual({ from: "2:21", to: "2:22" });
    expect(pageRange(mushaf, "9:9")).toBeNull();
  });

  it("clamps and orders a custom range inside one surah", () => {
    expect(customRange(2, 10, 4, 286)).toEqual({ from: "2:4", to: "2:10" });
    expect(customRange(114, 0, 99, 6)).toEqual({ from: "114:1", to: "114:6" });
  });
});
