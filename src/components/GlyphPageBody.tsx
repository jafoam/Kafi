import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AyahKey, HighlightColor, MistakeBadge, PageEntry } from "../data/types";
import type { GlyphPageData } from "../services/glyph-pages";
import { createWordTranslationLoader, type PageWords } from "../services/word-translations";
import { SurahBanner } from "./SurahBanner";

const wordLoader = createWordTranslationLoader();

/** U+FDFD ARABIC LIGATURE BISMILLAH, drawn as one calligraphic glyph by the AmiriBismillah font. */
const BISMILLAH = "\uFDFD";
export interface GlyphPageBodyProps {
  data: GlyphPageData;
  pageEntry: PageEntry;
  selectedAyah: AyahKey | null;
  playingAyah: AyahKey | null;
  highlights: Record<AyahKey, HighlightColor>;
  bookmarks: Set<AyahKey>;
  blurSet?: Set<AyahKey>;
  revealedSet?: Set<AyahKey>;
  mistakeAyahs?: Map<AyahKey, MistakeBadge>;
  /** Show the per-word translation tooltip (default on). */
  wordTranslation?: boolean;
  onSelectAyah: (ayah: AyahKey, anchorRect: DOMRect) => void;
  onPeekAyah?: (ayah: AyahKey) => void;
}

export function GlyphPageBody({
  data,
  pageEntry,
  selectedAyah,
  playingAyah,
  highlights,
  bookmarks,
  blurSet,
  revealedSet,
  mistakeAyahs,
  wordTranslation = true,
  onSelectAyah,
  onPeekAyah,
}: GlyphPageBodyProps) {
  const [hoveredAyah, setHoveredAyah] = useState<AyahKey | null>(null);
  /** Word under the pointer / last tapped, as "line-index"; used when translation mode highlights single words. */
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [pickedWord, setPickedWord] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [words, setWords] = useState<PageWords | null>(null);
  const [tip, setTip] = useState<{ code: string; rect: DOMRect } | null>(null);

  useEffect(() => {
    let live = true;
    setWords(null);
    if (!wordTranslation) return;
    wordLoader.load(data.page).then((w) => live && setWords(w), () => undefined);
    return () => {
      live = false;
    };
  }, [data.page, wordTranslation]);

  useEffect(() => {
    if (!wordTranslation) setTip(null);
  }, [wordTranslation]);

  const showTip = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return setTip(null);
    const el = target.closest<HTMLElement>("[data-code]");
    if (!el || !words?.has(el.dataset.code!)) return setTip(null);
    setTip({ code: el.dataset.code!, rect: el.getBoundingClientRect() });
  };
  const tipInfo = tip ? words?.get(tip.code) : undefined;
  const totalLines = data.page <= 2 ? 8 : 15;
  const rows = data.rows;

  // Shrink the glyph size just enough that the widest line fits; container-relative units keep it valid on resize.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.style.setProperty("--glyph-fit", "1");
    let widest = 0;
    for (const line of body.querySelectorAll<HTMLElement>("[data-glyph-line]")) {
      let natural = 0;
      for (const child of Array.from(line.children) as HTMLElement[]) natural += child.offsetWidth;
      widest = Math.max(widest, natural);
    }
    if (widest > body.clientWidth && body.clientWidth > 0) {
      body.style.setProperty("--glyph-fit", String(body.clientWidth / widest));
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

  const firstWordOfAyah = new Set<AyahKey>();

  return (
    <div
      ref={bodyRef}
      className="glyph-page"
      data-lines={totalLines}
      style={{ fontFamily: `"${data.fontFamily}"` }}
      onPointerOver={(event) => {
        setHoveredAyah(resolveAyah(event.target));
        setHoveredWord(resolveWord(event.target));
        if (event.pointerType === "mouse") showTip(event.target);
      }}
      onPointerLeave={() => {
        setHoveredAyah(null);
        setHoveredWord(null);
        setTip(null);
      }}
      onClick={(event) => {
        showTip(event.target);
        setPickedWord(resolveWord(event.target));
        const ayah = resolveAyah(event.target);
        if (!ayah) return;
        event.stopPropagation();
        const blurred = Boolean(
          !isLeadingSplit(ayah) && blurSet?.has(ayah) && !revealedSet?.has(ayah),
        );
        if (blurred && onPeekAyah) {
          onPeekAyah(ayah);
          return;
        }
        const el = (event.target as HTMLElement).closest<HTMLElement>("[data-ayah]");
        onSelectAyah(ayah, (el ?? event.currentTarget).getBoundingClientRect());
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
              const mistake = mistakeAyahs?.get(ayah);
              const classes = [
                "glyph-word",
                hl ? `glyph-word--hl-${hl}` : "",
                (wordTranslation ? hoveredWord === wordKey : hoveredAyah === ayah)
                  ? "glyph-word--hovered"
                  : "",
                (wordTranslation
                  ? selectedAyah === ayah && pickedWord === wordKey
                  : selectedAyah === ayah)
                  ? "glyph-word--selected"
                  : "",
                playingAyah === ayah ? "glyph-word--playing" : "",
                mistake ? "glyph-word--mistake" : "",
                blurred ? "glyph-word--blurred" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const [surah, ayahNo] = ayah.split(":");
              return (
                <span
                  key={`${row.line}-${index}`}
                  className={classes}
                  data-ayah={ayah}
                  data-code={word.code}
                  data-word={wordKey}
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
                    onSelectAyah(ayah, event.currentTarget.getBoundingClientRect());
                  }}
                >
                  {word.code}
                  {isFirst && bookmarks.has(ayah) && (
                    <span className="ayah-box__bookmark" aria-hidden="true" />
                  )}
                  {isFirst && mistake && (
                    <span className="ayah-box__mistake-badge">{mistake.count > 1 ? mistake.count : "!"}</span>
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
        </div>
      )}
    </div>
  );
}
