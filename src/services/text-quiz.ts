import type { AyahKey, Catalog } from "../data/types";
import { expandRandomPool, type RandomPool } from "./tasmi-logic";

export interface ContinueOption {
  ayah: AyahKey;
  text: string;
  correct: boolean;
}

export interface ContinueQuestion {
  kind: "continue";
  promptAyah: AyahKey;
  promptSurahName: string;
  promptAyahNum: number;
  promptText: string;
  answerAyah: AyahKey;
  options: ContinueOption[];
}

export interface OrderChunk {
  id: number;
  text: string;
}

export interface OrderQuestion {
  kind: "order";
  ayah: AyahKey;
  surahName: string;
  ayahNum: number;
  chunks: OrderChunk[];
  shuffled: OrderChunk[];
}

export type TextQuizMode = "continue" | "order";
export type TextQuizQuestion = ContinueQuestion | OrderQuestion;

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildContinueQuestion(
  pool: RandomPool,
  catalog: Pick<Catalog, "surahs" | "juzs">,
  getAyahWords: (surah: number, ayah: number) => string[],
  options?: { excludePrompt?: AyahKey | null; rng?: () => number },
): ContinueQuestion | null {
  const rng = options?.rng ?? Math.random;
  const segments = expandRandomPool(pool, catalog);
  if (segments.length === 0) return null;

  const surahNames = new Map<number, string>();
  for (const s of catalog.surahs) surahNames.set(s.number, s.name);

  // Collect all valid prompt -> next-ayah pairs plus all ayahs in the pool as distractors.
  const pairs: Array<{ surah: number; prompt: number; answer: number }> = [];
  const allAyahs: AyahKey[] = [];
  for (const seg of segments) {
    for (let a = seg.fromAyah; a <= seg.toAyah; a += 1) {
      allAyahs.push(`${seg.surah}:${a}`);
      if (a < seg.toAyah) {
        pairs.push({ surah: seg.surah, prompt: a, answer: a + 1 });
      }
    }
  }
  if (pairs.length === 0) return null;

  const filtered =
    options?.excludePrompt && pairs.length > 1
      ? pairs.filter((p) => `${p.surah}:${p.prompt}` !== options.excludePrompt)
      : pairs;
  const pickList = filtered.length > 0 ? filtered : pairs;
  const chosen = pickList[Math.min(pickList.length - 1, Math.floor(rng() * pickList.length))];

  const promptAyah: AyahKey = `${chosen.surah}:${chosen.prompt}`;
  const answerAyah: AyahKey = `${chosen.surah}:${chosen.answer}`;
  const promptText = getAyahWords(chosen.surah, chosen.prompt).join(" ").trim();
  const answerText = getAyahWords(chosen.surah, chosen.answer).join(" ").trim();
  if (!promptText || !answerText) return null;

  // Build up to 3 distinct distractors from the pool (falling back to nearby surahs if tiny pool).
  const distractors: ContinueOption[] = [];
  const usedTexts = new Set<string>([answerText, promptText]);
  const poolCandidates = shuffle(
    allAyahs.filter((k) => k !== promptAyah && k !== answerAyah),
    rng,
  );
  for (const key of poolCandidates) {
    if (distractors.length >= 3) break;
    const [s, a] = key.split(":").map(Number);
    const text = getAyahWords(s, a).join(" ").trim();
    if (!text || usedTexts.has(text)) continue;
    usedTexts.add(text);
    distractors.push({ ayah: key, text, correct: false });
  }

  // Fallback to short surahs in Juz 30 if the selected range had fewer than 4 distinct ayahs.
  if (distractors.length < 3) {
    for (let s = 114; s >= 105 && distractors.length < 3; s -= 1) {
      const info = catalog.surahs.find((item) => item.number === s);
      if (!info) continue;
      for (let a = 1; a <= info.ayahs && distractors.length < 3; a += 1) {
        const key: AyahKey = `${s}:${a}`;
        const text = getAyahWords(s, a).join(" ").trim();
        if (!text || usedTexts.has(text)) continue;
        usedTexts.add(text);
        distractors.push({ ayah: key, text, correct: false });
      }
    }
  }

  const allOptions = shuffle(
    [{ ayah: answerAyah, text: answerText, correct: true }, ...distractors],
    rng,
  );

  return {
    kind: "continue",
    promptAyah,
    promptSurahName: surahNames.get(chosen.surah) ?? `Surah ${chosen.surah}`,
    promptAyahNum: chosen.prompt,
    promptText,
    answerAyah,
    options: allOptions,
  };
}

/** Splits an ayah's words into 3..6 balanced phrase chunks for ordering. */
export function splitWordsIntoChunks(words: readonly string[]): OrderChunk[] {
  const clean = words.filter((w) => w.trim().length > 0);
  if (clean.length < 3) return [];
  const targetChunks = clean.length <= 5 ? clean.length : clean.length <= 10 ? 4 : 5;
  const chunks: OrderChunk[] = [];
  let offset = 0;
  for (let i = 0; i < targetChunks; i += 1) {
    const remainingWords = clean.length - offset;
    const remainingChunks = targetChunks - i;
    const take = Math.ceil(remainingWords / remainingChunks);
    chunks.push({ id: i, text: clean.slice(offset, offset + take).join(" ") });
    offset += take;
  }
  return chunks;
}

export function buildOrderQuestion(
  pool: RandomPool,
  catalog: Pick<Catalog, "surahs" | "juzs">,
  getAyahWords: (surah: number, ayah: number) => string[],
  options?: { excludeAyah?: AyahKey | null; rng?: () => number },
): OrderQuestion | null {
  const rng = options?.rng ?? Math.random;
  const segments = expandRandomPool(pool, catalog);
  if (segments.length === 0) return null;

  const surahNames = new Map<number, string>();
  for (const s of catalog.surahs) surahNames.set(s.number, s.name);

  const candidates: Array<{ surah: number; ayah: number; words: string[] }> = [];
  for (const seg of segments) {
    for (let a = seg.fromAyah; a <= seg.toAyah; a += 1) {
      const words = getAyahWords(seg.surah, a);
      if (words.length >= 3) {
        candidates.push({ surah: seg.surah, ayah: a, words });
      }
    }
  }
  if (candidates.length === 0) return null;

  const filtered =
    options?.excludeAyah && candidates.length > 1
      ? candidates.filter((c) => `${c.surah}:${c.ayah}` !== options.excludeAyah)
      : candidates;
  const pickList = filtered.length > 0 ? filtered : candidates;
  const chosen = pickList[Math.min(pickList.length - 1, Math.floor(rng() * pickList.length))];

  const chunks = splitWordsIntoChunks(chosen.words);
  if (chunks.length < 3) return null;

  // Ensure shuffled order differs from the original order.
  let shuffled = shuffle(chunks, rng);
  if (shuffled.every((c, idx) => c.id === idx)) {
    shuffled = [...chunks.slice(1), chunks[0]];
  }

  return {
    kind: "order",
    ayah: `${chosen.surah}:${chosen.ayah}`,
    surahName: surahNames.get(chosen.surah) ?? `Surah ${chosen.surah}`,
    ayahNum: chosen.ayah,
    chunks,
    shuffled,
  };
}
