import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { classifyRequest } from "../src/platform/sw-routing";
import { registerServiceWorker } from "../src/platform/register-sw";

const ORIGIN = "https://ayat.app";

describe("PWA manifest and SW routing", () => {
  it("routes same-origin mushaf pages, ORT wasm, static assets, and shell paths", () => {
    expect(classifyRequest("https://ayat.app/mushaf/pages/001.gif", ORIGIN)).toBe("cache-first-media");
    expect(classifyRequest("https://ayat.app/ort/ort-wasm-simd-threaded.jsep.wasm", ORIGIN)).toBe("cache-first-static");
    expect(classifyRequest("https://ayat.app/assets/index-abc123.js", ORIGIN)).toBe("cache-first-static");
    expect(classifyRequest("https://ayat.app/icons/icon.svg", ORIGIN)).toBe("cache-first-static");
    expect(classifyRequest("https://ayat.app/manifest.webmanifest", ORIGIN)).toBe("cache-first-static");
    expect(classifyRequest("https://ayat.app/", ORIGIN)).toBe("network-first-shell");
    expect(classifyRequest("https://ayat.app/index.html", ORIGIN)).toBe("network-first-shell");
  });

  it("enforces same-origin on pathname rules so third-party origins pass through", () => {
    expect(classifyRequest("https://evil.com/mushaf/pages/001.gif", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://evil.com/ort/ort-wasm-simd-threaded.jsep.wasm", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://evil.com/assets/index.js", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://evil.com/icons/icon.svg", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://evil.com/manifest.webmanifest", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://evil.com/", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://evil.com/index.html", ORIGIN)).toBe("passthrough");
  });

  it("passes through Quran API, audio hosts, tilawa.dev models, and invalid URLs", () => {
    expect(classifyRequest("https://everyayah.com/data/Alafasy_128kbps/001001.mp3", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://api.quran.com/api/v4/verses/by_key/1:1?translations=33", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://equran.id/api/v2/tafsir/1", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://tilawa.dev/v1/models/fastconformer-ar.onnx", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://cdn.tilawa.dev/v1/models/vocab.json", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("https://example.com/analytics", ORIGIN)).toBe("passthrough");
    expect(classifyRequest("not-a-valid-url", ORIGIN)).toBe("passthrough");
  });

  it("routes custom VITE_MUSHAF_BASE_URL prefix to cache-first-media while preserving tilawa.dev passthrough", () => {
    const cdnBase = "https://cdn.example.com/mushaf/pages";
    expect(classifyRequest("https://cdn.example.com/mushaf/pages/001.gif", ORIGIN, cdnBase)).toBe(
      "cache-first-media",
    );
    expect(
      classifyRequest("https://cdn.example.com/mushaf/pages/001.gif", ORIGIN, `${cdnBase}/`),
    ).toBe("cache-first-media");
    expect(
      classifyRequest("https://cdn.example.com/mushaf/pages-other/001.gif", ORIGIN, cdnBase),
    ).toBe("passthrough");
    expect(
      classifyRequest("https://tilawa.dev/v1/models/fastconformer-ar.onnx", ORIGIN, "https://tilawa.dev/v1"),
    ).toBe("passthrough");
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

  it("ships public/sw.js aligned with routing rules and never intercepting tilawa.dev or API hosts", () => {
    const swSource = fs.readFileSync("public/sw.js", "utf8");
    expect(swSource).toContain("ayat-shell-v1");
    expect(swSource).toContain("ayat-media-v1");
    expect(swSource).toContain("tilawa.dev");
    expect(swSource).toContain("mushafBase");
    expect(swSource).toContain("parsed.origin !== origin");
    expect(swSource).toContain("/mushaf/");
    expect(swSource).toContain("/ort/");
    expect(swSource).not.toContain("everyayah.com");
    expect(swSource).not.toContain("api.quran.com");
    expect(swSource).not.toContain("equran.id");
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

  it("registers /sw.js in web production builds and appends mushafBase when configured", async () => {
    const fakeReg = { scope: "/" } as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(fakeReg);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    const result = await registerServiceWorker(true, "");
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(result).toBe(fakeReg);

    await registerServiceWorker(true, "https://cdn.example.com/mushaf/pages/");
    expect(register).toHaveBeenCalledWith(
      "/sw.js?mushafBase=https%3A%2F%2Fcdn.example.com%2Fmushaf%2Fpages",
    );
  });
});
