import type { AyahKey, SurahInfo } from "../data/types";

export type RepeatCount = 1 | 2 | 3 | 5 | number;

export const REPEAT_OPTIONS: readonly RepeatCount[] = [1, 2, 3, 5, Infinity];
export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

export interface AudioState {
  currentAyah: AyahKey | null;
  isPlaying: boolean;
  isLoading: boolean;
  reciterId: string;
  repeatCount: RepeatCount;
  speed: number;
  fromCache: boolean;
  error: string | null;
}

export interface AudioElementLike {
  src: string;
  playbackRate: number;
  paused: boolean;
  currentTime?: number;
  onended: ((...args: never[]) => unknown) | null;
  onerror?: ((...args: never[]) => unknown) | null;
  play(): Promise<void>;
  pause(): void;
}

export interface AudioControllerDeps {
  surahs: SurahInfo[];
  reciterId: string;
  getAudioBlobUrl: (
    reciterFolder: string,
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ) => Promise<{ url: string; fromCache: boolean }>;
  createElement?: () => AudioElementLike;
}

export interface AudioController {
  playAyah(surah: number, ayah: number): Promise<void>;
  togglePlay(): void;
  pause(): void;
  next(): Promise<void>;
  prev(): Promise<void>;
  setReciter(id: string): void;
  setRepeat(count: RepeatCount): void;
  setSpeed(rate: number): void;
  subscribe(fn: (s: AudioState) => void): () => void;
  dispose(): void;
}

export function parseAyahKey(key: AyahKey): { surah: number; ayah: number } {
  const [s, a] = key.split(":").map(Number);
  return { surah: s, ayah: a };
}

export function nextAyah(
  surah: number,
  ayah: number,
  surahs: SurahInfo[],
): { surah: number; ayah: number } | null {
  const idx = surahs.findIndex((s) => s.number === surah);
  if (idx === -1) return null;
  const current = surahs[idx];
  if (ayah < current.ayahs) {
    return { surah, ayah: ayah + 1 };
  }
  const nextSurah = surahs[idx + 1];
  if (!nextSurah) return null;
  return { surah: nextSurah.number, ayah: 1 };
}

export function prevAyah(
  surah: number,
  ayah: number,
  surahs: SurahInfo[],
): { surah: number; ayah: number } | null {
  const idx = surahs.findIndex((s) => s.number === surah);
  if (idx === -1) return null;
  if (ayah > 1) {
    return { surah, ayah: ayah - 1 };
  }
  const prevSurah = surahs[idx - 1];
  if (!prevSurah) return null;
  return { surah: prevSurah.number, ayah: prevSurah.ayahs };
}

