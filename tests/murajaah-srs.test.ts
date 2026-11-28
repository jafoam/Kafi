import { describe, it, expect } from "vitest";
import type { TasmiSessionRecord } from "../src/data/types";
import {
  applySessionToMurajaah,
  backfillMurajaahCards,
  extractDrillAyahs,
  getDueMurajaahCards,
  getNextMurajaahTarget,
  scheduleMurajaahReview,
} from "../src/services/murajaah-srs";
import { createUserStore } from "../src/services/user-store";
import type { PlatformAdapter } from "../src/platform/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeRecord(overrides: Partial<TasmiSessionRecord> = {}): TasmiSessionRecord {
  return {
    id: `t-${Math.random()}`,
    startedAt: "2026-11-20T08:00:00.000Z",
    durationSec: 60,
    surah: 78,
    fromAyah: 1,
    toAyah: 40,
    mistakes: [],
    kind: "murajaah",
    ...overrides,
  };
}

describe("murajaah-srs", () => {
  it("progresses clean reviews 1 -> 3 -> 7 -> 14 -> 30 days and graduates ziyadah to murajaah", () => {
    const t0 = Date.parse("2026-11-01T00:00:00.000Z");
    const intervals: number[] = [];
    let card = undefined;

    for (let i = 0; i < 5; i += 1) {
      card = scheduleMurajaahReview(
        card,
        makeRecord({ kind: i === 0 ? "ziyadah" : undefined }),
        t0 + i * DAY_MS,
      );
      intervals.push(card.stabilityDays);
      if (i === 0) expect(card.kind).toBe("ziyadah");
      if (i === 1) expect(card.kind).toBe("murajaah");
    }

    expect(intervals).toEqual([1, 3, 7, 14, 30]);
  });

  it("resets to tomorrow (1 day) when mistakes or peeked ayahs occur", () => {
    const t0 = Date.parse("2026-11-10T00:00:00.000Z");
    let card = scheduleMurajaahReview(undefined, makeRecord(), t0);
    card = scheduleMurajaahReview(card, makeRecord(), t0 + DAY_MS);
    expect(card.stabilityDays).toBe(3);

    // Peeked ayah resets to 1 day and increments lapses
    const afterPeek = scheduleMurajaahReview(
      card,
      makeRecord({ peekedAyahs: ["78:5"] }),
      t0 + 4 * DAY_MS,
    );
    expect(afterPeek.stabilityDays).toBe(1);
    expect(afterPeek.lapses).toBe(1);
    expect(Date.parse(afterPeek.dueAt)).toBe(t0 + 5 * DAY_MS);
  });

  it("backfills from tasmiHistory and prioritizes due lapsed cards", () => {
    const now = Date.parse("2026-11-26T12:00:00.000Z");
    const cleanOld = makeRecord({
      id: "r1",
      startedAt: "2026-11-20T08:00:00.000Z",
      surah: 112,
      fromAyah: 1,
      toAyah: 4,
    });
    const lapsed = makeRecord({
      id: "r2",
      startedAt: "2026-11-24T08:00:00.000Z",
      surah: 78,
      fromAyah: 1,
      toAyah: 40,
      mistakes: [{ id: "m1", errorClass: "wrong_word", surah: 78, ayah: 12 }],
    });

    const cards = backfillMurajaahCards([lapsed, cleanOld]);
    expect(cards).toHaveLength(2);
    const due = getDueMurajaahCards(cards, now);
    expect(due[0].surah).toBe(78);
    expect(getNextMurajaahTarget(cards, now)?.surah).toBe(78);

    const updated = applySessionToMurajaah(cards, makeRecord({ surah: 78, fromAyah: 1, toAyah: 40, startedAt: new Date(now).toISOString() }));
    expect(updated.find((c) => c.surah === 78)?.reps).toBe(1);
  });

  it("extracts unique sorted drill ayahs from both mistakes and peekedAyahs", () => {
    const rec = makeRecord({
      mistakes: [
        { id: "m1", errorClass: "wrong_word", surah: 78, ayah: 10 },
        { id: "m2", errorClass: "omitted_word", surah: 78, ayah: 3 },
      ],
      peekedAyahs: ["78:10", "78:7"],
    });
    expect(extractDrillAyahs(rec)).toEqual(["78:3", "78:7", "78:10"]);
  });

  it("keeps Muraja'ah schedule manual (no auto-FSRS on Tasmi') and supports add/review/archive/delete", async () => {
    const kv = new Map<string, string>();
    const platform = {
      kvGet: async (k: string) => kv.get(k) ?? null,
      kvSet: async (k: string, v: string) => {
        kv.set(k, v);
      },
    } as unknown as PlatformAdapter;

    const store = createUserStore(platform);
    const afterTasmi = await store.addTasmiHistory(makeRecord());
    expect(afterTasmi.murajaahCards ?? []).toHaveLength(0);

    const added = await store.addMurajaahCard({
      surah: 67,
      fromAyah: 1,
      toAyah: 15,
      kind: "murajaah",
      intervalDays: 7,
      note: "Ba'da Subuh",
    });
    expect(added.murajaahCards).toHaveLength(1);
    const id = added.murajaahCards![0].id;
    expect(added.murajaahCards![0].note).toBe("Ba'da Subuh");

    const reviewed = await store.markMurajaahReviewed(id);
    expect(reviewed.murajaahCards![0].reps).toBe(1);

    const archived = await store.setMurajaahArchived(id, true);
    expect(archived.archivedMurajaah?.[id]?.on).toBe(true);

    const deleted = await store.deleteMurajaahCard(id);
    expect(deleted.murajaahCards).toHaveLength(0);
    expect(deleted.deletedMurajaahIds).toContain(id);
  });
});
