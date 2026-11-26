# Ayat

Single-codebase **Medina Mushaf (15-line)** reader and offline **Tasmi'** (memorization verification) app, built with React, Vite, ONNX Runtime Web (`@tilawa/core`), and Tauri v2. Runs both as an installable **Web PWA** and as a native **macOS / Windows** desktop app.

## Prerequisites

- **Node.js** 20+ and `npm`
- **Rust** toolchain (`rustup` / `cargo`) — required only for native desktop builds
- **Medina Mushaf assets** — either `Quranflash.pkg` in the repo root or an installed `/Applications/Quranflash.app` (both are gitignored)

## 1. Local Setup & Mushaf Asset Extraction

```bash
npm install
npm run extract:mushaf
```

`npm run extract:mushaf` reads `Quranflash.pkg` (or `QURANFLASH_APP_NW`, defaulting to `/Applications/Quranflash.app/Contents/Resources/app.nw`), extracts the 604 Medina Mushaf page images into `public/mushaf/pages/` (gitignored), and generates `src/data/mushaf-map.json` and `src/data/catalog.json`.

> **Attribution:** The 15-line Medina Mushaf page images originate from the **King Fahd Glorious Qur'an Printing Complex (KFGQPC)**. Keep `Quranflash.pkg`, `public/mushaf/pages/`, and `src-tauri/resources/mushaf/` out of source control.

## 2. Web PWA (Dev, Build & Public Deployment)

```bash
# Development server (http://localhost:5173)
npm run dev

# Production static PWA build (outputs to dist/)
npm run build
npm run preview
```

### Public CDN / Cloudflare Pages CI

Because `public/mushaf/pages/` is gitignored, CI builds for static hosts (Cloudflare Pages, Vercel, Netlify, etc.) should point to a self-hosted CDN or R2/S3 bucket containing `001.gif`–`604.gif` via `VITE_MUSHAF_BASE_URL`:

```bash
VITE_MUSHAF_BASE_URL="https://cdn.example.com/mushaf/pages" npm run build
```

When `VITE_MUSHAF_BASE_URL` is unset, the web app serves pages from `/mushaf/pages/{NNN}.gif`. Ensure your asset host complies with KFGQPC attribution and distribution terms and sends CORS headers if cached by the Service Worker.

## 3. Native Desktop Builds (Tauri v2)

### macOS (`.app` & `.dmg`)

```bash
npm run prepare:desktop
npx tauri build --bundles app,dmg
```

`npm run prepare:desktop` copies `public/mushaf/pages/*.gif` into `src-tauri/resources/mushaf/pages/` (gitignored) so the `.app` bundle is 100% offline-ready. Build outputs are placed in `src-tauri/target/release/bundle/macos/` and `src-tauri/target/release/bundle/dmg/`.

For public macOS distribution (Developer ID signing + notarization), set the standard Tauri macOS signing environment variables before `npx tauri build`:

- `APPLE_SIGNING_IDENTITY` — e.g. `Developer ID Application: Your Name (TEAMID)`
- `APPLE_CERTIFICATE` & `APPLE_CERTIFICATE_PASSWORD` — base64 `.p12` cert & password (for CI)
- `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), and `APPLE_TEAM_ID` (or `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`) for notarization

### Windows (`.msi` & `.exe`)

Run on Windows with Rust (MSVC toolchain) and WebView2 installed:

```powershell
npm run prepare:desktop
npx tauri build --bundles msi,nsis
```

Installers are written to `src-tauri/target/release/bundle/msi/` and `src-tauri/target/release/bundle/nsis/`.

## Testing & Type Checking

```bash
npx vitest run
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
```
