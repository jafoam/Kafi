import { useEffect, useRef, useState } from "react";
import type { AyahKey, ReciterInfo } from "../data/types";
import type { QuranApi } from "../services/quran-api";

export interface CompareAudioModalProps {
  open: boolean;
  ayah: AyahKey | null;
  surahName: string;
  reciter: ReciterInfo;
  quranApi: QuranApi;
  getArabicText: (ayah: AyahKey) => Promise<string>;
  onClose: () => void;
}

type PlayMode = "idle" | "qari" | "user" | "ab-qari" | "ab-user";

export function CompareAudioModal({
  open,
  ayah,
  surahName,
  reciter,
  quranApi,
  getArabicText,
  onClose,
}: CompareAudioModalProps) {
  const [arabicText, setArabicText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<PlayMode>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userUrlRef = useRef<string | null>(null);
  const playAbortRef = useRef<AbortController | null>(null);

  const stopPlayback = () => {
    playAbortRef.current?.abort();
    playAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlayMode("idle");
  };

  const stopRecording = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore already-stopped recorder
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    setRecording(false);
  };

  useEffect(() => {
    if (!open || !ayah) return;
    setError(null);
    setArabicText("");
    let live = true;
    void getArabicText(ayah)
      .then((txt) => {
        if (live) setArabicText(txt);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      stopRecording();
      stopPlayback();
      if (userUrlRef.current) {
        URL.revokeObjectURL(userUrlRef.current);
        userUrlRef.current = null;
      }
      setUserAudioUrl(null);
      setRecSec(0);
    };
  }, [open, ayah, getArabicText]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !ayah) return null;

  const [surahNum, ayahNum] = ayah.split(":").map(Number);

  const playUrl = (url: string, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
        signal.removeEventListener("abort", onAbort);
        if (audioRef.current === audio) audioRef.current = null;
      };
      const onAbort = () => {
        cleanup();
        audio.pause();
        audio.src = "";
        resolve();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("Gagal memutar audio."));
      };
      void audio.play().catch((err) => {
        cleanup();
        reject(err);
      });
    });

  const handleToggleRecord = async () => {
    setError(null);
    if (recording) {
      stopRecording();
      return;
    }
    stopPlayback();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Browser ini belum mendukung perekaman mikrofon (MediaRecorder).");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) {
          if (userUrlRef.current) URL.revokeObjectURL(userUrlRef.current);
          const url = URL.createObjectURL(blob);
          userUrlRef.current = url;
          setUserAudioUrl(url);
        }
      };
      recorder.start();
      setRecording(true);
      setRecSec(0);
      timerRef.current = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch {
      setError("Izin mikrofon ditolak atau mikrofon tidak tersedia.");
      stopRecording();
    }
  };

  const handlePlayQari = async () => {
    setError(null);
    if (playMode === "qari") {
      stopPlayback();
      return;
    }
    stopRecording();
    stopPlayback();
    const abort = new AbortController();
    playAbortRef.current = abort;
    setPlayMode("qari");
    try {
      const { url } = await quranApi.getAudioBlobUrl(reciter.subfolder, surahNum, ayahNum, abort.signal);
      if (!abort.signal.aborted) await playUrl(url, abort.signal);
    } catch (err) {
      if (!abort.signal.aborted) {
        setError(err instanceof Error ? err.message : "Gagal memuat audio qari.");
      }
    } finally {
      if (playAbortRef.current === abort) setPlayMode("idle");
    }
  };

  const handlePlayUser = async () => {
    setError(null);
    if (!userAudioUrl) return;
    if (playMode === "user") {
      stopPlayback();
      return;
    }
    stopRecording();
    stopPlayback();
    const abort = new AbortController();
    playAbortRef.current = abort;
    setPlayMode("user");
    try {
      await playUrl(userAudioUrl, abort.signal);
    } catch (err) {
      if (!abort.signal.aborted) {
        setError(err instanceof Error ? err.message : "Gagal memutar rekaman.");
      }
    } finally {
      if (playAbortRef.current === abort) setPlayMode("idle");
    }
  };

  const handlePlayCompareAB = async () => {
    setError(null);
    if (!userAudioUrl) return;
    if (playMode === "ab-qari" || playMode === "ab-user") {
      stopPlayback();
      return;
    }
    stopRecording();
    stopPlayback();
    const abort = new AbortController();
    playAbortRef.current = abort;
    try {
      setPlayMode("ab-qari");
      const { url } = await quranApi.getAudioBlobUrl(reciter.subfolder, surahNum, ayahNum, abort.signal);
      if (abort.signal.aborted) return;
      await playUrl(url, abort.signal);
      if (abort.signal.aborted) return;
      setPlayMode("ab-user");
      await playUrl(userAudioUrl, abort.signal);
    } catch (err) {
      if (!abort.signal.aborted) {
        setError(err instanceof Error ? err.message : "Gagal memutar perbandingan A/B.");
      }
    } finally {
      if (playAbortRef.current === abort) setPlayMode("idle");
    }
  };

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Rekam & Bandingkan Suara dengan Qari"
      onClick={onClose}
    >
      <div className="tasmi-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">Rekam &amp; Bandingkan</h2>
            <p className="tasmi-sheet__subtitle">
              {surahName} : {ayahNum} · Qari: {reciter.name} (lokal di perangkat)
            </p>
          </div>
          <button type="button" className="ayah-popover__close" aria-label="Tutup" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tasmi-sheet__body">
          {arabicText && (
            <div className="compare-audio__ayah" dir="rtl" lang="ar">
              {arabicText}
            </div>
          )}

          <div className="compare-audio__controls">
            <button
              type="button"
              className={`tasmi-sheet__start-btn ${recording ? "compare-audio__rec--active" : ""}`}
              onClick={() => void handleToggleRecord()}
            >
              {recording ? `■ Stop Rekam (${recSec} dtk)` : "● Rekam Suaraku"}
            </button>

            <div className="compare-audio__row">
              <button
                type="button"
                className={`tasmi-sheet__history-btn compare-audio__btn ${
                  playMode === "qari" || playMode === "ab-qari" ? "compare-audio__btn--active" : ""
                }`}
                onClick={() => void handlePlayQari()}
              >
                {playMode === "qari" ? "■ Stop Qari" : "▶ Suara Qari"}
              </button>
              <button
                type="button"
                className={`tasmi-sheet__history-btn compare-audio__btn ${
                  playMode === "user" || playMode === "ab-user" ? "compare-audio__btn--active" : ""
                }`}
                disabled={!userAudioUrl}
                onClick={() => void handlePlayUser()}
              >
                {playMode === "user" ? "■ Stop Rekamanku" : "▶ Rekamanku"}
              </button>
            </div>

            <button
              type="button"
              className="sync-secondary-btn"
              disabled={!userAudioUrl}
              onClick={() => void handlePlayCompareAB()}
            >
              {playMode === "ab-qari"
                ? "Memutar Qari… (1/2)"
                : playMode === "ab-user"
                  ? "Memutar Rekamanku… (2/2)"
                  : "⇄ Putar Bergantian (Qari → Saya)"}
            </button>
          </div>

          {error && <div className="tasmi-sheet__error">{error}</div>}
          <p className="tasmi-sheet__option-scope">
            Rekaman hanya disimpan sementara di memori perangkat dan dihapus otomatis saat jendela ditutup.
          </p>
        </div>
      </div>
    </div>
  );
}
