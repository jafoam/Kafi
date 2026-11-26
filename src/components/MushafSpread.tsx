import { useEffect, useRef, type TouchEvent as ReactTouchEvent } from "react";
import type { AyahKey, HifzBlurLevel, HighlightColor, MistakeBadge, PageEntry } from "../data/types";
import { getAdjacentPages, mapKeyToDirection } from "../state/reader-logic";
import type { GlyphPageLoader } from "../services/glyph-pages";
import { isCrossOriginHttpUrl, MushafPage } from "./MushafPage";

export interface MushafSpreadProps {
  rightPageEntry: PageEntry;
  leftPageEntry: PageEntry | null;
  pageUrls: Record<number, string>;
  selectedAyah: AyahKey | null;
  playingAyah: AyahKey | null;
  highlights: Record<AyahKey, HighlightColor>;
  bookmarks: Set<AyahKey>;
  blurSet?: Set<AyahKey>;
  blurLevel?: HifzBlurLevel;
  revealedSet?: Set<AyahKey>;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  wordTranslation?: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  isModalOpen: boolean;
  getPageImageUrl: (page: number) => Promise<string>;
  glyphLoader?: GlyphPageLoader;
  onRetryPage?: (page: number) => void;
  onTurnPage: (direction: "next" | "prev") => void;
  onSelectAyah: (ayah: AyahKey, anchorRect: DOMRect) => void;
  onPeekAyah?: (ayah: AyahKey) => void;
  onClearSelection: () => void;
  onToggleFocus: () => void;
  onTogglePalette: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function MushafSpread({
  rightPageEntry,
  leftPageEntry,
  pageUrls,
  selectedAyah,
  playingAyah,
  highlights,
  bookmarks,
  blurSet,
  blurLevel,
  revealedSet,
  mistakeAyahs,
  wordTranslation,
  canGoPrev,
  canGoNext,
  isModalOpen,
  getPageImageUrl,
  glyphLoader,
  onRetryPage,
  onTurnPage,
  onSelectAyah,
  onPeekAyah,
  onClearSelection,
  onToggleFocus,
  onTogglePalette,
}: MushafSpreadProps) {
  const prefetchedRef = useRef<Set<number>>(new Set());

  // Prefetch 2 adjacent pages in each direction for instant page turns
  useEffect(() => {
    let cancelled = false;
    const adjacent = getAdjacentPages(rightPageEntry.page, leftPageEntry?.page ?? null);
    for (const page of adjacent) {
      if (prefetchedRef.current.has(page)) continue;
      prefetchedRef.current.add(page);
      if (glyphLoader) {
        glyphLoader.prefetch(page);
        continue;
      }
      void getPageImageUrl(page).then((url) => {
        if (cancelled || !url) return;
        const img = new Image();
        if (isCrossOriginHttpUrl(url)) {
          img.crossOrigin = "anonymous";
        }
        img.src = url;
      });
    }
    return () => {
      cancelled = true;
    };
  }, [rightPageEntry.page, leftPageEntry?.page, getPageImageUrl, glyphLoader]);

  // Global keyboard shortcuts: ArrowLeft/Right, F (focus), Cmd/Ctrl+K (palette), Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onTogglePalette();
        return;
      }

      if (isModalOpen) return;

      if (event.key === "Escape") {
        onClearSelection();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        onToggleFocus();
        return;
      }

      const direction = mapKeyToDirection(event.key);
      if (direction) {
        event.preventDefault();
        onTurnPage(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, onClearSelection, onToggleFocus, onTogglePalette, onTurnPage]);

  const isDouble = leftPageEntry !== null;

  // Touch swipe page turning (RTL mushaf: swipe right → next page, swipe left → previous page)
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const handleTouchStart = (event: ReactTouchEvent) => {
    if (event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  };

  const handleTouchEnd = (event: ReactTouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || isModalOpen) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.t;
    if (elapsed > 800 || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0 && canGoNext) onTurnPage("next");
    else if (dx < 0 && canGoPrev) onTurnPage("prev");
  };

  return (
    <main
      className="reader-stage"
      onClick={onClearSelection}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStartRef.current = null;
      }}
    >
      <button
        type="button"
        className="turn-btn turn-btn--left"
        aria-label="Halaman berikutnya"
        title="Halaman berikutnya (←)"
        disabled={!canGoNext}
        onClick={(e) => {
          e.stopPropagation();
          onTurnPage("next");
        }}
      >
        ‹
      </button>

      <div
        className={`mushaf-spread ${isDouble ? "mushaf-spread--double" : "mushaf-spread--single"}`}
      >
        {leftPageEntry && (
          <MushafPage
            key={leftPageEntry.page}
            pageEntry={leftPageEntry}
            imageUrl={pageUrls[leftPageEntry.page] ?? null}
            glyphLoader={glyphLoader}
            side="left"
            selectedAyah={selectedAyah}
            playingAyah={playingAyah}
            highlights={highlights}
            bookmarks={bookmarks}
            blurSet={blurSet}
            revealedSet={revealedSet}
            mistakeAyahs={mistakeAyahs}
          wordTranslation={wordTranslation}
            onSelectAyah={onSelectAyah}
            onPeekAyah={onPeekAyah}
            onRetryPage={onRetryPage}
          />
        )}

        <MushafPage
          key={rightPageEntry.page}
          pageEntry={rightPageEntry}
          imageUrl={pageUrls[rightPageEntry.page] ?? null}
          glyphLoader={glyphLoader}
          side={isDouble ? "right" : "single"}
          selectedAyah={selectedAyah}
          playingAyah={playingAyah}
          highlights={highlights}
          bookmarks={bookmarks}
          blurSet={blurSet}
          blurLevel={blurLevel}
          revealedSet={revealedSet}
          mistakeAyahs={mistakeAyahs}
          wordTranslation={wordTranslation}
          onSelectAyah={onSelectAyah}
          onPeekAyah={onPeekAyah}
          onRetryPage={onRetryPage}
        />
      </div>

      <button
        type="button"
        className="turn-btn turn-btn--right"
        aria-label="Halaman sebelumnya"
        title="Halaman sebelumnya (→)"
        disabled={!canGoPrev}
        onClick={(e) => {
          e.stopPropagation();
          onTurnPage("prev");
        }}
      >
        ›
      </button>
    </main>
  );
}
