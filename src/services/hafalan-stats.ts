import type {
  AyahKey,
  Catalog,
  MurajaahCard,
  MushafMap,
  TasmiSessionRecord,
} from "../data/types";

export type HafalanStatus = "none" | "ziyadah" | "smooth" | "needs_review";

export interface PageProgress {
  page: number;
  status: HafalanStatus;
  coveredAyahs: number;
  totalAyahs: number;
}

export interface SurahProgress {
  surah: number;
  name: string;
  page: number;
  status: HafalanStatus;
  coveredAyahs: number;
  totalAyahs: number;
}

export interface JuzProgress {
  juz: number;
  page: number;
  status: HafalanStatus;
  coveredAyahs: number;
  totalAyahs: number;
}

export interface HafalanProgressSummary {
  totalAyahs: number;
  memorizedAyahs: number;
  smoothAyahs: number;
  ziyadahAyahs: number;
  needsReviewAyahs: number;
  memorizedPages: number;
}

export interface HafalanProgressMap {
  pages: PageProgress[];
  surahs: SurahProgress[];
  juzs: JuzProgress[];
  summary: HafalanProgressSummary;
}

export interface StreakDay {
  dateKey: string;
  label: string;
  active: boolean;
  sessions: number;
}

export interface HafalanStreak {
  currentStreak: number;
  longestStreak: number;
  todaySessions: number;
  todayMinutes: number;
  todayAyahs: number;
  totalSessions: number;
  weekDays: StreakDay[];
}

const STATUS_PRIORITY: Record<HafalanStatus, number> = {
  none: 0,
  smooth: 1,
  ziyadah: 2,
  needs_review: 3,
};

function mergeStatus(a: HafalanStatus, b: HafalanStatus): HafalanStatus {
  return STATUS_PRIORITY[b] > STATUS_PRIORITY[a] ? b : a;
}

function summarizeGroupStatus(counts: Record<HafalanStatus, number>): HafalanStatus {
  if (counts.needs_review > 0) return "needs_review";
  if (counts.ziyadah > 0) return "ziyadah";
  if (counts.smooth > 0) return "smooth";
  return "none";
}

export function computeHafalanProgress(
  murajaahCards: readonly MurajaahCard[],
  tasmiHistory: readonly TasmiSessionRecord[],
  catalog: Pick<Catalog, "surahs" | "juzs">,
  mushafMap: Pick<MushafMap, "pages" | "ayahToPage">,
): HafalanProgressMap {
  const ayahStatus = new Map<AyahKey, HafalanStatus>();

  // Derive per-ayah status from spaced-repetition cards first.
  for (const card of murajaahCards) {
    // Unreviewed manual schedules (0 reps, 0 lapses) are pending targets, not completed memorization.
    if (card.reps === 0 && card.lapses === 0) continue;
    const status: HafalanStatus =
      card.lapses > 0 && card.reps === 0
        ? "needs_review"
        : card.kind === "ziyadah"
          ? "ziyadah"
          : "smooth";
    for (let a = card.fromAyah; a <= card.toAyah; a += 1) {
      const key: AyahKey = `${card.surah}:${a}`;
      const prev = ayahStatus.get(key) ?? "none";
      ayahStatus.set(key, mergeStatus(prev, status));
    }
  }

  // Flag specific ayahs that had mistakes in the latest session covering them.
  const latestByPassage = new Map<string, TasmiSessionRecord>();
  for (const rec of tasmiHistory) {
    const id = `${rec.surah}:${rec.fromAyah}-${rec.toAyah}`;
    const prev = latestByPassage.get(id);
    if (!prev || (Date.parse(rec.startedAt) || 0) > (Date.parse(prev.startedAt) || 0)) {
      latestByPassage.set(id, rec);
    }
  }
  for (const rec of latestByPassage.values()) {
    for (const m of rec.mistakes) {
      ayahStatus.set(`${m.surah}:${m.ayah}`, "needs_review");
    }
  }

  // Aggregate per-surah
  let totalAyahs = 0;
  let smoothAyahs = 0;
  let ziyadahAyahs = 0;
  let needsReviewAyahs = 0;

  const surahs: SurahProgress[] = catalog.surahs.map((s) => {
    totalAyahs += s.ayahs;
    const counts: Record<HafalanStatus, number> = {
      none: 0,
      smooth: 0,
      ziyadah: 0,
      needs_review: 0,
    };
    for (let a = 1; a <= s.ayahs; a += 1) {
      const st = ayahStatus.get(`${s.number}:${a}`) ?? "none";
      counts[st] += 1;
    }
    smoothAyahs += counts.smooth;
    ziyadahAyahs += counts.ziyadah;
    needsReviewAyahs += counts.needs_review;
    const coveredAyahs = s.ayahs - counts.none;
    return {
      surah: s.number,
      name: s.name,
      page: s.page,
      status: summarizeGroupStatus(counts),
      coveredAyahs,
      totalAyahs: s.ayahs,
    };
  });

  // Aggregate per-page (604 pages)
  let memorizedPages = 0;
  const pages: PageProgress[] = mushafMap.pages.map((entry) => {
    const counts: Record<HafalanStatus, number> = {
      none: 0,
      smooth: 0,
      ziyadah: 0,
      needs_review: 0,
    };
    const seen = new Set<AyahKey>();
    for (const seg of entry.ayahs) {
      const key: AyahKey = `${seg.surah}:${seg.ayah}`;
      if (entry.leadingSplitAyah === key || seen.has(key)) continue;
      seen.add(key);
      const st = ayahStatus.get(key) ?? "none";
      counts[st] += 1;
    }
    const pageTotal = seen.size;
    const coveredAyahs = pageTotal - counts.none;
    if (coveredAyahs > 0) memorizedPages += 1;
    return {
      page: entry.page,
      status: summarizeGroupStatus(counts),
      coveredAyahs,
      totalAyahs: pageTotal,
    };
  });

  // Aggregate per-juz (30 juz)
  const sortedJuzs = [...catalog.juzs].sort((a, b) => a.number - b.number);
  const juzs: JuzProgress[] = sortedJuzs.map((juz, idx) => {
    const nextJuz = sortedJuzs[idx + 1];
    const startPage = juz.page;
    const endPage = nextJuz ? Math.max(startPage, nextJuz.page - 1) : mushafMap.pages.length;
    const counts: Record<HafalanStatus, number> = {
      none: 0,
      smooth: 0,
      ziyadah: 0,
      needs_review: 0,
    };
    let coveredAyahs = 0;
    let juzTotalAyahs = 0;
    for (let p = startPage; p <= endPage; p += 1) {
      const pageProg = pages[p - 1];
      if (!pageProg) continue;
      juzTotalAyahs += pageProg.totalAyahs;
      coveredAyahs += pageProg.coveredAyahs;
      counts[pageProg.status] += 1;
    }
    return {
      juz: juz.number,
      page: juz.page,
      status: summarizeGroupStatus(counts),
      coveredAyahs,
      totalAyahs: juzTotalAyahs,
    };
  });

  return {
    pages,
    surahs,
    juzs,
    summary: {
      totalAyahs,
      memorizedAyahs: smoothAyahs + ziyadahAyahs + needsReviewAyahs,
      smoothAyahs,
      ziyadahAyahs,
      needsReviewAyahs,
      memorizedPages,
    },
  };
}

