import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassSelect } from "./GlassSelect";
import { useI18n } from "../i18n";
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
  const { isEn, tr } = useI18n();
  const locale = isEn ? "en-US" : "id-ID";
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
          setTilawaError(
            err instanceof Error
              ? err.message
              : tr("Gagal mengunduh model AI Tasmi'.", "Failed to download the Tasmi' AI model."),
          );
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
      setNotice(tr("Semuanya sudah tersimpan.", "Everything is already saved offline."));
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
                  ? tr(
                      `${job.failed.length} surah gagal diunduh untuk ${itemName}. Periksa koneksi lalu coba lagi.`,
                      `${job.failed.length} surahs failed to download for ${itemName}. Check your connection and try again.`,
                    )
                  : tr(
                      `Gagal mengunduh ${itemName}. Periksa koneksi lalu coba lagi.`,
                      `Failed to download ${itemName}. Check your connection and try again.`,
                    )}
              </div>
              <div className="dl-panel__row">
                <button
                  type="button"
                  className="dl-btn"
                  onClick={() => textDownloads.start(kind, job.resourceId)}
                >
                  {tr("Coba lagi", "Retry")}
                </button>
                <button
                  type="button"
                  className="dl-btn dl-btn--ghost"
                  onClick={() => textDownloads.dismissError(kind, job.resourceId)}
                >
                  {tr("Tutup", "Close")}
                </button>
              </div>
            </section>
          );
        })}

        <section className="dl-panel__section">
          <p className="dl-panel__summary">
            {kind === "translation"
              ? tr(
                  "Unduh seluruh 114 surah terjemahan agar setiap ayat bisa dibaca tanpa internet. Bisa mengunduh beberapa edisi sekaligus.",
                  "Download all 114 surahs of a translation to read offline. You can save multiple editions.",
                )
              : tr(
                  "Unduh seluruh 114 surah tafsir (Kemenag & tafsir lainnya) agar bisa dibuka tanpa internet. Bisa mengunduh beberapa edisi sekaligus.",
                  "Download all 114 surahs of tafsir to read offline. You can save multiple editions.",
                )}
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
                      {item.isActive && <span className="dl-item__badge">{tr("Aktif", "Active")}</span>}
                    </div>
                    <div className="dl-item__sub">
                      {isCurrent
                        ? tr(`Mengunduh ${job.done}/${job.total} surah`, `Downloading ${job.done}/${job.total} surahs`)
                        : complete
                          ? tr(
                              `Tersimpan · ${total} surah · ${formatBytes(entry?.bytes ?? 0)}`,
                              `Saved · ${total} surahs · ${formatBytes(entry?.bytes ?? 0)}`,
                            )
                          : cached > 0
                            ? tr(
                                `${cached}/${total} surah · ${formatBytes(entry?.bytes ?? 0)}`,
                                `${cached}/${total} surahs · ${formatBytes(entry?.bytes ?? 0)}`,
                              )
                            : `${item.author} · ${tr("Belum diunduh", "Not downloaded")}`}
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
                        {tr("Batal", "Cancel")}
                      </button>
                    ) : (
                      <>
                        {!complete && (
                          <button
                            type="button"
                            className="dl-btn dl-btn--small"
                            onClick={() => textDownloads.start(kind, item.id)}
                          >
                            {cached > 0 ? tr("Lanjut", "Resume") : tr("Unduh", "Download")}
                          </button>
                        )}
                        {cached > 0 && (
                          <button
                            type="button"
                            className="dl-btn dl-btn--small dl-btn--ghost"
                            onClick={() => void textDownloads.remove(kind, item.id)}
                            aria-label={tr(`Hapus unduhan ${item.name}`, `Delete download ${item.name}`)}
                          >
                            {tr("Hapus", "Delete")}
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
    <div
      className="dl-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Unduh Offline", "Offline Downloads")}
      onClick={onClose}
    >
      <div className="dl-panel" onClick={(e) => e.stopPropagation()}>
        <header className="dl-panel__header">
          <h2 className="dl-panel__title">{tr("Unduh Offline", "Offline Downloads")}</h2>
          <button type="button" className="dl-panel__close" onClick={onClose} aria-label={tr("Tutup", "Close")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="dl-tabs" role="tablist" aria-label={tr("Jenis konten offline", "Offline content type")}>
          {(
            [
              ["audio", tr("Murottal", "Audio")],
              ["translation", tr("Terjemahan", "Translation")],
              ["tafsir", "Tafsir"],
              ["app", tr("Mushaf & AI", "Mushaf & AI")],
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
                {tr(
                  "Kelola halaman mushaf dan model AI Tasmi' agar seluruh fitur bisa dipakai tanpa internet.",
                  "Manage mushaf pages and the Tasmi' AI model so every feature works offline.",
                )}
                {storage && (
                  <span className="dl-panel__storage">
                    {" "}
                    · {tr("Penyimpanan aplikasi", "App storage")} {formatBytes(storage.used)} {tr("dari", "of")} {formatBytes(storage.quota)}
                  </span>
                )}
              </p>
              <ul className="dl-list">
                <li className="dl-item">
                  <div className="dl-item__main">
                    <div className="dl-item__name">
                      <span>{tr("Huruf Madinah 1405 (604 halaman)", "Madinah 1405 Script (604 pages)")}</span>
                      {(offlinePages.bundled || offlinePages.status === "done") && (
                        <span className="dl-item__badge">{tr("Siap offline", "Ready offline")}</span>
                      )}
                    </div>
                    <div className="dl-item__sub">
                      {offlinePages.bundled
                        ? tr("Sudah termasuk di dalam paket aplikasi ini.", "Included in this app bundle.")
                        : !offlinePages.supported
                          ? tr("Cache halaman offline tidak didukung di browser ini.", "Offline page caching is not supported in this browser.")
                          : offlinePages.status === "running"
                            ? tr(
                                `Mengunduh ${offlinePages.done}/${offlinePages.total} halaman…`,
                                `Downloading ${offlinePages.done}/${offlinePages.total} pages…`,
                              )
                            : offlinePages.status === "done"
                              ? tr(
                                  `Semua ${offlinePages.total} halaman tersimpan offline.`,
                                  `All ${offlinePages.total} pages saved offline.`,
                                )
                              : offlinePages.status === "error"
                                ? tr(
                                    `Sebagian gagal (${offlinePages.done}/${offlinePages.total}). Coba lagi.`,
                                    `Some pages failed (${offlinePages.done}/${offlinePages.total}). Try again.`,
                                  )
                                : offlinePages.done > 0
                                  ? tr(
                                      `${offlinePages.done}/${offlinePages.total} halaman tersimpan. Unduh sisanya (±47 MB total) agar mushaf bisa dibaca tanpa internet.`,
                                      `${offlinePages.done}/${offlinePages.total} pages saved. Download the rest (~47 MB total) to read offline.`,
                                    )
                                  : tr(
                                      "Simpan semua 604 halaman huruf 1405 (±47 MB) untuk dibaca tanpa internet.",
                                      "Save all 604 pages of the 1405 script (~47 MB) for offline reading.",
                                    )}
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
                          ? tr("Batal", "Cancel")
                          : offlinePages.status === "error"
                            ? tr("Coba lagi", "Retry")
                            : offlinePages.done > 0
                              ? tr("Lanjutkan", "Resume")
                              : tr("Unduh", "Download")}
                      </button>
                    </div>
                  )}
                </li>

                <li className="dl-item">
                  <div className="dl-item__main">
                    <div className="dl-item__name">
                      <span>{tr("Huruf Madinah 1441 (604 halaman)", "Madinah 1441 Script (604 pages)")}</span>
                      {tajweedPages.status === "done" && (
                        <span className="dl-item__badge">{tr("Siap offline", "Ready offline")}</span>
                      )}
                    </div>
                    <div className="dl-item__sub">
                      {tajweedPages.status === "running"
                        ? tr(
                            `Mengunduh ${tajweedPages.done}/${tajweedPages.total} halaman…`,
                            `Downloading ${tajweedPages.done}/${tajweedPages.total} pages…`,
                          )
                        : tajweedPages.status === "done"
                          ? tr(
                              `Semua ${tajweedPages.total} halaman tersimpan offline.`,
                              `All ${tajweedPages.total} pages saved offline.`,
                            )
                          : tajweedPages.status === "error"
                            ? tr(
                                `Sebagian gagal (${tajweedPages.done}/${tajweedPages.total}). Coba lagi.`,
                                `Some pages failed (${tajweedPages.done}/${tajweedPages.total}). Try again.`,
                              )
                            : tajweedPages.done > 0
                              ? tr(
                                  `${tajweedPages.done}/${tajweedPages.total} halaman tersimpan. Unduh sisanya (±47 MB total) agar huruf 1441 dan tajwid berwarna bisa dipakai tanpa internet.`,
                                  `${tajweedPages.done}/${tajweedPages.total} pages saved. Download the rest (~47 MB total) to use the 1441 script and color tajweed offline.`,
                                )
                              : tr(
                                  "Dipakai gaya huruf Madinah 1441 dan tajwid berwarna (±47 MB), agar bisa dibaca tanpa internet.",
                                  "Used by Madinah 1441 script and color tajweed (~47 MB) for offline reading.",
                                )}
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
                          ? tr("Batal", "Cancel")
                          : tajweedPages.status === "error"
                            ? tr("Coba lagi", "Retry")
                            : tajweedPages.done > 0
                              ? tr("Lanjutkan", "Resume")
                              : tr("Unduh", "Download")}
                      </button>
                    </div>
                  )}
                </li>

                <li className="dl-item">
                  <div className="dl-item__main">
                    <div className="dl-item__name">
                      <span>{tr("Model AI Tasmi'", "Tasmi' AI Model")}</span>
                      {tilawaSaved && !tilawaBusy && (
                        <span className="dl-item__badge">{tr("Tersimpan", "Saved")}</span>
                      )}
                    </div>
                    <div className="dl-item__sub">
                      {tilawaBusy
                        ? tilawaPct !== null
                          ? tr(`Mengunduh model AI… ${tilawaPct}%`, `Downloading AI model… ${tilawaPct}%`)
                          : tr("Menyiapkan model AI Tasmi'…", "Preparing Tasmi' AI model…")
                        : tilawaError
                          ? tilawaError
                          : tilawaSaved
                            ? tr("Siap menyimak hafalan tanpa internet.", "Ready to check recitation offline.")
                            : tr(
                                "Model pengenalan bacaan untuk fitur Tasmi' (setoran hafalan).",
                                "Speech recognition model for Tasmi' (memorization recitation check).",
                              )}
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
                        {tr("Batal", "Cancel")}
                      </button>
                    ) : tilawaSaved ? (
                      <button
                        type="button"
                        className="dl-btn dl-btn--small dl-btn--ghost"
                        onClick={() => void removeTilawaModel()}
                        aria-label={tr("Hapus model AI Tasmi'", "Delete Tasmi' AI model")}
                      >
                        {tr("Hapus", "Delete")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="dl-btn dl-btn--small"
                        onClick={startTilawaDownload}
                      >
                        {tr("Unduh", "Download")}
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
                <div className="dl-panel__field">
                  <span>{tr("Qari", "Reciter")}</span>
                  <GlassSelect
                    ariaLabel={tr("Pilih Qari", "Select Reciter")}
                    value={reciterId}
                    disabled={busy}
                    options={reciters.map((r) => ({ value: r.id, label: r.name }))}
                    onChange={onChangeReciter}
                  />
                </div>

                <p className="dl-panel__summary">
                  {status ? (
                    <>
                      {tr("Tersimpan", "Saved")} <strong>{status.cachedAyahs.toLocaleString(locale)}</strong>{" "}
                      {tr("dari", "of")} {status.totalAyahs.toLocaleString(locale)} {tr("ayat", "ayahs")} ·{" "}
                      {formatBytes(status.bytes)}
                    </>
                  ) : (
                    tr("Membaca unduhan...", "Reading downloads...")
                  )}
                  {storage && (
                    <span className="dl-panel__storage">
                      {" "}
                      · {tr("Penyimpanan aplikasi", "App storage")} {formatBytes(storage.used)} {tr("dari", "of")}{" "}
                      {formatBytes(storage.quota)}
                    </span>
                  )}
                </p>

                <button
                  type="button"
                  role="switch"
                  aria-checked={wifiOnly}
                  className="dl-panel__check"
                  onClick={() => downloads.setWifiOnly(!wifiOnly)}
                >
                  <span>{tr("Hanya unduh lewat Wi-Fi", "Download over Wi-Fi only")}</span>
                  <span className={`app-menu__switch ${wifiOnly ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
                </button>
              </section>

              {segmentDownloads && (
                <section className="dl-panel__section">
                  <h3 className="dl-panel__heading">
                    {tr("Highlight per kata (offline)", "Word-by-word highlight (offline)")}
                  </h3>
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
                            <span>{tr("Penanda waktu per kata", "Word timing markers")}</span>
                            {segComplete && (
                              <span className="dl-item__badge">{tr("Siap offline", "Ready offline")}</span>
                            )}
                          </div>
                          <div className="dl-item__sub">
                            {!segStatus
                              ? tr("Memeriksa cache...", "Checking cache...")
                              : !supported
                                ? tr(
                                    "Highlight per kata belum tersedia untuk qari ini.",
                                    "Word highlight is not yet available for this reciter.",
                                  )
                                : segRunning
                                  ? tr(
                                      `Mengunduh ${segmentDownloads.done}/${segmentDownloads.total} surah`,
                                      `Downloading ${segmentDownloads.done}/${segmentDownloads.total} surahs`,
                                    )
                                  : segmentDownloads.phase === "error"
                                    ? tr(
                                        `${segmentDownloads.failed.length || "Sebagian"} surah gagal diunduh. Coba lagi.`,
                                        `${segmentDownloads.failed.length || "Some"} surahs failed to download. Try again.`,
                                      )
                                    : segComplete
                                      ? tr(
                                          `Tersimpan · ${segTotal} surah · ${formatBytes(segStatus.bytes)}`,
                                          `Saved · ${segTotal} surahs · ${formatBytes(segStatus.bytes)}`,
                                        )
                                      : segCached > 0
                                        ? tr(
                                            `${segCached}/${segTotal} surah · ${formatBytes(segStatus.bytes)}`,
                                            `${segCached}/${segTotal} surahs · ${formatBytes(segStatus.bytes)}`,
                                          )
                                        : tr(
                                            "Simpan 114 surah agar sorotan per kata tetap jalan tanpa internet.",
                                            "Save all 114 surahs so word highlighting keeps working offline.",
                                          )}
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
                                {tr("Batal", "Cancel")}
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
                                      ? tr("Coba lagi", "Retry")
                                      : segCached > 0
                                        ? tr("Lanjut", "Resume")
                                        : tr("Unduh", "Download")}
                                  </button>
                                )}
                                {segCached > 0 && (
                                  <button
                                    type="button"
                                    className="dl-btn dl-btn--small dl-btn--ghost"
                                    onClick={() => void segmentDownloads.remove()}
                                    aria-label={tr("Hapus cache highlight per kata", "Delete word highlight cache")}
                                  >
                                    {tr("Hapus", "Delete")}
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
                        {tr("Mengunduh", "Downloading")} <strong>{current?.name ?? ""}</strong> {state.done}/{state.total}
                        {state.queue.length > 0 && (
                          <>
                            {" "}
                            · {state.queue.length} {tr("surah menunggu", "surahs queued")}
                          </>
                        )}
                      </div>
                      <div className="dl-bar" aria-hidden="true">
                        <div className="dl-bar__fill" style={{ width: `${state.total ? (state.done / state.total) * 100 : 0}%` }} />
                      </div>
                      <div className="dl-panel__row">
                        <button type="button" className="dl-btn dl-btn--ghost" onClick={downloads.cancel}>
                          {tr("Batalkan", "Cancel")}
                        </button>
                      </div>
                    </>
                  )}
                  {state.phase === "waiting-wifi" && (
                    <>
                      <div className="dl-panel__status-text">
                        {tr(
                          `Menunggu Wi-Fi · ${state.queue.length} surah belum diunduh`,
                          `Waiting for Wi-Fi · ${state.queue.length} surahs remaining`,
                        )}
                      </div>
                      <div className="dl-panel__row">
                        <button type="button" className="dl-btn" onClick={downloads.resume}>
                          {tr("Lanjut dengan data seluler", "Continue on mobile data")}
                        </button>
                        <button type="button" className="dl-btn dl-btn--ghost" onClick={downloads.cancel}>
                          {tr("Batalkan", "Cancel")}
                        </button>
                      </div>
                    </>
                  )}
                  {state.phase === "error" && (
                    <>
                      <div className="dl-panel__status-text">
                        {tr(
                          `${state.failed.length} surah gagal diunduh. Periksa koneksi lalu coba lagi.`,
                          `${state.failed.length} surahs failed to download. Check your connection and try again.`,
                        )}
                      </div>
                      <div className="dl-panel__row">
                        <button type="button" className="dl-btn" onClick={() => download(state.failed)}>
                          {tr("Coba lagi", "Retry")}
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}

              <section className="dl-panel__section">
                <h3 className="dl-panel__heading">{tr("Unduh cepat", "Quick download")}</h3>
                <div className="dl-panel__quick">
                  <button
                    type="button"
                    className="dl-btn"
                    onClick={() => download([activeSurah])}
                    title={
                      active
                        ? tr(`Unduh Surah ${active.name}`, `Download Surah ${active.name}`)
                        : tr("Unduh surah ini", "Download this surah")
                    }
                  >
                    {active ? active.name : tr("Surah ini", "This surah")}
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
                    {confirm === "all" ? tr("Konfirmasi", "Confirm") : tr("Semua", "All")}
                  </button>
                </div>
                {confirm === "all" && (
                  <p className="dl-panel__warn">
                    {tr(
                      "Seluruh Al-Quran bisa memakai ratusan MB. Pastikan ruang dan kuota cukup.",
                      "The full Quran can use hundreds of MB. Make sure you have enough storage and data.",
                    )}{" "}
                    <button type="button" className="dl-link" onClick={() => setConfirm(null)}>
                      {tr("Batal", "Cancel")}
                    </button>
                  </p>
                )}
                {notice && <p className="dl-panel__notice">{notice}</p>}
              </section>

              <section className="dl-panel__section">
                <h3 className="dl-panel__heading">{tr("Per surah", "By surah")}</h3>
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
                              ? tr(`Mengunduh ${state.done}/${state.total}`, `Downloading ${state.done}/${state.total}`)
                              : isQueued
                                ? tr("Dalam antrean", "Queued")
                                : complete
                                  ? `${tr("Tersimpan", "Saved")} · ${formatBytes(entry?.bytes ?? 0)}`
                                  : cached > 0
                                    ? `${cached}/${surah.ayahs} ${tr("ayat", "ayahs")}`
                                    : `${surah.ayahs} ${tr("ayat", "ayahs")}`}
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
                              {tr("Unduh", "Download")}
                            </button>
                          )}
                          {cached > 0 && !isCurrent && !isQueued && (
                            <button
                              type="button"
                              className="dl-btn dl-btn--small dl-btn--ghost"
                              onClick={() => void downloads.removeSurahs([surah.number])}
                              aria-label={tr(`Hapus unduhan ${surah.name}`, `Delete download ${surah.name}`)}
                            >
                              {tr("Hapus", "Delete")}
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
                  {confirm === "clear"
                    ? tr("Ketuk lagi: hapus semua unduhan qari ini", "Tap again: delete all downloads for this reciter")
                    : tr("Hapus semua unduhan qari ini", "Delete all downloads for this reciter")}
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
