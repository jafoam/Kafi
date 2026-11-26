import catalogJson from "../data/catalog.json";
import type { Catalog } from "../data/types";
import { surahBannerTitle } from "../data/surah-titles";

const surahByNumber = new Map(
  (catalogJson as unknown as Catalog).surahs.map((s) => [s.number, s]),
);

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);
}

/**
 * Illuminated Mushaf surah cartouche: pointed ogee ends, deep emerald & gold frame,
 * and three ivory windows (Makkiyah/Madaniyah on right, Surah name centered, Ayah count on left).
 */
export function SurahBanner({ surah }: { surah: number }) {
  const info = surahByNumber.get(surah);
  const revelation = info?.location === "medina" ? "مَدَنِيَّةٌ" : "مَكِّيَّةٌ";
  const ayahCount = info ? `آيَاتُهَا ${toArabicDigits(info.ayahs)}` : "";

  return (
    <div className="surah-banner" aria-hidden="true">
      <svg
        className="surah-banner__bg"
        viewBox="0 0 600 60"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Outer pointed ogee cartouche */}
        <path
          d="M4 30 C16 18 22 4 36 4 H564 C578 4 584 18 596 30 C584 42 578 56 564 56 H36 C22 56 16 42 4 30 Z"
          fill="var(--banner-bg)"
          stroke="var(--banner-gold)"
          strokeWidth="1.6"
        />
        {/* Inner fine gold frame */}
        <path
          d="M12 30 C22 20 27 8 39 8 H561 C573 8 578 20 588 30 C578 40 573 52 561 52 H39 C27 52 22 40 12 30 Z"
          fill="none"
          stroke="var(--banner-gold)"
          strokeWidth="0.9"
          opacity="0.7"
        />

        {/* Left window (Ayah count in RTL) */}
        <path
          d="M32 30 C38 19 44 13 54 13 H130 C138 13 142 19 146 30 C142 41 138 47 130 47 H54 C44 47 38 41 32 30 Z"
          fill="var(--banner-window)"
          stroke="var(--banner-gold)"
          strokeWidth="1.1"
        />

        {/* Center main window (Surah name) */}
        <path
          d="M174 30 C182 16 190 9 204 9 H396 C410 9 418 16 426 30 C418 44 410 51 396 51 H204 C190 51 182 44 174 30 Z"
          fill="var(--banner-window)"
          stroke="var(--banner-gold)"
          strokeWidth="1.3"
        />

        {/* Right window (Makkiyah / Madaniyah in RTL) */}
        <path
          d="M454 30 C458 19 462 13 470 13 H546 C556 13 562 19 568 30 C562 41 556 47 546 47 H470 C462 47 458 41 454 30 Z"
          fill="var(--banner-window)"
          stroke="var(--banner-gold)"
          strokeWidth="1.1"
        />

        {/* Two illuminated diamond star dividers */}
        <path d="M160 19 L167 30 L160 41 L153 30 Z" fill="var(--banner-gold)" opacity="0.9" />
        <circle cx="160" cy="30" r="2.2" fill="var(--banner-bg)" />
        <path d="M440 19 L447 30 L440 41 L433 30 Z" fill="var(--banner-gold)" opacity="0.9" />
        <circle cx="440" cy="30" r="2.2" fill="var(--banner-bg)" />
      </svg>

      <div className="surah-banner__content" dir="rtl">
        <span className="surah-banner__meta">{revelation}</span>
        <span className="surah-banner__name">{surahBannerTitle(surah)}</span>
        <span className="surah-banner__meta">{ayahCount}</span>
      </div>
    </div>
  );
}
