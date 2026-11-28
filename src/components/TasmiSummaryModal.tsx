import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  AyahKey,
  Catalog,
  HalaqahMembership,
  MurajaahCard,
  MushafMap,
  SurahInfo,
  TasmiSessionRecord,
} from "../data/types";
import type { GlyphPageLoader } from "../services/glyph-pages";
import {
  computeHafalanProgress,
  computeHafalanStreak,
  type HafalanStatus,
} from "../services/hafalan-stats";
import { extractDrillAyahs, formatDueLabel, murajaahCardId } from "../services/murajaah-srs";
import {
  ERROR_CLASS_LABELS,
  ERROR_CLASS_LABELS_EN,
  formatErrorClass,
  type DeclaredPassage,
} from "../services/tasmi-logic";
import type { NewMurajaahInput } from "../services/user-store";
import { GlassSelect } from "./GlassSelect";
import { useI18n } from "../i18n";
import { useBackClose } from "../state/useBackClose";

export type TasmiSummaryTab = "progress" | "history" | "schedule";

export interface TasmiSummaryModalProps {
  open: boolean;
  initialTab: TasmiSummaryTab;
  /** When true, opens directly as a standalone Summary popup (e.g. when a Tasmi' session finishes). */
  summaryOnly?: boolean;
  record: TasmiSessionRecord | null;
  history: TasmiSessionRecord[];
  archivedIds?: Set<string>;
  murajaahCards?: MurajaahCard[];
  archivedMurajaahIds?: Set<string>;
  surahs: SurahInfo[];
  catalog?: Pick<Catalog, "surahs" | "juzs">;
  mushafMap?: Pick<MushafMap, "pages" | "ayahToPage">;
  halaqahs?: HalaqahMembership[];
  getAyahWords: (surah: number, ayah: number) => string[];
  glyphLoader?: GlyphPageLoader;
  ayahToPage?: Record<AyahKey, number>;
  onClose: () => void;
  onPlayAyah: (ayah: AyahKey) => void;
  onJumpToAyah: (ayah: AyahKey) => void;
  onJumpToPage?: (page: number) => void;
  onStartDrill?: (ayahs: AyahKey[]) => void;
  onStartTasmiPassage?: (passage: DeclaredPassage) => void;
  onStartMurajaahCard?: (card: MurajaahCard) => void;
  onAddMurajaahCard?: (input: NewMurajaahInput) => void;
  onMarkMurajaahReviewed?: (id: string) => void;
  onDeleteMurajaahCard?: (id: string) => void;
  onToggleArchiveMurajaahCard?: (id: string, archived: boolean) => void;
  onDeleteHistory?: (id: string) => void;
  onToggleArchiveHistory?: (id: string, archived: boolean) => void;
  onSubmitToHalaqah?: (membership: HalaqahMembership, record: TasmiSessionRecord) => Promise<void>;
}

interface QcfGlyph {
  code: string;
  fontFamily: string;
}

const BREAKDOWN_CLASSES = [
  "wrong_word",
  "omitted_word",
  "added_word",
  "skipped_passage",
  "peeked",
] as const;

