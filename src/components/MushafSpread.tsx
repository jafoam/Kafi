import { useEffect, useRef } from "react";
import type { AyahKey, HighlightColor, MistakeBadge, PageEntry } from "../data/types";
import { getAdjacentPages, mapKeyToDirection } from "../state/reader-logic";
import { MushafPage } from "./MushafPage";

export interface MushafSpreadProps {
  rightPageEntry: PageEntry;
  leftPageEntry: PageEntry | null;
  pageUrls: Record<number, string>;
  selectedAyah: AyahKey | null;
  playingAyah: AyahKey | null;
  highlights: Record<AyahKey, HighlightColor>;
  bookmarks: Set<AyahKey>;
  blurSet?: Set<AyahKey>;
  revealedSet?: Set<AyahKey>;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  canGoPrev: boolean;
  canGoNext: boolean;
  isPaletteOpen: boolean;
  getPageImageUrl: (page: number) => Promise<string>;
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
  revealedSet,
  mistakeAyahs,
  canGoPrev,
  canGoNext,
  isPaletteOpen,
  getPageImageUrl,
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
      void getPageImageUrl(page).then((url) => {
        if (cancelled || !url) return;
        const img = new Image();
        img.src = url;
      });
    }
    return () => {
      cancelled = true;
    };
  }, [rightPageEntry.page, leftPageEntry?.page, getPageImageUrl]);

  // Global keyboard shortcuts: ArrowLeft/Right, F (focus), Cmd/Ctrl+K (palette), Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onTogglePalette();
        return;
      }

      if (isPaletteOpen) return;

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
  }, [isPaletteOpen, onClearSelection, onToggleFocus, onTogglePalette, onTurnPage]);

  const isDouble = leftPageEntry !== null;

  return (
    <main className="reader-stage" onClick={onClearSelection}>
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
            side="left"
            selectedAyah={selectedAyah}
            playingAyah={playingAyah}
            highlights={highlights}
            bookmarks={bookmarks}
            blurSet={blurSet}
            revealedSet={revealedSet}
            mistakeAyahs={mistakeAyahs}
            onSelectAyah={onSelectAyah}
            onPeekAyah={onPeekAyah}
          />
        )}

        <MushafPage
          key={rightPageEntry.page}
          pageEntry={rightPageEntry}
          imageUrl={pageUrls[rightPageEntry.page] ?? null}
          side={isDouble ? "right" : "single"}
          selectedAyah={selectedAyah}
          playingAyah={playingAyah}
          highlights={highlights}
          bookmarks={bookmarks}
          blurSet={blurSet}
          revealedSet={revealedSet}
          mistakeAyahs={mistakeAyahs}
          onSelectAyah={onSelectAyah}
          onPeekAyah={onPeekAyah}
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
