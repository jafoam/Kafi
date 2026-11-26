import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { defaultClientConditions } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const ORT_WASM_FILES = new Set([
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
]);

function copyOrtAssetsPlugin() {
  const bundleOrt = Boolean(process.env.TAURI_ENV_PLATFORM) || process.env.BUNDLE_ORT_WASM === "1";
  return {
    name: "copy-ort-assets",
    buildStart() {
      if (process.env.VITEST || !bundleOrt) return;
      const srcDir = path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist");
      const destDir = path.resolve(process.cwd(), "public/ort");
      if (!fs.existsSync(srcDir)) return;

      fs.mkdirSync(destDir, { recursive: true });
      for (const existing of fs.readdirSync(destDir)) {
        if (/^ort-wasm/.test(existing) && !ORT_WASM_FILES.has(existing)) {
          fs.rmSync(path.join(destDir, existing), { force: true });
        }
      }

      for (const file of ORT_WASM_FILES) {
        const srcPath = path.join(srcDir, file);
        if (!fs.existsSync(srcPath)) continue;
        const destPath = path.join(destDir, file);
        if (fs.existsSync(destPath) && fs.statSync(destPath).size === fs.statSync(srcPath).size) {
          continue;
        }
        fs.copyFileSync(srcPath, destPath);
      }
    },
    closeBundle() {
      // Web builds ship the ORT WASM gzipped (the raw 27 MB file exceeds the 25 MiB Pages limit).
      if (!bundleOrt) {
        const outDir = path.resolve(process.cwd(), "dist/ort");
        fs.rmSync(outDir, { recursive: true, force: true });
        // Ship the WASM gzipped (~6.6 MB) so each file stays under Cloudflare Pages' 25 MiB limit.
        const srcDir = path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist");
        const wasm = path.join(srcDir, "ort-wasm-simd-threaded.jsep.wasm");
        const mjs = path.join(srcDir, "ort-wasm-simd-threaded.jsep.mjs");
        if (!process.env.VITEST && fs.existsSync(wasm) && fs.existsSync(mjs)) {
          fs.mkdirSync(outDir, { recursive: true });
          fs.copyFileSync(mjs, path.join(outDir, "ort-wasm-simd-threaded.jsep.mjs"));
          fs.writeFileSync(
            path.join(outDir, "ort-wasm-simd-threaded.jsep.wasm.gz"),
            zlib.gzipSync(fs.readFileSync(wasm), { level: 9 }),
          );
        }
      }
      // Omit local mushaf pages when desktop bundles them via resources or web serves them from CDN/CF Pages.
      if (process.env.TAURI_ENV_PLATFORM || process.env.VITE_MUSHAF_BASE_URL || process.env.CF_PAGES) {
        fs.rmSync(path.resolve(process.cwd(), "dist/mushaf"), { recursive: true, force: true });
      }
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), copyOrtAssetsPlugin()],
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5174,
        }
      : undefined,
  },
  test: {
    environment: "jsdom",
  },
});
