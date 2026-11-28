import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AyahKey, HighlightColor, TasmiMistakeRecord } from "../data/types";
import type { QuranApi } from "../services/quran-api";
import { formatErrorClass } from "../services/tasmi-logic";

export interface AyahPopoverProps {
  ayah: AyahKey;
  surahName: string;
  anchorRect: DOMRect;
  quranApi: QuranApi;
  translationId: number;
  /** Uthmani text of the ayah, for Salin and Bagikan. */
  getArabicText: (ayah: AyahKey) => Promise<string>;
  isBookmarked: boolean;
  highlightColor: HighlightColor | null;
  /** Tasmi' mistakes recorded on this ayah (active or most recent session). */
  tasmiMistakes?: TasmiMistakeRecord[];
  onClose: () => void;
  onPlayAyah?: (ayah: AyahKey) => void;
  onOpenStudy?: (ayah: AyahKey) => void;
  onStartTasmi?: (ayah: AyahKey) => void;
  onCompareAudio?: (ayah: AyahKey) => void;
  onToggleBookmark: (ayah: AyahKey) => void;
  onSetHighlight: (ayah: AyahKey, color: HighlightColor | null) => void;
  /** Whether this ayah is hidden on the page now. */
  isHidden?: boolean;
  onToggleHidden?: (ayah: AyahKey) => void;
}

function htmlToPlainText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  el.querySelectorAll("sup").forEach((sup) => sup.remove());
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

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
  getArabicText,
  isBookmarked,
  highlightColor,
  tasmiMistakes,
  onClose,
  onPlayAyah,
  onOpenStudy,
  onStartTasmi,
  onCompareAudio,
  onToggleBookmark,
  onSetHighlight,
  isHidden = false,
  onToggleHidden,
}: AyahPopoverProps) {
  const ayahNum = ayah.split(":")[1] ?? "";
  const popoverRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>(() => ({
    w: 310,
    h: 220,
  }));
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

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const buildShareText = async (): Promise<string> => {
    const arabic = await getArabicText(ayah).catch(() => "");
    const meaning = translation.status === "ready" ? htmlToPlainText(translation.html) : "";
    return [arabic, meaning, `QS. ${surahName}: ${ayahNum}`].filter(Boolean).join("\n\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(await buildShareText());
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure context, denied permission); nothing to undo.
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({ text: await buildShareText() });
    } catch {
      // The user closed the share sheet.
    }
  };

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const measure = () => {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
      setSize((prev) =>
        prev.w === el.offsetWidth && prev.h === el.offsetHeight
          ? prev
          : { w: el.offsetWidth, h: el.offsetHeight },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ayah, translation, highlightColor, isHidden, onToggleHidden, tasmiMistakes]);

  const vw =
    typeof window !== "undefined"
      ? Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth)
      : 1024;
  const vh =
    typeof window !== "undefined"
      ? Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight)
      : 768;

  const edgePad = 12;
  const gap = 10;
  const maxHeight = Math.max(180, vh - edgePad * 2);
  const effectiveH = Math.min(size.h, maxHeight);
  const preferredLeft = anchorRect.left + anchorRect.width / 2 - size.w / 2;
  const left = Math.max(edgePad, Math.min(vw - size.w - edgePad, preferredLeft));
  const spaceAbove = anchorRect.top - edgePad - gap;
  const spaceBelow = vh - anchorRect.bottom - edgePad - gap;
  const placeAbove =
    effectiveH <= spaceAbove || (effectiveH > spaceBelow && spaceAbove >= spaceBelow);
  const rawTop = placeAbove ? anchorRect.top - effectiveH - gap : anchorRect.bottom + gap;
  const top = Math.max(edgePad, Math.min(vh - effectiveH - edgePad, rawTop));

  return (
    <div
      ref={popoverRef}
      className="ayah-popover"
      role="dialog"
      aria-label={`Aksi untuk ${surahName} ayat ${ayahNum}`}
      style={{ left, top, maxHeight }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ayah-popover__header">
        <span className="ayah-popover__title">
          {surahName} : {ayahNum}
        </span>
        <button type="button" className="ayah-popover__close" aria-label="Tutup" onClick={onClose}>
          ×
        </button>
      </div>

      {tasmiMistakes && tasmiMistakes.length > 0 && (
        <div className="ayah-popover__mistakes" aria-label="Catatan kesalahan Tasmi'">
          <div className="ayah-popover__mistakes-title">
            Catatan Tasmi&apos; ({tasmiMistakes.length})
          </div>
          <ul className="ayah-popover__mistakes-list">
            {tasmiMistakes.map((m) => (
              <li key={m.id} className="ayah-popover__mistake-row">
                <span className="ayah-popover__mistake-badge">
                  {formatErrorClass(m.errorClass)}
                </span>
                {m.wordText && (
                  <span className="ayah-popover__mistake-word" dir="rtl" lang="ar">
                    {m.wordText}
                  </span>
                )}
                {typeof m.word === "number" && m.word > 0 && (
                  <span className="ayah-popover__mistake-pos">kata {m.word}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
          Putar dari sini
        </button>
        <button type="button" className="ayah-popover__action" onClick={() => onOpenStudy?.(ayah)}>
          Tafsir
        </button>
        <button type="button" className="ayah-popover__action" onClick={() => onStartTasmi?.(ayah)}>
          Tasmi&apos; dari sini
        </button>
        {onCompareAudio && (
          <button
            type="button"
            className="ayah-popover__action"
            onClick={() => onCompareAudio(ayah)}
            title="Rekam suaramu lalu bandingkan dengan qari"
          >
            Bandingkan Suara
          </button>
        )}
      </div>

      <div className="ayah-popover__meta-row">
        <div className="ayah-popover__pills">
          <button
            type="button"
            className="ayah-popover__bookmark-btn"
            onClick={() => void handleCopy()}
            aria-live="polite"
          >
            {copied ? "Tersalin" : "Salin"}
          </button>
          {canShare && (
            <button
              type="button"
              className="ayah-popover__bookmark-btn"
              onClick={() => void handleShare()}
            >
              Bagikan
            </button>
          )}
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
        </div>

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

      {onToggleHidden && (
        <button
          type="button"
          role="switch"
          aria-checked={isHidden}
          className={`ayah-popover__hide${isHidden ? " ayah-popover__hide--on" : ""}`}
          onClick={() => onToggleHidden(ayah)}
        >
          <svg
            className="ayah-popover__hide-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {isHidden ? (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </>
            ) : (
              <>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
          <span className="ayah-popover__hide-label">Sembunyikan ayat ini</span>
          <span
            className={`app-menu__switch ${isHidden ? "app-menu__switch--on" : ""}`}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
