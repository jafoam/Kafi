import type {
  AppSettings,
  AyahKey,
  BookmarkEvent,
  HifzBlurLevel,
  HighlightColor,
  MurajaahCard,
  SpreadMode,
  TasmiSessionRecord,
  ThemeMode,
  UserData,
} from "../data/types";
import type { PlatformAdapter } from "../platform/types";
import { applySessionToMurajaah, backfillMurajaahCards } from "./murajaah-srs";

export const USER_DATA_KEY = "kafi:user";

export const DEFAULT_USER_DATA: UserData = {
  lastPage: 1,
  recentPages: [],
  bookmarks: [],
  highlights: {},
  notes: {},
  settings: {
    theme: "light",
    spreadMode: "auto",
    reciterId: "Alafasy_128kbps",
    translationId: 33,
    tafsirId: "equran-id",
    hifzBlur: false,
    hifzBlurLevel: "full",
    wordTranslation: true,
    tajweed: false,
    letterStyle: "1405",
    mistakeSound: false,
    pageNav: "swipe",
  },
  tasmiHistory: [],
};

const VALID_THEMES = new Set<ThemeMode>(["light", "sepia", "dark"]);
const VALID_SPREADS = new Set<SpreadMode>(["auto", "single", "double"]);
const VALID_HIGHLIGHTS = new Set<HighlightColor>(["amber", "emerald", "sky", "rose"]);
const VALID_BLUR_LEVELS = new Set<HifzBlurLevel>(["full", "first-word"]);
const MAX_RECENT_PAGES = 5;

function clampPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(604, Math.max(1, Math.trunc(page)));
}

