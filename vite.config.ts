import fs from "node:fs";
import path from "node:path";
import { defaultClientConditions } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const ORT_WASM_FILES = new Set([
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
]);

function copyOrtAssetsPlugin() {
  return {
    name: "copy-ort-assets",
    buildStart() {
      if (process.env.VITEST) return;
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
      // Desktop Tauri builds bundle Mushaf pages via bundle.resources; avoid duplicating ~60 MB inside the binary.
      if (!process.env.TAURI_ENV_PLATFORM) return;
      fs.rmSync(path.resolve(process.cwd(), "dist/mushaf"), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyOrtAssetsPlugin()],
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions],
  },
  test: {
    environment: "jsdom",
  },
});
