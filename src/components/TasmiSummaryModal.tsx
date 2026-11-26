import { useEffect, useMemo, useState } from "react";
import type { AyahKey, SurahInfo, TasmiSessionRecord } from "../data/types";
import { ERROR_CLASS_LABELS, formatErrorClass } from "../services/tasmi-logic";

export interface TasmiSummaryModalProps {
  open: boolean;
  initialTab: "summary" | "history";
  record: TasmiSessionRecord | null;
  history: TasmiSessionRecord[];
  surahs: SurahInfo[];
  getAyahWords: (surah: number, ayah: number) => string[];
  onClose: () => void;
  onPlayAyah: (ayah: AyahKey) => void;
  onJumpToAyah: (ayah: AyahKey) => void;
}

const BREAKDOWN_CLASSES = [
  "wrong_word",
  "omitted_word",
  "added_word",
  "skipped_passage",
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

export function TasmiSummaryModal({
  open,
  initialTab,
  record,
  history,
  surahs,
  getAyahWords,
  onClose,
  onPlayAyah,
  onJumpToAyah,
}: TasmiSummaryModalProps) {
  const [tab, setTab] = useState<"summary" | "history">(initialTab);
  const [selectedRecord, setSelectedRecord] = useState<TasmiSessionRecord | null>(record);

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
            Ringkasan Sesi
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
            Riwayat Tasmi&apos; ({history.length})
          </button>
        </div>

        <div className="tasmi-summary__body">
          {tab === "summary" ? (
            activeRecord ? (
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
                    </div>
                  </div>
                  <div
                    className={`tasmi-summary__score ${
                      activeRecord.mistakes.length === 0
                        ? "tasmi-summary__score--clean"
                        : "tasmi-summary__score--warn"
                    }`}
                  >
                    {activeRecord.mistakes.length === 0
                      ? "Lancar"
                      : `${activeRecord.mistakes.length} catatan`}
                  </div>
                </div>

                <div className="tasmi-summary__breakdown">
                  {BREAKDOWN_CLASSES.map((cls) => (
                    <div key={cls} className="tasmi-summary__stat">
                      <span className="tasmi-summary__stat-val">{breakdown[cls] ?? 0}</span>
                      <span className="tasmi-summary__stat-lbl">{ERROR_CLASS_LABELS[cls]}</span>
                    </div>
                  ))}
                </div>

                {activeRecord.mistakes.length === 0 ? (
                  <div className="tasmi-summary__empty">
                    Alhamdulillah, tidak ada kesalahan hafalan yang terkonfirmasi pada sesi ini.
                  </div>
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

                          {words.length > 0 ? (
                            <div className="tasmi-summary__arabic" dir="rtl" lang="ar">
                              {words.map((w, idx) => (
                                <span
                                  key={idx}
                                  className={
                                    m.word === idx + 1 ? "tasmi-summary__word--flagged" : undefined
                                  }
                                >
                                  {w}{" "}
                                </span>
                              ))}
                            </div>
                          ) : m.wordText ? (
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
            ) : (
              <div className="tasmi-summary__empty">Belum ada sesi Tasmi&apos; yang selesai.</div>
            )
          ) : history.length === 0 ? (
            <div className="tasmi-summary__empty">
              Riwayat Tasmi&apos; masih kosong. Selesaikan satu sesi untuk menyimpannya di sini.
            </div>
          ) : (
            <div className="tasmi-summary__history-list">
              {history.map((item) => {
                const sName = surahByNum.get(item.surah)?.name ?? `Surah ${item.surah}`;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="tasmi-summary__history-item"
                    onClick={() => {
                      setSelectedRecord(item);
                      setTab("summary");
                    }}
                  >
                    <div>
                      <div className="tasmi-summary__history-title">
                        {sName} · Ayat {item.fromAyah}–{item.toAyah}
                      </div>
                      <div className="tasmi-summary__history-sub">
                        {formatDate(item.startedAt)} · {formatDuration(item.durationSec)}
                      </div>
                    </div>
                    <span
                      className={`tasmi-summary__score ${
                        item.mistakes.length === 0
                          ? "tasmi-summary__score--clean"
                          : "tasmi-summary__score--warn"
                      }`}
                    >
                      {item.mistakes.length === 0 ? "Lancar" : `${item.mistakes.length} catatan`}
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
