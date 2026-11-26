import type { AyahKey, HighlightColor } from "../data/types";

export interface AyahPopoverProps {
  ayah: AyahKey;
  surahName: string;
  anchorRect: DOMRect;
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
  const popoverWidth = 310;
  const popoverHeight = 148;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  const preferredLeft = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
  const left = Math.max(12, Math.min(vw - popoverWidth - 12, preferredLeft));
  const fitsAbove = anchorRect.top > popoverHeight + 24;
  const top = fitsAbove
    ? Math.max(12, anchorRect.top - popoverHeight - 10)
    : Math.min(vh - popoverHeight - 12, anchorRect.bottom + 10);

  return (
    <div
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
