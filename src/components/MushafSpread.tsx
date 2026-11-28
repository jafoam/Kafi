import { useEffect, useLayoutEffect, useRef, type TouchEvent as ReactTouchEvent } from "react";
import type { AyahKey, HifzBlurLevel, HighlightColor, MistakeBadge, PageEntry } from "../data/types";
import { getAdjacentPages, mapKeyToDirection } from "../state/reader-logic";
import type { GlyphPageLoader } from "../services/glyph-pages";
import type { SelectedWord } from "../services/word-translations";
import { isCrossOriginHttpUrl, MushafPage } from "./MushafPage";

export interface MushafSpreadProps {
  rightPageEntry: PageEntry;
  leftPageEntry: PageEntry | null;
  pageUrls: Record<number, string>;
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
  canGoPrev: boolean;
  canGoNext: boolean;
  isModalOpen: boolean;
  getPageImageUrl: (page: number) => Promise<string>;
  glyphLoader?: GlyphPageLoader;
  onRetryPage?: (page: number) => void;
  onTurnPage: (direction: "next" | "prev") => void;
  onSelectAyah: (ayah: AyahKey, anchorRect: DOMRect, word?: SelectedWord) => void;
  onPeekAyah?: (ayah: AyahKey) => void;
  onClearSelection: () => void;
  /** A click or tap on the page that no ayah or word handled. */
  onTapPage?: () => void;
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
  onTapPage,
  onToggleFocus,
  onTogglePalette,
}: MushafSpreadProps) {
  const prefetchedRef = useRef<Set<number>>(new Set());
  const stageRef = useRef<HTMLElement>(null);

  // Reset vertical scroll (used in phone landscape full-width mode) when turning pages
  useEffect(() => {
    if (stageRef.current) stageRef.current.scrollTop = 0;
  }, [rightPageEntry.page, leftPageEntry?.page]);

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

  // Page turns slide like a book app: the page follows the finger, and on release either slides off
  // (the next one slides in from the other side) or springs back. RTL mushaf: dragging right turns
  // to the next page, so the next page comes in from the left.
  const spreadRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{
    x: number;
    y: number;
    t: number;
    axis: "x" | "y" | null;
    offset: number;
  } | null>(null);
  /** Which way (+1 right, -1 left) the old page just left, so the new one enters from the other side. */
  const exitRef = useRef<1 | -1 | null>(null);
  const prevPageRef = useRef(rightPageEntry.page);

  const prefersReducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const slideIn = (from: 1 | -1) => {
    const el = spreadRef.current;
    if (!el) return;
    for (const animation of el.getAnimations()) animation.cancel();
    el.style.transform = "";
    if (prefersReducedMotion() || typeof el.animate !== "function") return;
    const width = el.offsetWidth;
    el.animate(
      [{ transform: `translateX(${from * width}px)` }, { transform: "translateX(0)" }],
      { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  };

  useLayoutEffect(() => {
    const prev = prevPageRef.current;
    const page = rightPageEntry.page;
    prevPageRef.current = page;
    if (prev === page) return;
    const exited = exitRef.current;
    exitRef.current = null;
    if (exited !== null) {
      slideIn(exited === 1 ? -1 : 1);
      return;
    }
    // Turns from the keyboard, the arrows or the reciter: slide only for a neighbouring page, not a jump.
    const delta = page - prev;
    if (Math.abs(delta) > 2) {
      const el = spreadRef.current;
      if (el) {
        for (const animation of el.getAnimations()) animation.cancel();
        el.style.transform = "";
      }
      return;
    }
    slideIn(delta > 0 ? -1 : 1);
  }, [rightPageEntry.page]);

  const handleTouchStart = (event: ReactTouchEvent) => {
    if (event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const el = spreadRef.current;
    if (el) for (const animation of el.getAnimations()) animation.finish();
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now(), axis: null, offset: 0 };
  };

  const handleTouchMove = (event: ReactTouchEvent) => {
    const start = touchStartRef.current;
    const el = spreadRef.current;
    if (!start || !el || isModalOpen || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (start.axis === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      start.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
    }
    if (start.axis !== "x") return;
    const allowed = dx > 0 ? canGoNext : canGoPrev;
    start.offset = allowed ? dx : dx * 0.25;
    el.style.transform = `translateX(${start.offset}px)`;
  };

  const springBack = (from: number) => {
    const el = spreadRef.current;
    if (!el) return;
    el.style.transform = "";
    if (from === 0 || typeof el.animate !== "function") return;
    el.animate([{ transform: `translateX(${from}px)` }, { transform: "translateX(0)" }], {
      duration: 200,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  };

  const handleTouchEnd = (event: ReactTouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const el = spreadRef.current;
    if (!start || !el || start.axis !== "x") return;
    const touch = event.changedTouches[0];
    const dx = touch ? touch.clientX - start.x : start.offset;
    const elapsed = Date.now() - start.t;
    const width = el.offsetWidth;
    const allowed = dx > 0 ? canGoNext : canGoPrev;
    const commit =
      !isModalOpen && allowed && (Math.abs(dx) > width * 0.22 || (Math.abs(dx) > 40 && elapsed < 300));
    if (!commit) {
      springBack(start.offset);
      return;
    }
    const sign: 1 | -1 = dx > 0 ? 1 : -1;
    const turn = () => {
      exitRef.current = sign;
      onTurnPage(sign === 1 ? "next" : "prev");
      // If the turn did not happen, bring the page back rather than leave it off screen.
      window.setTimeout(() => {
        if (exitRef.current === sign) {
          exitRef.current = null;
          slideIn(sign);
        }
      }, 400);
    };
    if (prefersReducedMotion() || typeof el.animate !== "function") {
      el.style.transform = "";
      turn();
      return;
    }
    const end = sign * width;
    const remaining = Math.max(0.3, 1 - Math.abs(start.offset) / width);
    const exit = el.animate(
      [{ transform: `translateX(${start.offset}px)` }, { transform: `translateX(${end}px)` }],
      { duration: 180 * remaining, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    );
    el.style.transform = `translateX(${end}px)`;
    exit.onfinish = () => {
      exit.cancel();
      turn();
    };
  };

  const handleTouchCancel = () => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start?.axis === "x") springBack(start.offset);
  };

  return (
    <main
      ref={stageRef}
      className="reader-stage"
      onClick={onTapPage ?? onClearSelection}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
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
        ref={spreadRef}
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
            locatedAyah={locatedAyah}
            playingAyah={playingAyah}
            playingWordRange={playingWordRange}
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
