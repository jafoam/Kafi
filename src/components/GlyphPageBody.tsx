import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AyahKey, HighlightColor, MistakeBadge, PageEntry } from "../data/types";
import catalog from "../data/catalog.json";
import { buildPageRows } from "../services/glyph-layout";
import type { GlyphPageData } from "../services/glyph-pages";

const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const SURAH_NAMES = new Map<number, string>(
  (catalog as { surahs: { number: number; arabicName: string }[] }).surahs.map((s) => [
    s.number,
    s.arabicName,
  ]),
);

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
  onSelectAyah,
  onPeekAyah,
}: GlyphPageBodyProps) {
  const [hoveredAyah, setHoveredAyah] = useState<AyahKey | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const totalLines = data.page <= 2 ? 8 : 15;
  const rows = useMemo(() => buildPageRows(data, totalLines), [data, totalLines]);

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

  const firstWordOfAyah = new Set<AyahKey>();

  return (
    <div
      ref={bodyRef}
      className="glyph-page"
      data-lines={totalLines}
      style={{ fontFamily: `"${data.fontFamily}"` }}
      onPointerOver={(event) => setHoveredAyah(resolveAyah(event.target))}
      onPointerLeave={() => setHoveredAyah(null)}
      onClick={(event) => {
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
        if (row.kind === "blank") return <div key={row.line} className="glyph-line glyph-line--blank" />;
        if (row.kind === "header") {
          return (
            <div key={row.line} className="glyph-line glyph-line--header" aria-hidden="true">
              <span className="glyph-header">{`سورة ${SURAH_NAMES.get(row.surah) ?? ""}`}</span>
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
        const centered = data.page <= 2 && row.words.length < 6;
        return (
          <div
            key={row.line}
            className={`glyph-line ${centered ? "glyph-line--center" : ""}`}
            data-glyph-line={row.line}
          >
            {row.words.map((word, index) => {
              const ayah = word.ayah;
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
                hoveredAyah === ayah ? "glyph-word--hovered" : "",
                selectedAyah === ayah ? "glyph-word--selected" : "",
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
    </div>
  );
}
