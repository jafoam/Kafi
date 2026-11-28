import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AyahKey, HifzBlurLevel, HighlightColor, MistakeBadge, PageEntry } from "../data/types";
import type { GlyphPageData } from "../services/glyph-pages";
import {
  createWordTranslationLoader,
  type PageWords,
  type SelectedWord,
} from "../services/word-translations";
import { useLongPress } from "../state/useLongPress";
import { useI18n } from "../i18n";
import { SurahBanner } from "./SurahBanner";

const wordLoader = createWordTranslationLoader();

/**
 * Width of a normal full line in em for each kind of glyph, from the fonts' advance widths. It sets the
 * one letter size used on every page. v1: about 90% of lines are at most 14.6em (median 14.2em).
 * tajweed: the same v1 lines drawn with the v4 color glyphs, which vary more (median 16.1em, 85% at most
 * 17.3em); at 17.2em only about 6% of lines are narrowed by more than 6%.
 */
const FULL_LINE_EM = { v1: 14.6, tajweed: 17.2 } as const;

/** U+FDFD ARABIC LIGATURE BISMILLAH, drawn as one calligraphic glyph by the AmiriBismillah font. */
const BISMILLAH = "\uFDFD";
export interface GlyphPageBodyProps {
  data: GlyphPageData;
  pageEntry: PageEntry;
  selectedAyah: AyahKey | null;
  locatedAyah?: AyahKey | null;
  playingAyah: AyahKey | null;
  /** 0-based [start, end) word range currently spoken inside `playingAyah`. */
  playingWordRange?: [number, number] | null;
  highlights: Record<AyahKey, HighlightColor>;
  bookmarks: Set<AyahKey>;
  blurSet?: Set<AyahKey>;
  blurLevel?: HifzBlurLevel;
  revealedSet?: Set<AyahKey>;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  /** Show the per-word translation tooltip (default on). */
  wordTranslation?: boolean;
  onSelectAyah: (ayah: AyahKey, anchorRect: DOMRect, word?: SelectedWord) => void;
  onPeekAyah?: (ayah: AyahKey) => void;
}

