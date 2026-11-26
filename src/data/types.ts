export type AyahKey = `${number}:${number}`;

export type NormRect = [x: number, y: number, w: number, h: number];

export interface AyahSegment {
  surah: number;
  ayah: number;
  boxes: NormRect[];
}

export interface PageEntry {
  page: number;
  image: string;
  surahs: number[];
  ayahs: AyahSegment[];
  leadingSplitAyah?: AyahKey;
}

export interface MushafMap {
  width: 699;
  height: 1020;
  pages: PageEntry[];
  ayahToPage: Record<AyahKey, number>;
  surahToPage: Record<number, number>;
}

export interface SurahInfo {
  number: number;
  name: string;
  arabicName: string;
  ayahs: number;
  page: number;
  location: "mecca" | "medina";
}

export interface JuzInfo {
  number: number;
  page: number;
  startSurah: number;
  startAyah: number;
}

export interface ReciterInfo {
  id: string;
  name: string;
  arabicName?: string;
  style?: string;
  subfolder: string;
}

export interface ResourceInfo {
  id: number;
  name: string;
  author: string;
  language: string;
}

export interface TafsirInfo {
  id: string;
  name: string;
  author: string;
  language: string;
  source: "equran" | "qurancom";
  resourceId?: number;
}

export interface Catalog {
  surahs: SurahInfo[];
  juzs: JuzInfo[];
  reciters: ReciterInfo[];
  translations: ResourceInfo[];
  tafsirs: TafsirInfo[];
}

export type HighlightColor = "amber" | "emerald" | "sky" | "rose";

export type SpreadMode = "auto" | "single" | "double";

export type ThemeMode = "light" | "sepia" | "dark";

export interface AppSettings {
  theme: ThemeMode;
  spreadMode: SpreadMode;
  reciterId: string;
  translationId: number;
  tafsirId: string;
  hifzBlur: boolean;
  mistakeSound: boolean;
}

export interface TasmiMistakeRecord {
  id: string;
  errorClass: string;
  surah: number;
  ayah: number;
  word?: number;
  wordText?: string;
  confidence?: number;
}

export interface TasmiSessionRecord {
  id: string;
  startedAt: string;
  durationSec: number;
  surah: number;
  fromAyah: number;
  toAyah: number;
  mistakes: TasmiMistakeRecord[];
}

export interface UserData {
  lastPage: number;
  bookmarks: AyahKey[];
  highlights: Record<AyahKey, HighlightColor>;
  notes: Record<AyahKey, string>;
  settings: AppSettings;
  tasmiHistory: TasmiSessionRecord[];
}
