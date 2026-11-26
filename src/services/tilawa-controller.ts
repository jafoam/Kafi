import type {
  CheckerEvent,
  EngineEvent,
  LoadProgress,
  Microphone,
  ReferenceAsset,
  Tilawa,
  TilawaSession,
} from "@tilawa/core";
import type { PreparedMicrophone } from "@tilawa/core/web";
import type { PlatformAdapter } from "../platform/types";
import type { DeclaredPassage } from "./tasmi-logic";
import { loadGzippedOrtWasm } from "./ort-wasm";

export interface TilawaController {
  /** Acquires mic + AudioContext synchronously inside a user tap (required on iOS Safari). */
  prepareMic(): PreparedMicrophone | null;
  ensureReady(onProgress?: (p: LoadProgress) => void, signal?: AbortSignal): Promise<void>;
  startFree(onEvent: (e: EngineEvent) => void, prepared?: PreparedMicrophone | null): Promise<void>;
  startMemorization(
    passage: DeclaredPassage,
    onEvent: (e: EngineEvent) => void,
    prepared?: PreparedMicrophone | null,
  ): Promise<void>;
  stop(): Promise<CheckerEvent[]>;
  dispose(): void;
}

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
};

const MIC_TIMEOUT_MS = 15_000;

function prepareWebMicrophone(): PreparedMicrophone {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (!nav?.mediaDevices?.getUserMedia) {
    const err = new Error(
      typeof globalThis.isSecureContext === "boolean" && !globalThis.isSecureContext
        ? "Mikrofon hanya dapat digunakan melalui HTTPS atau localhost."
        : "Mikrofon tidak ditemukan di perangkat ini.",
    );
    throw err;
  }
  const context = new AudioContext();
  void context.resume().catch(() => {});
  const stream = nav.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  stream.catch(() => {});
  let released = false;
  return {
    context,
    stream,
    release() {
      if (released) return;
      released = true;
      void stream.then((s) => s.getTracks().forEach((t) => t.stop()), () => {});
      void context.close().catch(() => {});
    },
  };
}

function withMicTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(
        new Error(
          "Izin mikrofon tidak merespons. Pastikan akses mikrofon diizinkan di browser lalu coba lagi.",
        ),
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function translateMicError(err: unknown): Error {
  if (err && typeof err === "object" && "reason" in err) {
    const reason = (err as { reason?: string }).reason;
    if (reason === "denied") {
      return new Error(
        "Izin mikrofon ditolak. Aktifkan akses mikrofon di pengaturan browser lalu coba lagi.",
      );
    }
    if (reason === "unavailable") {
      return new Error("Mikrofon tidak ditemukan di perangkat ini.");
    }
    if (reason === "insecure-context") {
      return new Error("Mikrofon hanya dapat digunakan melalui HTTPS atau localhost.");
    }
  }
  if (err instanceof Error) return err;
  return new Error("Gagal membuka mikrofon.");
}

export function resolveOrtWasmPaths(
  isDesktop: boolean,
  override: string = import.meta.env?.VITE_ORT_WASM_PATH ?? "",
): string | undefined {
  const trimmed = override.trim();
  if (trimmed) return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  // Web loads ORT WASM from tilawa.dev CDN to stay under Cloudflare Pages' 25 MiB file limit.
  return isDesktop ? "/ort/" : undefined;
}

export function createTilawaController(platform: PlatformAdapter): TilawaController {
  let tilawa: Tilawa | null = null;
  let initPromise: Promise<Tilawa> | null = null;
  let activeSession: TilawaSession | null = null;
  let activeUnsub: (() => void) | null = null;
  let activeWebMic: Microphone | null = null;
  let activeNativeMicStop: (() => Promise<void>) | null = null;
  let stopPromise: Promise<CheckerEvent[]> | null = null;

  async function ensureTilawa(
    onProgress?: (p: LoadProgress) => void,
    signal?: AbortSignal,
  ): Promise<Tilawa> {
    if (tilawa) return tilawa;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const [{ createTilawa }, refMod] = await Promise.all([
        import("@tilawa/core/web"),
        import("@tilawa/core/assets/ref-v2.json"),
      ]);
      const reference = (refMod.default ?? refMod) as unknown as ReferenceAsset;
      let wasmPaths = resolveOrtWasmPaths(platform.isDesktop);
      if (!platform.isDesktop && !wasmPaths) {
        // Web: use the gzipped same-origin WASM; falls back to the tilawa.dev CDN if unavailable.
        const wasm = await loadGzippedOrtWasm(undefined, { signal });
        if (wasm) {
          const ort = await import("onnxruntime-web/all");
          ort.env.wasm.wasmBinary = wasm;
          wasmPaths = "/ort/";
        }
      }
      const instance = await createTilawa({
        ...(wasmPaths ? { wasmPaths } : {}),
        // Skip WebGPU: onnxruntime-web 1.30.0 fails on /Expand_6 (Failed to run JSEP kernel).
        providers: ["wasm"],
        storage: platform.createTilawaStorage(),
        reference,
        onProgress,
        signal,
      });
      tilawa = instance;
      // Ask the browser not to evict the downloaded model when storage runs low.
      void navigator.storage?.persist?.().catch(() => undefined);
      return instance;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });

    return initPromise;
  }

  async function stopActive(): Promise<CheckerEvent[]> {
    const session = activeSession;
    const unsub = activeUnsub;
    const webMic = activeWebMic;
    const nativeStop = activeNativeMicStop;

    activeSession = null;
    activeUnsub = null;
    activeWebMic = null;
    activeNativeMicStop = null;

    if (!session) return [];

    try {
      if (nativeStop) {
        await nativeStop();
        await session.end();
      } else if (webMic) {
        await webMic.stop();
      } else {
        await session.end();
      }
      return session.mistakes();
    } finally {
      unsub?.();
    }
  }

  function stop(): Promise<CheckerEvent[]> {
    if (stopPromise) return stopPromise;
    const currentStop = stopActive().finally(() => {
      if (stopPromise === currentStop) {
        stopPromise = null;
      }
    });
    stopPromise = currentStop;
    return currentStop;
  }

  async function startSession(
    createSession: (engine: Tilawa) => TilawaSession,
    onEvent: (e: EngineEvent) => void,
    prepared?: PreparedMicrophone | null,
  ): Promise<void> {
    if (stopPromise) {
      await stopPromise.catch(() => {});
    }
    const engine = await ensureTilawa();
    if (stopPromise) {
      await stopPromise.catch(() => {});
    }
    if (activeSession) {
      await stop();
    }

    const session = createSession(engine);
    const unsub = session.subscribe(onEvent);

    activeSession = session;
    activeUnsub = unsub;

    try {
      if (platform.startNativeMic) {
        prepared?.release();
        const stopNative = await platform.startNativeMic((pcm, sampleRate) => {
          void session.pushAudio(pcm, sampleRate).catch(() => {});
        });
        // If stopped/disposed while mic was initializing, release immediately
        if (activeSession !== session) {
          await stopNative();
          unsub();
          session.dispose();
          return;
        }
        activeNativeMicStop = stopNative;
      } else {
        const listenPromise = engine.listen(session, prepared ? { prepared } : undefined);
        const mic = await withMicTimeout(listenPromise, MIC_TIMEOUT_MS, () => {
          prepared?.release();
          void listenPromise.then((m) => m.stop().catch(() => {}), () => {});
        });
        if (activeSession !== session) {
          await mic.stop().catch(() => {});
          unsub();
          return;
        }
        activeWebMic = mic;
      }
    } catch (err) {
      prepared?.release();
      activeSession = null;
      activeUnsub = null;
      activeWebMic = null;
      activeNativeMicStop = null;
      unsub();
      session.dispose();
      throw translateMicError(err);
    }
  }

  return {
    prepareMic() {
      if (platform.startNativeMic) return null;
      return prepareWebMicrophone();
    },

    async ensureReady(onProgress, signal) {
      await ensureTilawa(onProgress, signal);
    },

    async startFree(onEvent, prepared) {
      await startSession((engine) => engine.startFreeRecitation(), onEvent, prepared);
    },

    async startMemorization(passage, onEvent, prepared) {
      await startSession((engine) => engine.startMemorization(passage), onEvent, prepared);
    },

    stop() {
      return stop();
    },

    dispose() {
      // Safe for React StrictMode remounts: tears down resources and resets state cleanly
      const session = activeSession;
      const unsub = activeUnsub;
      const webMic = activeWebMic;
      const nativeStop = activeNativeMicStop;
      const engine = tilawa;

      activeSession = null;
      activeUnsub = null;
      activeWebMic = null;
      activeNativeMicStop = null;
      stopPromise = null;
      tilawa = null;
      initPromise = null;

      unsub?.();
      if (nativeStop) void nativeStop().catch(() => {});
      if (webMic) void webMic.stop().catch(() => {});
      session?.dispose();
      if (engine) void engine.dispose().catch(() => {});
    },
  };
}
