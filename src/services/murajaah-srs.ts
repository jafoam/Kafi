import type { AyahKey, MurajaahCard, TasmiSessionRecord } from "../data/types";
import { compareAyahKeys } from "./audio-controller";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLEAN_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;
const MAX_INTERVAL_DAYS = 180;

export function murajaahCardId(surah: number, fromAyah: number, toAyah: number): string {
  return `${surah}:${fromAyah}-${toAyah}`;
}

/** Unique sorted ayahs that had a confirmed mistake or were peeked during a Tasmi' session. */
export function extractDrillAyahs(record: TasmiSessionRecord | null | undefined): AyahKey[] {
  if (!record) return [];
  const set = new Set<AyahKey>();
  for (const m of record.mistakes) {
    set.add(`${m.surah}:${m.ayah}`);
  }
  for (const k of record.peekedAyahs ?? []) {
    set.add(k);
  }
  return Array.from(set).sort(compareAyahKeys);
}

/**
 * FSRS-inspired spaced repetition scheduler:
 * - Clean session (0 mistakes, 0 peeks): 1 -> 3 -> 7 -> 14 -> 30 days, then scales by stability.
 * - Any mistake or peek: schedules review for tomorrow (1 day) and raises difficulty.
 */
export function scheduleMurajaahReview(
  existing: MurajaahCard | undefined,
  record: TasmiSessionRecord,
  nowMs: number = Date.parse(record.startedAt) || Date.now(),
): MurajaahCard {
  const id = murajaahCardId(record.surah, record.fromAyah, record.toAyah);
  const hadIssue = record.mistakes.length > 0 || (record.peekedAyahs?.length ?? 0) > 0;
  const baseDifficulty = existing?.difficulty ?? 5;

  let reps: number;
  let lapses: number;
  let stabilityDays: number;
  let difficulty: number;

  if (hadIssue) {
    reps = 0;
    lapses = (existing?.lapses ?? 0) + 1;
    stabilityDays = 1;
    difficulty = Math.min(10, Number((baseDifficulty + 0.8).toFixed(2)));
  } else {
    reps = (existing?.reps ?? 0) + 1;
    lapses = existing?.lapses ?? 0;
    difficulty = Math.max(1, Number((baseDifficulty - 0.4).toFixed(2)));
    if (reps <= CLEAN_INTERVALS_DAYS.length) {
      stabilityDays = CLEAN_INTERVALS_DAYS[reps - 1];
    } else {
      const factor = 1.6 + (10 - difficulty) * 0.08;
      stabilityDays = Math.min(
        MAX_INTERVAL_DAYS,
        Math.max(30, Math.round((existing?.stabilityDays ?? 30) * factor)),
      );
    }
  }

  // Graduate ziyadah -> murajaah once reviewed cleanly at least twice, or if explicitly murajaah.
  const initialKind = record.kind ?? existing?.kind ?? "murajaah";
  const kind = initialKind === "ziyadah" && reps >= 2 ? "murajaah" : initialKind;

  return {
    id,
    surah: record.surah,
    fromAyah: record.fromAyah,
    toAyah: record.toAyah,
    kind,
    stabilityDays,
    difficulty,
    reps,
    lapses,
    lastReviewedAt: new Date(nowMs).toISOString(),
    dueAt: new Date(nowMs + stabilityDays * DAY_MS).toISOString(),
  };
}

export function applySessionToMurajaah(
  cards: readonly MurajaahCard[],
  record: TasmiSessionRecord,
): MurajaahCard[] {
  const id = murajaahCardId(record.surah, record.fromAyah, record.toAyah);
  const existing = cards.find((c) => c.id === id);
  const updated = scheduleMurajaahReview(existing, record);
  return [updated, ...cards.filter((c) => c.id !== id)];
}

/** Seeds Muraja'ah cards from existing Tasmi' history when no cards are stored yet. */
export function backfillMurajaahCards(
  history: readonly TasmiSessionRecord[],
  existingCards: readonly MurajaahCard[] = [],
): MurajaahCard[] {
  if (existingCards.length > 0 || history.length === 0) return [...existingCards];
  const chronological = [...history].sort(
    (a, b) => (Date.parse(a.startedAt) || 0) - (Date.parse(b.startedAt) || 0),
  );
  let cards: MurajaahCard[] = [];
  for (const record of chronological) {
    cards = applySessionToMurajaah(cards, record);
  }
  return cards;
}

export function getDueMurajaahCards(
  cards: readonly MurajaahCard[],
  nowMs: number = Date.now(),
): MurajaahCard[] {
  return cards
    .filter((c) => (Date.parse(c.dueAt) || 0) <= nowMs)
    .sort((a, b) => {
      // Prioritize lapses/overdue items first, then ziyadah ahead of long-interval murajaah
      const overdueA = nowMs - (Date.parse(a.dueAt) || 0);
      const overdueB = nowMs - (Date.parse(b.dueAt) || 0);
      if (b.lapses !== a.lapses) return b.lapses - a.lapses;
      if (a.kind !== b.kind) return a.kind === "ziyadah" ? -1 : 1;
      return overdueB - overdueA;
    });
}

export function getNextMurajaahTarget(
  cards: readonly MurajaahCard[],
  nowMs: number = Date.now(),
): MurajaahCard | null {
  const due = getDueMurajaahCards(cards, nowMs);
  if (due.length > 0) return due[0];
  if (cards.length === 0) return null;
  return [...cards].sort((a, b) => (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0))[0];
}

export function formatDueLabel(dueAt: string, nowMs: number = Date.now()): string {
  const dueMs = Date.parse(dueAt);
  if (!Number.isFinite(dueMs)) return "Hari ini";
  const diffDays = Math.round((dueMs - nowMs) / DAY_MS);
  if (diffDays <= -2) return `Terlambat ${Math.abs(diffDays)} hari`;
  if (diffDays === -1) return "Terlambat 1 hari";
  if (diffDays <= 0) return "Hari ini";
  if (diffDays === 1) return "Besok";
  return `${diffDays} hari lagi`;
}
