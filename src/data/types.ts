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
  /** Indonesian Latin name (e.g. "Al-Baqarah"). */
  name: string;
  /** International spelling (e.g. "Al-Baqara"), still accepted by search. */
  nameAlt?: string;
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
  source: "equran" | "qurancom" | "spa5k";
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

/**
 * How the reader moves between pages: sideways swipe, a continuous vertical scroll, or a vertical
 * scroll that stops on each page.
 */
export type PageNavMode = "swipe" | "scroll" | "scroll-page";

export type HifzBlurLevel = "full" | "first-word";

/**
 * Which calligraphy draws the mushaf words. Both keep the 1405 Madinah page layout: `1405` uses the
 * QCF v1 glyphs, `1441` the QCF v4 glyphs of the 1441 print (the only ones with tajweed colors).
 */
export type LetterStyle = "1405" | "1441";

export interface AppSettings {
  theme: ThemeMode;
  spreadMode: SpreadMode;
  reciterId: string;
  translationId: number;
  tafsirId: string;
  hifzBlur: boolean;
  hifzBlurLevel: HifzBlurLevel;
  /** Show the word-by-word translation tooltip on mushaf words. */
  wordTranslation: boolean;
  /** Color the letters by tajweed rule; only the 1441 letters carry the colors, so it implies them. */
  tajweed: boolean;
  letterStyle: LetterStyle;
  mistakeSound: boolean;
  pageNav: PageNavMode;
}

export interface MistakeBadge {
  errorClass: string;
  count: number;
  wordText?: string;
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

export type TasmiSessionKind = "ziyadah" | "murajaah";

export interface TasmiSessionRecord {
  id: string;
  startedAt: string;
  durationSec: number;
  surah: number;
  fromAyah: number;
  toAyah: number;
  mistakes: TasmiMistakeRecord[];
  /** Number of unique target ayahs detected as recited in this session. */
  recitedAyahs?: number;
  /** Number of unique words detected as recited in this session. */
  recitedWords?: number;
  /** Ayahs the user peeked during Hifz blur; counted as needing review/drill. */
  peekedAyahs?: AyahKey[];
  /** Ziyadah (new memorization) vs Muraja'ah (review). */
  kind?: TasmiSessionKind;
}

export interface MurajaahCard {
  /** Stable key `${surah}:${fromAyah}-${toAyah}`. */
  id: string;
  surah: number;
  fromAyah: number;
  toAyah: number;
  kind: TasmiSessionKind;
  /** FSRS-inspired stability in days (grows 1 -> 3 -> 7 -> 14 -> 30+ on clean reviews). */
  stabilityDays: number;
  /** Difficulty 1 (easy) .. 10 (hard). */
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string;
  dueAt: string;
}

export interface SyncConfig {
  code: string;
  workerUrl: string;
  lastSyncedAt?: string;
}

export interface BookmarkEvent {
  on: boolean;
  at: string;
}

export interface UserData {
  lastPage: number;
  recentPages?: number[];
  bookmarks: AyahKey[];
  /** When each bookmark was last added or removed, so a removal survives sync. */
  bookmarkLog?: Record<AyahKey, BookmarkEvent>;
  highlights: Record<AyahKey, HighlightColor>;
  notes: Record<AyahKey, string>;
  settings: AppSettings;
  tasmiHistory: TasmiSessionRecord[];
  murajaahCards?: MurajaahCard[];
  updatedAt?: string;
  /** When settings last changed; settings merge by this, not by updatedAt. */
  settingsUpdatedAt?: string;
}
