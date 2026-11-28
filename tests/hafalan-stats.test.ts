import { describe, expect, it } from "vitest";
import catalogJson from "../src/data/catalog.json";
import mushafMapJson from "../src/data/mushaf-map.json";
import type { Catalog, MurajaahCard, MushafMap, TasmiSessionRecord } from "../src/data/types";
import { computeHafalanProgress, computeHafalanStreak } from "../src/services/hafalan-stats";

const catalog = catalogJson as unknown as Catalog;
const mushafMap = mushafMapJson as unknown as MushafMap;

describe("computeHafalanProgress", () => {
  it("aggregates smooth, ziyadah, and needs_review across surahs, juzs, and pages", () => {
    const cards: MurajaahCard[] = [
      {
        id: "1:1-7",
        surah: 1,
        fromAyah: 1,
        toAyah: 7,
        kind: "murajaah",
        stabilityDays: 14,
        difficulty: 4,
        reps: 4,
        lapses: 0,
        lastReviewedAt: "2026-11-20T08:00:00.000Z",
        dueAt: "2026-12-04T08:00:00.000Z",
      },
      {
        id: "112:1-4",
        surah: 112,
        fromAyah: 1,
        toAyah: 4,
        kind: "ziyadah",
        stabilityDays: 1,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        lastReviewedAt: "2026-11-27T08:00:00.000Z",
        dueAt: "2026-11-28T08:00:00.000Z",
      },
      {
        id: "114:1-6",
        surah: 114,
        fromAyah: 1,
        toAyah: 6,
        kind: "murajaah",
        stabilityDays: 1,
        difficulty: 6.6,
        reps: 0,
        lapses: 2,
        lastReviewedAt: "2026-11-27T08:00:00.000Z",
        dueAt: "2026-11-28T08:00:00.000Z",
      },
    ];

    const map = computeHafalanProgress(cards, [], catalog, mushafMap);
    expect(map.pages).toHaveLength(604);
    expect(map.surahs).toHaveLength(114);
    expect(map.juzs).toHaveLength(30);

    expect(map.surahs[0].status).toBe("smooth");
    expect(map.surahs[0].coveredAyahs).toBe(7);
    expect(map.surahs[111].status).toBe("ziyadah");
    expect(map.surahs[113].status).toBe("needs_review");
    expect(map.juzs[0].status).toBe("smooth");
    expect(map.juzs[29].status).toBe("needs_review");
    expect(map.summary.memorizedAyahs).toBe(17);
    expect(map.summary.smoothAyahs).toBe(7);
    expect(map.summary.ziyadahAyahs).toBe(4);
    expect(map.summary.needsReviewAyahs).toBe(6);
  });
});

describe("computeHafalanStreak", () => {
  it("computes active streak, longest streak, today totals, and 7-day strip", () => {
    const now = new Date(2026, 10, 28, 15, 0, 0).getTime();
    const rec = (dayOffset: number, durationSec: number, ayahs: number): TasmiSessionRecord => {
      const d = new Date(now);
      d.setDate(d.getDate() - dayOffset);
      return {
        id: `t-${dayOffset}-${durationSec}`,
        startedAt: d.toISOString(),
        durationSec,
        surah: 1,
        fromAyah: 1,
        toAyah: ayahs,
        recitedAyahs: ayahs,
        mistakes: [],
      };
    };

    const streak = computeHafalanStreak(
      [rec(0, 120, 7), rec(0, 60, 4), rec(1, 90, 5), rec(2, 90, 5), rec(5, 60, 3)],
      now,
    );
    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBe(3);
    expect(streak.todaySessions).toBe(2);
    expect(streak.todayMinutes).toBe(3);
    expect(streak.todayAyahs).toBe(11);
    expect(streak.weekDays).toHaveLength(7);
    expect(streak.weekDays[6].active).toBe(true);
    expect(streak.weekDays[3].active).toBe(false);
  });

  it("keeps streak alive if last session was yesterday", () => {
    const now = new Date(2026, 10, 28, 9, 0, 0).getTime();
    const yest = new Date(2026, 10, 27, 20, 0, 0).toISOString();
    const streak = computeHafalanStreak(
      [{ id: "y1", startedAt: yest, durationSec: 60, surah: 112, fromAyah: 1, toAyah: 4, mistakes: [] }],
      now,
    );
    expect(streak.currentStreak).toBe(1);
    expect(streak.todaySessions).toBe(0);
  });
});
