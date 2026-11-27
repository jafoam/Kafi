import { describe, it, expect, vi, afterEach } from "vitest";
import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import type { PlatformAdapter } from "../src/platform/types";
import { createWebAdapter, resolvePageUrl } from "../src/platform/web-adapter";
import { createTauriAdapter } from "../src/platform/tauri-adapter";
import { getPlatform } from "../src/platform";
import { createUserStore, DEFAULT_USER_DATA } from "../src/services/user-store";

function createMemoryPlatform(initial?: Record<string, string>): PlatformAdapter {
  const kv = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    isDesktop: false,
    getPageImageUrl: async (p: number) => resolvePageUrl(p),
    cacheGet: async () => null,
    cachePut: async () => {},
    cacheHas: async () => false,
    cacheDelete: async () => {},
    kvGet: async (k: string) => kv.get(k) ?? null,
    kvSet: async (k: string, v: string) => {
      kv.set(k, v);
    },
    createTilawaStorage: () => ({
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      keys: async () => [],
    }),
  };
}

describe("platform & user-store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("normalizes VITE_MUSHAF_BASE_URL with or without trailing slash", () => {
    expect(resolvePageUrl(1, "")).toBe("/mushaf/pages/001.gif");
    expect(resolvePageUrl(604, "https://cdn.example.com/medina/")).toBe(
      "https://cdn.example.com/medina/604.gif",
    );
    expect(resolvePageUrl(15, "https://cdn.example.com/medina")).toBe(
      "https://cdn.example.com/medina/015.gif",
    );
  });

  it("falls back safely to defaults when persisted JSON is corrupt", async () => {
    const store = createUserStore(createMemoryPlatform({ "kafi:user": "{broken-json" }));
    const data = await store.load();
    expect(data).toEqual(DEFAULT_USER_DATA);
  });

  it("reads letter style from older saves: tajweed on meant the 1441 letters", async () => {
    const saved = (settings: object) =>
      createUserStore(createMemoryPlatform({ "kafi:user": JSON.stringify({ settings }) })).load();
    expect((await saved({ tajweed: true })).settings.letterStyle).toBe("1441");
    expect((await saved({ tajweed: false })).settings.letterStyle).toBe("1405");
    expect((await saved({ tajweed: false, letterStyle: "1441" })).settings.letterStyle).toBe("1441");
    expect((await saved({ letterStyle: "bogus" })).settings.letterStyle).toBe("1405");
  });

  it("persists bookmarks, highlights, notes, settings, lastPage, and tasmi history", async () => {
    const platform = createMemoryPlatform();
    const store = createUserStore(platform);
    await store.load();
    await store.toggleBookmark("2:255");
    await store.setHighlight("2:255", "amber");
    await store.setNote("2:255", "Ayat Kursi");
    await store.updateSettings({ spreadMode: "single", theme: "sepia" });
    await store.setLastPage(42);
    await store.addTasmiHistory({
      id: "s1",
      startedAt: "2026-11-26T00:00:00Z",
      durationSec: 42,
      surah: 1,
      fromAyah: 1,
      toAyah: 7,
      mistakes: [],
    });

    const reloaded = await createUserStore(platform).load();
    expect(reloaded.bookmarks).toContain("2:255");
    expect(reloaded.highlights["2:255"]).toBe("amber");
    expect(reloaded.notes["2:255"]).toBe("Ayat Kursi");
    expect(reloaded.settings.spreadMode).toBe("single");
    expect(reloaded.settings.theme).toBe("sepia");
    expect(reloaded.settings.reciterId).toBe(DEFAULT_USER_DATA.settings.reciterId);
    expect(reloaded.settings.tajweed).toBe(false);
    expect(reloaded.lastPage).toBe(42);
    expect(reloaded.tasmiHistory).toHaveLength(1);

    await store.toggleBookmark("2:255");
    await store.setHighlight("2:255", null);
    await store.setNote("2:255", "   ");
    await store.setLastPage(999);
    const updated = await createUserStore(platform).load();
    expect(updated.bookmarks).not.toContain("2:255");
    expect(updated.highlights["2:255"]).toBeUndefined();
    expect(updated.notes["2:255"]).toBeUndefined();
    expect(updated.lastPage).toBe(604);
  });

  it("web adapter falls back to localStorage for KV and supports Cache API operations", async () => {
    const cacheEntries = new Map<string, Response>();
    const fakeCache = {
      match: vi.fn(async (req: string) => cacheEntries.get(req)?.clone()),
      put: vi.fn(async (req: string, res: Response) => {
        cacheEntries.set(req, res);
      }),
      delete: vi.fn(async (req: string) => cacheEntries.delete(req)),
      keys: vi.fn(async () => Array.from(cacheEntries.keys()).map((url) => ({ url }))),
    };
    const kvFallback = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => kvFallback.get(k) ?? null,
      setItem: (k: string, v: string) => {
        kvFallback.set(k, v);
      },
    });
    vi.stubGlobal("caches", {
      open: vi.fn(async () => fakeCache),
    });

    const adapter = createWebAdapter({ mushafBaseUrl: "https://cdn.example.com/pages/" });
    expect(adapter.isDesktop).toBe(false);
    expect(await adapter.getPageImageUrl(7)).toBe("https://cdn.example.com/pages/007.gif");

    await adapter.kvSet("kafi:test", "hello");
    expect(await adapter.kvGet("kafi:test")).toBe("hello");

    const bytes = new Uint8Array([1, 2, 3, 4]);
    await adapter.cachePut("audio", "001001", bytes);
    expect(await adapter.cacheHas("audio", "001001")).toBe(true);
    expect(await adapter.cacheGet("audio", "001001")).toEqual(bytes);
    await adapter.cacheDelete("audio", "001001");
    expect(await adapter.cacheHas("audio", "001001")).toBe(false);

    const storage = adapter.createTilawaStorage();
    await storage.put("spliced-clean@1-int8/model.onnx", bytes);
    expect(await storage.keys()).toEqual(["spliced-clean@1-int8/model.onnx"]);
    expect(await storage.get("spliced-clean@1-int8/model.onnx")).toEqual(bytes);
    await storage.delete("spliced-clean@1-int8/model.onnx");
    expect(await storage.keys()).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("does not retain unpersisted mutations when kvSet fails", async () => {
    const kv = new Map<string, string>();
    let failNextWrite = true;
    const platform: PlatformAdapter = {
      ...createMemoryPlatform(),
      kvGet: async (k) => kv.get(k) ?? null,
      kvSet: async (k, v) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error("disk full");
        }
        kv.set(k, v);
      },
    };
    const store = createUserStore(platform);
    await store.load();

    await expect(store.toggleBookmark("2:255")).rejects.toThrow("disk full");
    const afterSecond = await store.setHighlight("1:1", "emerald");
    expect(afterSecond.bookmarks).toEqual([]);
    expect(afterSecond.highlights["1:1"]).toBe("emerald");

    const reloaded = await createUserStore(platform).load();
    expect(reloaded.bookmarks).toEqual([]);
    expect(reloaded.highlights["1:1"]).toBe("emerald");
  });

  it("serializes concurrent load() and mutate() so load() never overwrites newer mutations", async () => {
    let releaseKvGet!: (val: string | null) => void;
    const kvGetGate = new Promise<string | null>((resolve) => {
      releaseKvGet = resolve;
    });
    const kv = new Map<string, string>();
    let firstRead = true;
    const platform: PlatformAdapter = {
      ...createMemoryPlatform(),
      kvGet: async (k) => {
        if (firstRead) {
          firstRead = false;
          return kvGetGate;
        }
        return kv.get(k) ?? null;
      },
      kvSet: async (k, v) => {
        kv.set(k, v);
      },
    };

    const store = createUserStore(platform);
    const loadPromise = store.load();
    const mutatePromise = store.toggleBookmark("2:255");

    releaseKvGet(JSON.stringify({ ...DEFAULT_USER_DATA, bookmarks: ["1:1"] }));
    await Promise.all([loadPromise, mutatePromise]);

    const finalState = await store.load();
    expect(finalState.bookmarks).toEqual(["1:1", "2:255"]);
  });

  it("tauri adapter uses raw binary cache IPC, handles CACHE_MISS, and streams mic chunks", async () => {
    const calls: Array<{ cmd: string; args?: InvokeArgs; options?: InvokeOptions }> = [];
    const disk = new Map<string, Uint8Array>();
    const kv = new Map<string, string>();
    let activeChannel: { onmessage: (msg: { samples: number[]; sampleRate: number }) => void } | null = null;

    const adapter = createTauriAdapter({
      invoke: async <T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> => {
        calls.push({ cmd, args, options });
        if (cmd === "cache_put") {
          expect(args).toBeInstanceOf(Uint8Array);
          const headers = options?.headers as Record<string, string>;
          const bucket = headers["x-cache-bucket"];
          const key = headers["x-cache-key"];
          if (!/^[A-Za-z0-9._:-]+$/.test(bucket) || !/^[A-Za-z0-9._:-]+$/.test(key)) {
            throw new Error("invalid key");
          }
          disk.set(`${bucket}/${key}`, new Uint8Array(args as Uint8Array));
          return undefined as T;
        }
        if (cmd === "cache_get") {
          const { bucket, key } = args as { bucket: string; key: string };
          if (key === "boom") {
            throw new Error("I/O error");
          }
          const found = disk.get(`${bucket}/${key}`);
          if (!found) {
            throw new Error("CACHE_MISS");
          }
          return found.buffer.slice(found.byteOffset, found.byteOffset + found.byteLength) as T;
        }
        if (cmd === "cache_has") {
          const { bucket, key } = args as { bucket: string; key: string };
          return disk.has(`${bucket}/${key}`) as T;
        }
        if (cmd === "cache_delete") {
          const { bucket, key } = args as { bucket: string; key: string };
          disk.delete(`${bucket}/${key}`);
          return undefined as T;
        }
        if (cmd === "kv_get") {
          const { key } = args as { key: string };
          return (kv.get(key) ?? null) as T;
        }
        if (cmd === "kv_set") {
          const { key, value } = args as { key: string; value: string };
          kv.set(key, value);
          return undefined as T;
        }
        if (cmd === "get_mushaf_page_path") {
          const { page } = args as { page: number };
          return `/app/resources/mushaf/pages/${String(page).padStart(3, "0")}.gif` as T;
        }
        if (cmd === "mic_start") {
          activeChannel = (args as { onChunk: typeof activeChannel }).onChunk;
          return 1 as T;
        }
        if (cmd === "mic_stop") {
          return undefined as T;
        }
        throw new Error(`Unexpected command: ${cmd}`);
      },
      convertFileSrc: (path: string) => `asset://localhost${path}`,
      createChannel: <T>() => ({
        onmessage: () => {},
      }) as unknown as import("@tauri-apps/api/core").Channel<T>,
    });

    expect(adapter.isDesktop).toBe(true);
    expect(await adapter.getPageImageUrl(1)).toBe("asset://localhost/app/resources/mushaf/pages/001.gif");

    expect(await adapter.cacheGet("audio", "missing")).toBeNull();
    await expect(adapter.cacheGet("audio", "boom")).rejects.toThrow("I/O error");

    const modelBytes = new Uint8Array([10, 20, 30]);
    const tilawaStorage = adapter.createTilawaStorage();
    await tilawaStorage.put("spliced-clean@1-int8/model.onnx", modelBytes);
    const putCall = calls.find((c) => c.cmd === "cache_put");
    expect(putCall?.args).toBe(modelBytes);
    expect((putCall?.options?.headers as Record<string, string>)["x-cache-bucket"]).toBe("tilawa");
    expect((putCall?.options?.headers as Record<string, string>)["x-cache-key"]).toMatch(/^[A-Za-z0-9._:-]+$/);
    expect(await tilawaStorage.keys()).toEqual(["spliced-clean@1-int8/model.onnx"]);
    expect(await tilawaStorage.get("spliced-clean@1-int8/model.onnx")).toEqual(modelBytes);
    await tilawaStorage.delete("spliced-clean@1-int8/model.onnx");
    expect(await tilawaStorage.keys()).toEqual([]);

    const chunks: Array<{ pcm: Float32Array; sampleRate: number }> = [];
    const stop = await adapter.startNativeMic!((pcm, sampleRate) => {
      chunks.push({ pcm, sampleRate });
    });
    activeChannel!.onmessage({ samples: [0.25, -0.25], sampleRate: 48000 });
    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0].pcm)).toEqual([0.25, -0.25]);
    expect(chunks[0].sampleRate).toBe(48000);
    await stop();
    expect(calls.some((c) => c.cmd === "mic_stop")).toBe(true);
  });

  it("auto-detects desktop vs web via __TAURI_INTERNALS__", () => {
    expect(getPlatform().isDesktop).toBe(false);
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(getPlatform().isDesktop).toBe(true);
  });

  it("omits startNativeMic and uses base64 cache_put on mobile Tauri builds", async () => {
    const mobileCalls: Array<{ cmd: string; args?: unknown }> = [];
    const mobileAdapter = createTauriAdapter({
      isMobile: true,
      invoke: async <T>(cmd: string, args?: unknown) => {
        mobileCalls.push({ cmd, args });
        return undefined as T;
      },
    });
    expect(mobileAdapter.isDesktop).toBe(true);
    expect(mobileAdapter.startNativeMic).toBeUndefined();

    await mobileAdapter.cachePut("audio", "001001.mp3", new Uint8Array([1, 2, 3, 255]));
    expect(mobileCalls).toEqual([
      {
        cmd: "cache_put",
        args: { bucket: "audio", key: "001001.mp3", dataB64: "AQID/w==" },
      },
    ]);

    const desktopAdapter = createTauriAdapter({ isMobile: false });
    expect(desktopAdapter.startNativeMic).toBeTypeOf("function");
  });
});