function cloneDefaultData(): UserData {
  return {
    lastPage: DEFAULT_USER_DATA.lastPage,
    recentPages: [],
    bookmarks: [],
    highlights: {},
    notes: {},
    settings: { ...DEFAULT_USER_DATA.settings },
    tasmiHistory: [],
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normalizeUserData(raw: unknown): UserData {
  if (!isPlainObject(raw)) return cloneDefaultData();

  const defaults = DEFAULT_USER_DATA.settings;
  const rawSettings = isPlainObject(raw.settings) ? raw.settings : {};

  const settings: AppSettings = {
    theme: VALID_THEMES.has(rawSettings.theme as ThemeMode)
      ? (rawSettings.theme as ThemeMode)
      : defaults.theme,
    spreadMode: VALID_SPREADS.has(rawSettings.spreadMode as SpreadMode)
      ? (rawSettings.spreadMode as SpreadMode)
      : defaults.spreadMode,
    reciterId:
      typeof rawSettings.reciterId === "string" && rawSettings.reciterId.length > 0
        ? rawSettings.reciterId
        : defaults.reciterId,
    translationId:
      typeof rawSettings.translationId === "number" && Number.isFinite(rawSettings.translationId)
        ? rawSettings.translationId
        : defaults.translationId,
    tafsirId:
      typeof rawSettings.tafsirId === "string" && rawSettings.tafsirId.length > 0
        ? rawSettings.tafsirId
        : defaults.tafsirId,
    hifzBlur: typeof rawSettings.hifzBlur === "boolean" ? rawSettings.hifzBlur : defaults.hifzBlur,
    hifzBlurLevel: VALID_BLUR_LEVELS.has(rawSettings.hifzBlurLevel as HifzBlurLevel)
      ? (rawSettings.hifzBlurLevel as HifzBlurLevel)
      : defaults.hifzBlurLevel,
    wordTranslation:
      typeof rawSettings.wordTranslation === "boolean" ? rawSettings.wordTranslation : defaults.wordTranslation,
    tajweed: typeof rawSettings.tajweed === "boolean" ? rawSettings.tajweed : defaults.tajweed,
    // Saved before letter styles existed: tajweed on meant the 1441 letters.
    letterStyle:
      rawSettings.letterStyle === "1405" || rawSettings.letterStyle === "1441"
        ? rawSettings.letterStyle
        : rawSettings.tajweed === true
          ? "1441"
          : defaults.letterStyle,
    mistakeSound:
      typeof rawSettings.mistakeSound === "boolean" ? rawSettings.mistakeSound : defaults.mistakeSound,
    pageNav:
      rawSettings.pageNav === "scroll" ||
      rawSettings.pageNav === "scroll-page" ||
      rawSettings.pageNav === "swipe"
        ? rawSettings.pageNav
        : defaults.pageNav,
  };

  const bookmarks = Array.isArray(raw.bookmarks)
    ? raw.bookmarks.filter((item): item is AyahKey => typeof item === "string" && item.includes(":"))
    : [];

  const bookmarkLog: Record<AyahKey, BookmarkEvent> = {};
  if (isPlainObject(raw.bookmarkLog)) {
    for (const [key, val] of Object.entries(raw.bookmarkLog)) {
      if (key.includes(":") && isPlainObject(val) && typeof val.on === "boolean" && typeof val.at === "string") {
        bookmarkLog[key as AyahKey] = { on: val.on, at: val.at };
      }
    }
  }

  const highlights: Record<AyahKey, HighlightColor> = {};
  if (isPlainObject(raw.highlights)) {
    for (const [key, val] of Object.entries(raw.highlights)) {
      if (key.includes(":") && VALID_HIGHLIGHTS.has(val as HighlightColor)) {
        highlights[key as AyahKey] = val as HighlightColor;
      }
    }
  }

  const notes: Record<AyahKey, string> = {};
  if (isPlainObject(raw.notes)) {
    for (const [key, val] of Object.entries(raw.notes)) {
      if (key.includes(":") && typeof val === "string" && val.trim().length > 0) {
        notes[key as AyahKey] = val;
      }
    }
  }

  const tasmiHistory = Array.isArray(raw.tasmiHistory)
    ? raw.tasmiHistory.filter(
        (item): item is TasmiSessionRecord =>
          isPlainObject(item) &&
          typeof item.id === "string" &&
          typeof item.startedAt === "string" &&
          typeof item.durationSec === "number" &&
          typeof item.surah === "number" &&
          typeof item.fromAyah === "number" &&
          typeof item.toAyah === "number" &&
          Array.isArray(item.mistakes),
      )
    : [];

  const lastPage =
    typeof raw.lastPage === "number" ? clampPage(raw.lastPage) : DEFAULT_USER_DATA.lastPage;
  const recentPages = Array.isArray(raw.recentPages)
    ? Array.from(
        new Set(
          raw.recentPages
            .filter((p): p is number => typeof p === "number" && Number.isFinite(p))
            .map(clampPage),
        ),
      ).slice(0, MAX_RECENT_PAGES)
    : [];

  const rawCards = Array.isArray(raw.murajaahCards)
    ? raw.murajaahCards.filter(
        (item): item is MurajaahCard =>
          isPlainObject(item) &&
          typeof item.id === "string" &&
          typeof item.surah === "number" &&
          typeof item.fromAyah === "number" &&
          typeof item.toAyah === "number" &&
          typeof item.stabilityDays === "number" &&
          typeof item.dueAt === "string",
      )
    : [];
  const murajaahCards = backfillMurajaahCards(tasmiHistory, rawCards);
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : undefined;
  const settingsUpdatedAt = typeof raw.settingsUpdatedAt === "string" ? raw.settingsUpdatedAt : undefined;

  return {
    lastPage,
    recentPages,
    bookmarks,
    bookmarkLog,
    highlights,
    notes,
    settings,
    tasmiHistory,
    murajaahCards,
    updatedAt,
    settingsUpdatedAt,
  };
}

export interface UserStore {
  load(): Promise<UserData>;
  toggleBookmark(ayah: AyahKey): Promise<UserData>;
  setHighlight(ayah: AyahKey, color: HighlightColor | null): Promise<UserData>;
  setNote(ayah: AyahKey, text: string): Promise<UserData>;
  updateSettings(patch: Partial<AppSettings>): Promise<UserData>;
  setLastPage(page: number): Promise<UserData>;
  addTasmiHistory(record: TasmiSessionRecord): Promise<UserData>;
  replaceAll(next: UserData): Promise<UserData>;
  /** Replace with a value built from the latest stored data, inside the write queue. */
  replaceWith(build: (current: UserData) => UserData): Promise<UserData>;
}

export function createUserStore(platform: PlatformAdapter): UserStore {
  let state: UserData | null = null;
  let writeQueue: Promise<unknown> = Promise.resolve();

  const loadFromStorage = async (): Promise<UserData> => {
    const raw = await platform.kvGet(USER_DATA_KEY);
    if (!raw) {
      state = cloneDefaultData();
      return state;
    }
    try {
      state = normalizeUserData(JSON.parse(raw));
    } catch {
      state = cloneDefaultData();
    }
    return state;
  };

  const mutate = (updater: (current: UserData) => UserData): Promise<UserData> => {
    const next = writeQueue.then(async () => {
      const current = state ?? (await loadFromStorage());
      const updated = { ...updater(current), updatedAt: new Date().toISOString() };
      await platform.kvSet(USER_DATA_KEY, JSON.stringify(updated));
      state = updated;
      return updated;
    });
    writeQueue = next.catch(() => {});
    return next;
  };

  return {
    load() {
      const next = writeQueue.then(() => loadFromStorage());
      writeQueue = next.catch(() => {});
      return next;
    },
    toggleBookmark(ayah: AyahKey) {
      return mutate((current) => {
        const exists = current.bookmarks.includes(ayah);
        const bookmarks = exists
          ? current.bookmarks.filter((item) => item !== ayah)
          : [...current.bookmarks, ayah];
        const bookmarkLog = {
          ...current.bookmarkLog,
          [ayah]: { on: !exists, at: new Date().toISOString() },
        };
        return { ...current, bookmarks, bookmarkLog };
      });
    },
    setHighlight(ayah: AyahKey, color: HighlightColor | null) {
      return mutate((current) => {
        const highlights = { ...current.highlights };
        if (color === null) {
          delete highlights[ayah];
        } else {
          highlights[ayah] = color;
        }
        return { ...current, highlights };
      });
    },
    setNote(ayah: AyahKey, text: string) {
      return mutate((current) => {
        const notes = { ...current.notes };
        if (text.trim().length === 0) {
          delete notes[ayah];
        } else {
          notes[ayah] = text;
        }
        return { ...current, notes };
      });
    },
    updateSettings(patch: Partial<AppSettings>) {
      return mutate((current) => ({
        ...current,
        settings: { ...current.settings, ...patch },
        settingsUpdatedAt: new Date().toISOString(),
      }));
    },
    setLastPage(page: number) {
      return mutate((current) => {
        const clamped = clampPage(page);
        const prev = current.recentPages ?? [];
        const recentPages = [clamped, ...prev.filter((p) => p !== clamped)].slice(0, MAX_RECENT_PAGES);
        return {
          ...current,
          lastPage: clamped,
          recentPages,
        };
      });
    },
    addTasmiHistory(record: TasmiSessionRecord) {
      return mutate((current) => ({
        ...current,
        tasmiHistory: [record, ...current.tasmiHistory],
        murajaahCards: applySessionToMurajaah(current.murajaahCards ?? [], record),
      }));
    },
    replaceAll(nextData: UserData) {
      const normalized = normalizeUserData(nextData);
      const next = writeQueue.then(async () => {
        await platform.kvSet(USER_DATA_KEY, JSON.stringify(normalized));
        state = normalized;
        return normalized;
      });
      writeQueue = next.catch(() => {});
      return next;
    },
    replaceWith(build: (current: UserData) => UserData) {
      const next = writeQueue.then(async () => {
        const current = state ?? (await loadFromStorage());
        const normalized = normalizeUserData(build(current));
        await platform.kvSet(USER_DATA_KEY, JSON.stringify(normalized));
        state = normalized;
        return normalized;
      });
      writeQueue = next.catch(() => {});
      return next;
    },
  };
}
