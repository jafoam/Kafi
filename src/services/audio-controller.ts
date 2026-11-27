import type { AyahKey, SurahInfo } from "../data/types";
import type { SilenceBounds } from "./audio-trim";

export type RepeatCount = 1 | 2 | 3 | 5 | number;

export const REPEAT_OPTIONS: readonly RepeatCount[] = [1, 2, 3, 5, Infinity];
export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

/**
 * How far playback runs before it stops or loops. "continue" plays on to the end of the Quran;
 * the others stay inside the surah, page or juz of the ayah being played, or inside a custom range.
 */
export type PlaybackScopeKind = "continue" | "surah" | "page" | "juz" | "custom";

export interface PlaybackScope {
  kind: PlaybackScopeKind;
  /** At the end of the range, start again from its first ayah instead of stopping. */
  loop: boolean;
  /** Bounds of a "custom" scope. */
  from?: AyahKey;
  to?: AyahKey;
}

export interface AyahRange {
  from: AyahKey;
  to: AyahKey;
}

export const DEFAULT_SCOPE: PlaybackScope = { kind: "continue", loop: false };

export interface AudioState {
  currentAyah: AyahKey | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** The bismillah that opens a surah is playing, before the surah's first ayah. */
  isBismillah: boolean;
  reciterId: string;
  repeatCount: RepeatCount;
  scope: PlaybackScope;
  speed: number;
  talaqqi: boolean;
  isTalaqqiPause: boolean;
  fromCache: boolean;
  error: string | null;
}

export interface AudioElementLike {
  src: string;
  playbackRate: number;
  paused: boolean;
  preload?: string;
  currentTime?: number;
  duration?: number;
  onended: ((...args: never[]) => unknown) | null;
  onerror?: ((...args: never[]) => unknown) | null;
  ontimeupdate?: ((...args: never[]) => unknown) | null;
  load?: () => void;
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
  /** Bounds of the page or juz that contains an ayah (the surah is worked out from `surahs`). */
  resolveRange?: (kind: "page" | "juz", ayah: AyahKey) => AyahRange | null;
  createElement?: () => AudioElementLike;
  /**
   * Where the recitation starts and ends inside an audio file. When given, playback skips the
   * file's lead-in silence and moves on as soon as the recitation ends instead of on `ended`.
   */
  analyzeSilence?: (url: string, signal?: AbortSignal) => Promise<SilenceBounds | null>;
}

export interface AudioController {
  /** `withBismillah` recites the bismillah first, as when playback moves on into a new surah. */
  playAyah(surah: number, ayah: number, withBismillah?: boolean): Promise<void>;
  togglePlay(): void;
  pause(): void;
  next(): Promise<void>;
  prev(): Promise<void>;
  setReciter(id: string): void;
  setRepeat(count: RepeatCount): void;
  setScope(scope: PlaybackScope): void;
  setSpeed(rate: number): void;
  /** Current playback position in milliseconds for word-level highlighting. */
  getCurrentTimeMs(): number;
  setTalaqqi(enabled: boolean): void;
  subscribe(fn: (s: AudioState) => void): () => void;
  dispose(): void;
}

export function parseAyahKey(key: AyahKey): { surah: number; ayah: number } {
  const [s, a] = key.split(":").map(Number);
  return { surah: s, ayah: a };
}

