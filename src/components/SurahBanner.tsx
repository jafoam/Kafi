import { surahBannerTitle } from "../data/surah-titles";

/**
 * Teal surah banner: a rounded band with a fine inner rule and the surah name in white. The name is set at
 * the page's own letter size (it inherits the glyph page's font-size), so it matches the ayah text on every
 * screen instead of scaling with the banner's width.
 */
export function SurahBanner({ surah }: { surah: number }) {
  return (
    <div className="surah-banner" aria-hidden="true">
      <span className="surah-banner__name">{surahBannerTitle(surah)}</span>
    </div>
  );
}
