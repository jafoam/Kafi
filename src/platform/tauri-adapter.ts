import {
  Channel,
  convertFileSrc,
  invoke,
  type InvokeArgs,
  type InvokeOptions,
} from "@tauri-apps/api/core";
import type { PlatformAdapter, TilawaModelStorage } from "./types";

interface MicChunkPayload {
  samples: number[];
  sampleRate: number;
}

export interface TauriAdapterDeps {
  invoke: <T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<T>;
  convertFileSrc: typeof convertFileSrc;
  createChannel: <T>() => Channel<T>;
}

const TILAWA_BUCKET = "tilawa";
const TILAWA_KEYS_KV = "kafi:tilawa-keys";

/** Encodes arbitrary Tilawa model keys (e.g. `id@ver/file.onnx`) into `[A-Za-z0-9._:-]` for `cache.rs`. */
function encodeSafeCacheKey(rawKey: string): string {
  return rawKey.replace(/[^A-Za-z0-9.:-]/g, (ch) => `_${ch.charCodeAt(0).toString(16)}_`);
}

export function createTauriAdapter(deps?: Partial<TauriAdapterDeps>): PlatformAdapter {
  const tauriInvoke = deps?.invoke ?? invoke;
  const tauriConvertFileSrc = deps?.convertFileSrc ?? convertFileSrc;
  const createChannel = deps?.createChannel ?? (<T>() => new Channel<T>());

  const cacheGet = async (bucket: string, key: string): Promise<Uint8Array | null> => {
    try {
      const buf = await tauriInvoke<ArrayBuffer>("cache_get", { bucket, key });
      return new Uint8Array(buf);
    } catch (err) {
      if (String(err).includes("CACHE_MISS")) {
        return null;
      }
      throw err;
    }
  };

  const cachePut = async (bucket: string, key: string, bytes: Uint8Array): Promise<void> => {
    await tauriInvoke("cache_put", bytes, {
      headers: {
        "x-cache-bucket": bucket,
        "x-cache-key": key,
      },
    });
  };

  const cacheHas = async (bucket: string, key: string): Promise<boolean> => {
    return tauriInvoke<boolean>("cache_has", { bucket, key });
  };

  const cacheDelete = async (bucket: string, key: string): Promise<void> => {
    await tauriInvoke("cache_delete", { bucket, key });
  };

  const kvGet = async (key: string): Promise<string | null> => {
    return tauriInvoke<string | null>("kv_get", { key });
  };

  const kvSet = async (key: string, value: string): Promise<void> => {
    await tauriInvoke("kv_set", { key, value });
  };

  const createTilawaStorage = (): TilawaModelStorage => {
    let keyQueue: Promise<unknown> = Promise.resolve();

    const readTrackedKeys = async (): Promise<string[]> => {
      const raw = await kvGet(TILAWA_KEYS_KV);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    };

    const updateTrackedKeys = (mutate: (keys: string[]) => string[]): Promise<void> => {
      const next = keyQueue.then(async () => {
        const updated = mutate(await readTrackedKeys());
        await kvSet(TILAWA_KEYS_KV, JSON.stringify(updated));
      });
      keyQueue = next.catch(() => {});
      return next;
    };

    return {
      async get(key: string) {
        return cacheGet(TILAWA_BUCKET, encodeSafeCacheKey(key));
      },
      async put(key: string, bytes: Uint8Array) {
        await cachePut(TILAWA_BUCKET, encodeSafeCacheKey(key), bytes);
        await updateTrackedKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
      },
      async delete(key: string) {
        await cacheDelete(TILAWA_BUCKET, encodeSafeCacheKey(key));
        await updateTrackedKeys((keys) => keys.filter((k) => k !== key));
      },
      async keys() {
        await keyQueue;
        return readTrackedKeys();
      },
    };
  };

  return {
    isDesktop: true,
    async getPageImageUrl(page: number) {
      const filePath = await tauriInvoke<string>("get_mushaf_page_path", { page });
      return tauriConvertFileSrc(filePath);
    },
    cacheGet,
    cachePut,
    cacheHas,
    cacheDelete,
    kvGet,
    kvSet,
    createTilawaStorage,
    async startNativeMic(onChunk) {
      const channel = createChannel<MicChunkPayload>();
      channel.onmessage = (msg) => {
        onChunk(new Float32Array(msg.samples), msg.sampleRate);
      };
      await tauriInvoke("mic_start", { onChunk: channel });
      return async () => {
        await tauriInvoke("mic_stop");
      };
    },
  };
}
