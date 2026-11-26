import { useEffect, useState } from "react";
import { useBackClose } from "../state/useBackClose";
import type { AyahKey, ReciterInfo } from "../data/types";
import type { AudioState, PlaybackScope, RepeatCount } from "../services/audio-controller";
import { PlaybackMenu, scopeLabel } from "./PlaybackMenu";

export interface AudioDockProps {
  audioState: AudioState;
  activeAyah: AyahKey;
  surahName: string;
  surahNumber: number;
  surahAyahCount: number;
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
  onChangeScope: (scope: PlaybackScope) => void;
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
  surahNumber,
  surahAyahCount,
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
  onChangeScope,
  onDownloadSurah,
  onOpenStudy,
  onOpenTasmi,
}: AudioDockProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reciterOpen, setReciterOpen] = useState(false);
  useBackClose(menuOpen, () => setMenuOpen(false));
  useBackClose(reciterOpen, () => setReciterOpen(false));

  useEffect(() => {
    if (!reciterOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReciterOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reciterOpen]);

  const ayahNum = activeAyah.split(":")[1];
  const isDownloading = downloadProgress !== null;
  const activeReciter = reciters.find((r) => r.id === audioState.reciterId) ?? reciters[0];

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
              <span className="audio-dock__title-full">
                {surahName} : {ayahNum}
              </span>
              <span className="audio-dock__title-short">Ayat {ayahNum}</span>
            </span>
            {audioState.error ? (
              <span className="audio-dock__status audio-dock__status--error">
                Gagal memuat
              </span>
            ) : audioState.isBismillah ? (
              <span className="audio-dock__status">Basmalah</span>
            ) : audioState.fromCache && audioState.currentAyah ? (
              <span className="audio-dock__status">Offline</span>
            ) : null}
          </button>

          {activeReciter && (
            <button
              type="button"
              className={`audio-dock__reciter-btn ${reciterOpen ? "audio-dock__reciter-btn--open" : ""}`}
              onClick={() => {
                setMenuOpen(false);
                setReciterOpen((open) => !open);
              }}
              aria-label={`Qari: ${activeReciter.name}. Ketuk untuk mengganti`}
              aria-haspopup="dialog"
              aria-expanded={reciterOpen}
              title={`Qari: ${activeReciter.name} — klik untuk mengganti`}
            >
              <span className="audio-dock__reciter-name">{activeReciter.name}</span>
              <svg
                className="audio-dock__reciter-chevron"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}
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
            className={`audio-dock__pill-btn audio-dock__repeat-btn ${audioState.repeatCount !== 1 ? "audio-dock__pill-btn--active" : ""}`}
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
            className={`audio-dock__pill-btn audio-dock__scope-btn ${audioState.scope.kind !== "continue" || audioState.repeatCount !== 1 || audioState.speed !== 1 ? "audio-dock__pill-btn--active" : ""}`}
            onClick={() => {
              setReciterOpen(false);
              setMenuOpen((open) => !open);
            }}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label="Mode putar, ulang ayat, dan kecepatan"
            title="Mode putar: ulang surah, halaman, juz, ulang ayat, dan kecepatan"
          >
            <svg className="audio-dock__pill-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h11M4 12h11M4 17h7" />
              <path d="m17 14 4 3-4 3z" fill="currentColor" />
            </svg>
            <span className="audio-dock__pill-text">{scopeLabel(audioState.scope)}</span>
          </button>

          <button
            type="button"
            className={`audio-dock__pill-btn audio-dock__speed-btn ${audioState.speed !== 1 ? "audio-dock__pill-btn--active" : ""}`}
            onClick={onCycleSpeed}
            aria-label={`Kecepatan: ${audioState.speed}x`}
            title="Kecepatan bacaan"
          >
            {audioState.speed}×
          </button>

          <button
            type="button"
            className={`audio-dock__pill-btn audio-dock__download-btn ${isSurahDownloaded ? "audio-dock__pill-btn--active" : ""}`}
            onClick={onDownloadSurah}
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
      {reciterOpen && (
        <>
          <button
            type="button"
            className="playback-menu__backdrop"
            aria-label="Tutup daftar qari"
            onClick={() => setReciterOpen(false)}
          />
          <div className="reciter-menu" role="dialog" aria-label="Pilih Qari">
            <div className="playback-menu__title">Pilih Qari</div>
            <div className="reciter-menu__list" role="radiogroup" aria-label="Daftar Qari">
              {reciters.map((r) => {
                const active = r.id === audioState.reciterId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`reciter-menu__item ${active ? "reciter-menu__item--active" : ""}`}
                    onClick={() => {
                      onChangeReciter(r.id);
                      setReciterOpen(false);
                    }}
                  >
                    <span className="reciter-menu__names">
                      <span className="reciter-menu__latin">{r.name}</span>
                      <span className="reciter-menu__arabic" lang="ar" dir="rtl">
                        {r.arabicName}
                      </span>
                    </span>
                    {active && (
                      <svg
                        className="reciter-menu__check"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      {menuOpen && (
        <PlaybackMenu
          scope={audioState.scope}
          repeatCount={audioState.repeatCount}
          speed={audioState.speed}
          surahNumber={surahNumber}
          surahName={surahName}
          ayahCount={surahAyahCount}
          activeAyah={activeAyah}
          onChange={onChangeScope}
          onCycleRepeat={onCycleRepeat}
          onCycleSpeed={onCycleSpeed}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
