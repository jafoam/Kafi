import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  buildPageTasmiCandidates,
  createTasmiState,
  reduceTilawaEvent,
  computeBlurMask,
} from "../src/services/tasmi-logic";

const map = JSON.parse(fs.readFileSync("src/data/mushaf-map.json", "utf8"));
const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));

describe("tasmi-logic", () => {
  it("lists each surah separately on multi-surah page 604 (per-surah Tasmi')", () => {
    const p604 = map.pages[603];
    const options = buildPageTasmiCandidates([p604], catalog.surahs);
    expect(options.map((o) => o.surah)).toEqual([112, 113, 114]);
    expect(options[0]).toMatchObject({ surah: 112, fromAyah: 1, toAyah: 4 });
  });

  it("handles split-ayah page 15 by leaving leading 2:94 unmasked and starting at 2:95", () => {
    const p15 = map.pages[14];
    expect(p15.leadingSplitAyah).toBe("2:94");
    const options = buildPageTasmiCandidates([p15], catalog.surahs);
    expect(options[0]).toMatchObject({ surah: 2, fromAyah: 95 });
    const masked = computeBlurMask(
      p15,
      "tasmi",
      { surah: 2, fromAyah: 95, toAyah: options[0].toAyah },
      new Set(),
      null,
    );
    expect(masked.has("2:94")).toBe(false);
    expect(masked.has("2:95")).toBe(true);
  });

  it("combines a 2-page spread option when the same surah spans both pages", () => {
    const options = buildPageTasmiCandidates([map.pages[2], map.pages[3]], catalog.surahs); // pages 3 & 4 (Al-Baqara)
    expect(options.some((o) => o.surah === 2 && o.scopeLabel.includes("2 Halaman"))).toBe(true);
  });

  it("tracks locked words, reveals recited ayahs, and counts only confirmed mistakes", () => {
    let st = createTasmiState("memorization", { surah: 1, fromAyah: 1, toAyah: 7 });
    const words = () => ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"];

    st = reduceTilawaEvent(
      st,
      {
        v: 1,
        type: "position",
        timeMs: 500,
        referenceVersion: "ref-v2",
        state: "locked",
        observed: [
          {
            word: { surah: 1, ayah: 1, word: 2 },
            span: {
              start: { surah: 1, ayah: 1, word: 1 },
              end: { surah: 1, ayah: 1, word: 2 },
            },
            confidence: 0.9,
            cost: 0.1,
            per: 0.05,
          },
        ],
        expected: { surah: 1, ayah: 1, word: 3 },
      } as any,
      words,
    );
    expect(st.activeAyah).toBe("1:1");
    expect(st.revealedAyahs.has("1:1")).toBe(true);

    // suspected -> should NOT appear in confirmedMistakes
    st = reduceTilawaEvent(
      st,
      {
        v: 1,
        type: "checker",
        id: "m1",
        timeMs: 900,
        state: "suspected",
        errorClass: "wrong_word",
        location: { surah: 1, ayah: 1, word: 3 },
        confidence: 0.8,
      } as any,
      words,
    );
    expect(st.confirmedMistakes).toHaveLength(0);

    // confirmed -> counted once with Uthmani word text
    st = reduceTilawaEvent(
      st,
      {
        v: 1,
        type: "checker",
        id: "m1",
        timeMs: 1200,
        state: "confirmed",
        errorClass: "wrong_word",
        location: { surah: 1, ayah: 1, word: 3 },
        confidence: 0.85,
      } as any,
      words,
    );
    expect(st.confirmedMistakes).toHaveLength(1);
    expect(st.confirmedMistakes[0].wordText).toBe("ٱلرَّحْمَـٰنِ");

    // resolved later -> removed from confirmedMistakes (self-corrected)
    st = reduceTilawaEvent(
      st,
      {
        v: 1,
        type: "checker",
        id: "m1",
        timeMs: 1600,
        state: "resolved",
        errorClass: "wrong_word",
        location: { surah: 1, ayah: 1, word: 3 },
        confidence: 0.9,
      } as any,
      words,
    );
    expect(st.confirmedMistakes).toHaveLength(0);
  });

  it("handles blur mask modes off, all, and tasmi with revealed and peeked ayahs", () => {
    const p1 = map.pages[0]; // Al-Fatihah 1:1..1:7
    expect(computeBlurMask(p1, "off", null, new Set(), null).size).toBe(0);

    const allMasked = computeBlurMask(p1, "all", null, new Set(["1:1"]), "1:2");
    expect(allMasked.has("1:1")).toBe(false);
    expect(allMasked.has("1:2")).toBe(false);
    expect(allMasked.has("1:3")).toBe(true);

    const tasmiMasked = computeBlurMask(
      p1,
      "tasmi",
      { surah: 1, fromAyah: 2, toAyah: 5 },
      new Set(["1:2"]),
      "1:3",
    );
    expect(tasmiMasked.has("1:1")).toBe(false);
    expect(tasmiMasked.has("1:2")).toBe(false);
    expect(tasmiMasked.has("1:3")).toBe(false);
    expect(tasmiMasked.has("1:4")).toBe(true);
    expect(tasmiMasked.has("1:5")).toBe(true);
    expect(tasmiMasked.has("1:6")).toBe(false);
  });

  it("uses actual QCF glyphAyahs when building page Tasmi' candidates", () => {
    const p593 = map.pages[592]; // scanned map has 88:23..26 and 89:1..22
    const printed593 = Array.from({ length: 23 }, (_, i) => `89:${i + 1}` as const);
    const candidates = buildPageTasmiCandidates([p593], catalog.surahs, { 593: printed593 });
    expect(candidates[0]).toMatchObject({
      surah: 89,
      fromAyah: 1,
      toAyah: 23,
      scopeLabel: "Hal. 593 (1–23)",
    });
    expect(candidates.some((c) => c.surah === 88)).toBe(false);
  });
});
