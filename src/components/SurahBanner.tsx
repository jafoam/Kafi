import { surahBannerTitle } from "../data/surah-titles";

function BannerOrnament({ flip }: { flip?: boolean }) {
  return (
    <svg
      className={`surah-banner__ornament ${flip ? "surah-banner__ornament--flip" : ""}`}
      viewBox="0 0 40 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 10h12m0 0 5-5 5 5-5 5-5-5Zm10 0h4c3 0 5-3 9-3m-9 3c3 0 5 3 9 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

/**
 * Classic mushaf surah header: double ornamental frame on a soft parchment band with centered calligraphy.
 */
export function SurahBanner({ surah }: { surah: number }) {
  return (
    <div className="surah-banner" aria-hidden="true">
      <BannerOrnament />
      <span className="surah-banner__name">{surahBannerTitle(surah)}</span>
      <BannerOrnament flip />
    </div>
  );
}