const DAY_LABELS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const DAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function toLocalDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeHafalanStreak(
  tasmiHistory: readonly TasmiSessionRecord[],
  nowMs: number = Date.now(),
  lang: "id" | "en" = "id",
): HafalanStreak {
  const byDay = new Map<string, { sessions: number; durationSec: number; ayahs: number }>();
  let validSessions = 0;

  for (const rec of tasmiHistory) {
    if (
      typeof rec.recitedWords === "number" &&
      rec.recitedWords === 0 &&
      (rec.recitedAyahs ?? 0) === 0
    ) {
      continue;
    }
    const ts = Date.parse(rec.startedAt);
    if (!Number.isFinite(ts)) continue;
    validSessions += 1;
    const key = toLocalDateKey(ts);
    const prev = byDay.get(key) ?? { sessions: 0, durationSec: 0, ayahs: 0 };
    const ayahs = rec.recitedAyahs ?? Math.max(1, rec.toAyah - rec.fromAyah + 1);
    byDay.set(key, {
      sessions: prev.sessions + 1,
      durationSec: prev.durationSec + Math.max(0, rec.durationSec || 0),
      ayahs: prev.ayahs + ayahs,
    });
  }

  const todayDate = new Date(nowMs);
  todayDate.setHours(12, 0, 0, 0);
  const todayKey = toLocalDateKey(todayDate.getTime());
  const todayStats = byDay.get(todayKey);

  // Current streak: count backwards from today, or from yesterday if today has no session yet.
  let currentStreak = 0;
  const cursor = new Date(todayDate.getTime());
  if (!byDay.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (byDay.has(toLocalDateKey(cursor.getTime()))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak across all recorded days.
  const sortedDays = Array.from(byDay.keys()).sort();
  let longestStreak = 0;
  let run = 0;
  let prevDateMs: number | null = null;
  for (const key of sortedDays) {
    const [y, m, d] = key.split("-").map(Number);
    const curMs = Date.UTC(y, m - 1, d);
    if (prevDateMs !== null && curMs - prevDateMs === 86_400_000) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prevDateMs = curMs;
  }

  // Last 7 days (oldest -> today)
  const weekDays: StreakDay[] = [];
  const dayLabels = lang === "en" ? DAY_LABELS_EN : DAY_LABELS_ID;
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(todayDate.getTime());
    d.setDate(d.getDate() - offset);
    const key = toLocalDateKey(d.getTime());
    const stats = byDay.get(key);
    weekDays.push({
      dateKey: key,
      label: dayLabels[d.getDay()],
      active: Boolean(stats),
      sessions: stats?.sessions ?? 0,
    });
  }

  return {
    currentStreak,
    longestStreak,
    todaySessions: todayStats?.sessions ?? 0,
    todayMinutes: Math.round((todayStats?.durationSec ?? 0) / 60),
    todayAyahs: todayStats?.ayahs ?? 0,
    totalSessions: validSessions,
    weekDays,
  };
}
