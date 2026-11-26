import { describe, it, expect } from "vitest";
import { SURAH_TITLES, surahBannerTitle } from "../src/data/surah-titles";

describe("surah banner titles", () => {
  it("covers all 114 surahs without blanks", () => {
    expect(SURAH_TITLES).toHaveLength(114);
    expect(SURAH_TITLES.every((t) => t.trim().length > 0)).toBe(true);
  });

  it("prefixes the name with سُورَةُ", () => {
    expect(surahBannerTitle(3)).toBe("سُورَةُ آلِ عِمْرَانَ");
    expect(surahBannerTitle(0)).toBe("");
    expect(surahBannerTitle(115)).toBe("");
  });
});
