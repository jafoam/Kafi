import { describe, expect, it } from "vitest";
import catalogJson from "../src/data/catalog.json";
import type { Catalog } from "../src/data/types";
import {
  buildContinueQuestion,
  buildOrderQuestion,
  splitWordsIntoChunks,
} from "../src/services/text-quiz";

const catalog = catalogJson as unknown as Catalog;

const FAKE_WORDS: Record<string, string[]> = {
  "112:1": ["قُلْ", "هُوَ", "اللَّهُ", "أَحَدٌ"],
  "112:2": ["اللَّهُ", "الصَّمَدُ"],
  "112:3": ["لَمْ", "يَلِدْ", "وَلَمْ", "يُولَدْ"],
  "112:4": ["وَلَمْ", "يَكُن", "لَّهُ", "كُفُوًا", "أَحَدٌ"],
  "114:1": ["قُلْ", "أَعُوذُ", "بِرَبِّ", "النَّاسِ"],
  "114:2": ["مَلِكِ", "النَّاسِ"],
  "114:3": ["إِلَٰهِ", "النَّاسِ"],
};

const lookup = (surah: number, ayah: number) => FAKE_WORDS[`${surah}:${ayah}`] ?? [];

describe("text-quiz", () => {
  it("builds a continue-ayah question with exactly one correct option", () => {
    const q = buildContinueQuestion(
      { kind: "surah", fromSurah: 112, toSurah: 112 },
      catalog,
      lookup,
      { rng: () => 0.1 },
    );
    expect(q).not.toBeNull();
    expect(q!.promptAyah).toBe("112:1");
    expect(q!.answerAyah).toBe("112:2");
    expect(q!.options.filter((o) => o.correct)).toHaveLength(1);
    expect(q!.options.length).toBeGreaterThanOrEqual(3);
  });

  it("splits words into balanced chunks and builds a shuffled order question", () => {
    const chunks = splitWordsIntoChunks(["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"]);
    expect(chunks).toHaveLength(4);
    expect(chunks.map((c) => c.text).join(" ")).toBe("w1 w2 w3 w4 w5 w6 w7 w8");

    const q = buildOrderQuestion(
      { kind: "surah", fromSurah: 112, toSurah: 112 },
      catalog,
      lookup,
      { rng: () => 0.0 },
    );
    expect(q).not.toBeNull();
    expect(q!.chunks.length).toBeGreaterThanOrEqual(3);
    // Shuffled order must differ from canonical 0..n-1 order.
    expect(q!.shuffled.every((c, idx) => c.id === idx)).toBe(false);
  });
});
