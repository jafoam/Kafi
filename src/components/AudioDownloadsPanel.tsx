import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoadProgress } from "@tilawa/core";
import type { ReciterInfo, ResourceInfo, SurahInfo, TafsirInfo } from "../data/types";
import type { TilawaModelStorage } from "../platform/types";
import { formatBytes, isSurahComplete } from "../services/audio-downloads";
import type { AudioDownloads } from "../state/useAudioDownloads";
import type { OfflinePages } from "../state/useOfflinePages";
import type { SegmentDownloads } from "../state/useSegmentDownloads";
import { textJobKey, type TextDownloads } from "../state/useTextDownloads";

export type DownloadsTab = "audio" | "translation" | "tafsir" | "app";

export interface AudioDownloadsPanelProps {
  initialTab?: DownloadsTab;
  surahs: SurahInfo[];
  reciters: ReciterInfo[];
  reciterId: string;
  onChangeReciter: (reciterId: string) => void;
  /** Surah being read, and the surahs of the juz it belongs to. */
  activeSurah: number;
  juzNumber: number;
  juzSurahs: number[];
  downloads: AudioDownloads;
  segmentDownloads?: SegmentDownloads;
  translations: ResourceInfo[];
  tafsirs: TafsirInfo[];
  activeTranslationId: number;
  activeTafsirId: string;
  textDownloads: TextDownloads;
  offlinePages: OfflinePages;
  /** The colored tajweed page fonts, saved on the device for offline use. */
  tajweedPages: OfflinePages;
  tilawaStorage: TilawaModelStorage;
  onDownloadTilawa: (onProgress: (p: LoadProgress) => void, signal: AbortSignal) => Promise<void>;
  onClose: () => void;
}

const JUZ_AMMA = Array.from({ length: 114 - 78 + 1 }, (_, i) => 78 + i);

type Confirm = "all" | "clear" | null;

