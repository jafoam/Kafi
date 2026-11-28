import type {
  AppSettings,
  AyahKey,
  BookmarkEvent,
  HalaqahMembership,
  HifzBlurLevel,
  HighlightColor,
  MurajaahCard,
  ReadingMode,
  SpreadMode,
  TasmiSessionKind,
  TasmiSessionRecord,
  ThemeMode,
  UserData,
} from "../data/types";
import type { PlatformAdapter } from "../platform/types";
import { murajaahCardId } from "./murajaah-srs";

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
    wordAudioHighlight: true,
    tajweed: false,
    letterStyle: "1405",
    mistakeSound: false,
    pageNav: "swipe",
    readingMode: "mushaf",
    flowFontScale: 1,
  },
  tasmiHistory: [],
};

const VALID_THEMES = new Set<ThemeMode>(["light", "sepia", "dark"]);
const VALID_SPREADS = new Set<SpreadMode>(["auto", "single", "double"]);
const VALID_HIGHLIGHTS = new Set<HighlightColor>(["amber", "emerald", "sky", "rose"]);
const VALID_BLUR_LEVELS = new Set<HifzBlurLevel>(["full", "first-word"]);
const VALID_READING_MODES = new Set<ReadingMode>(["mushaf", "translation", "reading"]);
const MAX_RECENT_PAGES = 5;

function clampPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(604, Math.max(1, Math.trunc(page)));
}

export function detectSystemTheme(): ThemeMode {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return DEFAULT_USER_DATA.settings.theme;
}

