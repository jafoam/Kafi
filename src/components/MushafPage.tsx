import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useLongPress } from "../state/useLongPress";
import type { AyahKey, HifzBlurLevel, HighlightColor, MistakeBadge, PageEntry } from "../data/types";
import type { GlyphPageData, GlyphPageLoader } from "../services/glyph-pages";
import type { SelectedWord } from "../services/word-translations";
import { GlyphPageBody } from "./GlyphPageBody";

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
  glyphLoader?: GlyphPageLoader;
  side?: "left" | "right" | "single";
  selectedAyah: AyahKey | null;
  locatedAyah?: AyahKey | null;
  playingAyah: AyahKey | null;
  playingWordRange?: [number, number] | null;
  highlights: Record<AyahKey, HighlightColor>;
  bookmarks: Set<AyahKey>;
  blurSet?: Set<AyahKey>;
  blurLevel?: HifzBlurLevel;
  revealedSet?: Set<AyahKey>;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  wordTranslation?: boolean;
  onSelectAyah: (ayah: AyahKey, anchorRect: DOMRect, word?: SelectedWord) => void;
  onPeekAyah?: (ayah: AyahKey) => void;
  onRetryPage?: (page: number) => void;
}

export function MushafPage({
  pageEntry,
  imageUrl,
  glyphLoader,
  side = "single",
  selectedAyah,
  locatedAyah = null,
  playingAyah,
  playingWordRange,
  highlights,
  bookmarks,
  blurSet,
  blurLevel,
  revealedSet,
  mistakeAyahs,
  wordTranslation,
  onSelectAyah,
  onPeekAyah,
  onRetryPage,
}: MushafPageProps) {
  const { tr } = useI18n();
  const [hoveredAyah, setHoveredAyah] = useState<AyahKey | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [glyphData, setGlyphData] = useState<GlyphPageData | null>(null);
  const [glyphFailed, setGlyphFailed] = useState(!glyphLoader);

  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [imageUrl]);

  useEffect(() => {
    if (!glyphLoader) {
      setGlyphFailed(true);
      return;
    }
    let cancelled = false;
    setGlyphData(null);
    setGlyphFailed(false);
    glyphLoader
      .load(pageEntry.page)
      .then((data) => {
        if (!cancelled) setGlyphData(data);
      })
      .catch(() => {
        if (!cancelled) setGlyphFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [glyphLoader, pageEntry.page]);

  const pointerTypeRef = useRef<string>("mouse");
  const longPress = useLongPress((target) => {
    const box = target.closest<HTMLElement>("[data-ayah]");
    const ayah = box?.dataset.ayah as AyahKey | undefined;
    if (!box || !ayah) return false;
    onSelectAyah(ayah, box.getBoundingClientRect());
    return true;
  });

  const useGlyphs = glyphData !== null;
  const showImage = glyphFailed && !useGlyphs;

  return (
    <div
      className="mushaf-page"
      data-side={side}
      data-page={pageEntry.page}
    >
      {!useGlyphs && (!showImage || !imageUrl || (!imgLoaded && !imgError)) && (
        <div className="mushaf-page__skeleton" aria-hidden="true" />
      )}

      {useGlyphs && glyphData && (
        <GlyphPageBody
          data={glyphData}
          pageEntry={pageEntry}
          selectedAyah={selectedAyah}
          locatedAyah={locatedAyah}
          playingAyah={playingAyah}
          playingWordRange={playingWordRange}
          highlights={highlights}
          bookmarks={bookmarks}
          blurSet={blurSet}
          blurLevel={blurLevel}
          revealedSet={revealedSet}
          mistakeAyahs={mistakeAyahs}
          wordTranslation={wordTranslation}
          onSelectAyah={onSelectAyah}
          onPeekAyah={onPeekAyah}
        />
      )}

      {showImage && imageUrl && !imgError && (
        <img
          key={`${imageUrl}-${retryCount}`}
          className="mushaf-page__img"
          src={imageUrl}
          crossOrigin={isCrossOriginHttpUrl(imageUrl) ? "anonymous" : undefined}
          alt={tr(`Halaman Mushaf ${pageEntry.page}`, `Mushaf Page ${pageEntry.page}`)}
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgLoaded(false);
            setImgError(true);
          }}
        />
      )}

      {showImage && imgError && (
        <div
          className="mushaf-page__error"
          role="status"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="mushaf-page__error-text">
            {tr("Halaman belum tersedia offline", "Page not available offline")}
          </p>
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
            {tr("Coba lagi", "Retry")}
          </button>
        </div>
      )}

      {side !== "single" && <div className="mushaf-page__spine" aria-hidden="true" />}

      {showImage && (
      <div
        className="mushaf-page__overlays"
        onPointerDown={(event) => {
          pointerTypeRef.current = event.pointerType || "mouse";
          longPress.handlers.onPointerDown(event);
        }}
        onPointerMove={longPress.handlers.onPointerMove}
        onPointerUp={longPress.handlers.onPointerUp}
        onPointerCancel={longPress.handlers.onPointerCancel}
        onContextMenu={longPress.handlers.onContextMenu}
      >
        {pageEntry.ayahs.map((segment) => {
          const ayahKey: AyahKey = `${segment.surah}:${segment.ayah}`;
          const isHovered = hoveredAyah === ayahKey;
          const isSelected = selectedAyah === ayahKey;
          const isLocated = locatedAyah === ayahKey;
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
              isLocated ? "ayah-box--located" : "",
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
                data-ayah={ayahKey}
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
                      ? tr(
                          `Intip Surah ${segment.surah} Ayat ${segment.ayah}`,
                          `Peek Surah ${segment.surah} Ayah ${segment.ayah}`,
                        )
                      : tr(
                          `Surah ${segment.surah} Ayat ${segment.ayah}`,
                          `Surah ${segment.surah} Ayah ${segment.ayah}`,
                        )
                    : undefined
                }
                aria-hidden={isFirstBox ? undefined : true}
                onMouseEnter={() => setHoveredAyah(ayahKey)}
                onMouseLeave={() => setHoveredAyah((prev) => (prev === ayahKey ? null : prev))}
                onClick={(event) => {
                  if (longPress.consumeClick()) {
                    event.stopPropagation();
                    return;
                  }
                  if (isBlurred && onPeekAyah) {
                    event.stopPropagation();
                    onPeekAyah(ayahKey);
                    return;
                  }
                  // A touch tap falls through to the page, which toggles focus mode.
                  if (pointerTypeRef.current !== "mouse") return;
                  event.stopPropagation();
                  onSelectAyah(ayahKey, event.currentTarget.getBoundingClientRect());
                }}
              >
                {isFirstBox && isBookmarked && (
                  <span className="ayah-box__bookmark" aria-hidden="true" />
                )}
              </button>
            );
          });
        })}
      </div>
      )}

      <span className="mushaf-page__num" aria-hidden="true">
        {pageEntry.page}
      </span>
    </div>
  );
}
