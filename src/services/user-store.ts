import type {
  AppSettings,
  AyahKey,
  HighlightColor,
  SpreadMode,
  TasmiSessionRecord,
  ThemeMode,
  UserData,
} from "../data/types";
import type { PlatformAdapter } from "../platform/types";

export const USER_DATA_KEY = "kafi:user";

export const DEFAULT_USER_DATA: UserData = {
  lastPage: 1,
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
    wordTranslation: true,
    mistakeSound: false,
  },
  tasmiHistory: [],
};

const VALID_THEMES = new Set<ThemeMode>(["light", "sepia", "dark"]);
const VALID_SPREADS = new Set<SpreadMode>(["auto", "single", "double"]);
const VALID_HIGHLIGHTS = new Set<HighlightColor>(["amber", "emerald", "sky", "rose"]);

function clampPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(604, Math.max(1, Math.trunc(page)));
}

function cloneDefaultData(): UserData {
  return {
    lastPage: DEFAULT_USER_DATA.lastPage,
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

function normalizeUserData(raw: unknown): UserData {
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
    wordTranslation:
      typeof rawSettings.wordTranslation === "boolean" ? rawSettings.wordTranslation : defaults.wordTranslation,
    mistakeSound:
      typeof rawSettings.mistakeSound === "boolean" ? rawSettings.mistakeSound : defaults.mistakeSound,
  };

  const bookmarks = Array.isArray(raw.bookmarks)
    ? raw.bookmarks.filter((item): item is AyahKey => typeof item === "string" && item.includes(":"))
    : [];

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

  return {
    lastPage:
      typeof raw.lastPage === "number" ? clampPage(raw.lastPage) : DEFAULT_USER_DATA.lastPage,
    bookmarks,
    highlights,
    notes,
    settings,
    tasmiHistory,
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
      const updated = updater(current);
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
        return { ...current, bookmarks };
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
      }));
    },
    setLastPage(page: number) {
      return mutate((current) => ({
        ...current,
        lastPage: clampPage(page),
      }));
    },
    addTasmiHistory(record: TasmiSessionRecord) {
      return mutate((current) => ({
        ...current,
        tasmiHistory: [record, ...current.tasmiHistory],
      }));
    },
  };
}
