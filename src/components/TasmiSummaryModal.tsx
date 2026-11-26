import { useEffect, useMemo, useState } from "react";
import type { AyahKey, MurajaahCard, SurahInfo, TasmiSessionRecord } from "../data/types";
import type { GlyphPageLoader } from "../services/glyph-pages";
import { extractDrillAyahs, formatDueLabel, murajaahCardId } from "../services/murajaah-srs";
import { ERROR_CLASS_LABELS, formatErrorClass } from "../services/tasmi-logic";

export interface TasmiSummaryModalProps {
  open: boolean;
  initialTab: "summary" | "history" | "schedule";
  record: TasmiSessionRecord | null;
  history: TasmiSessionRecord[];
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
}: TasmiSummaryModalProps) {
  const [tab, setTab] = useState<"summary" | "history" | "schedule">(initialTab);
  const [selectedRecord, setSelectedRecord] = useState<TasmiSessionRecord | null>(record);
  const [qcfByAyah, setQcfByAyah] = useState<Record<string, QcfGlyph[]>>({});

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
            (map[w.ayah] ??= []).push({ code: w.code, fontFamily: data.fontFamily });
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
            Riwayat ({history.length})
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
                      {activeRecord.peekedAyahs && activeRecord.peekedAyahs.length > 0
                        ? ` · ${activeRecord.peekedAyahs.length} diintip`
                        : ""}
                    </div>
                  </div>
                  <div
                    className={`tasmi-summary__score ${
                      drillAyahs.length === 0
                        ? "tasmi-summary__score--clean"
                        : "tasmi-summary__score--warn"
                    }`}
                  >
                    {drillAyahs.length === 0
                      ? "Lancar"
                      : `${activeRecord.mistakes.length} catatan`}
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
            ) : (
              <div className="tasmi-summary__empty">Belum ada sesi Tasmi&apos; yang selesai.</div>
            )
          ) : tab === "history" ? (
            history.length === 0 ? (
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
