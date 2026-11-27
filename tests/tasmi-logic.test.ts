import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import {
  buildPageTasmiCandidates,
  countRecitedAyahs,
  createTasmiState,
  recordPeekMistake,
  reduceTilawaEvent,
  computeBlurMask,
  expandRandomPool,
  pickRandomChallenge,
  resolvePromptAudio,
} from "../src/services/tasmi-logic";
import { audioCacheKey } from "../src/services/quran-api";

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

  it("prioritizes a surah starting on the page over the trailing tail of the previous surah", () => {
    const p583 = map.pages[582]; // Page 583: An-Naba 31–40 + An-Naziat 1–16
    const options = buildPageTasmiCandidates([p583], catalog.surahs);
    expect(options[0]).toMatchObject({ surah: 79, fromAyah: 1 });
    expect(options[1]).toMatchObject({ surah: 78, fromAyah: 31 });
  });

  it("reveals an ayah after it is recited, keeps it open after mistakes and peeks, and counts peeks as mistakes", () => {
    let st = createTasmiState("memorization", { surah: 1, fromAyah: 1, toAyah: 7 });
    const words = () => ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"];

    // Word 2 of 4 -> still mid-ayah, so NOT revealed yet
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
    expect(st.revealedAyahs.has("1:1")).toBe(false);
    expect(st.recitedWords.size).toBe(2);
    expect(countRecitedAyahs(st)).toBe(1);

    // Word 4 of 4 with zero mistakes -> ayah 1:1 is now revealed!
    st = reduceTilawaEvent(
      st,
      {
        v: 1,
        type: "position",
        timeMs: 800,
        referenceVersion: "ref-v2",
        state: "locked",
        observed: [
          {
            word: { surah: 1, ayah: 1, word: 4 },
            span: {
              start: { surah: 1, ayah: 1, word: 3 },
              end: { surah: 1, ayah: 1, word: 4 },
            },
            confidence: 0.9,
            cost: 0.1,
            per: 0.05,
          },
        ],
        expected: { surah: 1, ayah: 2, word: 1 },
      } as any,
      words,
    );
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

    // confirmed -> counted once with Uthmani word text; the ayah stays open
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
    expect(st.revealedAyahs.has("1:1")).toBe(true);

    // resolved later -> mid-ayah mistake STILL counts as a mistake
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
    expect(st.confirmedMistakes).toHaveLength(1);

    // peeking a blurred ayah without reciting counts as a mistake, and opens it for good
    st = recordPeekMistake(st, "1:2");
    expect(st.revealedAyahs.has("1:2")).toBe(true);
    expect(st.confirmedMistakes).toHaveLength(2);
    expect(st.confirmedMistakes[1]).toMatchObject({
      errorClass: "peeked",
      surah: 1,
      ayah: 2,
    });
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

  it("expands Juz and Surah random pools accurately including Juz 30 through An-Nas", () => {
    const juz30 = expandRandomPool({ kind: "juz", fromJuz: 30, toJuz: 30 }, catalog);
    expect(juz30[0]).toEqual({ surah: 78, fromAyah: 1, toAyah: 40 });
    expect(juz30[juz30.length - 1]).toEqual({ surah: 114, fromAyah: 1, toAyah: 6 });

    const multiJuz = expandRandomPool({ kind: "juz", fromJuz: 1, toJuz: 2 }, catalog);
    expect(multiJuz[0]).toEqual({ surah: 1, fromAyah: 1, toAyah: 7 });
    expect(multiJuz[1]).toEqual({ surah: 2, fromAyah: 1, toAyah: 252 });

    const surahRange = expandRandomPool({ kind: "surah", fromSurah: 112, toSurah: 114 }, catalog);
    expect(surahRange).toEqual([
      { surah: 112, fromAyah: 1, toAyah: 4 },
      { surah: 113, fromAyah: 1, toAyah: 5 },
      { surah: 114, fromAyah: 1, toAyah: 6 },
    ]);
  });

  it("picks a prompt ayah followed by blurred continuation ayahs and avoids repeating prompt", () => {
    const challenge = pickRandomChallenge(
      { kind: "surah", fromSurah: 1, toSurah: 1, fromAyah: 1, toAyah: 7 },
      catalog,
      { rng: () => 0 },
    );
    expect(challenge).toEqual({
      promptAyah: "1:1",
      passage: { surah: 1, fromAyah: 2, toAyah: 4 },
    });

    const p1 = map.pages[0];
    const masked = computeBlurMask(p1, "tasmi", challenge!.passage, new Set(), null);
    expect(masked.has("1:1")).toBe(false);
    expect(masked.has("1:2")).toBe(true);
    expect(masked.has("1:3")).toBe(true);
    expect(masked.has("1:4")).toBe(true);
    expect(masked.has("1:5")).toBe(false);

    // Excluding 1:1 with rng=0 picks 1:2 next
    const next = pickRandomChallenge(
      { kind: "surah", fromSurah: 1, toSurah: 1, fromAyah: 1, toAyah: 7 },
      catalog,
      { excludePrompt: "1:1", rng: () => 0 },
    );
    expect(next?.promptAyah).toBe("1:2");
    expect(next?.passage).toEqual({ surah: 1, fromAyah: 3, toAyah: 5 });
  });

  it("resolves prompt audio using selected reciter or falling back to an offline cached reciter", async () => {
    const reciters = catalog.reciters.slice(0, 2);
    const [first, second] = reciters;
    const secondKey = audioCacheKey(second.subfolder, 78, 1);

    const platform = {
      cacheHas: vi.fn(async (_bucket: string, key: string) => key === secondKey),
    };
    const quranApi = {
      getAudioBlobUrl: vi.fn(async (folder: string) => ({
        url: `blob:${folder}`,
        fromCache: folder === second.subfolder,
      })),
    };

    // Offline: skips uncached selected reciter and uses the offline-cached second reciter
    const offlineMatch = await resolvePromptAudio(78, 1, first.id, reciters, platform, quranApi, {
      isOffline: true,
    });
    expect(offlineMatch?.reciter.id).toBe(second.id);
    expect(offlineMatch?.fromCache).toBe(true);

    // Online: uses selected reciter first
    const onlineMatch = await resolvePromptAudio(78, 1, first.id, reciters, platform, quranApi, {
      isOffline: false,
    });
    expect(onlineMatch?.reciter.id).toBe(first.id);

    // Online fetch failure: falls back to cached second reciter
    quranApi.getAudioBlobUrl.mockImplementationOnce(async () => {
      throw new Error("Network error");
    });
    const fallbackMatch = await resolvePromptAudio(78, 1, first.id, reciters, platform, quranApi, {
      isOffline: false,
    });
    expect(fallbackMatch?.reciter.id).toBe(second.id);
  });
});
