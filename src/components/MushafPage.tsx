import { useEffect, useState } from "react";
import type { AyahKey, HighlightColor, MistakeBadge, PageEntry } from "../data/types";

export type { MistakeBadge };

export function isCrossOriginHttpUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "asset.localhost") return false;
    return typeof window !== "undefined" && parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export interface MushafPageProps {
  pageEntry: PageEntry;
  imageUrl: string | null;
  side?: "left" | "right" | "single";
  selectedAyah: AyahKey | null;
  playingAyah: AyahKey | null;
  highlights: Record<AyahKey, HighlightColor>;
  bookmarks: Set<AyahKey>;
  blurSet?: Set<AyahKey>;
  revealedSet?: Set<AyahKey>;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  onSelectAyah: (ayah: AyahKey, anchorRect: DOMRect) => void;
  onPeekAyah?: (ayah: AyahKey) => void;
  onRetryPage?: (page: number) => void;
}

export function MushafPage({
  pageEntry,
  imageUrl,
  side = "single",
  selectedAyah,
  playingAyah,
  highlights,
  bookmarks,
  blurSet,
  revealedSet,
  mistakeAyahs,
  onSelectAyah,
  onPeekAyah,
  onRetryPage,
}: MushafPageProps) {
  const [hoveredAyah, setHoveredAyah] = useState<AyahKey | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [imageUrl]);

  return (
    <div
      className="mushaf-page"
      data-side={side}
      data-page={pageEntry.page}
    >
      {(!imageUrl || (!imgLoaded && !imgError)) && (
        <div className="mushaf-page__skeleton" aria-hidden="true" />
      )}

      {imageUrl && !imgError && (
        <img
          key={`${imageUrl}-${retryCount}`}
          className="mushaf-page__img"
          src={imageUrl}
          crossOrigin={isCrossOriginHttpUrl(imageUrl) ? "anonymous" : undefined}
          alt={`Halaman Mushaf ${pageEntry.page}`}
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgLoaded(false);
            setImgError(true);
          }}
        />
      )}

      {imgError && (
        <div
          className="mushaf-page__error"
          role="status"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="mushaf-page__error-text">Halaman belum tersedia offline</p>
          <button
            type="button"
            className="mushaf-page__retry-btn"
            onClick={() => {
              setImgError(false);
              setImgLoaded(false);
              setRetryCount((count) => count + 1);
              onRetryPage?.(pageEntry.page);
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      {side !== "single" && <div className="mushaf-page__spine" aria-hidden="true" />}

      <div className="mushaf-page__overlays">
        {pageEntry.ayahs.map((segment) => {
          const ayahKey: AyahKey = `${segment.surah}:${segment.ayah}`;
          const isHovered = hoveredAyah === ayahKey;
          const isSelected = selectedAyah === ayahKey;
          const isPlaying = playingAyah === ayahKey;
          const highlightColor = highlights[ayahKey];
          const isBookmarked = bookmarks.has(ayahKey);
          const isBlurred = Boolean(
            pageEntry.leadingSplitAyah !== ayahKey &&
              blurSet?.has(ayahKey) &&
              !revealedSet?.has(ayahKey),
          );
          const mistake = mistakeAyahs?.get(ayahKey);

          return segment.boxes.map((box, boxIndex) => {
            const [x, y, w, h] = box;
            const isFirstBox = boxIndex === 0;
            const classes = [
              "ayah-box",
              highlightColor ? `ayah-box--hl-${highlightColor}` : "",
              isHovered ? "ayah-box--hovered" : "",
              isSelected ? "ayah-box--selected" : "",
              isPlaying ? "ayah-box--playing" : "",
              mistake ? "ayah-box--mistake" : "",
              isBlurred ? "ayah-box--blurred" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={`${ayahKey}-${boxIndex}`}
                type="button"
                className={classes}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${w}%`,
                  height: `${h}%`,
                }}
                tabIndex={isFirstBox ? 0 : -1}
                aria-label={
                  isFirstBox
                    ? isBlurred
                      ? `Intip Surah ${segment.surah} Ayat ${segment.ayah}`
                      : `Surah ${segment.surah} Ayat ${segment.ayah}`
                    : undefined
                }
                aria-hidden={isFirstBox ? undefined : true}
                onMouseEnter={() => setHoveredAyah(ayahKey)}
                onMouseLeave={() => setHoveredAyah((prev) => (prev === ayahKey ? null : prev))}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isBlurred && onPeekAyah) {
                    onPeekAyah(ayahKey);
                    return;
                  }
                  onSelectAyah(ayahKey, event.currentTarget.getBoundingClientRect());
                }}
              >
                {isFirstBox && isBookmarked && (
                  <span className="ayah-box__bookmark" aria-hidden="true" />
                )}
                {isFirstBox && mistake && (
                  <span
                    className="ayah-box__mistake-badge"
                    title={mistake.wordText ? `${mistake.errorClass}: ${mistake.wordText}` : mistake.errorClass}
                  >
                    {mistake.count > 1 ? mistake.count : "!"}
                  </span>
                )}
              </button>
            );
          });
        })}
      </div>

      <span className="mushaf-page__num" aria-hidden="true">
        {pageEntry.page}
      </span>
    </div>
  );
}