export function createAudioController(deps: AudioControllerDeps): AudioController {
  const audio: AudioElementLike = deps.createElement ? deps.createElement() : new Audio();
  const listeners = new Set<(s: AudioState) => void>();

  let state: AudioState = {
    currentAyah: null,
    isPlaying: false,
    isLoading: false,
    reciterId: deps.reciterId,
    repeatCount: 1,
    speed: 1,
    fromCache: false,
    error: null,
  };

  let requestSeq = 0;
  let remainingRepeats = 0;
  let currentAbort: AbortController | null = null;
  let prefetchAbort: AbortController | null = null;
  let disposed = false;

  function emit(): void {
    const snapshot: AudioState = { ...state };
    for (const fn of listeners) {
      fn(snapshot);
    }
  }

  function abortInFlight(): void {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    if (prefetchAbort) {
      prefetchAbort.abort();
      prefetchAbort = null;
    }
  }

  function prefetchNextTwo(surah: number, ayah: number, reciterId: string): void {
    const controller = new AbortController();
    prefetchAbort = controller;

    const first = nextAyah(surah, ayah, deps.surahs);
    if (first) {
      void deps
        .getAudioBlobUrl(reciterId, first.surah, first.ayah, controller.signal)
        .catch(() => {});
      const second = nextAyah(first.surah, first.ayah, deps.surahs);
      if (second) {
        void deps
          .getAudioBlobUrl(reciterId, second.surah, second.ayah, controller.signal)
          .catch(() => {});
      }
    }
  }

  async function handleEnded(seq: number, surah: number, ayah: number): Promise<void> {
    if (disposed || seq !== requestSeq) return;

    if (remainingRepeats > 0) {
      if (remainingRepeats !== Infinity) {
        remainingRepeats -= 1;
      }
      if (typeof audio.currentTime === "number") {
        audio.currentTime = 0;
      }
      audio.playbackRate = state.speed;
      try {
        await audio.play();
      } catch (err) {
        if (disposed || seq !== requestSeq) return;
        state = {
          ...state,
          isPlaying: false,
          error: err instanceof Error ? err.message : "Gagal memutar audio",
        };
        emit();
      }
      return;
    }

    const next = nextAyah(surah, ayah, deps.surahs);
    if (next) {
      await playAyah(next.surah, next.ayah);
    } else {
      state = { ...state, isPlaying: false };
      emit();
    }
  }

  async function playAyah(surah: number, ayah: number): Promise<void> {
    if (disposed) return;

    const seq = ++requestSeq;
    abortInFlight();

    const abort = new AbortController();
    currentAbort = abort;

    audio.pause();
    remainingRepeats =
      state.repeatCount === Infinity ? Infinity : Math.max(0, state.repeatCount - 1);

    const reciterId = state.reciterId;
    state = {
      ...state,
      currentAyah: `${surah}:${ayah}`,
      isLoading: true,
      isPlaying: false,
      error: null,
    };
    emit();

    try {
      const { url, fromCache } = await deps.getAudioBlobUrl(
        reciterId,
        surah,
        ayah,
        abort.signal,
      );

      if (disposed || seq !== requestSeq || abort.signal.aborted) {
        return;
      }

      audio.src = url;
      audio.playbackRate = state.speed;
      audio.onended = () => {
        void handleEnded(seq, surah, ayah);
      };

      await audio.play();

      if (disposed || seq !== requestSeq || abort.signal.aborted) {
        audio.pause();
        return;
      }

      state = {
        ...state,
        isLoading: false,
        isPlaying: true,
        fromCache,
        error: null,
      };
      emit();

      prefetchNextTwo(surah, ayah, reciterId);
    } catch (err) {
      if (disposed || seq !== requestSeq || abort.signal.aborted) {
        return;
      }
      state = {
        ...state,
        isLoading: false,
        isPlaying: false,
        error: err instanceof Error ? err.message : "Gagal memuat audio murottal",
      };
      emit();
    }
  }

  function pause(): void {
    if (state.isLoading) {
      requestSeq += 1;
      abortInFlight();
    }
    audio.pause();
    if (state.isPlaying || state.isLoading) {
      state = { ...state, isPlaying: false, isLoading: false };
      emit();
    }
  }

  function togglePlay(): void {
    if (disposed) return;
    if (state.isPlaying || state.isLoading) {
      pause();
      return;
    }
    if (!state.currentAyah) return;

    if (audio.src) {
      audio.playbackRate = state.speed;
      const playPromise = audio.play();
      state = { ...state, isPlaying: true, error: null };
      emit();
      void playPromise.catch((err) => {
        if (disposed) return;
        state = {
          ...state,
          isPlaying: false,
          error: err instanceof Error ? err.message : "Gagal memutar audio",
        };
        emit();
      });
    } else {
      const { surah, ayah } = parseAyahKey(state.currentAyah);
      void playAyah(surah, ayah);
    }
  }

  async function next(): Promise<void> {
    if (!state.currentAyah) return;
    const { surah, ayah } = parseAyahKey(state.currentAyah);
    const target = nextAyah(surah, ayah, deps.surahs);
    if (target) {
      await playAyah(target.surah, target.ayah);
    }
  }

  async function prev(): Promise<void> {
    if (!state.currentAyah) return;
    const { surah, ayah } = parseAyahKey(state.currentAyah);
    const target = prevAyah(surah, ayah, deps.surahs);
    if (target) {
      await playAyah(target.surah, target.ayah);
    }
  }

  function setReciter(id: string): void {
    if (disposed || id === state.reciterId) return;
    const wasActive = state.isPlaying || state.isLoading;
    state = { ...state, reciterId: id, error: null };
    emit();
    if (wasActive && state.currentAyah) {
      const { surah, ayah } = parseAyahKey(state.currentAyah);
      void playAyah(surah, ayah);
    }
  }

  function setRepeat(count: RepeatCount): void {
    state = { ...state, repeatCount: count };
    remainingRepeats = count === Infinity ? Infinity : Math.max(0, count - 1);
    emit();
  }

  function setSpeed(rate: number): void {
    state = { ...state, speed: rate };
    audio.playbackRate = rate;
    emit();
  }

  function subscribe(fn: (s: AudioState) => void): () => void {
    listeners.add(fn);
    fn({ ...state });
    return () => {
      listeners.delete(fn);
    };
  }

  function dispose(): void {
    disposed = true;
    requestSeq += 1;
    abortInFlight();
    audio.onended = null;
    audio.pause();
    state = { ...state, isPlaying: false, isLoading: false };
    emit();
    listeners.clear();
  }

  return {
    playAyah,
    togglePlay,
    pause,
    next,
    prev,
    setReciter,
    setRepeat,
    setSpeed,
    subscribe,
    dispose,
  };
}
