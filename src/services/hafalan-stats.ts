import type {
  AyahKey,
  Catalog,
  MurajaahCard,
  MushafMap,
  TasmiSessionRecord,
} from "../data/types";

export type HafalanStatus = "none" | "in_progress" | "smooth" | "needs_review";

export interface PageProgress {
  page: number;
  status: HafalanStatus;
  coveredAyahs: number;
  totalAyahs: number;
  needsReviewAyahs: AyahKey[];
}

export interface SurahProgress {
  surah: number;
  name: string;
  page: number;
  status: HafalanStatus;
  coveredAyahs: number;
  totalAyahs: number;
  needsReviewAyahs: AyahKey[];
}

export interface JuzProgress {
  juz: number;
  page: number;
  status: HafalanStatus;
  coveredAyahs: number;
  totalAyahs: number;
  needsReviewAyahs: AyahKey[];
}

export interface HafalanProgressSummary {
  totalAyahs: number;
  memorizedAyahs: number;
  smoothAyahs: number;
  needsReviewAyahs: number;
  memorizedPages: number;
}

export interface HafalanProgressMap {
  pages: PageProgress[];
  surahs: SurahProgress[];
  juzs: JuzProgress[];
  summary: HafalanProgressSummary;
  /** Error classes or "murajaah_lapse" for each ayah marked as needs_review. */
  reviewReasons: Record<AyahKey, string[]>;
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

function summarizeGroupStatus(
  smoothCount: number,
  needsReviewCount: number,
  totalCount: number,
): HafalanStatus {
  if (needsReviewCount > 0) return "needs_review";
  if (totalCount > 0 && smoothCount >= totalCount) return "smooth";
  if (smoothCount > 0) return "in_progress";
  return "none";
}

export function computeHafalanProgress(
  murajaahCards: readonly MurajaahCard[],
  tasmiHistory: readonly TasmiSessionRecord[],
  catalog: Pick<Catalog, "surahs" | "juzs">,
  mushafMap: Pick<MushafMap, "pages" | "ayahToPage">,
): HafalanProgressMap {
  const ayahState = new Map<AyahKey, { status: HafalanStatus; ts: number }>();
  const reviewReasonsMap = new Map<AyahKey, Set<string>>();

  const setAyahStatus = (key: AyahKey, status: HafalanStatus, ts: number, reasons?: Iterable<string>) => {
    ayahState.set(key, { status, ts });
    if (status === "needs_review") {
      const set = new Set<string>(reasons ?? []);
      reviewReasonsMap.set(key, set);
    } else {
      reviewReasonsMap.delete(key);
    }
  };

  // Process Tasmi' sessions chronologically so newer smooth sessions clear older mistakes.
  const chronological = [...tasmiHistory].sort(
    (a, b) => (Date.parse(a.startedAt) || 0) - (Date.parse(b.startedAt) || 0),
  );

  for (const rec of chronological) {
    const hasExplicitCounts = typeof rec.recitedWords === "number" || typeof rec.recitedAyahs === "number";
    const words = rec.recitedWords ?? 0;
    const ayahs = rec.recitedAyahs ?? 0;
    const peeked = rec.peekedAyahs ?? [];
    if (hasExplicitCounts && words === 0 && ayahs === 0 && rec.mistakes.length === 0 && peeked.length === 0) {
      continue;
    }

    const ts = Date.parse(rec.startedAt) || 0;
    const totalAyahs = Math.max(1, rec.toAyah - rec.fromAyah + 1);
    const coveredCount =
      typeof rec.recitedAyahs === "number" ? Math.min(totalAyahs, Math.max(0, rec.recitedAyahs)) : totalAyahs;
    const coveredEnd = coveredCount > 0 ? Math.min(rec.toAyah, rec.fromAyah + coveredCount - 1) : rec.fromAyah - 1;

    const mistakeReasons = new Map<AyahKey, Set<string>>();
    for (const m of rec.mistakes) {
      const key: AyahKey = `${m.surah}:${m.ayah}`;
      let set = mistakeReasons.get(key);
      if (!set) {
        set = new Set<string>();
        mistakeReasons.set(key, set);
      }
      set.add(m.errorClass);
    }
    for (const key of peeked) {
      let set = mistakeReasons.get(key);
      if (!set) {
        set = new Set<string>();
        mistakeReasons.set(key, set);
      }
      set.add("peeked");
    }

    for (let a = rec.fromAyah; a <= coveredEnd; a += 1) {
      const key: AyahKey = `${rec.surah}:${a}`;
      if (!mistakeReasons.has(key)) {
        setAyahStatus(key, "smooth", ts);
      }
    }
    for (const [key, reasons] of mistakeReasons.entries()) {
      setAyahStatus(key, "needs_review", ts, reasons);
    }
  }

  // Also include reviewed schedule cards (reps > 0 or lapses > 0) when they are at least as recent.
  for (const card of murajaahCards) {
    // Unreviewed manual schedules (0 reps, 0 lapses) are pending targets, not completed memorization.
    if (card.reps === 0 && card.lapses === 0) continue;
    const ts = Date.parse(card.lastReviewedAt) || 0;
    const status: HafalanStatus = card.lapses > 0 && card.reps === 0 ? "needs_review" : "smooth";
    for (let a = card.fromAyah; a <= card.toAyah; a += 1) {
      const key: AyahKey = `${card.surah}:${a}`;
      const prev = ayahState.get(key);
      if (!prev || ts >= prev.ts) {
        setAyahStatus(key, status, ts, status === "needs_review" ? ["murajaah_lapse"] : undefined);
      }
    }
  }

  // Aggregate per-surah
  let totalAyahs = 0;
  let smoothAyahs = 0;
  let needsReviewAyahs = 0;

  const surahs: SurahProgress[] = catalog.surahs.map((s) => {
    totalAyahs += s.ayahs;
    let surahSmooth = 0;
    let surahReview = 0;
    const surahReviewAyahs: AyahKey[] = [];
    for (let a = 1; a <= s.ayahs; a += 1) {
      const key: AyahKey = `${s.number}:${a}`;
      const st = ayahState.get(key)?.status ?? "none";
      if (st === "smooth") surahSmooth += 1;
      else if (st === "needs_review") {
        surahReview += 1;
        surahReviewAyahs.push(key);
      }
    }
    smoothAyahs += surahSmooth;
    needsReviewAyahs += surahReview;
    const coveredAyahs = surahSmooth + surahReview;
    return {
      surah: s.number,
      name: s.name,
      page: s.page,
      status: summarizeGroupStatus(surahSmooth, surahReview, s.ayahs),
      coveredAyahs,
      totalAyahs: s.ayahs,
      needsReviewAyahs: surahReviewAyahs,
    };
  });

  // Aggregate per-page (604 pages)
  let memorizedPages = 0;
  const pageSmoothCounts: number[] = [];
  const pages: PageProgress[] = mushafMap.pages.map((entry) => {
    let pageSmooth = 0;
    let pageReview = 0;
    const seen = new Set<AyahKey>();
    const pageReviewAyahs: AyahKey[] = [];
    for (const seg of entry.ayahs) {
      const key: AyahKey = `${seg.surah}:${seg.ayah}`;
      if (entry.leadingSplitAyah === key || seen.has(key)) continue;
      seen.add(key);
      const st = ayahState.get(key)?.status ?? "none";
      if (st === "smooth") pageSmooth += 1;
      else if (st === "needs_review") {
        pageReview += 1;
        pageReviewAyahs.push(key);
      }
    }
    const pageTotal = seen.size;
    const coveredAyahs = pageSmooth + pageReview;
    if (coveredAyahs > 0) memorizedPages += 1;
    pageSmoothCounts.push(pageSmooth);
    return {
      page: entry.page,
      status: summarizeGroupStatus(pageSmooth, pageReview, pageTotal),
      coveredAyahs,
      totalAyahs: pageTotal,
      needsReviewAyahs: pageReviewAyahs,
    };
  });

  // Aggregate per-juz (30 juz)
  const sortedJuzs = [...catalog.juzs].sort((a, b) => a.number - b.number);
  const juzs: JuzProgress[] = sortedJuzs.map((juz, idx) => {
    const nextJuz = sortedJuzs[idx + 1];
    const startPage = juz.page;
    const endPage = nextJuz ? Math.max(startPage, nextJuz.page - 1) : mushafMap.pages.length;
    let coveredAyahs = 0;
    let juzTotalAyahs = 0;
    let juzSmoothAyahs = 0;
    const juzReviewSet = new Set<AyahKey>();
    for (let p = startPage; p <= endPage; p += 1) {
      const pageProg = pages[p - 1];
      if (!pageProg) continue;
      juzTotalAyahs += pageProg.totalAyahs;
      coveredAyahs += pageProg.coveredAyahs;
      juzSmoothAyahs += pageSmoothCounts[p - 1] ?? 0;
      for (const key of pageProg.needsReviewAyahs) juzReviewSet.add(key);
    }
    return {
      juz: juz.number,
      page: juz.page,
      status: summarizeGroupStatus(juzSmoothAyahs, juzReviewSet.size, juzTotalAyahs),
      coveredAyahs,
      totalAyahs: juzTotalAyahs,
      needsReviewAyahs: Array.from(juzReviewSet),
    };
  });

  const reviewReasons: Record<AyahKey, string[]> = {};
  for (const [k, set] of reviewReasonsMap.entries()) {
    reviewReasons[k] = Array.from(set);
  }

  return {
    pages,
    surahs,
    juzs,
    summary: {
      totalAyahs,
      memorizedAyahs: smoothAyahs + needsReviewAyahs,
      smoothAyahs,
      needsReviewAyahs,
      memorizedPages,
    },
    reviewReasons,
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
