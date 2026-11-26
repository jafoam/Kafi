import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { classifyRequest } from "../src/platform/sw-routing";
import { registerServiceWorker } from "../src/platform/register-sw";

describe("PWA manifest and SW routing", () => {
  it("routes mushaf pages, ORT wasm, and EveryAyah audio to cache-first strategies", () => {
    expect(classifyRequest("https://ayat.app/mushaf/pages/001.gif")).toBe("cache-first-media");
    expect(classifyRequest("https://ayat.app/ort/ort-wasm-simd-threaded.wasm")).toBe("cache-first-static");
    expect(classifyRequest("https://everyayah.com/data/Alafasy_128kbps/001001.mp3")).toBe("cache-first-media");
    expect(classifyRequest("https://api.quran.com/api/v4/verses/by_key/1:1?translations=33")).toBe("cache-first-media");
    expect(classifyRequest("https://equran.id/api/v2/tafsir/1")).toBe("cache-first-media");
    expect(classifyRequest("https://ayat.app/")).toBe("network-first-shell");
  });

  it("passes through tilawa.dev model downloads and unknown third-party URLs", () => {
    expect(classifyRequest("https://tilawa.dev/v1/models/fastconformer-ar.onnx")).toBe("passthrough");
    expect(classifyRequest("https://cdn.tilawa.dev/v1/models/vocab.json")).toBe("passthrough");
    expect(classifyRequest("https://example.com/analytics")).toBe("passthrough");
    expect(classifyRequest("not-a-valid-url")).toBe("passthrough");
  });

  it("routes static app assets and navigation shell paths appropriately", () => {
    expect(classifyRequest("https://ayat.app/assets/index-abc123.js")).toBe("cache-first-static");
    expect(classifyRequest("https://ayat.app/icons/icon.svg")).toBe("cache-first-static");
    expect(classifyRequest("https://ayat.app/manifest.webmanifest")).toBe("cache-first-static");
    expect(classifyRequest("https://ayat.app/index.html")).toBe("network-first-shell");
  });

  it("ships a valid webmanifest with Ayat name, standalone display, and existing icon", () => {
    const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.name).toContain("Ayat");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#136f5a");
    expect(manifest.icons.length).toBeGreaterThan(0);

    for (const icon of manifest.icons) {
      const iconPath = path.join("public", icon.src.replace(/^\//, ""));
      expect(fs.existsSync(iconPath)).toBe(true);
    }
  });

  it("ships public/sw.js aligned with routing rules and never intercepting tilawa.dev", () => {
    const swSource = fs.readFileSync("public/sw.js", "utf8");
    expect(swSource).toContain("ayat-shell-v1");
    expect(swSource).toContain("ayat-media-v1");
    expect(swSource).toContain("tilawa.dev");
    expect(swSource).toContain("/mushaf/");
    expect(swSource).toContain("/ort/");
    expect(swSource).toContain("everyayah.com");
    expect(swSource).toContain("api.quran.com");
    expect(swSource).toContain("equran.id");
    expect(swSource).toContain("navigate");
    expect(swSource).toContain('startsWith("ayat-")');
  });
});

describe("registerServiceWorker", () => {
  const originalServiceWorker = navigator.serviceWorker;

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    Object.defineProperty(navigator, "serviceWorker", {
      value: originalServiceWorker,
      configurable: true,
    });
  });

  it("skips registration in non-production builds", async () => {
    const register = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    const result = await registerServiceWorker(false);
    expect(result).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("skips registration inside Tauri desktop webview", async () => {
    const register = vi.fn();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    const result = await registerServiceWorker(true);
    expect(result).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers /sw.js in web production builds", async () => {
    const fakeReg = { scope: "/" } as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(fakeReg);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    const result = await registerServiceWorker(true);
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(result).toBe(fakeReg);
  });
});