function formatDuration(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string, lang: "id" | "en" = "id"): string {
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function evaluateRecord(
  record: TasmiSessionRecord,
  lang: "id" | "en" = "id",
): {
  label: string;
  tone: "clean" | "warn" | "muted";
  emptyNote: string;
  progressText: string | null;
} {
  const isEn = lang === "en";
  const totalAyahs = Math.max(1, record.toAyah - record.fromAyah + 1);
  const hasCounts = typeof record.recitedWords === "number" || typeof record.recitedAyahs === "number";
  const words = record.recitedWords ?? 0;
  const ayahs = record.recitedAyahs ?? 0;
  const progressText = hasCounts
    ? isEn
      ? `${ayahs}/${totalAyahs} ayahs · ${words} words recited`
      : `${ayahs}/${totalAyahs} ayat · ${words} kata terbaca`
    : null;

  if (hasCounts && words === 0 && ayahs === 0) {
    return {
      label: isEn ? "No recitation yet" : "Belum ada bacaan",
      tone: "muted",
      emptyNote: isEn
        ? "No recitation was detected in this session. Make sure your microphone is enabled and recite clearly."
        : "Belum ada bacaan yang terdeteksi pada sesi ini. Pastikan mikrofon aktif dan bacalah dengan suara yang jelas.",
      progressText,
    };
  }
  if (record.mistakes.length > 0) {
    return {
      label: isEn
        ? `${record.mistakes.length} ${record.mistakes.length === 1 ? "note" : "notes"}`
        : `${record.mistakes.length} catatan`,
      tone: "warn",
      emptyNote: "",
      progressText,
    };
  }
  if (hasCounts && ayahs < totalAyahs) {
    return {
      label: isEn ? `${ayahs}/${totalAyahs} ayahs` : `${ayahs}/${totalAyahs} ayat`,
      tone: "muted",
      emptyNote: isEn
        ? `Recited ${ayahs} of ${totalAyahs} ayahs (${words} words) with no confirmed mistakes.`
        : `Terbaca ${ayahs} dari ${totalAyahs} ayat (${words} kata) tanpa kesalahan terkonfirmasi.`,
      progressText,
    };
  }
  return {
    label: isEn ? "Smooth" : "Lancar",
    tone: "clean",
    emptyNote: isEn
      ? "Alhamdulillah, no memorization mistakes were confirmed in this session."
      : "Alhamdulillah, tidak ada kesalahan hafalan yang terkonfirmasi pada sesi ini.",
    progressText,
  };
}

export function TasmiSummaryModal({
  open,
  initialTab,
  summaryOnly = false,
  record,
  history,
  archivedIds,
  murajaahCards = [],
  archivedMurajaahIds,
  surahs,
  catalog,
  mushafMap,
  halaqahs = [],
  getAyahWords,
  glyphLoader,
  ayahToPage,
  onClose,
  onPlayAyah,
  onJumpToAyah,
  onJumpToPage,
  onStartDrill,
  onStartTasmiPassage,
  onStartMurajaahCard,
  onAddMurajaahCard,
  onMarkMurajaahReviewed,
  onDeleteMurajaahCard,
  onToggleArchiveMurajaahCard,
  onDeleteHistory,
  onToggleArchiveHistory,
  onSubmitToHalaqah,
}: TasmiSummaryModalProps) {
  const { lang, isEn, tr } = useI18n();
  const errorClassLabels = isEn ? ERROR_CLASS_LABELS_EN : ERROR_CLASS_LABELS;
  const resolvedInitialTab: TasmiSummaryTab =
    initialTab === "progress" && (!catalog || !mushafMap) ? "history" : initialTab;
  const [tab, setTab] = useState<TasmiSummaryTab>(resolvedInitialTab);
  const [historyFilter, setHistoryFilter] = useState<"active" | "archived">("active");
  const [scheduleFilter, setScheduleFilter] = useState<"active" | "archived">("active");
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [schedSurah, setSchedSurah] = useState(78);
  const [schedFrom, setSchedFrom] = useState(1);
  const [schedTo, setSchedTo] = useState(10);
  const [schedInterval, setSchedInterval] = useState(3);
  const [schedNote, setSchedNote] = useState("");
  const [popupRecord, setPopupRecord] = useState<TasmiSessionRecord | null>(null);
  const [qcfByAyah, setQcfByAyah] = useState<Record<string, QcfGlyph[]>>({});
  const [mapView, setMapView] = useState<"juz" | "surah" | "page">("juz");
  const [statusFilter, setStatusFilter] = useState<"all" | HafalanStatus>("all");
  const [selectedProgressKey, setSelectedProgressKey] = useState<string | null>(null);
  const [selectedHalaqahCode, setSelectedHalaqahCode] = useState<string>("");
  const [submittingHalaqah, setSubmittingHalaqah] = useState(false);
  const [submittedRecordId, setSubmittedRecordId] = useState<string | null>(null);

  useBackClose(Boolean(open && !summaryOnly && popupRecord), () => setPopupRecord(null));

  const streak = useMemo(() => computeHafalanStreak(history, undefined, lang), [history, lang]);
  const progressMap = useMemo(() => {
    if (!catalog || !mushafMap || tab !== "progress") return null;
    return computeHafalanProgress(murajaahCards, history, catalog, mushafMap);
  }, [catalog, mushafMap, murajaahCards, history, tab]);

  const activeHistory = useMemo(
    () => (archivedIds && archivedIds.size > 0 ? history.filter((item) => !archivedIds.has(item.id)) : history),
    [history, archivedIds],
  );
  const activeMurajaahCount = useMemo(
    () =>
      archivedMurajaahIds && archivedMurajaahIds.size > 0
        ? murajaahCards.filter((card) => !archivedMurajaahIds.has(card.id)).length
        : murajaahCards.length,
    [murajaahCards, archivedMurajaahIds],
  );
  const archivedHistory = useMemo(
    () => (archivedIds && archivedIds.size > 0 ? history.filter((item) => archivedIds.has(item.id)) : []),
    [history, archivedIds],
  );
  const visibleHistory = historyFilter === "archived" && archivedHistory.length > 0 ? archivedHistory : activeHistory;

  useEffect(() => {
    if (historyFilter === "archived" && archivedHistory.length === 0) {
      setHistoryFilter("active");
    }
  }, [historyFilter, archivedHistory.length]);

  const surahByNum = useMemo(() => {
    const map = new Map<number, SurahInfo>();
    for (const s of surahs) map.set(s.number, s);
    return map;
  }, [surahs]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab === "progress" && (!catalog || !mushafMap) ? "history" : initialTab);
    setPopupRecord(null);
    // Omit `history` so async addTasmiHistory updates don't reset the user's open tab or record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab, summaryOnly, record]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!summaryOnly && popupRecord) {
          setPopupRecord(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, summaryOnly, popupRecord, onClose]);

  const activeRecord = summaryOnly ? (record ?? history[0] ?? null) : popupRecord;
  const showingSummaryPopup = Boolean(open && activeRecord && (summaryOnly || popupRecord !== null));

  useEffect(() => {
    if (!showingSummaryPopup || !activeRecord || !glyphLoader || !ayahToPage) return;
    if (activeRecord.mistakes.length === 0) return;

    const neededPages = new Set<number>();
    const ayahKeys = new Set<AyahKey>();
    for (const m of activeRecord.mistakes) {
      const key: AyahKey = `${m.surah}:${m.ayah}`;
      ayahKeys.add(key);
      const p = ayahToPage[key];
      if (p) {
        neededPages.add(p);
        if (p < 604) neededPages.add(p + 1);
      }
    }
    if (neededPages.size === 0) return;

    let live = true;
    const sortedPages = Array.from(neededPages).sort((a, b) => a - b);
    void Promise.all(
      sortedPages.map((p) => glyphLoader.load(p).catch(() => null)),
    ).then((loaded) => {
      if (!live) return;
      const map: Record<string, QcfGlyph[]> = {};
      for (const data of loaded) {
        if (!data) continue;
        for (const line of data.lines) {
          for (const w of line.words) {
            if (!ayahKeys.has(w.ayah)) continue;
            (map[w.ayah] ??= []).push({ code: w.code, fontFamily: w.fontFamily ?? data.fontFamily });
          }
        }
      }
      setQcfByAyah(map);
    });

    return () => {
      live = false;
    };
  }, [showingSummaryPopup, activeRecord, glyphLoader, ayahToPage]);

  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cls of BREAKDOWN_CLASSES) counts[cls] = 0;
    if (activeRecord) {
      for (const m of activeRecord.mistakes) {
        counts[m.errorClass] = (counts[m.errorClass] ?? 0) + 1;
      }
    }
    return counts;
  }, [activeRecord]);

  const drillAyahs = useMemo(() => extractDrillAyahs(activeRecord), [activeRecord]);
  const activeCard = useMemo(() => {
    if (!activeRecord) return null;
    const id = murajaahCardId(activeRecord.surah, activeRecord.fromAyah, activeRecord.toAyah);
    return murajaahCards.find((c) => c.id === id) ?? null;
  }, [activeRecord, murajaahCards]);
  const sortedCards = useMemo(
    () => [...murajaahCards].sort((a, b) => (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0)),
    [murajaahCards],
  );

  if (!open) return null;

  const renderSummaryContent = (targetRecord: TasmiSessionRecord) => {
    const status = evaluateRecord(targetRecord, lang);
    return (
      <>
        <div className="tasmi-summary__hero">
          <div>
            <div className="tasmi-summary__surah">
              {surahByNum.get(targetRecord.surah)?.name ?? `Surah ${targetRecord.surah}`} ·{" "}
              {tr("Ayat", "Ayah")} {targetRecord.fromAyah}–{targetRecord.toAyah}
            </div>
            <div className="tasmi-summary__meta">
              {tr("Durasi", "Duration")} {formatDuration(targetRecord.durationSec)} ·{" "}
              {formatDate(targetRecord.startedAt, lang)}
              {status.progressText ? ` · ${status.progressText}` : ""}
              {targetRecord.peekedAyahs && targetRecord.peekedAyahs.length > 0
                ? ` · ${targetRecord.peekedAyahs.length} ${tr("diintip", "peeked")}`
                : ""}
            </div>
          </div>
          <div className={`tasmi-summary__score tasmi-summary__score--${status.tone}`}>
            {status.label}
          </div>
        </div>

        {activeCard && (
          <div className="tasmi-summary__schedule-note">
            {tr("Jadwal Muraja'ah berikutnya:", "Next Muraja'ah review:")}{" "}
            <strong>{formatDueLabel(activeCard.dueAt, undefined, lang)}</strong> (
            {tr(`interval ${activeCard.stabilityDays} hari`, `${activeCard.stabilityDays}-day interval`)})
          </div>
        )}

        {drillAyahs.length > 0 && onStartDrill && (
          <button
            type="button"
            className="tasmi-summary__drill-btn"
            onClick={() => onStartDrill(drillAyahs)}
          >
            {tr(`Latih Kesalahan (${drillAyahs.length} ayat)`, `Drill Mistakes (${drillAyahs.length} ayahs)`)}
          </button>
        )}

        {halaqahs.length > 0 && onSubmitToHalaqah && (
          <div className="halaqah-submit-row">
            {halaqahs.length > 1 && (
              <GlassSelect
                ariaLabel={tr("Pilih Halaqah", "Select Halaqah")}
                value={selectedHalaqahCode || halaqahs[0].code}
                options={halaqahs.map((h) => ({ value: h.code, label: h.name }))}
                onChange={setSelectedHalaqahCode}
              />
            )}
            <button
              type="button"
              className="tasmi-sheet__history-btn halaqah-submit-btn"
              disabled={submittingHalaqah || submittedRecordId === targetRecord.id}
              onClick={() => {
                const target =
                  halaqahs.find((h) => h.code === selectedHalaqahCode) ?? halaqahs[0];
                if (!target) return;
                setSubmittingHalaqah(true);
                void onSubmitToHalaqah(target, targetRecord)
                  .then(() => setSubmittedRecordId(targetRecord.id))
                  .finally(() => setSubmittingHalaqah(false));
              }}
            >
              {submittedRecordId === targetRecord.id
                ? tr("✓ Terkirim ke Halaqah", "✓ Sent to Halaqah")
                : submittingHalaqah
                  ? tr("Mengirim…", "Sending…")
                  : `${tr("Kirim ke Halaqah", "Send to Halaqah")}${halaqahs.length === 1 ? ` (${halaqahs[0].name})` : ""}`}
            </button>
          </div>
        )}

        <div className="tasmi-summary__breakdown">
          {BREAKDOWN_CLASSES.map((cls) => (
            <div key={cls} className="tasmi-summary__stat">
              <span className="tasmi-summary__stat-val">{breakdown[cls] ?? 0}</span>
              <span className="tasmi-summary__stat-lbl">{errorClassLabels[cls]}</span>
            </div>
          ))}
        </div>

        {targetRecord.mistakes.length === 0 ? (
          <div className="tasmi-summary__empty">{status.emptyNote}</div>
        ) : (
          <div className="tasmi-summary__list">
            {targetRecord.mistakes.map((m) => {
              const ayahKey: AyahKey = `${m.surah}:${m.ayah}`;
              const words = getAyahWords(m.surah, m.ayah);
              const surahName = surahByNum.get(m.surah)?.name ?? `Surah ${m.surah}`;

              return (
                <div key={m.id} className="tasmi-summary__mistake">
                  <div className="tasmi-summary__mistake-head">
                    <span className="tasmi-summary__mistake-badge">
                      {formatErrorClass(m.errorClass, lang)}
                    </span>
                    <span className="tasmi-summary__mistake-loc">
                      {surahName} : {m.ayah}
                      {m.word ? ` (${tr("kata", "word")} ${m.word})` : ""}
                    </span>
                  </div>

                  {words.length > 0 ? (() => {
                    const rawQcf = qcfByAyah[ayahKey];
                    const qcf = rawQcf && rawQcf.length - 1 === words.length ? rawQcf.slice(0, -1) : null;
                    return (
                      <div
                        className={`tasmi-summary__arabic ${qcf ? "tasmi-summary__arabic--qcf" : ""}`}
                        dir="rtl"
                        lang="ar"
                      >
                        {words.map((w, idx) => (
                          <span
                            key={idx}
                            className={
                              m.word === idx + 1 ? "tasmi-summary__word--flagged" : undefined
                            }
                            style={qcf ? { fontFamily: `"${qcf[idx].fontFamily}"` } : undefined}
                          >
                            {qcf ? qcf[idx].code : w}{" "}
                          </span>
                        ))}
                      </div>
                    );
                  })() : m.wordText ? (
                    <div className="tasmi-summary__arabic" dir="rtl" lang="ar">
                      <span className="tasmi-summary__word--flagged">{m.wordText}</span>
                    </div>
                  ) : null}

                  <div className="tasmi-summary__mistake-actions">
                    <button
                      type="button"
                      className="tasmi-summary__play-btn"
                      onClick={() => onPlayAyah(ayahKey)}
                    >
                      {tr("▶ Dengar Murottal", "▶ Play Audio")}
                    </button>
                    <button
                      type="button"
                      className="tasmi-summary__jump-btn"
                      onClick={() => onJumpToAyah(ayahKey)}
                    >
                      {tr("Buka Ayat", "Open Ayah")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  if (summaryOnly) {
    return (
      <div
        className="palette-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Ringkasan Tasmi'", "Tasmi' Summary")}
        onClick={onClose}
      >
        <div className="tasmi-summary" onClick={(e) => e.stopPropagation()}>
          <div className="tasmi-sheet__header">
            <div>
              <h2 className="tasmi-sheet__title">{tr("Ringkasan Tasmi'", "Tasmi' Summary")}</h2>
              <p className="tasmi-sheet__subtitle">
                {tr("Hasil bacaan Tasmi' yang baru saja selesai", "Result of your completed Tasmi' session")}
              </p>
            </div>
            <button
              type="button"
              className="ayah-popover__close"
              aria-label={tr("Tutup", "Close")}
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div className="tasmi-summary__body">
            {activeRecord ? (
              renderSummaryContent(activeRecord)
            ) : (
              <div className="tasmi-summary__empty">
                {tr("Belum ada sesi Tasmi' yang selesai.", "No completed Tasmi' sessions yet.")}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Evaluasi Tasmi'", "Tasmi' Evaluation")}
      onClick={onClose}
    >
      <div className="tasmi-summary" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">{tr("Evaluasi Tasmi'", "Tasmi' Evaluation")}</h2>
            <p className="tasmi-sheet__subtitle">
              {tr("Pantau progres hafalan, riwayat setoran, dan jadwal muraja'ah", "Track memorization progress, session history, and revision schedule")}
            </p>
          </div>
          <button
            type="button"
            className="ayah-popover__close"
            aria-label={tr("Tutup", "Close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="tasmi-sheet__modes" role="tablist">
          {catalog && mushafMap && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "progress"}
              className={`tasmi-sheet__mode-btn ${
                tab === "progress" ? "tasmi-sheet__mode-btn--active" : ""
              }`}
              onClick={() => setTab("progress")}
            >
              {tr("Progres", "Progress")}
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            className={`tasmi-sheet__mode-btn ${
              tab === "history" ? "tasmi-sheet__mode-btn--active" : ""
            }`}
            onClick={() => setTab("history")}
          >
            {tr("Riwayat", "History")} ({activeHistory.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "schedule"}
            className={`tasmi-sheet__mode-btn ${
              tab === "schedule" ? "tasmi-sheet__mode-btn--active" : ""
            }`}
            onClick={() => setTab("schedule")}
          >
            {tr("Jadwal", "Schedule")} ({activeMurajaahCount})
          </button>
        </div>

        <div className="tasmi-summary__body">
          {tab === "history" ? (
            history.length === 0 ? (
              <div className="tasmi-summary__empty">
                {tr(
                  "Riwayat Tasmi' masih kosong. Selesaikan satu sesi untuk menyimpannya di sini.",
                  "Your Tasmi' history is empty. Finish a session to save it here.",
                )}
              </div>
            ) : (
              <div className="tasmi-summary__history-list">
                {archivedHistory.length > 0 && (
                  <div
                    className="app-menu__segmented tasmi-summary__history-filter"
                    role="tablist"
                    aria-label={tr("Filter riwayat Tasmi'", "Filter Tasmi' history")}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={historyFilter === "active"}
                      className={`app-menu__seg ${historyFilter === "active" ? "app-menu__seg--active" : ""}`}
                      onClick={() => setHistoryFilter("active")}
                    >
                      {tr("Aktif", "Active")} ({activeHistory.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={historyFilter === "archived"}
                      className={`app-menu__seg ${historyFilter === "archived" ? "app-menu__seg--active" : ""}`}
                      onClick={() => setHistoryFilter("archived")}
                    >
                      {tr("Arsip", "Archived")} ({archivedHistory.length})
                    </button>
                  </div>
                )}

                {(onDeleteHistory || onToggleArchiveHistory) && visibleHistory.length > 0 && (
                  <p className="tasmi-summary__history-hint">
                    {tr(
                      "Geser ke kiri atau ketuk ikon untuk arsipkan atau hapus riwayat.",
                      "Swipe left or tap an icon to archive or delete history.",
                    )}
                  </p>
                )}

                {visibleHistory.length === 0 ? (
                  <div className="tasmi-summary__empty">
                    {tr("Semua riwayat saat ini berada di Arsip.", "All history entries are currently archived.")}
                  </div>
                ) : (
                  visibleHistory.map((item) => {
                    const sName = surahByNum.get(item.surah)?.name ?? `Surah ${item.surah}`;
                    const isArchived = Boolean(archivedIds?.has(item.id));
                    const status = evaluateRecord(item, lang);
                    return (
                      <SwipeableHistoryRow
                        key={item.id}
                        title={`${sName} · ${tr("Ayat", "Ayah")} ${item.fromAyah}–${item.toAyah}`}
                        sub={`${formatDate(item.startedAt, lang)} · ${formatDuration(item.durationSec)}`}
                        scoreLabel={status.label}
                        scoreTone={status.tone}
                        archived={isArchived}
                        onSelect={() => {
                          setPopupRecord(item);
                        }}
                        onToggleArchive={
                          onToggleArchiveHistory
                            ? () => onToggleArchiveHistory(item.id, !isArchived)
                            : undefined
                        }
                        onDelete={
                          onDeleteHistory
                            ? () => {
                                if (popupRecord?.id === item.id) {
                                  setPopupRecord(null);
                                }
                                onDeleteHistory(item.id);
                              }
                            : undefined
                        }
                      />
                    );
                  })
                )}
              </div>
            )
          ) : tab === "progress" && progressMap ? (() => {
            const activeItems =
              mapView === "juz"
                ? progressMap.juzs.map((j) => ({
                    key: `juz-${j.juz}`,
                    title: `Juz ${j.juz}`,
                    page: j.page,
                    status: j.status,
                    coveredAyahs: j.coveredAyahs,
                    totalAyahs: j.totalAyahs,
                    needsReviewAyahs: j.needsReviewAyahs,
                    surahNumber: undefined as number | undefined,
                    sub: j.coveredAyahs > 0 ? `${j.coveredAyahs}/${j.totalAyahs}` : `${tr("Hal.", "p.")} ${j.page}`,
                    compactLabel: `Juz ${j.juz}`,
                  }))
                : mapView === "surah"
                  ? progressMap.surahs.map((s) => ({
                      key: `surah-${s.surah}`,
                      title: `${s.surah}. ${s.name}`,
                      page: s.page,
                      status: s.status,
                      coveredAyahs: s.coveredAyahs,
                      totalAyahs: s.totalAyahs,
                      needsReviewAyahs: s.needsReviewAyahs,
                      surahNumber: s.surah,
                      sub: `${s.coveredAyahs}/${s.totalAyahs}`,
                      compactLabel: `${s.surah}. ${s.name}`,
                    }))
                  : progressMap.pages.map((p) => ({
                      key: `page-${p.page}`,
                      title: `${tr("Halaman", "Page")} ${p.page}`,
                      page: p.page,
                      status: p.status,
                      coveredAyahs: p.coveredAyahs,
                      totalAyahs: p.totalAyahs,
                      needsReviewAyahs: p.needsReviewAyahs,
                      surahNumber: undefined as number | undefined,
                      sub: `${p.coveredAyahs}/${p.totalAyahs}`,
                      compactLabel: String(p.page),
                    }));

            const statusCounts = {
              smooth: 0,
              needs_review: 0,
              none: 0,
            };
            for (const item of activeItems) {
              if (item.status === "smooth") statusCounts.smooth += 1;
              else if (item.status === "needs_review") statusCounts.needs_review += 1;
              else statusCounts.none += 1;
            }

            const filteredItems =
              statusFilter === "all"
                ? activeItems
                : statusFilter === "none"
                  ? activeItems.filter((item) => item.status === "none" || item.status === "in_progress")
                  : activeItems.filter((item) => item.status === statusFilter);

            const selectedItem =
              selectedProgressKey
                ? activeItems.find((item) => item.key === selectedProgressKey) ?? null
                : null;

            const latestMatchingRecord = selectedItem
              ? history.find((rec) => {
                  if (selectedItem.surahNumber !== undefined) {
                    return rec.surah === selectedItem.surahNumber;
                  }
                  if (mapView === "page") {
                    const p = ayahToPage?.[`${rec.surah}:${rec.fromAyah}`];
                    const pEnd = ayahToPage?.[`${rec.surah}:${rec.toAyah}`];
                    return p !== undefined && pEnd !== undefined && selectedItem.page >= p && selectedItem.page <= pEnd;
                  }
                  if (mapView === "juz" && catalog) {
                    const juzIdx = catalog.juzs.findIndex((j) => `juz-${j.number}` === selectedItem.key);
                    const curJuz = catalog.juzs[juzIdx];
                    const nextJuz = catalog.juzs[juzIdx + 1];
                    const recPage = ayahToPage?.[`${rec.surah}:${rec.fromAyah}`];
                    if (!curJuz || !recPage) return false;
                    const endPage = nextJuz ? nextJuz.page - 1 : 604;
                    return recPage >= curJuz.page && recPage <= endPage;
                  }
                  return false;
                }) ?? null
              : null;

            const statusLabel = (st: HafalanStatus) =>
              st === "smooth"
                ? tr("Lancar", "Smooth")
                : st === "in_progress"
                  ? tr("Sebagian", "In progress")
                  : st === "needs_review"
                    ? tr("Perlu ulang", "Needs review")
                    : tr("Belum", "Not yet");

            const formatReason = (reason: string) =>
              reason === "murajaah_lapse"
                ? tr("Perlu muraja'ah", "Review due")
                : formatErrorClass(reason, lang);

            return (
            <div className="progress-tab">
              <div className="streak-card">
                <div className="streak-card__stats">
                  <div className="streak-card__stat">
                    <span className="streak-card__val">
                      {streak.currentStreak} {tr("hari", streak.currentStreak === 1 ? "day" : "days")}
                    </span>
                    <span className="streak-card__lbl">{tr("Streak aktif", "Current streak")}</span>
                  </div>
                  <div className="streak-card__stat">
                    <span className="streak-card__val">
                      {streak.longestStreak} {tr("hari", streak.longestStreak === 1 ? "day" : "days")}
                    </span>
                    <span className="streak-card__lbl">{tr("Rekor terbaik", "Best streak")}</span>
                  </div>
                  <div className="streak-card__stat">
                    <span className="streak-card__val">
                      {tr(
                        `${streak.todaySessions} sesi · ${streak.todayMinutes} mnt`,
                        `${streak.todaySessions} ${streak.todaySessions === 1 ? "session" : "sessions"} · ${streak.todayMinutes} min`,
                      )}
                    </span>
                    <span className="streak-card__lbl">
                      {tr(
                        `Hari ini (${streak.todayAyahs} ayat)`,
                        `Today (${streak.todayAyahs} ${streak.todayAyahs === 1 ? "ayah" : "ayahs"})`,
                      )}
                    </span>
                  </div>
                </div>
                <div className="streak-card__week" aria-label={tr("Aktivitas 7 hari terakhir", "Last 7 days activity")}>
                  {streak.weekDays.map((d) => (
                    <div
                      key={d.dateKey}
                      className={`streak-card__day ${d.active ? "streak-card__day--active" : ""}`}
                      title={`${d.label}: ${d.sessions} ${tr("sesi", d.sessions === 1 ? "session" : "sessions")}`}
                    >
                      <span className="streak-card__day-dot" />
                      <span className="streak-card__day-lbl">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="progress-map__header">
                <div className="progress-map__summary">
                  <strong>{progressMap.summary.memorizedPages}/604</strong> {tr("hal", "pages")} ·{" "}
                  <strong>{progressMap.summary.memorizedAyahs}</strong> {tr("ayat tersentuh", "ayahs covered")}
                </div>
                <div
                  className="app-menu__segmented"
                  role="tablist"
                  aria-label={tr("Tampilan peta hafalan", "Memorization map view")}
                >
                  {(["juz", "surah", "page"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={mapView === v}
                      className={`app-menu__seg ${mapView === v ? "app-menu__seg--active" : ""}`}
                      onClick={() => {
                        setMapView(v);
                        setSelectedProgressKey(null);
                      }}
                    >
                      {v === "juz" ? "30 Juz" : v === "surah" ? "114 Surah" : tr("604 Hal", "604 Pages")}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="progress-map__legend progress-map__filters"
                role="group"
                aria-label={tr("Filter status hafalan", "Filter memorization status")}
              >
                {(
                  [
                    ["all", tr("Semua", "All"), activeItems.length, null],
                    ["needs_review", tr("Ulang", "Review"), statusCounts.needs_review, "needs_review"],
                    ["smooth", tr("Lancar", "Smooth"), statusCounts.smooth, "smooth"],
                    ["none", tr("Belum", "Left"), statusCounts.none, "none"],
                  ] as const
                ).map(([value, label, count, dot]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={statusFilter === value}
                    className={`pm-filter-pill ${statusFilter === value ? "pm-filter-pill--active" : ""}`}
                    onClick={() => {
                      setStatusFilter((prev) => (prev === value && value !== "all" ? "all" : value));
                      setSelectedProgressKey(null);
                    }}
                  >
                    {dot && <i className={`pm-dot pm-dot--${dot}`} />}
                    <span>{label}</span>
                    {value !== "all" && count > 0 && <span className="pm-filter-pill__count">{count}</span>}
                  </button>
                ))}
              </div>

              {selectedItem && (
                <div className="progress-detail" role="region" aria-label={selectedItem.title}>
                  <div className="progress-detail__head">
                    <div>
                      <div className="progress-detail__title">{selectedItem.title}</div>
                      <div className="progress-detail__sub">
                        {selectedItem.coveredAyahs}/{selectedItem.totalAyahs} {tr("ayat", "ayahs")} ·{" "}
                        {tr("Hal.", "p.")} {selectedItem.page}
                        {selectedItem.needsReviewAyahs.length > 0
                          ? ` · ${selectedItem.needsReviewAyahs.length} ${tr("perlu diulang", "need review")}`
                          : ""}
                      </div>
                    </div>
                    <div className="progress-detail__head-right">
                      <span
                        className={`tasmi-summary__score tasmi-summary__score--${
                          selectedItem.status === "needs_review"
                            ? "warn"
                            : selectedItem.status === "smooth"
                              ? "clean"
                              : "muted"
                        }`}
                      >
                        {statusLabel(selectedItem.status)}
                      </span>
                      <button
                        type="button"
                        className="ayah-popover__close"
                        aria-label={tr("Tutup detail", "Close details")}
                        onClick={() => setSelectedProgressKey(null)}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {selectedItem.needsReviewAyahs.length > 0 && (
                    <div className="progress-detail__review">
                      <div className="progress-detail__review-label">
                        {tr(
                          `Ayat yang perlu diulang (${selectedItem.needsReviewAyahs.length})`,
                          `Ayahs needing review (${selectedItem.needsReviewAyahs.length})`,
                        )}
                      </div>
                      <div className="progress-detail__chips">
                        {selectedItem.needsReviewAyahs.slice(0, 24).map((ayahKey) => {
                          const [sNum, aNum] = ayahKey.split(":").map(Number);
                          const sName = surahByNum.get(sNum)?.name ?? `Surah ${sNum}`;
                          const reasons = progressMap.reviewReasons[ayahKey] ?? [];
                          const reasonText = reasons[0] ? formatReason(reasons[0]) : "";
                          return (
                            <button
                              key={ayahKey}
                              type="button"
                              className="progress-detail__chip"
                              onClick={() => onJumpToAyah(ayahKey)}
                            >
                              <span>{sName} : {aNum}</span>
                              {reasonText && <small>{reasonText}</small>}
                            </button>
                          );
                        })}
                        {selectedItem.needsReviewAyahs.length > 24 && (
                          <span className="progress-detail__more">
                            +{selectedItem.needsReviewAyahs.length - 24} {tr("lainnya", "more")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="progress-detail__actions">
                    {latestMatchingRecord && (
                      <button
                        type="button"
                        className="tasmi-sheet__history-btn"
                        onClick={() => setPopupRecord(latestMatchingRecord)}
                      >
                        {tr("Lihat Ringkasan", "View Summary")}
                      </button>
                    )}
                    {selectedItem.needsReviewAyahs.length > 0 && onStartDrill && (
                      <button
                        type="button"
                        className="tasmi-summary__drill-btn progress-detail__drill-btn"
                        onClick={() => onStartDrill(selectedItem.needsReviewAyahs)}
                      >
                        {tr(
                          `Latih Kesalahan (${selectedItem.needsReviewAyahs.length} ayat)`,
                          `Drill Mistakes (${selectedItem.needsReviewAyahs.length} ${selectedItem.needsReviewAyahs.length === 1 ? "ayah" : "ayahs"})`,
                        )}
                      </button>
                    )}
                    {selectedItem.surahNumber !== undefined && onStartTasmiPassage && (
                      <button
                        type="button"
                        className="tasmi-sheet__history-btn"
                        onClick={() =>
                          onStartTasmiPassage({
                            surah: selectedItem.surahNumber!,
                            fromAyah: 1,
                            toAyah: selectedItem.totalAyahs,
                          })
                        }
                      >
                        {tr("Mulai Tasmi'", "Start Tasmi'")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="tasmi-sheet__history-btn"
                      onClick={() => {
                        onJumpToPage?.(selectedItem.page);
                        onClose();
                      }}
                    >
                      {tr(`Buka Hal. ${selectedItem.page}`, `Open Page ${selectedItem.page}`)}
                    </button>
                  </div>
                </div>
              )}

              {filteredItems.length === 0 ? (
                <div className="tasmi-summary__empty">
                  {statusFilter === "needs_review"
                    ? tr(
                        "Alhamdulillah, tidak ada bagian yang perlu diulang saat ini.",
                        "Alhamdulillah, nothing currently needs review.",
                      )
                    : tr("Tidak ada data pada filter ini.", "No items match this filter.")}
                </div>
              ) : mapView === "page" ? (
                <div className="progress-grid progress-grid--page">
                  {filteredItems.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={selectedProgressKey === p.key}
                      className={`pm-page-dot pm-cell--${p.status} ${selectedProgressKey === p.key ? "pm-cell--selected" : ""}`}
                      title={`${p.title}: ${p.coveredAyahs}/${p.totalAyahs} ${tr("ayat", "ayahs")}`}
                      onClick={() =>
                        setSelectedProgressKey((prev) => (prev === p.key ? null : p.key))
                      }
                    >
                      {p.compactLabel}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`progress-grid progress-grid--${mapView}`}>
                  {filteredItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={selectedProgressKey === item.key}
                      className={`pm-cell pm-cell--${item.status} ${selectedProgressKey === item.key ? "pm-cell--selected" : ""}`}
                      title={`${item.title}: ${item.coveredAyahs}/${item.totalAyahs} ${tr("ayat", "ayahs")}`}
                      onClick={() =>
                        setSelectedProgressKey((prev) => (prev === item.key ? null : item.key))
                      }
                    >
                      <span className="pm-cell__num">{item.compactLabel}</span>
                      <span className="pm-cell__sub">
                        {item.needsReviewAyahs.length > 0
                          ? `${item.needsReviewAyahs.length} ${tr("ulang", "review")}`
                          : item.sub}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            );
          })() : (() => {
            const activeSched = sortedCards.filter((c) => !archivedMurajaahIds?.has(c.id));
            const archivedSched = sortedCards.filter((c) => archivedMurajaahIds?.has(c.id));
            const visibleSched =
              scheduleFilter === "archived" && archivedSched.length > 0 ? archivedSched : activeSched;
            const schedSurahInfo = surahByNum.get(schedSurah);
            const schedMaxAyah = schedSurahInfo?.ayahs ?? 286;

            return (
              <div className="tasmi-summary__history-list">
                {onAddMurajaahCard && (
                  <div className="schedule-toolbar">
                    <button
                      type="button"
                      className="tasmi-sheet__start-btn schedule-add-toggle"
                      onClick={() => setAddingSchedule((v) => !v)}
                    >
                      {addingSchedule ? tr("Tutup Form", "Close Form") : tr("+ Tambah Jadwal Sendiri", "+ Add Custom Schedule")}
                    </button>
                    {archivedSched.length > 0 && (
                      <div
                        className="app-menu__segmented"
                        role="tablist"
                        aria-label={tr("Filter jadwal", "Filter schedules")}
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={scheduleFilter === "active"}
                          className={`app-menu__seg ${scheduleFilter === "active" ? "app-menu__seg--active" : ""}`}
                          onClick={() => setScheduleFilter("active")}
                        >
                          {tr("Aktif", "Active")} ({activeSched.length})
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={scheduleFilter === "archived"}
                          className={`app-menu__seg ${scheduleFilter === "archived" ? "app-menu__seg--active" : ""}`}
                          onClick={() => setScheduleFilter("archived")}
                        >
                          {tr("Arsip", "Archived")} ({archivedSched.length})
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {addingSchedule && onAddMurajaahCard && (
                  <form
                    className="schedule-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const clampedFrom = Math.max(1, Math.min(schedFrom, schedMaxAyah));
                      const clampedTo = Math.max(clampedFrom, Math.min(schedTo, schedMaxAyah));
                      onAddMurajaahCard({
                        surah: schedSurah,
                        fromAyah: clampedFrom,
                        toAyah: clampedTo,
                        kind: "murajaah",
                        intervalDays: schedInterval,
                        note: schedNote,
                      });
                      setSchedNote("");
                      setAddingSchedule(false);
                    }}
                  >
                    <GlassSelect
                      ariaLabel={tr("Pilih Surah jadwal", "Select Surah for schedule")}
                      value={String(schedSurah)}
                      options={surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` }))}
                      onChange={(val) => {
                        const num = Number(val);
                        const info = surahByNum.get(num);
                        setSchedSurah(num);
                        setSchedFrom(1);
                        setSchedTo(info?.ayahs ?? 10);
                      }}
                    />
                    <div className="schedule-form__row">
                      <label className="tasmi-sheet__field">
                        <span>{tr("Dari ayat", "From ayah")}</span>
                        <input
                          type="number"
                          min={1}
                          max={schedMaxAyah}
                          value={schedFrom}
                          onChange={(e) => setSchedFrom(Number(e.target.value) || 1)}
                        />
                      </label>
                      <label className="tasmi-sheet__field">
                        <span>{tr("Sampai ayat", "To ayah")}</span>
                        <input
                          type="number"
                          min={1}
                          max={schedMaxAyah}
                          value={schedTo}
                          onChange={(e) => setSchedTo(Number(e.target.value) || 1)}
                        />
                      </label>
                    </div>
                    <GlassSelect
                      ariaLabel={tr("Interval ulang", "Review interval")}
                      value={String(schedInterval)}
                      options={[
                        { value: "1", label: tr("Tiap 1 hari", "Every 1 day") },
                        { value: "3", label: tr("Tiap 3 hari", "Every 3 days") },
                        { value: "7", label: tr("Tiap 7 hari", "Every 7 days") },
                        { value: "14", label: tr("Tiap 14 hari", "Every 14 days") },
                        { value: "30", label: tr("Tiap 30 hari", "Every 30 days") },
                      ]}
                      onChange={(v) => setSchedInterval(Number(v))}
                    />
                    <input
                      type="text"
                      className="palette__input"
                      placeholder={tr("Catatan jadwal (opsional, mis. Ba'da Subuh)", "Schedule note (optional, e.g. After Fajr)")}
                      value={schedNote}
                      onChange={(e) => setSchedNote(e.target.value)}
                    />
                    <button type="submit" className="tasmi-sheet__start-btn">
                      {tr("Simpan Jadwal", "Save Schedule")}
                    </button>
                  </form>
                )}

                {visibleSched.length === 0 ? (
                  <div className="tasmi-summary__empty">
                    {scheduleFilter === "archived"
                      ? tr("Belum ada jadwal di arsip.", "No archived schedules yet.")
                      : tr(
                          "Belum ada jadwal muraja'ah. Tambahkan jadwalmu sendiri di atas.",
                          "No muraja'ah schedule yet. Add your own schedule above.",
                        )}
                  </div>
                ) : (
                  visibleSched.map((card) => {
                    const sName = surahByNum.get(card.surah)?.name ?? `Surah ${card.surah}`;
                    const isUnreviewed = card.reps === 0 && card.lapses === 0;
                    const isDue = (Date.parse(card.dueAt) || 0) <= Date.now();
                    const isArchived = Boolean(archivedMurajaahIds?.has(card.id));
                    const badgeTone = isDue ? "warn" : isUnreviewed ? "muted" : "clean";
                    return (
                      <div key={card.id} className="schedule-card">
                        <div className="schedule-card__top">
                          <div>
                            <div className="tasmi-summary__history-title">
                              {sName} · {tr("Ayat", "Ayah")} {card.fromAyah}–{card.toAyah}
                            </div>
                            <div className="tasmi-summary__history-sub">
                              {tr(`Tiap ${card.stabilityDays} hari`, `Every ${card.stabilityDays} days`)}
                              {card.reps > 0
                                ? ` · ${card.reps}× ${tr("selesai", "done")}`
                                : ` · ${tr("Belum disetor", "Not recited yet")}`}
                              {card.note ? ` · ${card.note}` : ""}
                            </div>
                          </div>
                          <span className={`tasmi-summary__score tasmi-summary__score--${badgeTone}`}>
                            {formatDueLabel(card.dueAt, undefined, lang)}
                          </span>
                        </div>
                        <div className="schedule-card__actions">
                          {onStartMurajaahCard && !isArchived && (
                            <button
                              type="button"
                              className="tasmi-sheet__history-btn"
                              onClick={() => onStartMurajaahCard(card)}
                            >
                              Tasmi&apos;
                            </button>
                          )}
                          {onMarkMurajaahReviewed && !isArchived && (
                            <button
                              type="button"
                              className="tasmi-sheet__history-btn"
                              onClick={() => onMarkMurajaahReviewed(card.id)}
                            >
                              {tr("✓ Selesai", "✓ Done")}
                            </button>
                          )}
                          {onToggleArchiveMurajaahCard && (
                            <button
                              type="button"
                              className="tasmi-sheet__history-btn"
                              onClick={() => onToggleArchiveMurajaahCard(card.id, !isArchived)}
                            >
                              {isArchived ? tr("Pulihkan", "Restore") : tr("Arsip", "Archive")}
                            </button>
                          )}
                          {onDeleteMurajaahCard && (
                            <button
                              type="button"
                              className="manage-data__del-btn"
                              onClick={() => onDeleteMurajaahCard(card.id)}
                            >
                              {tr("Hapus", "Delete")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {popupRecord && (
        <div
          className="palette-backdrop tasmi-summary__popup-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={tr("Ringkasan Tasmi'", "Tasmi' Summary")}
          onClick={(e) => {
            e.stopPropagation();
            setPopupRecord(null);
          }}
        >
          <div className="tasmi-summary" onClick={(e) => e.stopPropagation()}>
            <div className="tasmi-sheet__header">
              <div>
                <h2 className="tasmi-sheet__title">{tr("Ringkasan Tasmi'", "Tasmi' Summary")}</h2>
                <p className="tasmi-sheet__subtitle">
                  {tr("Tinjau catatan bacaan dan dengarkan murottal untuk koreksi", "Review recitation notes and listen to audio for correction")}
                </p>
              </div>
              <button
                type="button"
                className="ayah-popover__close"
                aria-label={tr("Tutup", "Close")}
                onClick={() => setPopupRecord(null)}
              >
                ×
              </button>
            </div>
            <div className="tasmi-summary__body">
              {renderSummaryContent(popupRecord)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SWIPE_ACTION_PX = 76;

interface SwipeableHistoryRowProps {
  title: string;
  sub: string;
  scoreLabel: string;
  scoreTone: "clean" | "warn" | "muted";
  archived?: boolean;
  onSelect: () => void;
  onToggleArchive?: () => void;
  onDelete?: () => void;
}

function SwipeableHistoryRow({
  title,
  sub,
  scoreLabel,
  scoreTone,
  archived = false,
  onSelect,
  onToggleArchive,
  onDelete,
}: SwipeableHistoryRowProps) {
  const { tr } = useI18n();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const justDraggedRef = useRef(false);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    baseOffset: number;
    axis: "pending" | "x" | "y";
    moved: boolean;
  } | null>(null);

  const actionCount = (onToggleArchive ? 1 : 0) + (onDelete ? 1 : 0);
  const revealWidth = actionCount * SWIPE_ACTION_PX;
  const fullDeleteThreshold = revealWidth + 72;

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (actionCount === 0 || e.button > 0) return;
    if ((e.target as HTMLElement).closest(".tasmi-history-swipe__btns")) return;
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseOffset: offset,
      axis: "pending",
      moved: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.axis === "pending") {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        drag.axis = "x";
        drag.moved = true;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        drag.axis = "y";
        return;
      }
    }
    if (drag.axis !== "x") return;
    const maxPull = onDelete ? fullDeleteThreshold + 20 : revealWidth + 16;
    const next = Math.max(-maxPull, Math.min(0, drag.baseOffset + dx));
    setOffset(next);
  };

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    if (drag.axis !== "x") return;
    justDraggedRef.current = drag.moved;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (onDelete && offset <= -fullDeleteThreshold) {
      onDelete();
      return;
    }
    setOffset(offset <= -revealWidth / 2 ? -revealWidth : 0);
  };

  const archiveLabel = archived ? tr("Pulihkan", "Restore") : tr("Arsipkan", "Archive");
  const deleteLabel = tr("Hapus", "Delete");

  return (
    <div className="tasmi-history-swipe">
      {actionCount > 0 && (
        <div className="tasmi-history-swipe__tray" style={{ width: revealWidth }}>
          {onToggleArchive && (
            <button
              type="button"
              className="tasmi-history-swipe__action tasmi-history-swipe__action--archive"
              onClick={() => {
                setOffset(0);
                onToggleArchive();
              }}
              aria-label={`${archiveLabel} ${tr("riwayat", "history")} ${title}`}
              tabIndex={offset < 0 ? 0 : -1}
            >
              {archiveLabel}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="tasmi-history-swipe__action tasmi-history-swipe__action--delete"
              onClick={onDelete}
              aria-label={`${deleteLabel} ${tr("riwayat", "history")} ${title}`}
              tabIndex={offset < 0 ? 0 : -1}
            >
              {deleteLabel}
            </button>
          )}
        </div>
      )}
      <div
        className={`tasmi-summary__history-item tasmi-history-swipe__card ${
          dragging ? "tasmi-history-swipe__card--dragging" : ""
        }`}
        style={offset !== 0 ? { transform: `translateX(${offset}px)` } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <button
          type="button"
          className="tasmi-history-swipe__main"
          onClick={() => {
            if (justDraggedRef.current) {
              justDraggedRef.current = false;
              return;
            }
            if (offset < 0) {
              setOffset(0);
              return;
            }
            onSelect();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Delete" || e.key === "Backspace") && onDelete) {
              e.preventDefault();
              onDelete();
            }
          }}
        >
          <div className="tasmi-history-swipe__text">
            <div className="tasmi-summary__history-title">{title}</div>
            <div className="tasmi-summary__history-sub">{sub}</div>
          </div>
          <span className={`tasmi-summary__score tasmi-summary__score--${scoreTone}`}>
            {scoreLabel}
          </span>
        </button>

        {actionCount > 0 && (
          <div className="tasmi-history-swipe__btns">
            {onToggleArchive && (
              <button
                type="button"
                className="tasmi-history-swipe__icon-btn"
                onClick={onToggleArchive}
                aria-label={`${archiveLabel} ${tr("riwayat", "history")} ${title}`}
                title={archiveLabel}
              >
                {archived ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="20" height="5" x="2" y="3" rx="1" />
                    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                    <path d="M10 12h4" />
                  </svg>
                )}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="tasmi-history-swipe__icon-btn tasmi-history-swipe__icon-btn--danger"
                onClick={onDelete}
                aria-label={`${deleteLabel} ${tr("riwayat", "history")} ${title}`}
                title={deleteLabel}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