export function AudioDownloadsPanel({
  initialTab = "audio",
  surahs,
  reciters,
  reciterId,
  onChangeReciter,
  activeSurah,
  juzNumber,
  juzSurahs,
  downloads,
  segmentDownloads,
  translations,
  tafsirs,
  activeTranslationId,
  activeTafsirId,
  textDownloads,
  offlinePages,
  tajweedPages,
  tilawaStorage,
  onDownloadTilawa,
  onClose,
}: AudioDownloadsPanelProps) {
  const { state, status, storage, wifiOnly } = downloads;
  const [tab, setTab] = useState<DownloadsTab>(initialTab);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tilawaKeys, setTilawaKeys] = useState<string[] | null>(null);
  const [tilawaBusy, setTilawaBusy] = useState(false);
  const [tilawaProgress, setTilawaProgress] = useState<LoadProgress | null>(null);
  const [tilawaError, setTilawaError] = useState<string | null>(null);
  const tilawaAbortRef = useRef<AbortController | null>(null);

  const refreshTilawa = useCallback(() => {
    void tilawaStorage
      .keys()
      .then(setTilawaKeys)
      .catch(() => setTilawaKeys([]));
  }, [tilawaStorage]);

  useEffect(() => {
    refreshTilawa();
    return () => {
      tilawaAbortRef.current?.abort();
    };
  }, [refreshTilawa]);

  const startTilawaDownload = () => {
    if (tilawaBusy) return;
    const controller = new AbortController();
    tilawaAbortRef.current = controller;
    setTilawaBusy(true);
    setTilawaError(null);
    setTilawaProgress(null);
    void onDownloadTilawa((p) => {
      if (!controller.signal.aborted) setTilawaProgress(p);
    }, controller.signal)
      .then(() => {
        if (!controller.signal.aborted) refreshTilawa();
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setTilawaError(err instanceof Error ? err.message : "Gagal mengunduh model AI Tasmi'.");
        }
      })
      .finally(() => {
        if (tilawaAbortRef.current === controller) tilawaAbortRef.current = null;
        setTilawaBusy(false);
        setTilawaProgress(null);
      });
  };

  const cancelTilawaDownload = () => {
    tilawaAbortRef.current?.abort();
    tilawaAbortRef.current = null;
    setTilawaBusy(false);
    setTilawaProgress(null);
  };

  const removeTilawaModel = async () => {
    const keys = await tilawaStorage.keys().catch(() => [] as string[]);
    for (const key of keys) {
      await tilawaStorage.delete(key).catch(() => undefined);
    }
    refreshTilawa();
  };

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

  const renderTextList = (kind: "translation" | "tafsir") => {
    const items =
      kind === "translation"
        ? translations.map((t) => ({
            id: String(t.id),
            name: t.name,
            author: t.author,
            isActive: t.id === activeTranslationId,
          }))
        : tafsirs.map((t) => ({
            id: t.id,
            name: t.name,
            author: t.author,
            isActive: t.id === activeTafsirId,
          }));
    const statusMap = kind === "translation" ? textDownloads.translations : textDownloads.tafsirs;
    const nameById = new Map(items.map((item) => [item.id, item.name]));
    const kindErrorJobs = Object.values(textDownloads.jobs).filter(
      (job) => job.kind === kind && job.phase === "error",
    );

    return (
      <>
        {kindErrorJobs.map((job) => {
          const itemName = nameById.get(job.resourceId) ?? job.resourceId;
          return (
            <section
              key={textJobKey(job.kind, job.resourceId)}
              className="dl-panel__status dl-panel__status--error"
              aria-live="polite"
            >
              <div className="dl-panel__status-text">
                {job.failed.length > 0
                  ? `${job.failed.length} surah gagal diunduh untuk ${itemName}. Periksa koneksi lalu coba lagi.`
                  : `Gagal mengunduh ${itemName}. Periksa koneksi lalu coba lagi.`}
              </div>
              <div className="dl-panel__row">
                <button
                  type="button"
                  className="dl-btn"
                  onClick={() => textDownloads.start(kind, job.resourceId)}
                >
                  Coba lagi
                </button>
                <button
                  type="button"
                  className="dl-btn dl-btn--ghost"
                  onClick={() => textDownloads.dismissError(kind, job.resourceId)}
                >
                  Tutup
                </button>
              </div>
            </section>
          );
        })}

        <section className="dl-panel__section">
          <p className="dl-panel__summary">
            {kind === "translation"
              ? "Unduh seluruh 114 surah terjemahan agar setiap ayat bisa dibaca tanpa internet. Bisa mengunduh beberapa edisi sekaligus."
              : "Unduh seluruh 114 surah tafsir (Kemenag & tafsir lainnya) agar bisa dibuka tanpa internet. Bisa mengunduh beberapa edisi sekaligus."}
          </p>
          <ul className="dl-list">
            {items.map((item) => {
              const entry = statusMap?.get(item.id);
              const total = entry?.totalSurahs ?? 114;
              const job = textDownloads.jobs[textJobKey(kind, item.id)];
              const isCurrent = job?.phase === "running";
              const cached = isCurrent ? Math.max(entry?.cachedSurahs ?? 0, job.done) : (entry?.cachedSurahs ?? 0);
              const complete = !isCurrent && cached >= total;

              return (
                <li key={item.id} className="dl-item">
                  <div className="dl-item__main">
                    <div className="dl-item__name">
                      <span>{item.name}</span>
                      {item.isActive && <span className="dl-item__badge">Aktif</span>}
                    </div>
                    <div className="dl-item__sub">
                      {isCurrent
                        ? `Mengunduh ${job.done}/${job.total} surah`
                        : complete
                          ? `Tersimpan · ${total} surah · ${formatBytes(entry?.bytes ?? 0)}`
                          : cached > 0
                            ? `${cached}/${total} surah · ${formatBytes(entry?.bytes ?? 0)}`
                            : `${item.author} · Belum diunduh`}
                    </div>
                    <div className="dl-bar dl-bar--thin" aria-hidden="true">
                      <div
                        className={`dl-bar__fill ${complete ? "dl-bar__fill--done" : ""}`}
                        style={{ width: `${total ? Math.min(100, (cached / total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="dl-item__actions">
                    {isCurrent ? (
                      <button
                        type="button"
                        className="dl-btn dl-btn--small dl-btn--ghost"
                        onClick={() => textDownloads.cancel(kind, item.id)}
                      >
                        Batal
                      </button>
                    ) : (
                      <>
                        {!complete && (
                          <button
                            type="button"
                            className="dl-btn dl-btn--small"
                            onClick={() => textDownloads.start(kind, item.id)}
                          >
                            {cached > 0 ? "Lanjut" : "Unduh"}
                          </button>
                        )}
                        {cached > 0 && (
                          <button
                            type="button"
                            className="dl-btn dl-btn--small dl-btn--ghost"
                            onClick={() => void textDownloads.remove(kind, item.id)}
                            aria-label={`Hapus unduhan ${item.name}`}
                          >
                            Hapus
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </>
    );
  };

  const tilawaSaved = (tilawaKeys?.length ?? 0) > 0;
  const tilawaPct =
    tilawaProgress && tilawaProgress.total && tilawaProgress.total > 0
      ? Math.min(100, Math.round((tilawaProgress.loaded / tilawaProgress.total) * 100))
      : null;

  return (
    <div className="dl-backdrop" role="dialog" aria-modal="true" aria-label="Unduh Offline" onClick={onClose}>
      <div className="dl-panel" onClick={(e) => e.stopPropagation()}>
        <header className="dl-panel__header">
          <h2 className="dl-panel__title">Unduh Offline</h2>
          <button type="button" className="dl-panel__close" onClick={onClose} aria-label="Tutup">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="dl-tabs" role="tablist" aria-label="Jenis konten offline">
          {(
            [
              ["audio", "Murottal"],
              ["translation", "Terjemahan"],
              ["tafsir", "Tafsir"],
              ["app", "Mushaf & AI"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`dl-tabs__btn ${tab === key ? "dl-tabs__btn--active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="dl-panel__scroll">
          {tab === "translation" && renderTextList("translation")}
          {tab === "tafsir" && renderTextList("tafsir")}
          {tab === "app" && (
            <section className="dl-panel__section">
              <p className="dl-panel__summary">
                Kelola halaman mushaf dan model AI Tasmi&apos; agar seluruh fitur bisa dipakai tanpa internet.
                {storage && (
                  <span className="dl-panel__storage">
                    {" "}
                    · Penyimpanan aplikasi {formatBytes(storage.used)} dari {formatBytes(storage.quota)}
                  </span>
                )}
              </p>
              <ul className="dl-list">
                <li className="dl-item">
                  <div className="dl-item__main">
                    <div className="dl-item__name">
                      <span>Huruf Madinah 1405 (604 halaman)</span>
                      {(offlinePages.bundled || offlinePages.status === "done") && (
                        <span className="dl-item__badge">Siap offline</span>
                      )}
                    </div>
                    <div className="dl-item__sub">
                      {offlinePages.bundled
                        ? "Sudah termasuk di dalam paket aplikasi ini."
                        : !offlinePages.supported
                          ? "Cache halaman offline tidak didukung di browser ini."
                          : offlinePages.status === "running"
                            ? `Mengunduh ${offlinePages.done}/${offlinePages.total} halaman…`
                            : offlinePages.status === "done"
                              ? `Semua ${offlinePages.total} halaman tersimpan offline.`
                              : offlinePages.status === "error"
                                ? `Sebagian gagal (${offlinePages.done}/${offlinePages.total}). Coba lagi.`
                                : offlinePages.done > 0
                                  ? `${offlinePages.done}/${offlinePages.total} halaman tersimpan. Unduh sisanya (±47 MB total) agar mushaf bisa dibaca tanpa internet.`
                                  : "Simpan semua 604 halaman huruf 1405 (±47 MB) untuk dibaca tanpa internet."}
                    </div>
                    {!offlinePages.bundled && offlinePages.supported && (
                      <div className="dl-bar dl-bar--thin" aria-hidden="true">
                        <div
                          className={`dl-bar__fill ${offlinePages.status === "done" ? "dl-bar__fill--done" : ""}`}
                          style={{
                            width: `${offlinePages.total ? Math.min(100, (offlinePages.done / offlinePages.total) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {!offlinePages.bundled && offlinePages.supported && offlinePages.status !== "done" && (
                    <div className="dl-item__actions">
                      <button
                        type="button"
                        className={`dl-btn dl-btn--small ${offlinePages.status === "running" ? "dl-btn--ghost" : ""}`}
                        onClick={offlinePages.toggle}
                      >
                        {offlinePages.status === "running"
                          ? "Batal"
                          : offlinePages.status === "error"
                            ? "Coba lagi"
                            : offlinePages.done > 0
                              ? "Lanjutkan"
                              : "Unduh"}
                      </button>
                    </div>
                  )}
                </li>

                <li className="dl-item">
                  <div className="dl-item__main">
                    <div className="dl-item__name">
                      <span>Huruf Madinah 1441 (604 halaman)</span>
                      {tajweedPages.status === "done" && <span className="dl-item__badge">Siap offline</span>}
                    </div>
                    <div className="dl-item__sub">
                      {tajweedPages.status === "running"
                        ? `Mengunduh ${tajweedPages.done}/${tajweedPages.total} halaman…`
                        : tajweedPages.status === "done"
                          ? `Semua ${tajweedPages.total} halaman tersimpan offline.`
                          : tajweedPages.status === "error"
                            ? `Sebagian gagal (${tajweedPages.done}/${tajweedPages.total}). Coba lagi.`
                            : tajweedPages.done > 0
                              ? `${tajweedPages.done}/${tajweedPages.total} halaman tersimpan. Unduh sisanya (±47 MB total) agar huruf 1441 dan tajwid berwarna bisa dipakai tanpa internet.`
                              : "Dipakai gaya huruf Madinah 1441 dan tajwid berwarna (±47 MB), agar bisa dibaca tanpa internet."}
                    </div>
                    <div className="dl-bar dl-bar--thin" aria-hidden="true">
                      <div
                        className={`dl-bar__fill ${tajweedPages.status === "done" ? "dl-bar__fill--done" : ""}`}
                        style={{ width: `${Math.min(100, (tajweedPages.done / tajweedPages.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                  {tajweedPages.status !== "done" && (
                    <div className="dl-item__actions">
                      <button
                        type="button"
                        className={`dl-btn dl-btn--small ${tajweedPages.status === "running" ? "dl-btn--ghost" : ""}`}
                        onClick={tajweedPages.toggle}
                      >
                        {tajweedPages.status === "running"
                          ? "Batal"
                          : tajweedPages.status === "error"
                            ? "Coba lagi"
                            : tajweedPages.done > 0
                              ? "Lanjutkan"
                              : "Unduh"}
                      </button>
                    </div>
                  )}
                </li>

                <li className="dl-item">
                  <div className="dl-item__main">
                    <div className="dl-item__name">
                      <span>Model AI Tasmi&apos;</span>
                      {tilawaSaved && !tilawaBusy && <span className="dl-item__badge">Tersimpan</span>}
                    </div>
                    <div className="dl-item__sub">
                      {tilawaBusy
                        ? tilawaPct !== null
                          ? `Mengunduh model AI… ${tilawaPct}%`
                          : "Menyiapkan model AI Tasmi'…"
                        : tilawaError
                          ? tilawaError
                          : tilawaSaved
                            ? "Siap menyimak hafalan tanpa internet."
                            : "Model pengenalan bacaan untuk fitur Tasmi' (setoran hafalan)."}
                    </div>
                    {(tilawaBusy || tilawaSaved) && (
                      <div className="dl-bar dl-bar--thin" aria-hidden="true">
                        <div
                          className={`dl-bar__fill ${tilawaSaved && !tilawaBusy ? "dl-bar__fill--done" : ""}`}
                          style={{ width: `${tilawaBusy ? (tilawaPct ?? 15) : 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="dl-item__actions">
                    {tilawaBusy ? (
                      <button
                        type="button"
                        className="dl-btn dl-btn--small dl-btn--ghost"
                        onClick={cancelTilawaDownload}
                      >
                        Batal
                      </button>
                    ) : tilawaSaved ? (
                      <button
                        type="button"
                        className="dl-btn dl-btn--small dl-btn--ghost"
                        onClick={() => void removeTilawaModel()}
                        aria-label="Hapus model AI Tasmi'"
                      >
                        Hapus
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="dl-btn dl-btn--small"
                        onClick={startTilawaDownload}
                      >
                        Unduh
                      </button>
                    )}
                  </div>
                </li>
              </ul>
            </section>
          )}
          {tab === "audio" && (
            <>
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

          {segmentDownloads && (
            <section className="dl-panel__section">
              <h3 className="dl-panel__heading">Highlight per kata (offline)</h3>
              {(() => {
                const segStatus = segmentDownloads.status;
                const supported = segStatus?.supported ?? false;
                const segTotal = segStatus?.totalSurahs ?? segmentDownloads.total ?? 114;
                const segRunning = segmentDownloads.phase === "running";
                const segCached = segRunning
                  ? Math.max(segStatus?.cachedSurahs ?? 0, segmentDownloads.done)
                  : (segStatus?.cachedSurahs ?? 0);
                const segComplete = supported && !segRunning && segCached >= segTotal;
                return (
                  <div className="dl-item">
                    <div className="dl-item__main">
                      <div className="dl-item__name">
                        <span>Penanda waktu per kata</span>
                        {segComplete && <span className="dl-item__badge">Siap offline</span>}
                      </div>
                      <div className="dl-item__sub">
                        {!segStatus
                          ? "Memeriksa cache..."
                          : !supported
                            ? "Highlight per kata belum tersedia untuk qari ini."
                            : segRunning
                              ? `Mengunduh ${segmentDownloads.done}/${segmentDownloads.total} surah`
                              : segmentDownloads.phase === "error"
                                ? `${segmentDownloads.failed.length || "Sebagian"} surah gagal diunduh. Coba lagi.`
                                : segComplete
                                  ? `Tersimpan · ${segTotal} surah · ${formatBytes(segStatus.bytes)}`
                                  : segCached > 0
                                    ? `${segCached}/${segTotal} surah · ${formatBytes(segStatus.bytes)}`
                                    : "Simpan 114 surah agar sorotan per kata tetap jalan tanpa internet."}
                      </div>
                      {supported && (
                        <div className="dl-bar dl-bar--thin" aria-hidden="true">
                          <div
                            className={`dl-bar__fill ${segComplete ? "dl-bar__fill--done" : ""}`}
                            style={{ width: `${segTotal ? Math.min(100, (segCached / segTotal) * 100) : 0}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {supported && (
                      <div className="dl-item__actions">
                        {segRunning ? (
                          <button
                            type="button"
                            className="dl-btn dl-btn--small dl-btn--ghost"
                            onClick={segmentDownloads.cancel}
                          >
                            Batal
                          </button>
                        ) : (
                          <>
                            {!segComplete && (
                              <button
                                type="button"
                                className="dl-btn dl-btn--small"
                                onClick={segmentDownloads.start}
                              >
                                {segmentDownloads.phase === "error"
                                  ? "Coba lagi"
                                  : segCached > 0
                                    ? "Lanjut"
                                    : "Unduh"}
                              </button>
                            )}
                            {segCached > 0 && (
                              <button
                                type="button"
                                className="dl-btn dl-btn--small dl-btn--ghost"
                                onClick={() => void segmentDownloads.remove()}
                                aria-label="Hapus cache highlight per kata"
                              >
                                Hapus
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          )}

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
              <button
                type="button"
                className="dl-btn"
                onClick={() => download([activeSurah])}
                title={active ? `Unduh Surah ${active.name}` : "Unduh surah ini"}
              >
                {active ? active.name : "Surah ini"}
              </button>
              <button type="button" className="dl-btn" onClick={() => download(juzSurahs)}>
                Juz {juzNumber}
              </button>
              {juzNumber !== 30 && (
                <button type="button" className="dl-btn" onClick={() => download(JUZ_AMMA)}>
                  Juz 30
                </button>
              )}
              <button type="button" className={`dl-btn ${confirm === "all" ? "dl-btn--danger" : ""}`} onClick={askAll}>
                {confirm === "all" ? "Konfirmasi" : "Semua"}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
