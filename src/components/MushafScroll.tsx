import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AyahKey, HifzBlurLevel, HighlightColor, MistakeBadge, PageEntry } from "../data/types";
import type { GlyphPageLoader } from "../services/glyph-pages";
import type { SelectedWord } from "../services/word-translations";
import { MushafPage } from "./MushafPage";

export interface MushafScrollProps {
  /** Stop on each page instead of scrolling freely. */
  snap?: boolean;
  pages: PageEntry[];
  currentPage: number;
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
  isModalOpen: boolean;
  getPageImageUrl: (page: number) => Promise<string>;
  glyphLoader?: GlyphPageLoader;
  onRetryPage?: (page: number) => void;
  onPageChange: (page: number) => void;
  onSelectAyah: (ayah: AyahKey, anchorRect: DOMRect, word?: SelectedWord) => void;
  onPeekAyah?: (ayah: AyahKey) => void;
  onClearSelection: () => void;
  /** A click or tap on the page that no ayah or word handled. */
  onTapPage?: () => void;
  onToggleFocus: () => void;
  onTogglePalette: () => void;
}

/** Pages mounted on each side of the current one; the rest are same-sized placeholders. */
const WINDOW = 2;

/**
 * The mushaf as one vertical column that scrolls like a document. Every page slot has the same
 * size, so the page under the middle of the screen is plain arithmetic and only a few pages are
 * ever mounted.
 */
export function MushafScroll({
  snap = false,
  pages,
  currentPage,
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
  isModalOpen,
  getPageImageUrl,
  glyphLoader,
  onRetryPage,
  onPageChange,
  onSelectAyah,
  onPeekAyah,
  onClearSelection,
  onTapPage,
  onToggleFocus,
  onTogglePalette,
}: MushafScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotHeightRef = useRef(0);
  const gapRef = useRef(12);
  const padTopRef = useRef(0);
  const reportedRef = useRef(currentPage);
  /** Pages this component reported recently, so their echo back as `currentPage` is not a jump. */
  const recentReportsRef = useRef(new Map<number, number>());
  const [urls, setUrls] = useState<Record<number, string>>({});

  const pageAtScroll = useCallback((): number | null => {
    const el = scrollRef.current;
    const slot = slotHeightRef.current;
    if (!el || slot <= 0) return null;
    const first = el.firstElementChild as HTMLElement | null;
    const top = first?.offsetTop ?? 0;
    const mid = el.scrollTop + el.clientHeight / 2 - top;
    return Math.min(pages.length, Math.max(1, Math.floor(mid / (slot + gapRef.current)) + 1));
  }, [pages.length]);

  const scrollToPage = useCallback((page: number) => {
    const el = scrollRef.current;
    const slot = slotHeightRef.current;
    if (!el || slot <= 0) return;
    const first = el.firstElementChild as HTMLElement | null;
    const top = first?.offsetTop ?? 0;
    const offset = snap ? padTopRef.current : Math.max(0, (el.clientHeight - slot) / 2);
    el.scrollTop = top + (page - 1) * (slot + gapRef.current) - offset;
  }, [snap]);

  // Measure a slot, and keep the current page in place when the size changes (rotation, resize).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const padTop = parseFloat(style.paddingTop) || 0;
      const padBottom = parseFloat(style.paddingBottom) || 0;
      if (snap) {
        // A gap as tall as the bars keeps the neighbouring pages out of view.
        el.style.setProperty("--snap-gap", `${Math.ceil(Math.max(padTop, padBottom)) + 8}px`);
        el.style.scrollPaddingTop = `${padTop}px`;
      } else {
        el.style.removeProperty("--snap-gap");
        el.style.scrollPaddingTop = "";
      }
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      const first = el.firstElementChild as HTMLElement | null;
      const h = first?.getBoundingClientRect().height ?? 0;
      const changed =
        Math.abs(h - slotHeightRef.current) > 0.5 ||
        Math.abs(gap - gapRef.current) > 0.5 ||
        Math.abs(padTop - padTopRef.current) > 0.5;
      if (h > 0 && changed) {
        slotHeightRef.current = h;
        gapRef.current = gap;
        padTopRef.current = padTop;
        scrollToPage(reportedRef.current);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToPage]);

  // Jumps from elsewhere (search, audio following the recitation) scroll to the page.
  useEffect(() => {
    const reportedAt = recentReportsRef.current.get(currentPage);
    if (currentPage === reportedRef.current) return;
    if (reportedAt !== undefined && performance.now() - reportedAt < 1500) return;
    recentReportsRef.current.clear();
    reportedRef.current = currentPage;
    scrollToPage(currentPage);
  }, [currentPage, pageAtScroll, scrollToPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const page = pageAtScroll();
        if (page !== null && page !== reportedRef.current) {
          reportedRef.current = page;
          recentReportsRef.current.set(page, performance.now());
          onPageChange(page);
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [onPageChange, pageAtScroll]);

  const from = Math.max(1, currentPage - WINDOW);
  const to = Math.min(pages.length, currentPage + WINDOW);

  // Images for the mounted pages (glyph pages draw themselves from the loader).
  useEffect(() => {
    let cancelled = false;
    for (let p = from; p <= to; p++) {
      if (glyphLoader) glyphLoader.prefetch(p);
      if (urls[p]) continue;
      void getPageImageUrl(p)
        .then((url) => {
          if (!cancelled && url) setUrls((prev) => (prev[p] ? prev : { ...prev, [p]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [from, to, getPageImageUrl, glyphLoader]);

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
      const t = event.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        onToggleFocus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, onClearSelection, onToggleFocus, onTogglePalette]);

  return (
    <main
      className={`reader-stage reader-scroll ${snap ? "reader-scroll--snap" : ""}`}
      ref={scrollRef} onClick={onTapPage ?? onClearSelection}>
      {pages.map((entry) => {
        const mounted = entry.page >= from && entry.page <= to;
        return (
          <div key={entry.page} className="reader-scroll__slot" data-page={entry.page}>
            {mounted && (
              <div className="mushaf-spread mushaf-spread--single reader-scroll__sheet">
                <MushafPage
                  pageEntry={entry}
                  imageUrl={urls[entry.page] ?? null}
                  glyphLoader={glyphLoader}
                  side="single"
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
            )}
          </div>
        );
      })}
    </main>
  );
}
