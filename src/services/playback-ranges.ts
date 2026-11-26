import type { AyahKey, Catalog, MushafMap } from "../data/types";
import { compareAyahKeys, parseAyahKey, prevAyah, type AyahRange } from "./audio-controller";

/** First and last ayah that start on the page `ayah` starts on. */
export function pageRange(mushaf: MushafMap, ayah: AyahKey): AyahRange | null {
  const page = mushaf.ayahToPage[ayah];
  const entry = mushaf.pages.find((p) => p.page === page);
  if (!entry) return null;
  const keys = entry.ayahs
    .map((segment) => `${segment.surah}:${segment.ayah}` as AyahKey)
    .filter((key) => mushaf.ayahToPage[key] === page)
    .sort(compareAyahKeys);
  if (keys.length === 0) return null;
  return { from: keys[0], to: keys[keys.length - 1] };
}

/** First and last ayah of the juz that contains `ayah`. */
export function juzRange(catalog: Catalog, ayah: AyahKey): AyahRange | null {
  const juzs = [...catalog.juzs].sort((a, b) => a.number - b.number);
  const startOf = (juz: (typeof juzs)[number]): AyahKey => `${juz.startSurah}:${juz.startAyah}`;
  let index = -1;
  for (let i = 0; i < juzs.length; i++) {
    if (compareAyahKeys(startOf(juzs[i]), ayah) <= 0) index = i;
  }
  if (index === -1) return null;

  const from = startOf(juzs[index]);
  const following = juzs[index + 1];
  if (following) {
    const last = prevAyah(following.startSurah, following.startAyah, catalog.surahs);
    return last ? { from, to: `${last.surah}:${last.ayah}` } : null;
  }
  const lastSurah = catalog.surahs[catalog.surahs.length - 1];
  return lastSurah ? { from, to: `${lastSurah.number}:${lastSurah.ayahs}` } : null;
}

/** Keeps a custom range inside one surah and in reading order. */
export function customRange(surah: number, from: number, to: number, ayahCount: number): AyahRange {
  const clamp = (n: number) => Math.min(Math.max(Math.round(n) || 1, 1), ayahCount);
  const start = clamp(from);
  const end = clamp(to);
  return { from: `${surah}:${Math.min(start, end)}`, to: `${surah}:${Math.max(start, end)}` };
}

export { parseAyahKey };
