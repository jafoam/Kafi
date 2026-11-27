import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AyahKey, HighlightColor } from "../data/types";
import type { QuranApi } from "../services/quran-api";

export interface AyahPopoverProps {
  ayah: AyahKey;
  surahName: string;
  anchorRect: DOMRect;
  quranApi: QuranApi;
  translationId: number;
  isBookmarked: boolean;
  highlightColor: HighlightColor | null;
  onClose: () => void;
  onPlayAyah?: (ayah: AyahKey) => void;
  onOpenStudy?: (ayah: AyahKey) => void;
  onStartTasmi?: (ayah: AyahKey) => void;
  onToggleBookmark: (ayah: AyahKey) => void;
  onSetHighlight: (ayah: AyahKey, color: HighlightColor | null) => void;
}

const HIGHLIGHT_COLORS: { color: HighlightColor; label: string }[] = [
  { color: "amber", label: "Kuning" },
  { color: "emerald", label: "Hijau" },
  { color: "sky", label: "Biru" },
  { color: "rose", label: "Merah Muda" },
];

export function AyahPopover({
  ayah,
  surahName,
  anchorRect,
  quranApi,
  translationId,
  isBookmarked,
  highlightColor,
  onClose,
  onPlayAyah,
  onOpenStudy,
  onStartTasmi,
  onToggleBookmark,
  onSetHighlight,
}: AyahPopoverProps) {
  const ayahNum = ayah.split(":")[1] ?? "";
  const popoverRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>(() => ({ w: 310, h: 220 }));
  const [translation, setTranslation] = useState<
    { status: "loading" } | { status: "ready"; html: string } | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    const [surah, num] = ayah.split(":").map(Number);
    const controller = new AbortController();
    setTranslation({ status: "loading" });
    quranApi
      .getTranslation(translationId, surah, num, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setTranslation({ status: "ready", html: res.html });
      })
      .catch(() => {
        if (!controller.signal.aborted) setTranslation({ status: "error" });
      });
    return () => controller.abort();
  }, [ayah, translationId, quranApi]);

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return;
    setSize((prev) =>
      prev.w === el.offsetWidth && prev.h === el.offsetHeight
        ? prev
        : { w: el.offsetWidth, h: el.offsetHeight },
    );
  }, [ayah, translation, highlightColor]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  const preferredLeft = anchorRect.left + anchorRect.width / 2 - size.w / 2;
  const left = Math.max(12, Math.min(vw - size.w - 12, preferredLeft));
  const fitsAbove = anchorRect.top > size.h + 24;
  const top = fitsAbove
    ? Math.max(12, anchorRect.top - size.h - 10)
    : Math.min(vh - size.h - 12, anchorRect.bottom + 10);

  return (
    <div
      ref={popoverRef}
      className="ayah-popover"
      role="dialog"
      aria-label={`Aksi untuk ${surahName} ayat ${ayahNum}`}
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ayah-popover__header">
        <span className="ayah-popover__title">
          {surahName} : {ayahNum}
        </span>
        <button
          type="button"
          className="ayah-popover__close"
          aria-label="Tutup"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="ayah-popover__translation" aria-live="polite">
        {translation.status === "loading" && (
          <span className="ayah-popover__translation-muted">Memuat terjemahan…</span>
        )}
        {translation.status === "error" && (
          <span className="ayah-popover__translation-muted">
            Terjemahan belum tersedia offline.
          </span>
        )}
        {translation.status === "ready" && (
          <p
            className="ayah-popover__translation-text"
            // Sanitized by quran-api before it is cached or returned.
            dangerouslySetInnerHTML={{ __html: translation.html }}
          />
        )}
      </div>

      <div className="ayah-popover__actions">
        <button
          type="button"
          className="ayah-popover__action ayah-popover__action--primary"
          onClick={() => onPlayAyah?.(ayah)}
        >
          Putar
        </button>
        <button
          type="button"
          className="ayah-popover__action"
          onClick={() => onOpenStudy?.(ayah)}
        >
          Tafsir &amp; Terjemahan
        </button>
        <button
          type="button"
          className="ayah-popover__action"
          onClick={() => onStartTasmi?.(ayah)}
        >
          Tasmi&apos; dari sini
        </button>
      </div>

      <div className="ayah-popover__meta-row">
        <button
          type="button"
          className={`ayah-popover__bookmark-btn ${
            isBookmarked ? "ayah-popover__bookmark-btn--active" : ""
          }`}
          aria-pressed={isBookmarked}
          onClick={() => onToggleBookmark(ayah)}
        >
          {isBookmarked ? "Tersimpan" : "Bookmark"}
        </button>

        <div className="hl-swatches" role="group" aria-label="Warna Sorotan">
          {HIGHLIGHT_COLORS.map((item) => (
            <button
              key={item.color}
              type="button"
              className={`hl-swatch hl-swatch--${item.color} ${
                highlightColor === item.color ? "hl-swatch--active" : ""
              }`}
              aria-label={`Sorot ${item.label}`}
              aria-pressed={highlightColor === item.color}
              onClick={() =>
                onSetHighlight(ayah, highlightColor === item.color ? null : item.color)
              }
            />
          ))}
          {highlightColor && (
            <button
              type="button"
              className="hl-swatch hl-swatch--clear"
              aria-label="Hapus sorotan"
              title="Hapus sorotan"
              onClick={() => onSetHighlight(ayah, null)}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
