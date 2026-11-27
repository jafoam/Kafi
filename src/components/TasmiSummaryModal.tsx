import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AyahKey, MurajaahCard, SurahInfo, TasmiSessionRecord } from "../data/types";
import type { GlyphPageLoader } from "../services/glyph-pages";
import { extractDrillAyahs, formatDueLabel, murajaahCardId } from "../services/murajaah-srs";
import { ERROR_CLASS_LABELS, formatErrorClass } from "../services/tasmi-logic";

export interface TasmiSummaryModalProps {
  open: boolean;
  initialTab: "summary" | "history" | "schedule";
  record: TasmiSessionRecord | null;
  history: TasmiSessionRecord[];
  archivedIds?: Set<string>;
  murajaahCards?: MurajaahCard[];
  surahs: SurahInfo[];
  getAyahWords: (surah: number, ayah: number) => string[];
  glyphLoader?: GlyphPageLoader;
  ayahToPage?: Record<AyahKey, number>;
  onClose: () => void;
  onPlayAyah: (ayah: AyahKey) => void;
  onJumpToAyah: (ayah: AyahKey) => void;
  onStartDrill?: (ayahs: AyahKey[]) => void;
  onStartMurajaahCard?: (card: MurajaahCard) => void;
  onDeleteHistory?: (id: string) => void;
  onToggleArchiveHistory?: (id: string, archived: boolean) => void;
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

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function evaluateRecord(record: TasmiSessionRecord): {
  label: string;
  tone: "clean" | "warn" | "muted";
  emptyNote: string;
  progressText: string | null;
} {
  const totalAyahs = Math.max(1, record.toAyah - record.fromAyah + 1);
  const hasCounts = typeof record.recitedWords === "number" || typeof record.recitedAyahs === "number";
  const words = record.recitedWords ?? 0;
  const ayahs = record.recitedAyahs ?? 0;
  const progressText = hasCounts
    ? `${ayahs}/${totalAyahs} ayat · ${words} kata terbaca`
    : null;

  if (hasCounts && words === 0 && ayahs === 0) {
    return {
      label: "Belum ada bacaan",
      tone: "muted",
      emptyNote:
        "Belum ada bacaan yang terdeteksi pada sesi ini. Pastikan mikrofon aktif dan bacalah dengan suara yang jelas.",
      progressText,
    };
  }
  if (record.mistakes.length > 0) {
    return {
      label: `${record.mistakes.length} catatan`,
      tone: "warn",
      emptyNote: "",
      progressText,
    };
  }
  if (hasCounts && ayahs < totalAyahs) {
    return {
      label: `${ayahs}/${totalAyahs} ayat`,
      tone: "muted",
      emptyNote: `Terbaca ${ayahs} dari ${totalAyahs} ayat (${words} kata) tanpa kesalahan terkonfirmasi.`,
      progressText,
    };
  }
  return {
    label: "Lancar",
    tone: "clean",
    emptyNote: "Alhamdulillah, tidak ada kesalahan hafalan yang terkonfirmasi pada sesi ini.",
    progressText,
  };
}

export function TasmiSummaryModal({
  open,
  initialTab,
  record,
  history,
  archivedIds,
  murajaahCards = [],
  surahs,
  getAyahWords,
  glyphLoader,
  ayahToPage,
  onClose,
  onPlayAyah,
  onJumpToAyah,
  onStartDrill,
  onStartMurajaahCard,
  onDeleteHistory,
  onToggleArchiveHistory,
}: TasmiSummaryModalProps) {
  const [tab, setTab] = useState<"summary" | "history" | "schedule">(initialTab);
  const [historyFilter, setHistoryFilter] = useState<"active" | "archived">("active");
  const [selectedRecord, setSelectedRecord] = useState<TasmiSessionRecord | null>(record);
  const [qcfByAyah, setQcfByAyah] = useState<Record<string, QcfGlyph[]>>({});

  const activeHistory = useMemo(
    () => (archivedIds && archivedIds.size > 0 ? history.filter((item) => !archivedIds.has(item.id)) : history),
    [history, archivedIds],
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
    setTab(initialTab);
    setSelectedRecord(record ?? history[0] ?? null);
    // Omit `history` so async addTasmiHistory updates don't reset the user's open tab or record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab, record]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const activeRecord = selectedRecord ?? record ?? history[0] ?? null;

  useEffect(() => {
    if (!open || tab !== "summary" || !activeRecord || !glyphLoader || !ayahToPage) return;
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
  }, [open, tab, activeRecord, glyphLoader, ayahToPage]);

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

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Ringkasan & Riwayat Tasmi'"
      onClick={onClose}
    >
      <div className="tasmi-summary" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">Evaluasi Tasmi&apos;</h2>
            <p className="tasmi-sheet__subtitle">
              Tinjau catatan bacaan dan dengarkan murottal untuk koreksi
            </p>
          </div>
          <button
            type="button"
            className="ayah-popover__close"
            aria-label="Tutup"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="tasmi-sheet__modes" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "summary"}
            className={`tasmi-sheet__mode-btn ${
              tab === "summary" ? "tasmi-sheet__mode-btn--active" : ""
            }`}
            onClick={() => setTab("summary")}
          >
            Ringkasan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            className={`tasmi-sheet__mode-btn ${
              tab === "history" ? "tasmi-sheet__mode-btn--active" : ""
            }`}
            onClick={() => setTab("history")}
          >
            Riwayat ({activeHistory.length})
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
            Jadwal ({murajaahCards.length})
          </button>
        </div>

        <div className="tasmi-summary__body">
          {tab === "summary" ? (
            activeRecord ? (() => {
              const status = evaluateRecord(activeRecord);
              return (
              <>
                <div className="tasmi-summary__hero">
                  <div>
                    <div className="tasmi-summary__surah">
                      {surahByNum.get(activeRecord.surah)?.name ?? `Surah ${activeRecord.surah}`} ·
                      Ayat {activeRecord.fromAyah}–{activeRecord.toAyah}
                    </div>
                    <div className="tasmi-summary__meta">
                      Durasi {formatDuration(activeRecord.durationSec)} ·{" "}
                      {formatDate(activeRecord.startedAt)}
                      {status.progressText ? ` · ${status.progressText}` : ""}
                      {activeRecord.peekedAyahs && activeRecord.peekedAyahs.length > 0
                        ? ` · ${activeRecord.peekedAyahs.length} diintip`
                        : ""}
                    </div>
                  </div>
                  <div className={`tasmi-summary__score tasmi-summary__score--${status.tone}`}>
                    {status.label}
                  </div>
                </div>

                {activeCard && (
                  <div className="tasmi-summary__schedule-note">
                    Jadwal {activeCard.kind === "ziyadah" ? "Ziyadah" : "Muraja'ah"} berikutnya:{" "}
                    <strong>{formatDueLabel(activeCard.dueAt)}</strong> (interval{" "}
                    {activeCard.stabilityDays} hari)
                  </div>
                )}

                {drillAyahs.length > 0 && onStartDrill && (
                  <button
                    type="button"
                    className="tasmi-summary__drill-btn"
                    onClick={() => onStartDrill(drillAyahs)}
                  >
                    Latih Kesalahan ({drillAyahs.length} ayat)
                  </button>
                )}

                <div className="tasmi-summary__breakdown">
                  {BREAKDOWN_CLASSES.map((cls) => (
                    <div key={cls} className="tasmi-summary__stat">
                      <span className="tasmi-summary__stat-val">{breakdown[cls] ?? 0}</span>
                      <span className="tasmi-summary__stat-lbl">{ERROR_CLASS_LABELS[cls]}</span>
                    </div>
                  ))}
                </div>

                {activeRecord.mistakes.length === 0 ? (
                  <div className="tasmi-summary__empty">{status.emptyNote}</div>
                ) : (
                  <div className="tasmi-summary__list">
                    {activeRecord.mistakes.map((m) => {
                      const ayahKey: AyahKey = `${m.surah}:${m.ayah}`;
                      const words = getAyahWords(m.surah, m.ayah);
                      const surahName = surahByNum.get(m.surah)?.name ?? `Surah ${m.surah}`;

                      return (
                        <div key={m.id} className="tasmi-summary__mistake">
                          <div className="tasmi-summary__mistake-head">
                            <span className="tasmi-summary__mistake-badge">
                              {formatErrorClass(m.errorClass)}
                            </span>
                            <span className="tasmi-summary__mistake-loc">
                              {surahName} : {m.ayah}
                              {m.word ? ` (kata ${m.word})` : ""}
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
                              ▶ Dengar Murottal
                            </button>
                            <button
                              type="button"
                              className="tasmi-summary__jump-btn"
                              onClick={() => onJumpToAyah(ayahKey)}
                            >
                              Buka Ayat
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
              );
            })() : (
              <div className="tasmi-summary__empty">Belum ada sesi Tasmi&apos; yang selesai.</div>
            )
          ) : tab === "history" ? (
            history.length === 0 ? (
              <div className="tasmi-summary__empty">
                Riwayat Tasmi&apos; masih kosong. Selesaikan satu sesi untuk menyimpannya di sini.
              </div>
            ) : (
              <div className="tasmi-summary__history-list">
                {archivedHistory.length > 0 && (
                  <div className="app-menu__segmented tasmi-summary__history-filter" role="tablist" aria-label="Filter riwayat Tasmi'">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={historyFilter === "active"}
                      className={`app-menu__seg ${historyFilter === "active" ? "app-menu__seg--active" : ""}`}
                      onClick={() => setHistoryFilter("active")}
                    >
                      Aktif ({activeHistory.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={historyFilter === "archived"}
                      className={`app-menu__seg ${historyFilter === "archived" ? "app-menu__seg--active" : ""}`}
                      onClick={() => setHistoryFilter("archived")}
                    >
                      Arsip ({archivedHistory.length})
                    </button>
                  </div>
                )}

                {(onDeleteHistory || onToggleArchiveHistory) && visibleHistory.length > 0 && (
                  <p className="tasmi-summary__history-hint">
                    Geser ke kiri atau ketuk ikon untuk arsipkan atau hapus riwayat.
                  </p>
                )}

                {visibleHistory.length === 0 ? (
                  <div className="tasmi-summary__empty">
                    Semua riwayat saat ini berada di Arsip.
                  </div>
                ) : (
                  visibleHistory.map((item) => {
                    const sName = surahByNum.get(item.surah)?.name ?? `Surah ${item.surah}`;
                    const isArchived = Boolean(archivedIds?.has(item.id));
                    return (
                      <SwipeableHistoryRow
                        key={item.id}
                        title={`${sName} · Ayat ${item.fromAyah}–${item.toAyah}`}
                        sub={`${formatDate(item.startedAt)} · ${formatDuration(item.durationSec)}`}
                        scoreLabel={
                          item.mistakes.length === 0
                            ? "Lancar"
                            : `${item.mistakes.length} catatan`
                        }
                        scoreTone={item.mistakes.length === 0 ? "clean" : "warn"}
                        archived={isArchived}
                        onSelect={() => {
                          setSelectedRecord(item);
                          setTab("summary");
                        }}
                        onToggleArchive={
                          onToggleArchiveHistory
                            ? () => onToggleArchiveHistory(item.id, !isArchived)
                            : undefined
                        }
                        onDelete={
                          onDeleteHistory
                            ? () => {
                                if (selectedRecord?.id === item.id) {
                                  setSelectedRecord(null);
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
          ) : sortedCards.length === 0 ? (
            <div className="tasmi-summary__empty">
              Belum ada jadwal muraja&apos;ah. Selesaikan satu sesi Tasmi&apos; agar jadwal otomatis terbentuk.
            </div>
          ) : (
            <div className="tasmi-summary__history-list">
              {sortedCards.map((card) => {
                const sName = surahByNum.get(card.surah)?.name ?? `Surah ${card.surah}`;
                const isDue = (Date.parse(card.dueAt) || 0) <= Date.now();
                return (
                  <button
                    key={card.id}
                    type="button"
                    className="tasmi-summary__history-item"
                    onClick={() => onStartMurajaahCard?.(card)}
                  >
                    <div>
                      <div className="tasmi-summary__history-title">
                        {sName} · Ayat {card.fromAyah}–{card.toAyah}
                      </div>
                      <div className="tasmi-summary__history-sub">
                        {card.kind === "ziyadah" ? "Ziyadah" : "Muraja'ah"} · Interval{" "}
                        {card.stabilityDays} hari
                        {card.lapses > 0 ? ` · ${card.lapses}× ulang` : ""}
                      </div>
                    </div>
                    <span
                      className={`tasmi-summary__score ${
                        isDue ? "tasmi-summary__score--warn" : "tasmi-summary__score--clean"
                      }`}
                    >
                      {formatDueLabel(card.dueAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SWIPE_ACTION_PX = 76;

interface SwipeableHistoryRowProps {
  title: string;
  sub: string;
  scoreLabel: string;
  scoreTone: "clean" | "warn";
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

  const archiveLabel = archived ? "Pulihkan" : "Arsipkan";

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
              aria-label={`${archiveLabel} riwayat ${title}`}
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
              aria-label={`Hapus riwayat ${title}`}
              tabIndex={offset < 0 ? 0 : -1}
            >
              Hapus
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
                aria-label={`${archiveLabel} riwayat ${title}`}
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
                aria-label={`Hapus riwayat ${title}`}
                title="Hapus"
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
