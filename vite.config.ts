import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { Plugin } from "vite";
import { defaultClientConditions } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import syncWorker from "./sync-worker/src/index";

function localHalaqahDevPlugin(): Plugin {
  const storePath = path.resolve(process.cwd(), "node_modules/.cache/kafi-dev-halaqah.json");
  const loadMap = (): Map<string, string> => {
    try {
      if (fs.existsSync(storePath)) {
        const parsed = JSON.parse(fs.readFileSync(storePath, "utf8")) as Record<string, string>;
        return new Map(Object.entries(parsed));
      }
    } catch {
      // Start fresh if cache file is unreadable
    }
    return new Map();
  };
  const saveMap = (map: Map<string, string>) => {
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify(Object.fromEntries(map.entries())));
    } catch {
      // Ignore write failures in read-only sandboxes
    }
  };

  return {
    name: "local-halaqah-dev",
    configureServer(server) {
      const store = loadMap();
      const kv = {
        async get(key: string) {
          return store.get(key) ?? null;
        },
        async put(key: string, value: string) {
          store.set(key, value);
          saveMap(store);
        },
        async delete(key: string) {
          store.delete(key);
          saveMap(store);
        },
        async list({ prefix = "", limit = 100 }: { prefix?: string; limit?: number } = {}) {
          const keys = Array.from(store.keys())
            .filter((k) => k.startsWith(prefix))
            .slice(0, limit)
            .map((name) => ({ name }));
          return { keys };
        },
      };

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/v1/halaqah/")) {
          next();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          }
          const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === "string") headers.set(k, v);
          }
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" ? undefined : body,
          });
          const response = await syncWorker.fetch(request, { KAFI_SYNC_KV: kv as never });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          const buf = Buffer.from(await response.arrayBuffer());
          res.end(buf);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Local dev error" }));
        }
      });
    },
  };
}

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
      // Keep Android APKs lightweight (~20 MB): QCF page fonts load on demand and cache on disk.
      if (process.env.TAURI_ENV_PLATFORM === "android") {
        fs.rmSync(path.resolve(process.cwd(), "dist/fonts/qcf-v1"), { recursive: true, force: true });
      }
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), copyOrtAssetsPlugin(), localHalaqahDevPlugin()],
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
