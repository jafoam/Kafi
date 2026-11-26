import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function copyOrtAssetsPlugin() {
  return {
    name: "copy-ort-assets",
    buildStart() {
      if (process.env.VITEST) return;
      const srcDir = path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist");
      const destDir = path.resolve(process.cwd(), "public/ort");
      if (!fs.existsSync(srcDir)) return;

      fs.mkdirSync(destDir, { recursive: true });
      for (const file of fs.readdirSync(srcDir)) {
        if (!/^ort-wasm.*\.(wasm|mjs)$/.test(file)) continue;
        const srcPath = path.join(srcDir, file);
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
  test: {
    environment: "jsdom",
  },
});