/** Orders ayah keys in reading order: negative when `a` comes before `b`. */
export function compareAyahKeys(a: AyahKey, b: AyahKey): number {
  const left = parseAyahKey(a);
  const right = parseAyahKey(b);
  return left.surah - right.surah || left.ayah - right.ayah;
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
  const makeAudio = (): AudioElementLike => (deps.createElement ? deps.createElement() : new Audio());
  let audio: AudioElementLike = makeAudio();
  const secondAudio = makeAudio();
  // Tests that pass a single shared mock instance via `createElement: () => fakeAudio` get single-deck mode.
  let standby: AudioElementLike | null = secondAudio !== audio ? secondAudio : null;
  const listeners = new Set<(s: AudioState) => void>();

  let state: AudioState = {
    currentAyah: null,
    isPlaying: false,
    isLoading: false,
    isBismillah: false,
    reciterId: deps.reciterId,
    repeatCount: 1,
    scope: DEFAULT_SCOPE,
    speed: 1,
    talaqqi: false,
    isTalaqqiPause: false,
    fromCache: false,
    error: null,
  };

  let requestSeq = 0;
  let remainingRepeats = 0;
  let loadedKey: string | null = null;
  let standbyReady: {
    key: string;
    surah: number;
    ayah: number;
    withBismillah: boolean;
    fromCache: boolean;
  } | null = null;
  let currentAbort: AbortController | null = null;
  let prefetchAbort: AbortController | null = null;
  let talaqqiTimer: ReturnType<typeof setTimeout> | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const bounds = new Map<string, SilenceBounds>();

  function clearEndTimer(): void {
    if (endTimer !== null) {
      clearTimeout(endTimer);
      endTimer = null;
    }
  }

  function boundsOf(deck: AudioElementLike): SilenceBounds | undefined {
    return deck.src ? bounds.get(deck.src) : undefined;
  }

  async function learnBounds(url: string, signal?: AbortSignal): Promise<SilenceBounds | null> {
    if (!deps.analyzeSilence) return null;
    const known = bounds.get(url);
    if (known) return known;
    const found = await deps.analyzeSilence(url, signal).catch(() => null);
    if (found) {
      bounds.set(url, found);
      if (bounds.size > 64) {
        const oldest = bounds.keys().next().value;
        if (oldest !== undefined) bounds.delete(oldest);
      }
    }
    return found;
  }

  /** Moves a deck past its file's lead-in silence. */
  function skipLeadIn(deck: AudioElementLike): void {
    const b = boundsOf(deck);
    if (!b || b.start <= 0 || typeof deck.currentTime !== "number") return;
    if (deck.currentTime < b.start - 0.02) deck.currentTime = b.start;
  }

  /**
   * Runs `onEnd` once, when the recitation in `deck` finishes: at the end of the audible part
   * when its silence bounds are known (so the next ayah starts without the trailing gap), or on
   * `ended` otherwise.
   */
  function bindEnd(deck: AudioElementLike, onEnd: () => void): void {
    clearEndTimer();
    let fired = false;
    const fire = () => {
      if (fired || disposed) return;
      fired = true;
      clearEndTimer();
      deck.ontimeupdate = null;
      onEnd();
    };
    deck.onended = fire;
    deck.ontimeupdate = () => {
      if (fired || endTimer !== null || deck.paused || deck !== audio) return;
      const b = boundsOf(deck);
      if (!b || b.end >= b.duration - 0.05 || typeof deck.currentTime !== "number") return;
      const remaining = (b.end - deck.currentTime) / (state.speed || 1);
      // timeupdate fires every ~250ms, so arm a precise timer once the end is close.
      if (remaining > 0.4) return;
      endTimer = setTimeout(
        () => {
          endTimer = null;
          if (!deck.paused && deck === audio) fire();
        },
        Math.max(0, remaining * 1000 - 10),
      );
    };
  }

  function clearStandby(): void {
    standbyReady = null;
    if (standby) {
      standby.onended = null;
      standby.ontimeupdate = null;
      standby.pause();
    }
  }

  function clearTalaqqiTimer(): void {
    if (talaqqiTimer !== null) {
      clearTimeout(talaqqiTimer);
      talaqqiTimer = null;
    }
  }

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

  function prefetchNextTwo(
    surah: number,
    ayah: number,
    reciterId: string,
    withBismillah = false,
  ): void {
    const controller = new AbortController();
    prefetchAbort = controller;
    clearStandby();

    const firstTarget = withBismillah
      ? { surah, ayah, bismillah: false }
      : followingAyah(surah, ayah);
    if (!firstTarget) return;

    const firstKey = `${reciterId}:${firstTarget.surah}:${firstTarget.ayah}:${firstTarget.bismillah ? 1 : 0}`;
    const audioSurah = firstTarget.bismillah ? 1 : firstTarget.surah;
    const audioAyah = firstTarget.bismillah ? 1 : firstTarget.ayah;

    void deps
      .getAudioBlobUrl(reciterId, audioSurah, audioAyah, controller.signal)
      .then(async ({ url, fromCache }) => {
        await learnBounds(url, controller.signal);
        if (disposed || controller.signal.aborted || !standby) return;
        standby.preload = "auto";
        standby.src = url;
        standby.playbackRate = state.speed;
        standby.load?.();
        skipLeadIn(standby);
        standbyReady = {
          key: firstKey,
          surah: firstTarget.surah,
          ayah: firstTarget.ayah,
          withBismillah: firstTarget.bismillah,
          fromCache,
        };
      })
      .catch(() => {});

    const second = nextAyah(firstTarget.surah, firstTarget.ayah, deps.surahs);
    if (second) {
      void deps
        .getAudioBlobUrl(reciterId, second.surah, second.ayah, controller.signal)
        .catch(() => {});
    }
  }

  /** The range the current scope confines `ayah` to, or null when playback is not confined. */
  function rangeFor(ayah: AyahKey): AyahRange | null {
    const { scope } = state;
    switch (scope.kind) {
      case "continue":
        return null;
      case "surah": {
        const { surah } = parseAyahKey(ayah);
        const info = deps.surahs.find((s) => s.number === surah);
        return info ? { from: `${surah}:1`, to: `${surah}:${info.ayahs}` } : null;
      }
      case "custom":
        return scope.from && scope.to ? { from: scope.from, to: scope.to } : null;
      default:
        return deps.resolveRange?.(scope.kind, ayah) ?? null;
    }
  }

  /**
   * The ayah that follows `ayah` under the current scope, or null when playback should stop.
   * `bismillah` is set when it starts a new surah (other than Al-Fatihah, which includes it, and
   * At-Tawbah, which has none), so the bismillah is recited between surahs.
   */
  function followingAyah(
    surah: number,
    ayah: number,
  ): { surah: number; ayah: number; bismillah: boolean } | null {
    const range = rangeFor(`${surah}:${ayah}`);
    const next = nextAyah(surah, ayah, deps.surahs);
    let target: { surah: number; ayah: number } | null;
    let wrapped = false;
    if (!range) {
      target = next;
    } else if (next && compareAyahKeys(`${next.surah}:${next.ayah}`, range.to) <= 0) {
      target = next;
    } else if (state.scope.loop) {
      target = parseAyahKey(range.from);
      wrapped = true;
    } else {
      target = null;
    }
    if (!target) return null;
    const opensSurah = target.ayah === 1 && target.surah !== 1 && target.surah !== 9;
    // Looping a hand-picked range does not recite a bismillah at each wrap.
    const bismillah = opensSurah && !(wrapped && state.scope.kind === "custom");
    return { ...target, bismillah };
  }

  async function handleEnded(seq: number, surah: number, ayah: number): Promise<void> {
    if (disposed || seq !== requestSeq) return;

    if (state.talaqqi) {
      const rawDur =
        typeof audio.duration === "number" && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration / state.speed
          : 3;
      const delayMs = Math.min(Math.max(Math.round(rawDur * 1000), 1500), 30000);
      state = { ...state, isTalaqqiPause: true };
      emit();
      await new Promise<void>((resolve) => {
        clearTalaqqiTimer();
        talaqqiTimer = setTimeout(() => {
          talaqqiTimer = null;
          resolve();
        }, delayMs);
      });
      if (disposed || seq !== requestSeq) return;
      state = { ...state, isTalaqqiPause: false };
      emit();
    }

    if (remainingRepeats > 0) {
      if (remainingRepeats !== Infinity) {
        remainingRepeats -= 1;
      }
      if (typeof audio.currentTime === "number") {
        audio.currentTime = boundsOf(audio)?.start ?? 0;
      }
      bindEnd(audio, () => void handleEnded(seq, surah, ayah));
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

    const next = followingAyah(surah, ayah);
    if (next) {
      await advanceTo(next.surah, next.ayah, next.bismillah);
    } else {
      clearEndTimer();
      audio.pause();
      state = { ...state, isPlaying: false };
      emit();
    }
  }

  async function handleBismillahEnded(seq: number, surah: number, ayah: number): Promise<void> {
    if (disposed || seq !== requestSeq) return;
    await advanceTo(surah, ayah, false);
  }

  /**
   * Swaps to the preloaded standby deck synchronously when ready for gapless transitions,
   * falling back to `playAyah` if the standby deck is not yet buffered.
   */
  async function advanceTo(surah: number, ayah: number, withBismillah: boolean): Promise<void> {
    const expectedKey = `${state.reciterId}:${surah}:${ayah}:${withBismillah ? 1 : 0}`;
    if (standby && standbyReady && standbyReady.key === expectedKey) {
      const seq = ++requestSeq;
      const ready = standbyReady;
      standbyReady = null;

      const prev = audio;
      prev.onended = null;
      prev.ontimeupdate = null;
      prev.pause();
      audio = standby;
      standby = prev;
      skipLeadIn(audio);

      remainingRepeats = withBismillah
        ? 0
        : state.repeatCount === Infinity
          ? Infinity
          : Math.max(0, state.repeatCount - 1);

      audio.playbackRate = state.speed;
      bindEnd(audio, () => {
        if (withBismillah) void handleBismillahEnded(seq, surah, ayah);
        else void handleEnded(seq, surah, ayah);
      });

      const playPromise = audio.play();
      loadedKey = `${state.reciterId}:${surah}:${ayah}`;
      state = {
        ...state,
        currentAyah: `${surah}:${ayah}`,
        isLoading: false,
        isPlaying: true,
        isBismillah: withBismillah,
        isTalaqqiPause: false,
        fromCache: ready.fromCache,
        error: null,
      };
      emit();

      try {
        await playPromise;
        if (disposed || seq !== requestSeq) {
          audio.pause();
          return;
        }
        prefetchNextTwo(surah, ayah, state.reciterId, withBismillah);
      } catch (err) {
        if (disposed || seq !== requestSeq) return;
        state = {
          ...state,
          isLoading: false,
          isPlaying: false,
          error: err instanceof Error ? err.message : "Gagal memutar audio",
        };
        emit();
      }
      return;
    }

    await playAyah(surah, ayah, withBismillah);
  }

  async function playAyah(surah: number, ayah: number, withBismillah = false): Promise<void> {
    if (disposed) return;

    const seq = ++requestSeq;
    clearTalaqqiTimer();
    clearEndTimer();
    abortInFlight();

    const abort = new AbortController();
    currentAbort = abort;

    audio.pause();
    loadedKey = null;
    // The bismillah plays once; the ayah's repeats start when the ayah itself does.
    remainingRepeats = withBismillah
      ? 0
      : state.repeatCount === Infinity
        ? Infinity
        : Math.max(0, state.repeatCount - 1);

    const reciterId = state.reciterId;
    state = {
      ...state,
      currentAyah: `${surah}:${ayah}`,
      isLoading: true,
      isPlaying: false,
      isBismillah: withBismillah,
      isTalaqqiPause: false,
      error: null,
    };
    emit();

    try {
      // Al-Fatihah's first ayah is the bismillah, so every reciter has it as 1:1.
      const { url, fromCache } = await deps.getAudioBlobUrl(
        reciterId,
        withBismillah ? 1 : surah,
        withBismillah ? 1 : ayah,
        abort.signal,
      );

      if (disposed || seq !== requestSeq || abort.signal.aborted) {
        return;
      }

      if (deps.analyzeSilence) {
        await learnBounds(url, abort.signal);
        if (disposed || seq !== requestSeq || abort.signal.aborted) {
          return;
        }
      }

      audio.src = url;
      audio.playbackRate = state.speed;
      skipLeadIn(audio);
      bindEnd(audio, () => {
        if (withBismillah) void handleBismillahEnded(seq, surah, ayah);
        else void handleEnded(seq, surah, ayah);
      });

      await audio.play();

      if (disposed || seq !== requestSeq || abort.signal.aborted) {
        audio.pause();
        return;
      }

      loadedKey = `${reciterId}:${surah}:${ayah}`;
      state = {
        ...state,
        isLoading: false,
        isPlaying: true,
        fromCache,
        error: null,
      };
      emit();

      prefetchNextTwo(surah, ayah, reciterId, withBismillah);
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
    clearTalaqqiTimer();
    clearEndTimer();
    if (state.isLoading || state.isTalaqqiPause) {
      requestSeq += 1;
      abortInFlight();
    }
    audio.pause();
    if (state.isPlaying || state.isLoading || state.isTalaqqiPause) {
      state = { ...state, isPlaying: false, isLoading: false, isTalaqqiPause: false };
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

    const expectedKey = `${state.reciterId}:${state.currentAyah}`;
    if (audio.src && loadedKey === expectedKey) {
      const seq = requestSeq;
      audio.playbackRate = state.speed;
      const playPromise = audio.play();
      state = { ...state, isPlaying: true, error: null };
      emit();
      void playPromise.catch((err) => {
        if (disposed || seq !== requestSeq || !state.isPlaying) return;
        state = {
          ...state,
          isPlaying: false,
          error: err instanceof Error ? err.message : "Gagal memutar audio",
        };
        emit();
      });
    } else {
      const { surah, ayah } = parseAyahKey(state.currentAyah);
      void playAyah(surah, ayah, state.isBismillah);
    }
  }

  async function next(): Promise<void> {
    if (!state.currentAyah) return;
    const { surah, ayah } = parseAyahKey(state.currentAyah);
    const target = followingAyah(surah, ayah);
    if (target) {
      await playAyah(target.surah, target.ayah, target.bismillah);
    }
  }

  async function prev(): Promise<void> {
    if (!state.currentAyah) return;
    const { surah, ayah } = parseAyahKey(state.currentAyah);
    const range = rangeFor(state.currentAyah);
    // Going back from the first ayah of a looping range wraps to its last ayah.
    const target =
      range && state.scope.loop && compareAyahKeys(state.currentAyah, range.from) <= 0
        ? parseAyahKey(range.to)
        : prevAyah(surah, ayah, deps.surahs);
    if (target) {
      await playAyah(target.surah, target.ayah);
    }
  }

  function setReciter(id: string): void {
    if (disposed || id === state.reciterId) return;
    const wasActive = state.isPlaying || state.isLoading;
    loadedKey = null;
    clearStandby();
    state = { ...state, reciterId: id, error: null };
    emit();
    if (wasActive && state.currentAyah) {
      const { surah, ayah } = parseAyahKey(state.currentAyah);
      void playAyah(surah, ayah, state.isBismillah);
    }
  }

  function setRepeat(count: RepeatCount): void {
    state = { ...state, repeatCount: count };
    remainingRepeats = count === Infinity ? Infinity : Math.max(0, count - 1);
    emit();
  }

  function setScope(scope: PlaybackScope): void {
    if (disposed) return;
    clearStandby();
    state = { ...state, scope: { ...scope, loop: scope.kind === "continue" ? false : scope.loop } };
    emit();
  }

  function setSpeed(rate: number): void {
    clearEndTimer();
    state = { ...state, speed: rate };
    audio.playbackRate = rate;
    if (standby) standby.playbackRate = rate;
    emit();
  }

  function setTalaqqi(enabled: boolean): void {
    if (disposed) return;
    if (!enabled) clearTalaqqiTimer();
    state = { ...state, talaqqi: enabled, ...(enabled ? {} : { isTalaqqiPause: false }) };
    emit();
  }

  function subscribe(fn: (s: AudioState) => void): () => void {
    // Re-arm if remounted after React StrictMode cleanup
    disposed = false;
    listeners.add(fn);
    fn({ ...state });
    return () => {
      listeners.delete(fn);
    };
  }

  function dispose(): void {
    disposed = true;
    requestSeq += 1;
    loadedKey = null;
    clearTalaqqiTimer();
    clearEndTimer();
    clearStandby();
    abortInFlight();
    audio.onended = null;
    audio.ontimeupdate = null;
    audio.pause();
    audio.src = "";
    if (standby) standby.src = "";
    state = { ...state, isPlaying: false, isLoading: false, isTalaqqiPause: false };
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
    setScope,
    setSpeed,
    getCurrentTimeMs() {
      return typeof audio.currentTime === "number" && Number.isFinite(audio.currentTime)
        ? audio.currentTime * 1000
        : 0;
    },
    setTalaqqi,
    subscribe,
    dispose,
  };
}
