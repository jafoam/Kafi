import type { AyahKey, ReciterInfo } from "../data/types";
import type { AudioState, RepeatCount } from "../services/audio-controller";

export interface AudioDockProps {
  audioState: AudioState;
  activeAyah: AyahKey;
  surahName: string;
  reciters: ReciterInfo[];
  hidden: boolean;
  downloadProgress: { done: number; total: number } | null;
  isSurahDownloaded: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onChangeReciter: (reciterId: string) => void;
  onCycleRepeat: () => void;
  onCycleSpeed: () => void;
  onDownloadSurah: () => void;
  onOpenStudy: () => void;
  onOpenTasmi: () => void;
}

function formatRepeat(repeat: RepeatCount): string {
  return repeat === Infinity ? "∞" : `${repeat}×`;
}

export function AudioDock({
  audioState,
  activeAyah,
  surahName,
  reciters,
  hidden,
  downloadProgress,
  isSurahDownloaded,
  onTogglePlay,
  onPrev,
  onNext,
  onChangeReciter,
  onCycleRepeat,
  onCycleSpeed,
  onDownloadSurah,
  onOpenStudy,
  onOpenTasmi,
}: AudioDockProps) {
  const ayahNum = activeAyah.split(":")[1];
  const isDownloading = downloadProgress !== null;

  return (
    <div className="audio-dock-zone">
      <section
        className={`audio-dock ${hidden ? "audio-dock--hidden" : ""}`}
        aria-label="Pemutar Murottal"
      >
        <div className="audio-dock__info">
          <button
            type="button"
            className="audio-dock__ayah-btn"
            onClick={onOpenStudy}
            title="Buka Terjemahan, Tafsir & Catatan"
          >
            <span className="audio-dock__ayah-title">
              {surahName} : {ayahNum}
            </span>
            {audioState.error ? (
              <span className="audio-dock__status audio-dock__status--error">
                Gagal memuat
              </span>
            ) : audioState.fromCache && audioState.currentAyah ? (
              <span className="audio-dock__status">Offline</span>
            ) : null}
          </button>
        </div>

        <div className="audio-dock__transport">
          <button
            type="button"
            className="audio-dock__icon-btn"
            onClick={onPrev}
            aria-label="Ayat sebelumnya"
            title="Ayat sebelumnya"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
            </svg>
          </button>

          <button
            type="button"
            className="audio-dock__play-btn"
            onClick={onTogglePlay}
            aria-label={audioState.isPlaying ? "Jeda murottal" : "Putar murottal"}
            title={audioState.isPlaying ? "Jeda (Spasi)" : "Putar (Spasi)"}
          >
            {audioState.isLoading ? (
              <span className="audio-dock__spinner" aria-hidden="true" />
            ) : audioState.isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7-11-7z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="audio-dock__icon-btn"
            onClick={onNext}
            aria-label="Ayat berikutnya"
            title="Ayat berikutnya"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z" />
            </svg>
          </button>
        </div>

        <div className="audio-dock__controls">
          <button
            type="button"
            className={`audio-dock__pill-btn ${audioState.repeatCount !== 1 ? "audio-dock__pill-btn--active" : ""}`}
            onClick={onCycleRepeat}
            aria-label={`Ulang ayat: ${formatRepeat(audioState.repeatCount)}`}
            title="Ulang ayat"
          >
            <svg className="audio-dock__pill-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11V9a3 3 0 0 1 3-3h15" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v2a3 3 0 0 1-3 3H3" />
            </svg>
            <span className="audio-dock__pill-label">Ulang </span>
            {formatRepeat(audioState.repeatCount)}
          </button>

          <button
            type="button"
            className={`audio-dock__pill-btn ${audioState.speed !== 1 ? "audio-dock__pill-btn--active" : ""}`}
            onClick={onCycleSpeed}
            aria-label={`Kecepatan: ${audioState.speed}x`}
            title="Kecepatan bacaan"
          >
            {audioState.speed}×
          </button>

          <select
            className="audio-dock__select"
            aria-label="Pilih Qari"
            value={audioState.reciterId}
            onChange={(e) => onChangeReciter(e.target.value)}
          >
            {reciters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`audio-dock__pill-btn audio-dock__download-btn ${isSurahDownloaded ? "audio-dock__pill-btn--active" : ""}`}
            onClick={onDownloadSurah}
            disabled={isDownloading}
            title={isSurahDownloaded ? "Surah tersimpan offline" : "Unduh audio surah untuk offline"}
          >
            {isDownloading
              ? `${downloadProgress.done}/${downloadProgress.total}`
              : isSurahDownloaded
                ? "Tersimpan offline"
                : "Unduh Surah"}
          </button>

          <button
            type="button"
            className="audio-dock__tasmi-btn"
            onClick={onOpenTasmi}
            aria-label="Mulai Tasmi'"
            title="Mulai Tasmi' (setoran hafalan)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
            </svg>
            <span className="audio-dock__tasmi-label">Tasmi&apos;</span>
          </button>
        </div>
      </section>
    </div>
  );
}
