/**
 * Finds where the recitation actually starts and stops inside an ayah file. Most EveryAyah
 * reciters pad each file with silence, so waiting for `ended` leaves an audible gap between
 * ayahs; playback uses these bounds to start past the lead-in and hand over before the tail.
 */
export interface SilenceBounds {
  /** Seconds of lead-in silence to skip. */
  start: number;
  /** Seconds at which the recitation has finished. */
  end: number;
  duration: number;
}

const LEAD_PAD_S = 0.04;
const TAIL_PAD_S = 0.08;

export function findSilenceBounds(
  samples: Float32Array,
  sampleRate: number,
): SilenceBounds | null {
  const n = samples.length;
  if (n === 0 || sampleRate <= 0) return null;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  if (peak === 0) return null;
  // About -34 dB under the file's peak, so quiet ghunnah endings are kept.
  const threshold = Math.max(peak * 0.02, 0.002);

  let first = 0;
  while (first < n && Math.abs(samples[first]) < threshold) first++;
  let last = n - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last--;

  const duration = n / sampleRate;
  const start = Math.max(0, first / sampleRate - LEAD_PAD_S);
  const end = Math.min(duration, last / sampleRate + TAIL_PAD_S);
  if (end - start < 0.2) return null;
  return { start, end, duration };
}

export type SilenceAnalyzer = (url: string, signal?: AbortSignal) => Promise<SilenceBounds | null>;

export function createSilenceAnalyzer(): SilenceAnalyzer {
  const cache = new Map<string, Promise<SilenceBounds | null>>();
  let ctx: BaseAudioContext | null = null;

  function context(): BaseAudioContext | null {
    if (ctx) return ctx;
    const Offline =
      typeof OfflineAudioContext !== "undefined"
        ? OfflineAudioContext
        : ((globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
            .webkitOfflineAudioContext ?? null);
    if (!Offline) return null;
    try {
      ctx = new Offline(1, 1, 44100);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  return (url, signal) => {
    const hit = cache.get(url);
    if (hit) return hit;
    const audioCtx = context();
    if (!audioCtx) return Promise.resolve(null);
    const job = fetch(url, { signal })
      .then((res) => res.arrayBuffer())
      .then((buf) => audioCtx.decodeAudioData(buf))
      .then((decoded) => findSilenceBounds(decoded.getChannelData(0), decoded.sampleRate))
      .catch(() => {
        cache.delete(url);
        return null;
      });
    cache.set(url, job);
    if (cache.size > 64) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return job;
  };
}
