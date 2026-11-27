import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlatformAdapter } from "../src/platform/types";
import { createTilawaController, resolveOrtWasmPaths } from "../src/services/tilawa-controller";

const mockEvents: string[] = [];
let releaseNativeStop: (() => void) | null = null;
let nativeStopCalls = 0;
let nativeStartCalls = 0;
let sessionCount = 0;

vi.mock("@tilawa/core/web", () => ({
  createTilawa: vi.fn(async () => ({
    startFreeRecitation: () => {
      const id = ++sessionCount;
      mockEvents.push(`create-session:${id}`);
      return {
        subscribe: () => () => {},
        pushAudio: async () => [],
        end: async () => [],
        mistakes: () => [],
        dispose: () => {},
      };
    },
    startMemorization: () => {
      const id = ++sessionCount;
      mockEvents.push(`create-session:${id}`);
      return {
        subscribe: () => () => {},
        pushAudio: async () => [],
        end: async () => [],
        mistakes: () => [],
        dispose: () => {},
      };
    },
    listen: vi.fn(),
    dispose: vi.fn(async () => {}),
  })),
}));

vi.mock("@tilawa/core/assets/ref-v2.json", () => ({
  default: { ayahs: [] },
}));

function createDesktopMockPlatform(): PlatformAdapter {
  return {
    isDesktop: true,
    getPageImageUrl: async () => "",
    cacheGet: async () => null,
    cachePut: async () => {},
    cacheHas: async () => false,
    cacheDelete: async () => {},
    kvGet: async () => null,
    kvSet: async () => {},
    createTilawaStorage: () => ({
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      keys: async () => [],
    }),
    startNativeMic: async () => {
      nativeStartCalls += 1;
      mockEvents.push(`native-start:${nativeStartCalls}`);
      return async () => {
        nativeStopCalls += 1;
        mockEvents.push(`native-stop-begin:${nativeStopCalls}`);
        await new Promise<void>((resolve) => {
          releaseNativeStop = resolve;
        });
        mockEvents.push(`native-stop-end:${nativeStopCalls}`);
      };
    },
  };
}

describe("tilawa-controller concurrency", () => {
  beforeEach(() => {
    mockEvents.length = 0;
    releaseNativeStop = null;
    nativeStopCalls = 0;
    nativeStartCalls = 0;
    sessionCount = 0;
  });

  it("deduplicates concurrent stop() calls and serializes startSession() behind in-flight stop()", async () => {
    const controller = createTilawaController(createDesktopMockPlatform());
    await controller.startFree(() => {});

    const stop1 = controller.stop();
    const stop2 = controller.stop();
    expect(stop1).toBe(stop2);

    const restartPromise = controller.startFree(() => {});

    // Wait a microtask tick to verify restart has NOT started mic while stop is pending
    await Promise.resolve();
    await Promise.resolve();
    expect(nativeStartCalls).toBe(1);
    expect(nativeStopCalls).toBe(1);

    releaseNativeStop!();
    await Promise.all([stop1, stop2, restartPromise]);

    expect(nativeStartCalls).toBe(2);
    expect(mockEvents).toEqual([
      "create-session:1",
      "native-start:1",
      "native-stop-begin:1",
      "native-stop-end:1",
      "create-session:2",
      "native-start:2",
    ]);

    controller.dispose();
  });

  it("uses tilawa.dev CDN on web by default, /ort/ on desktop, and honors VITE_ORT_WASM_PATH override", () => {
    expect(resolveOrtWasmPaths(false, "")).toBeUndefined();
    expect(resolveOrtWasmPaths(true, "")).toBe("/ort/");
    expect(resolveOrtWasmPaths(false, "https://cdn.example.com/ort")).toBe(
      "https://cdn.example.com/ort/",
    );
  });

  it("forces wasm execution provider to avoid WebGPU JSEP Expand kernel failure", async () => {
    const { createTilawa } = await import("@tilawa/core/web");
    const mockCreate = vi.mocked(createTilawa);
    mockCreate.mockClear();

    const controller = createTilawaController(createDesktopMockPlatform());
    await controller.ensureReady();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: ["wasm"],
      }),
    );
    controller.dispose();
  });

  it("warmupIfCached skips when storage is empty and warms up when model is cached", async () => {
    const { createTilawa } = await import("@tilawa/core/web");
    const mockCreate = vi.mocked(createTilawa);
    mockCreate.mockClear();

    const emptyController = createTilawaController(createDesktopMockPlatform());
    await emptyController.warmupIfCached();
    expect(mockCreate).not.toHaveBeenCalled();
    emptyController.dispose();

    const cachedPlatform = createDesktopMockPlatform();
    cachedPlatform.createTilawaStorage = () => ({
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      keys: async () => ["spliced-clean/1-int8"],
    });
    const cachedController = createTilawaController(cachedPlatform);
    await cachedController.warmupIfCached();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    cachedController.dispose();
  });
});
