import { useMemo, useState } from "react";
import type { ReciterInfo, SurahInfo } from "../data/types";
import { formatBytes, isSurahComplete } from "../services/audio-downloads";
import type { AudioDownloads } from "../state/useAudioDownloads";

export interface AudioDownloadsPanelProps {
  surahs: SurahInfo[];
  reciters: ReciterInfo[];
  reciterId: string;
  onChangeReciter: (reciterId: string) => void;
  /** Surah being read, and the surahs of the juz it belongs to. */
  activeSurah: number;
  juzNumber: number;
  juzSurahs: number[];
  downloads: AudioDownloads;
  onClose: () => void;
}

const JUZ_AMMA = Array.from({ length: 114 - 78 + 1 }, (_, i) => 78 + i);

type Confirm = "all" | "clear" | null;

export function AudioDownloadsPanel({
  surahs,
  reciters,
  reciterId,
  onChangeReciter,
  activeSurah,
  juzNumber,
  juzSurahs,
  downloads,
  onClose,
}: AudioDownloadsPanelProps) {
  const { state, status, storage, wifiOnly } = downloads;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const busy = state.phase === "running" || state.phase === "waiting-wifi";
  const queued = useMemo(() => new Set(state.queue), [state.queue]);
  const surahByNumber = useMemo(() => new Map(surahs.map((s) => [s.number, s])), [surahs]);
  const active = surahByNumber.get(activeSurah);
  const current = state.current === null ? null : surahByNumber.get(state.current);

  /** Queues the surahs that are not complete yet. */
  const download = (numbers: number[]) => {
    const missing = numbers.filter((n) => !isSurahComplete(status?.bySurah.get(n)));
    if (missing.length === 0) {
      setNotice("Semuanya sudah tersimpan.");
      return;
    }
    setNotice(null);
    downloads.start(missing);
  };

  const askAll = () => {
    if (confirm === "all") {
      setConfirm(null);
      download(surahs.map((s) => s.number));
    } else {
      setConfirm("all");
    }
  };

  const clearAll = () => {
    if (confirm === "clear") {
      setConfirm(null);
      void downloads.removeSurahs(surahs.filter((s) => (status?.bySurah.get(s.number)?.cached ?? 0) > 0).map((s) => s.number));
    } else {
      setConfirm("clear");
    }
  };

  return (
    <div className="dl-backdrop" role="dialog" aria-modal="true" aria-label="Unduh Suara" onClick={onClose}>
      <div className="dl-panel" onClick={(e) => e.stopPropagation()}>
        <header className="dl-panel__header">
          <h2 className="dl-panel__title">Unduh Suara</h2>
          <button type="button" className="dl-panel__close" onClick={onClose} aria-label="Tutup">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="dl-panel__scroll">
          <section className="dl-panel__section">
            <label className="dl-panel__field">
              <span>Qari</span>
              <select value={reciterId} onChange={(e) => onChangeReciter(e.target.value)} disabled={busy}>
                {reciters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <p className="dl-panel__summary">
              {status ? (
                <>
                  Tersimpan <strong>{status.cachedAyahs.toLocaleString("id-ID")}</strong> dari{" "}
                  {status.totalAyahs.toLocaleString("id-ID")} ayat · {formatBytes(status.bytes)}
                </>
              ) : (
                "Membaca unduhan..."
              )}
              {storage && (
                <span className="dl-panel__storage">
                  {" "}
                  · Penyimpanan aplikasi {formatBytes(storage.used)} dari {formatBytes(storage.quota)}
                </span>
              )}
            </p>

            <label className="dl-panel__check">
              <input type="checkbox" checked={wifiOnly} onChange={(e) => downloads.setWifiOnly(e.target.checked)} />
              <span>Hanya unduh lewat Wi-Fi</span>
            </label>
          </section>

          {state.phase !== "idle" && (
            <section className={`dl-panel__status dl-panel__status--${state.phase}`} aria-live="polite">
              {state.phase === "running" && (
                <>
                  <div className="dl-panel__status-text">
                    Mengunduh <strong>{current?.name ?? ""}</strong> {state.done}/{state.total}
                    {state.queue.length > 0 && <> · {state.queue.length} surah menunggu</>}
                  </div>
                  <div className="dl-bar" aria-hidden="true">
                    <div className="dl-bar__fill" style={{ width: `${state.total ? (state.done / state.total) * 100 : 0}%` }} />
                  </div>
                  <div className="dl-panel__row">
                    <button type="button" className="dl-btn dl-btn--ghost" onClick={downloads.cancel}>
                      Batalkan
                    </button>
                  </div>
                </>
              )}
              {state.phase === "waiting-wifi" && (
                <>
                  <div className="dl-panel__status-text">
                    Menunggu Wi-Fi · {state.queue.length} surah belum diunduh
                  </div>
                  <div className="dl-panel__row">
                    <button type="button" className="dl-btn" onClick={downloads.resume}>
                      Lanjut dengan data seluler
                    </button>
                    <button type="button" className="dl-btn dl-btn--ghost" onClick={downloads.cancel}>
                      Batalkan
                    </button>
                  </div>
                </>
              )}
              {state.phase === "error" && (
                <>
                  <div className="dl-panel__status-text">
                    {state.failed.length} surah gagal diunduh. Periksa koneksi lalu coba lagi.
                  </div>
                  <div className="dl-panel__row">
                    <button type="button" className="dl-btn" onClick={() => download(state.failed)}>
                      Coba lagi
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          <section className="dl-panel__section">
            <h3 className="dl-panel__heading">Unduh cepat</h3>
            <div className="dl-panel__quick">
              <button type="button" className="dl-btn" onClick={() => download([activeSurah])}>
                Surah ini{active ? ` · ${active.name}` : ""}
              </button>
              <button type="button" className="dl-btn" onClick={() => download(juzSurahs)}>
                Juz {juzNumber} ini
              </button>
              <button type="button" className="dl-btn" onClick={() => download(JUZ_AMMA)}>
                Juz 30 (Amma)
              </button>
              <button type="button" className={`dl-btn ${confirm === "all" ? "dl-btn--danger" : ""}`} onClick={askAll}>
                {confirm === "all" ? "Ketuk lagi: unduh semua" : "Seluruh Al-Quran"}
              </button>
            </div>
            {confirm === "all" && (
              <p className="dl-panel__warn">
                Seluruh Al-Quran bisa memakai ratusan MB. Pastikan ruang dan kuota cukup.{" "}
                <button type="button" className="dl-link" onClick={() => setConfirm(null)}>
                  Batal
                </button>
              </p>
            )}
            {notice && <p className="dl-panel__notice">{notice}</p>}
          </section>

          <section className="dl-panel__section">
            <h3 className="dl-panel__heading">Per surah</h3>
            <ul className="dl-list">
              {surahs.map((surah) => {
                const entry = status?.bySurah.get(surah.number);
                const complete = isSurahComplete(entry);
                const isCurrent = state.current === surah.number && state.phase === "running";
                const isQueued = queued.has(surah.number);
                const cached = isCurrent ? Math.max(entry?.cached ?? 0, state.done) : (entry?.cached ?? 0);
                return (
                  <li key={surah.number} className="dl-item">
                    <span className="dl-item__num">{surah.number}</span>
                    <div className="dl-item__main">
                      <div className="dl-item__name">
                        {surah.name}
                        <span className="dl-item__ar">{surah.arabicName}</span>
                      </div>
                      <div className="dl-item__sub">
                        {isCurrent
                          ? `Mengunduh ${state.done}/${state.total}`
                          : isQueued
                            ? "Dalam antrean"
                            : complete
                              ? `Tersimpan · ${formatBytes(entry?.bytes ?? 0)}`
                              : cached > 0
                                ? `${cached}/${surah.ayahs} ayat`
                                : `${surah.ayahs} ayat`}
                      </div>
                      <div className="dl-bar dl-bar--thin" aria-hidden="true">
                        <div
                          className={`dl-bar__fill ${complete ? "dl-bar__fill--done" : ""}`}
                          style={{ width: `${surah.ayahs ? Math.min(100, (cached / surah.ayahs) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="dl-item__actions">
                      {!complete && !isCurrent && !isQueued && (
                        <button type="button" className="dl-btn dl-btn--small" onClick={() => download([surah.number])}>
                          Unduh
                        </button>
                      )}
                      {cached > 0 && !isCurrent && !isQueued && (
                        <button
                          type="button"
                          className="dl-btn dl-btn--small dl-btn--ghost"
                          onClick={() => void downloads.removeSurahs([surah.number])}
                          aria-label={`Hapus unduhan ${surah.name}`}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="dl-panel__section">
            <button
              type="button"
              className={`dl-btn dl-btn--ghost ${confirm === "clear" ? "dl-btn--danger" : ""}`}
              onClick={clearAll}
              disabled={busy || !status || status.cachedAyahs === 0}
            >
              {confirm === "clear" ? "Ketuk lagi: hapus semua unduhan qari ini" : "Hapus semua unduhan qari ini"}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
