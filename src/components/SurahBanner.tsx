import { surahBannerTitle } from "../data/surah-titles";

/** Teal surah banner: a rounded band with a fine inner rule and the surah name in white. */
export function SurahBanner({ surah }: { surah: number }) {
  return (
    <svg
      className="surah-banner"
      viewBox="0 0 600 56"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="600" height="56" rx="10" fill="var(--banner-fill)" />
      <rect
        x="5"
        y="5"
        width="590"
        height="46"
        rx="6"
        fill="none"
        stroke="var(--banner-ink)"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <text
        x="300"
        y="36"
        textAnchor="middle"
        direction="rtl"
        className="surah-banner__name"
        fill="var(--banner-ink)"
      >
        {surahBannerTitle(surah)}
      </text>
    </svg>
  );
}