function cloneDefaultData(): UserData {
  return {
    lastPage: DEFAULT_USER_DATA.lastPage,
    recentPages: [],
    bookmarks: [],
    highlights: {},
    notes: {},
    settings: { ...DEFAULT_USER_DATA.settings, theme: detectSystemTheme() },
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
      : detectSystemTheme(),
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
    wordAudioHighlight:
      typeof rawSettings.wordAudioHighlight === "boolean"
        ? rawSettings.wordAudioHighlight
        : defaults.wordAudioHighlight,
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
    readingMode: VALID_READING_MODES.has(rawSettings.readingMode as ReadingMode)
      ? (rawSettings.readingMode as ReadingMode)
      : defaults.readingMode,
    flowFontScale:
      typeof rawSettings.flowFontScale === "number" && Number.isFinite(rawSettings.flowFontScale)
        ? Math.min(1.6, Math.max(0.85, Math.round(rawSettings.flowFontScale * 100) / 100))
        : defaults.flowFontScale,
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

  const hiddenAyahs: Record<AyahKey, BookmarkEvent> = {};
  if (isPlainObject(raw.hiddenAyahs)) {
    for (const [key, val] of Object.entries(raw.hiddenAyahs)) {
      if (key.includes(":") && isPlainObject(val) && typeof val.on === "boolean" && typeof val.at === "string") {
        hiddenAyahs[key as AyahKey] = { on: val.on, at: val.at };
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

  const deletedTasmiIds = Array.isArray(raw.deletedTasmiIds)
    ? Array.from(new Set(raw.deletedTasmiIds.filter((id): id is string => typeof id === "string" && id.length > 0)))
    : [];
  const deletedTasmiSet = new Set(deletedTasmiIds);

  const archivedTasmi: Record<string, BookmarkEvent> = {};
  if (isPlainObject(raw.archivedTasmi)) {
    for (const [key, val] of Object.entries(raw.archivedTasmi)) {
      if (
        key.length > 0 &&
        !deletedTasmiSet.has(key) &&
        isPlainObject(val) &&
        typeof val.on === "boolean" &&
        typeof val.at === "string"
      ) {
        archivedTasmi[key] = { on: val.on, at: val.at };
      }
    }
  }

  const tasmiHistory = Array.isArray(raw.tasmiHistory)
    ? raw.tasmiHistory.filter(
        (item): item is TasmiSessionRecord =>
          isPlainObject(item) &&
          typeof item.id === "string" &&
          !deletedTasmiSet.has(item.id) &&
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

  const deletedMurajaahIds = Array.isArray(raw.deletedMurajaahIds)
    ? Array.from(new Set(raw.deletedMurajaahIds.filter((id): id is string => typeof id === "string" && id.length > 0)))
    : [];
  const deletedMurajaahSet = new Set(deletedMurajaahIds);

  const archivedMurajaah: Record<string, BookmarkEvent> = {};
  if (isPlainObject(raw.archivedMurajaah)) {
    for (const [key, val] of Object.entries(raw.archivedMurajaah)) {
      if (
        key.length > 0 &&
        !deletedMurajaahSet.has(key) &&
        isPlainObject(val) &&
        typeof val.on === "boolean" &&
        typeof val.at === "string"
      ) {
        archivedMurajaah[key] = { on: val.on, at: val.at };
      }
    }
  }

  // Schedules are user-managed (no automatic FSRS backfill from Tasmi' history).
  const murajaahCards = Array.isArray(raw.murajaahCards)
    ? raw.murajaahCards.filter(
        (item): item is MurajaahCard =>
          isPlainObject(item) &&
          typeof item.id === "string" &&
          !deletedMurajaahSet.has(item.id) &&
          typeof item.surah === "number" &&
          typeof item.fromAyah === "number" &&
          typeof item.toAyah === "number" &&
          typeof item.stabilityDays === "number" &&
          typeof item.dueAt === "string",
      )
    : [];
  const halaqahs = Array.isArray(raw.halaqahs)
    ? raw.halaqahs.filter(
        (item): item is HalaqahMembership =>
          isPlainObject(item) &&
          typeof item.code === "string" &&
          typeof item.name === "string" &&
          typeof item.displayName === "string" &&
          typeof item.memberId === "string" &&
          typeof item.memberSecret === "string" &&
          typeof item.workerUrl === "string" &&
          typeof item.joinedAt === "string",
      )
    : [];
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : undefined;
  const settingsUpdatedAt = typeof raw.settingsUpdatedAt === "string" ? raw.settingsUpdatedAt : undefined;

  return {
    lastPage,
    recentPages,
    bookmarks,
    bookmarkLog,
    highlights,
    hiddenAyahs,
    notes,
    settings,
    tasmiHistory,
    ...(deletedTasmiIds.length > 0 ? { deletedTasmiIds } : {}),
    ...(Object.keys(archivedTasmi).length > 0 ? { archivedTasmi } : {}),
    murajaahCards,
    ...(deletedMurajaahIds.length > 0 ? { deletedMurajaahIds } : {}),
    ...(Object.keys(archivedMurajaah).length > 0 ? { archivedMurajaah } : {}),
    ...(halaqahs.length > 0 ? { halaqahs } : {}),
    updatedAt,
    settingsUpdatedAt,
  };
}

export interface NewMurajaahInput {
  surah: number;
  fromAyah: number;
  toAyah: number;
  kind: TasmiSessionKind;
  intervalDays: number;
  dueAt?: string;
  note?: string;
}

export interface UserStore {
  load(): Promise<UserData>;
  toggleBookmark(ayah: AyahKey): Promise<UserData>;
  setHighlight(ayah: AyahKey, color: HighlightColor | null): Promise<UserData>;
  setAyahHidden(ayah: AyahKey, hidden: boolean): Promise<UserData>;
  setNote(ayah: AyahKey, text: string): Promise<UserData>;
  updateSettings(patch: Partial<AppSettings>): Promise<UserData>;
  setLastPage(page: number): Promise<UserData>;
  addTasmiHistory(record: TasmiSessionRecord): Promise<UserData>;
  deleteTasmiHistory(id: string): Promise<UserData>;
  setTasmiArchived(id: string, archived: boolean): Promise<UserData>;
  addMurajaahCard(input: NewMurajaahInput): Promise<UserData>;
  markMurajaahReviewed(id: string): Promise<UserData>;
  deleteMurajaahCard(id: string): Promise<UserData>;
  setMurajaahArchived(id: string, archived: boolean): Promise<UserData>;
  upsertHalaqah(membership: HalaqahMembership): Promise<UserData>;
  removeHalaqah(code: string): Promise<UserData>;
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
    setAyahHidden(ayah: AyahKey, hidden: boolean) {
      return mutate((current) => ({
        ...current,
        hiddenAyahs: {
          ...current.hiddenAyahs,
          [ayah]: { on: hidden, at: new Date().toISOString() },
        },
      }));
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
      }));
    },
    deleteTasmiHistory(id: string) {
      return mutate((current) => {
        const deletedTasmiIds = Array.from(new Set([...(current.deletedTasmiIds ?? []), id]));
        const archivedTasmi = { ...(current.archivedTasmi ?? {}) };
        delete archivedTasmi[id];
        return {
          ...current,
          tasmiHistory: current.tasmiHistory.filter((item) => item.id !== id),
          deletedTasmiIds,
          ...(Object.keys(archivedTasmi).length > 0 ? { archivedTasmi } : { archivedTasmi: undefined }),
        };
      });
    },
    setTasmiArchived(id: string, archived: boolean) {
      return mutate((current) => ({
        ...current,
        archivedTasmi: {
          ...(current.archivedTasmi ?? {}),
          [id]: { on: archived, at: new Date().toISOString() },
        },
      }));
    },
    addMurajaahCard(input: NewMurajaahInput) {
      return mutate((current) => {
        const fromAyah = Math.max(1, Math.min(input.fromAyah, input.toAyah));
        const toAyah = Math.max(fromAyah, input.toAyah);
        const intervalDays = Math.max(1, Math.min(365, Math.round(input.intervalDays) || 1));
        const id = murajaahCardId(input.surah, fromAyah, toAyah);
        const nowIso = new Date().toISOString();
        const dueAt = input.dueAt && Number.isFinite(Date.parse(input.dueAt)) ? input.dueAt : nowIso;
        const card: MurajaahCard = {
          id,
          surah: input.surah,
          fromAyah,
          toAyah,
          kind: input.kind,
          stabilityDays: intervalDays,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          lastReviewedAt: nowIso,
          dueAt,
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        };
        const deletedMurajaahIds = (current.deletedMurajaahIds ?? []).filter((d) => d !== id);
        const archivedMurajaah = { ...(current.archivedMurajaah ?? {}) };
        delete archivedMurajaah[id];
        return {
          ...current,
          murajaahCards: [card, ...(current.murajaahCards ?? []).filter((c) => c.id !== id)],
          ...(deletedMurajaahIds.length > 0 ? { deletedMurajaahIds } : { deletedMurajaahIds: undefined }),
          ...(Object.keys(archivedMurajaah).length > 0
            ? { archivedMurajaah }
            : { archivedMurajaah: undefined }),
        };
      });
    },
    markMurajaahReviewed(id: string) {
      return mutate((current) => {
        const nowMs = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const murajaahCards = (current.murajaahCards ?? []).map((card) => {
          if (card.id !== id) return card;
          const interval = Math.max(1, card.stabilityDays || 1);
          return {
            ...card,
            reps: card.reps + 1,
            lastReviewedAt: new Date(nowMs).toISOString(),
            dueAt: new Date(nowMs + interval * DAY_MS).toISOString(),
          };
        });
        return { ...current, murajaahCards };
      });
    },
    deleteMurajaahCard(id: string) {
      return mutate((current) => {
        const deletedMurajaahIds = Array.from(new Set([...(current.deletedMurajaahIds ?? []), id]));
        const archivedMurajaah = { ...(current.archivedMurajaah ?? {}) };
        delete archivedMurajaah[id];
        return {
          ...current,
          murajaahCards: (current.murajaahCards ?? []).filter((c) => c.id !== id),
          deletedMurajaahIds,
          ...(Object.keys(archivedMurajaah).length > 0
            ? { archivedMurajaah }
            : { archivedMurajaah: undefined }),
        };
      });
    },
    setMurajaahArchived(id: string, archived: boolean) {
      return mutate((current) => ({
        ...current,
        archivedMurajaah: {
          ...(current.archivedMurajaah ?? {}),
          [id]: { on: archived, at: new Date().toISOString() },
        },
      }));
    },
    upsertHalaqah(membership: HalaqahMembership) {
      return mutate((current) => {
        const list = current.halaqahs ?? [];
        return {
          ...current,
          halaqahs: [membership, ...list.filter((item) => item.code !== membership.code)],
        };
      });
    },
    removeHalaqah(code: string) {
      return mutate((current) => {
        const next = (current.halaqahs ?? []).filter((item) => item.code !== code);
        return {
          ...current,
          ...(next.length > 0 ? { halaqahs: next } : { halaqahs: undefined }),
        };
      });
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
