import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { parsePageXhtml } from "../scripts/extract-mushaf.mjs";

describe("extract-mushaf", () => {
  it("normalizes btnScaler + btnContainer + vBtn geometry into 0..100 percentages", () => {
    const sample = `
      <div class="btnScaler" style="transform:scale(1.5195652173913);transform-origin:top left;">
        <div class="btnContainer" style="left:-70px;top:-70px;transform:scale(1.09,1.09);">
          <div class="vBtn" id="v1_1" style="top:288px;left:186px;width:110px;height:25px;"></div>
        </div>
      </div><img src="../../imgs/0004.gif" width="699"/>`;
    const parsed = parsePageXhtml(sample, 1);
    expect(parsed.ayahs).toHaveLength(1);
    expect(parsed.ayahs[0]).toMatchObject({ surah: 1, ayah: 1 });
    const [x, y, w, h] = parsed.ayahs[0].boxes[0];
    expect(x).toBeGreaterThan(0);
    expect(x + w).toBeLessThan(100);
    expect(y).toBeGreaterThan(0);
    expect(y + h).toBeLessThan(100);
  });

  it("groups multi-box ayahs in reading order, clamps coordinates, and ignores non-ayah IDs", () => {
    const sample = `
      <div class="btnScaler" style="transform:scale(1.5);transform-origin:top left;">
        <div class="btnContainer" style="left:0px;top:0px;transform:scale(1,1);">
          <div class="vBtn" id="helper_box" style="top:0px;left:0px;width:10px;height:10px;"></div>
          <div class="vBtn" id="v1_6_1" style="top:10px;left:-10px;width:100px;height:20px;"></div>
          <div class="vBtn" id="v1_6_2" style="top:30px;left:50px;width:120px;height:20px;"></div>
        </div>
      </div><img src="../../imgs/0004.gif" width="699"/>`;
    const parsed = parsePageXhtml(sample, 1);
    expect(parsed.imageFile).toBe("0004.gif");
    expect(parsed.ayahs).toHaveLength(1);
    expect(parsed.ayahs[0].boxes).toHaveLength(2);
    expect(parsed.ayahs[0].boxes[0][0]).toBe(0);
    expect(parsed.surahs).toEqual([1]);
  });

  it("extracts all 604 pages, 54 multi-surah pages, and exact 8 split ayahs", () => {
    const map = JSON.parse(fs.readFileSync("src/data/mushaf-map.json", "utf8"));
    const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));
    expect(map.pages).toHaveLength(604);
    expect(map.ayahToPage["1:1"]).toBe(1);
    expect(map.ayahToPage["114:6"]).toBe(604);
    expect(Object.keys(map.ayahToPage)).toHaveLength(6236);
    expect(Object.keys(map.surahToPage)).toHaveLength(114);
    expect(map.pages.filter((p: { surahs: number[] }) => p.surahs.length > 1)).toHaveLength(54);
    const splits = map.pages
      .filter((p: { leadingSplitAyah?: string }) => p.leadingSplitAyah)
      .map((p: { leadingSplitAyah: string }) => p.leadingSplitAyah);
    expect(splits).toEqual(["2:94", "3:181", "7:164", "7:179", "11:109", "16:111", "18:54", "71:11"]);
    expect(catalog.surahs).toHaveLength(114);
    expect(catalog.juzs).toHaveLength(30);
    expect(catalog.juzs[1].page).toBe(22);
    expect(catalog.juzs[29].page).toBe(582);
    expect(catalog.reciters.some((r: { id: string }) => r.id === "Alafasy_128kbps")).toBe(true);
    expect(catalog.translations.some((t: { id: number }) => t.id === 33)).toBe(true);
    expect(catalog.tafsirs.some((t: { id: string }) => t.id === "equran-id")).toBe(true);
    expect(fs.existsSync("public/mushaf/pages/001.gif")).toBe(true);
    expect(fs.existsSync("public/mushaf/pages/604.gif")).toBe(true);
  });
});