export function GlyphPageBody({
  data,
  pageEntry,
  selectedAyah,
  locatedAyah = null,
  playingAyah,
  playingWordRange,
  highlights,
  bookmarks,
  blurSet,
  blurLevel = "full",
  revealedSet,
  mistakeAyahs,
  wordTranslation = true,
  onSelectAyah,
  onPeekAyah,
}: GlyphPageBodyProps) {
  const { tr } = useI18n();
  const [hoveredAyah, setHoveredAyah] = useState<AyahKey | null>(null);
  /** Word under the pointer / last tapped, as "line-index"; used when translation mode highlights single words. */
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [pickedWord, setPickedWord] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [words, setWords] = useState<PageWords | null>(null);
  const [tip, setTip] = useState<{ code: string; rect: DOMRect; word?: string; touch?: boolean } | null>(
    null,
  );
  const pointerTypeRef = useRef<string>("mouse");

  useEffect(() => {
    let live = true;
    setWords(null);
    if (!wordTranslation) return;
    wordLoader.load(data.page).then((w) => live && setWords(w), () => undefined);
    return () => {
      live = false;
    };
  }, [data.page, wordTranslation]);

  // Once an ayah is selected its popover shows the word, so the tooltip steps aside.
  useEffect(() => {
    if (!wordTranslation || selectedAyah) setTip(null);
  }, [wordTranslation, selectedAyah]);

  // Bring an ayah located by search or voice jump into the center of the viewport.
  useEffect(() => {
    if (!locatedAyah) return;
    const body = bodyRef.current;
    if (!body) return;
    const target = body.querySelector<HTMLElement>(`[data-ayah="${locatedAyah}"]`);
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [locatedAyah, data.page]);

  // A tapped tooltip is placed from a fixed rect, so it goes away on scroll or a tap elsewhere.
  const touchTip = Boolean(tip?.touch);
  useEffect(() => {
    if (!touchTip) return;
    const close = () => setTip(null);
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && bodyRef.current?.contains(target) && target.closest("[data-word]")) return;
      close();
      // A tap on the page that dismisses the tooltip must not also toggle focus mode.
      const swallow = (click: MouseEvent) => {
        const el = click.target instanceof Element ? click.target : null;
        if (!el?.closest(".reader-stage") || el.closest("button")) return;
        click.stopPropagation();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 600);
    };
    const timer = window.setTimeout(close, 6000);
    window.addEventListener("scroll", close, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [touchTip, tip]);

  const showTip = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return setTip(null);
    const el = target.closest<HTMLElement>("[data-code]");
    if (!el || !words?.has(el.dataset.code!)) return setTip(null);
    // A hidden word's meaning would give the ayah away.
    if (el.classList.contains("glyph-word--blurred")) return setTip(null);
    setTip({ code: el.dataset.code!, rect: el.getBoundingClientRect() });
  };
  const tipInfo = tip ? words?.get(tip.code) : undefined;
  const totalLines = data.page <= 2 ? 8 : 15;
  const rows = data.rows;

  // One letter size for every page of a print: it is set so a normal full line spans the page, so the
  // letters (and their stroke weight) never change from page to page. Container-relative units keep it
  // valid on resize. A rare line drawn wider than that is narrowed on its own instead of shrinking the page.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // Re-fit when the page changes size (rotation, window resize, entering focus mode).
    let lastSize = "";
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const size = `${body.clientWidth}x${body.clientHeight}`;
            if (size !== lastSize) fitPage(body);
          });
    observer?.observe(body);
    fitPage(body);
    return () => observer?.disconnect();

    function fitPage(body: HTMLDivElement) {
      lastSize = `${body.clientWidth}x${body.clientHeight}`;
      const lineEls = Array.from(body.querySelectorAll<HTMLElement>("[data-glyph-line]"));
      for (const line of lineEls) {
        delete line.dataset.squeeze;
        delete line.dataset.tight;
        line.style.removeProperty("--line-squeeze");
      }
      body.style.setProperty("--glyph-fit", "1");
      // Words stop growing while measured, so each line reports its natural width.
      body.dataset.measuring = "";
      const widths = new Map<HTMLElement, number>();
      let widest = 0;
      for (const line of lineEls) {
        let natural = 0;
        for (const child of Array.from(line.children) as HTMLElement[]) natural += child.offsetWidth;
        widths.set(line, natural);
        widest = Math.max(widest, natural);
      }
      delete body.dataset.measuring;
      const width = body.clientWidth;
      const fontSize = parseFloat(getComputedStyle(body).fontSize);
      if (width <= 0 || fontSize <= 0 || widest <= 0) return;

      let fit = 1;
      if (data.page > 2) {
        const lineEm = FULL_LINE_EM[data.variant ?? "v1"];
        const rowHeight = body.clientHeight / totalLines;
        // Never so tall that neighbouring lines collide.
        const maxFit = Math.max(1, rowHeight / (fontSize * 1.35));
        fit = Math.min(width / (lineEm * fontSize), maxFit);
      } else if (widest > width) {
        fit = width / widest;
      }
      body.style.setProperty("--glyph-fit", String(fit));
      for (const [line, measured] of widths) {
        let natural = measured;
        if (natural * fit <= width) continue;
        if (line.classList.contains("glyph-line--center")) {
          // A centered line first gives up the air between its words (0.16em a side, see app.css).
          line.dataset.tight = "";
          natural -= line.children.length * 0.32 * fontSize;
          if (natural * fit <= width) continue;
        }
        line.dataset.squeeze = "";
        line.style.setProperty("--line-squeeze", String((width / (natural * fit)) * 0.998));
      }
    }
  }, [data]);

  const isLeadingSplit = (ayah: AyahKey) => pageEntry.leadingSplitAyah === ayah;

  const resolveAyah = (target: EventTarget | null): AyahKey | null => {
    if (!(target instanceof HTMLElement)) return null;
    const el = target.closest<HTMLElement>("[data-ayah]");
    return (el?.dataset.ayah as AyahKey | undefined) ?? null;
  };

  const resolveWord = (target: EventTarget | null): string | null => {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest<HTMLElement>("[data-word]")?.dataset.word ?? null;
  };

  /** Opens the ayah menu for a pressed word, with its translation when word mode is on. */
  const selectFromElement = (target: HTMLElement): boolean => {
    const el = target.closest<HTMLElement>("[data-ayah]");
    const ayah = el?.dataset.ayah as AyahKey | undefined;
    if (!el || !ayah) return false;
    const wordKey = el.dataset.word ?? null;
    const code = el.dataset.code;
    const info = wordTranslation && code ? words?.get(code) : undefined;
    const selectedWord: SelectedWord | undefined =
      info && wordKey && info.translation
        ? { key: `${data.page}:${wordKey}`, translation: info.translation, transliteration: info.transliteration }
        : undefined;
    setTip(null);
    setPickedWord(wordKey);
    onSelectAyah(ayah, el.getBoundingClientRect(), selectedWord);
    return true;
  };
  const longPress = useLongPress(selectFromElement);

  const firstWordOfAyah = new Set<AyahKey>();

  return (
    <div
      ref={bodyRef}
      className={`glyph-page${data.variant === "tajweed" ? " glyph-page--tajweed" : ""}`}
      data-lines={totalLines}
      style={{ fontFamily: `"${data.fontFamily}"` }}
      onPointerDown={(event) => {
        pointerTypeRef.current = event.pointerType || "mouse";
        longPress.handlers.onPointerDown(event);
      }}
      onPointerMove={longPress.handlers.onPointerMove}
      onPointerUp={longPress.handlers.onPointerUp}
      onPointerCancel={longPress.handlers.onPointerCancel}
      onContextMenu={longPress.handlers.onContextMenu}
      onPointerOver={(event) => {
        setHoveredAyah(resolveAyah(event.target));
        setHoveredWord(resolveWord(event.target));
        if (event.pointerType === "mouse" && !selectedAyah) showTip(event.target);
      }}
      onPointerLeave={(event) => {
        setHoveredAyah(null);
        setHoveredWord(null);
        // Touch fires pointerleave right after the tap, which would close the tapped tooltip.
        if (event.pointerType === "mouse") setTip(null);
      }}
      onClick={(event) => {
        if (longPress.consumeClick()) {
          event.stopPropagation();
          return;
        }
        const wordKey = resolveWord(event.target);
        const ayah = resolveAyah(event.target);
        const el = (event.target as HTMLElement).closest<HTMLElement>("[data-ayah]");
        const code = el?.dataset.code;
        const blurred = Boolean(
          ayah && !isLeadingSplit(ayah) && blurSet?.has(ayah) && !revealedSet?.has(ayah),
        );
        if (blurred && ayah && onPeekAyah) {
          event.stopPropagation();
          setTip(null);
          onPeekAyah(ayah);
          return;
        }
        // Touch: a tap shows a word's meaning when word mode is on, and otherwise falls through to
        // the page, which toggles focus mode. The ayah menu opens on a hold (see useLongPress).
        if (pointerTypeRef.current !== "mouse") {
          if (tip?.touch) {
            event.stopPropagation();
            setTip(null);
            if (tip.word === wordKey) return;
          }
          if (wordTranslation && el && wordKey && code && words?.has(code)) {
            event.stopPropagation();
            setHoveredWord(wordKey);
            setTip({ code, rect: el.getBoundingClientRect(), word: wordKey, touch: true });
          }
          return;
        }
        setTip(null);
        if (!el) return;
        event.stopPropagation();
        selectFromElement(el);
      }}
    >
      {rows.map((row) => {
        if (row.kind === "header") {
          return (
            <div key={row.line} className="glyph-line glyph-line--header" aria-hidden="true">
              <SurahBanner surah={row.surah} />
            </div>
          );
        }
        if (row.kind === "bismillah") {
          return (
            <div key={row.line} className="glyph-line glyph-line--bismillah" aria-hidden="true">
              <span className="glyph-bismillah">{BISMILLAH}</span>
            </div>
          );
        }
        // The two opening pages, and the short surah-ending lines flagged in the data, print centered at
        // the normal letter size instead of being stretched to the page.
        const centered = data.page <= 2 || row.centered === true;
        return (
          <div
            key={row.line}
            className={`glyph-line ${centered ? "glyph-line--center" : ""}`}
            data-glyph-line={row.line}
          >
            {row.words.map((word, index) => {
              const ayah = word.ayah;
              const wordKey = `${row.line}-${index}`;
              const isFirst = !firstWordOfAyah.has(ayah);
              if (isFirst) firstWordOfAyah.add(ayah);
              const hl = highlights[ayah];
              const blurred = Boolean(
                !isLeadingSplit(ayah) && blurSet?.has(ayah) && !revealedSet?.has(ayah),
              );
              const wordBlurred = blurred && !(blurLevel === "first-word" && isFirst);
              const mistake = mistakeAyahs?.get(ayah);
              const isPlayingWord = Boolean(
                playingAyah === ayah &&
                  playingWordRange &&
                  typeof word.wordIndex === "number" &&
                  word.wordIndex >= playingWordRange[0] &&
                  word.wordIndex < playingWordRange[1],
              );
              const prevAyah = index > 0 ? row.words[index - 1].ayah : null;
              const nextAyah = index + 1 < row.words.length ? row.words[index + 1].ayah : null;
              const classes = [
                "glyph-word",
                prevAyah !== ayah ? "glyph-word--run-start" : "",
                nextAyah !== ayah ? "glyph-word--run-end" : "",
                hl ? `glyph-word--hl-${hl}` : "",
                (wordTranslation ? hoveredWord === wordKey : hoveredAyah === ayah)
                  ? "glyph-word--hovered"
                  : "",
                (wordTranslation
                  ? selectedAyah === ayah && pickedWord === wordKey
                  : selectedAyah === ayah)
                  ? "glyph-word--selected"
                  : "",
                locatedAyah === ayah ? "glyph-word--located" : "",
                playingAyah === ayah ? "glyph-word--playing" : "",
                isPlayingWord ? "glyph-word--playing-word" : "",
                mistake ? "glyph-word--mistake" : "",
                wordBlurred ? "glyph-word--blurred" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const [surah, ayahNo] = ayah.split(":");
              const lookupCode = word.v1Code ?? word.code;
              return (
                <span
                  key={`${row.line}-${index}`}
                  className={classes}
                  data-ayah={ayah}
                  data-code={lookupCode}
                  data-word={wordKey}
                  style={word.fontFamily ? { fontFamily: `"${word.fontFamily}"` } : undefined}
                  role={isFirst ? "button" : undefined}
                  tabIndex={isFirst ? 0 : undefined}
                  aria-label={
                    isFirst
                      ? blurred
                        ? `Intip Surah ${surah} Ayat ${ayahNo}`
                        : `Surah ${surah} Ayat ${ayahNo}`
                      : undefined
                  }
                  aria-hidden={isFirst ? undefined : true}
                  onKeyDown={(event) => {
                    if (!isFirst || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    event.stopPropagation();
                    setTip(null);
                    setPickedWord(wordKey);
                    const info = wordTranslation ? words?.get(lookupCode) : undefined;
                    const selectedWord: SelectedWord | undefined =
                      info && info.translation
                        ? {
                            key: `${data.page}:${wordKey}`,
                            translation: info.translation,
                            transliteration: info.transliteration,
                          }
                        : undefined;
                    onSelectAyah(ayah, event.currentTarget.getBoundingClientRect(), selectedWord);
                  }}
                >
                  {word.code}
                  {isFirst && bookmarks.has(ayah) && (
                    <span className="ayah-box__bookmark" aria-hidden="true" />
                  )}
                </span>
              );
            })}
          </div>
        );
      })}
      {tip && tipInfo && (
        <div
          className="word-tip"
          role="tooltip"
          style={{
            left: Math.max(8, Math.min(window.innerWidth - 168, tip.rect.left + tip.rect.width / 2 - 80)),
            top: tip.rect.top > 90 ? tip.rect.top - 8 : tip.rect.bottom + 8,
            transform: tip.rect.top > 90 ? "translateY(-100%)" : undefined,
          }}
        >
          <span className="word-tip__tr">{tipInfo.transliteration}</span>
          <span className="word-tip__id">{tipInfo.translation}</span>
          {tip.touch && (
            <span className="word-tip__hint">
              {tr("Tahan kata untuk menu ayat", "Hold word for ayah menu")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
