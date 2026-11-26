# Design Document: Ayat — Fast Cross-Platform Mushaf Reader & Offline Tasmi'

**Date:** 2026-11-26  
**Workspace:** `/Users/rifizzu/Ayat`  
**Status:** Ready for User Approval (builder-reviewed)

---

## 1. Intent & Why

The user currently has `Quranflash.pkg` (125.8 MB, installed at `/Applications/Quranflash.app`), which wraps a 2017-era Kotobee Reader web app inside an **Intel (`x86_64`) NW.js / Chromium 58** runtime. On Apple Silicon (`arm64`) macOS, opening it is slow and heavy because it launches an ancient `x86_64` Chromium engine under Rosetta 2.

The goal is to build **Ayat**: a **fast, modern, Tarteel-inspired Quran reader and offline memorization (tasmi') app** from **one codebase** that runs:
1. **Natively and offline on macOS** (`arm64` `.app` / `.dmg` via Rust + Tauri v2 using macOS's built-in WKWebView — instant startup, zero Chromium bloat), with clean cross-platform readiness for **Windows** (`.msi` / `.exe` via Tauri v2 WebView2) later; and
2. **Publicly on the Web as a fast static PWA** with identical UI, offline caching, and on-device voice tracking — requiring **no custom backend server**.

The user originally asked whether `erkamyaman/rust-anything` could convert `Quranflash.pkg` automatically. Inspection confirmed `Quranflash.app` has no Node backend source modules to port (`package.json` points straight to `index.html`, and its JS is minified Kotobee frontend code wrapping scanned Medina Mushaf pages), and `rust-anything` targets source-code CLIs, HTTP servers, and libraries rather than GUI/NW.js apps. Building cleanly with Rust/Tauri v2 + a single Web PWA frontend directly solves the user's goals.

---

## 2. Scope: Goals, Non-Goals, Anti-Goals

### Goals (User-Decided)
- **Single codebase for offline desktop (macOS `.app`/`.dmg` now, Windows-ready) + fast public Web PWA**.
- **Modern, clean UI redesigned in the spirit of Tarteel** (not preserving the legacy 2016 Kotobee/Ionic UI).
- **Full core Quran reading & study features**:
  - **Medina Mushaf** (604 standard pages, `699×1020` aspect ratio with exact clickable ayah overlay regions) with a **user-selectable 1-page / 2-page RTL spread option**.
  - **Listen to Murottal while reading**: per-ayah audio streaming & local offline caching across popular reciters, auto-advance across ayahs/pages, ayah/range repeat, play/pause, playback speed, and active-ayah highlight on the mushaf.
  - **Tafsir, Translation, and I'rab**: per-ayah viewer supporting Indonesian & English translations (e.g., Kemenag / Bahasa Indonesia, Sahih International, Yusuf Ali), classic & Indonesian tafsirs (Ibn Kathir, Jalalayn, Muyassar, Sa'di, Qurtubi, Tabari), and Arabic grammar/notes, cached locally once read.
  - **Navigation & study utilities**: Surah list (114 surahs with Meccan/Medinan metadata), Juz index (1–30), direct page jump (1–604), last-read position restore, bookmarks, colored highlights, and personal ayah notes.
  - **Offline Arabic Search**: instant verse search (normalized without harakat using Tilawa's bundled Uthmani `ref-v2.json`) plus surah name search.
- **Tarteel-like features & Tasmi' powered by `tilawa.dev` (`@tilawa/core@next`, MIT license)**:
  - **100% on-device offline speech recognition** (audio never leaves the device; ONNX model downloaded once and cached locally).
  - **Free Recitation ("Baca Bebas")**: recite from anywhere across the Quran; Tilawa detects `{ surah, ayah, word }`, jumps to the page, and follows along live.
  - **Per-Surah Tasmi' / Memorization Mode**: scoped to **one surah per session** (directly matching `@tilawa/core`'s `startMemorization({ surah, fromAyah, toAyah })`), with quick presets for ayahs of a surah on the current page, full surah, or custom ayah range within that surah. Detects `wrong_word`, `omitted_word`, `added_word`, and `skipped_passage`, plus a post-session mistake review summary.
  - **Hifz Blur / Hide-and-Reveal Mode**: masks/blurs ayah regions on the mushaf page using ayah bounding boxes, smoothly revealing ayahs as the user recites them (with tap-to-peek and reveal-all controls).
  - **Tasmi' Session History**: locally persisted log of past sessions and mistakes to revisit.

### Secondary Features (Our Calls — Confirmable by User)
- **Public-Safe Data Providers (Not Dependent on Proprietary Quranflash Servers)**: Because the user plans public Web / `.dmg` / Windows distribution, v1 will use **public, CORS-verified open Quran endpoints** (`api.quran.com/api/v4` for translations/metadata, `everyayah.com` for per-ayah MP3 murottal, and `cdn.jsdelivr.net/gh/spa5k/tafsir_api` for tafsirs) instead of scraping Quranflash's commercial `enterprise.quranflash.com` CDN *(our call)*.
- **Gitignored Local Assets + Pluggable Mushaf Source**: Extracted scans from `Quranflash.pkg` are strictly **gitignored** (never committed to public Git or shipped in public builds). Local dev/personal builds can extract Medina Mushaf scans from `Quranflash.pkg`, while public Web CI and public `.dmg`/Windows releases load an open-attribution King Fahd Complex / QUL Medina Mushaf pack via `VITE_MUSHAF_BASE_URL` or a separate release asset fetch step *(our call)*.
- **Deferred to v2**: Additional mushaf styles (Warsh, Douri, 12-line) and IP-based Prayer Times are excluded from v1 *(our call)* to keep v1 lean and focused.

### Non-Goals
- **Tajweed / Makhraj grading**: `@tilawa/core` 1.0 checks memorization/word accuracy only (`MEMORIZATION_CLASSES`); pronunciation/tajweed classes are unsupported in 1.0 and clearly noted in the UI.
- **Cross-surah chained Tasmi' sessions** (e.g., testing 1 full Juz or 3 surahs in one chained `startMemorization` session): explicitly out of scope per user decision (Tasmi' is per-surah; Free Recitation covers multi-surah continuous reading).
- **User accounts, cloud sync, or social features**: all data stays strictly local.
- **Mobile native apps (iOS/Android)** in v1 (though the responsive Web PWA works on mobile browsers).

### Anti-Goals
- Bundling Chromium or Node.js inside the desktop app.
- Uploading microphone audio to any server.
- Committing `Quranflash.pkg` (125.8 MB) or proprietary extracted assets into a public Git repository.
- Forcing Web users to download all 604 pages (~63 MB) before the first page renders.
- Breaking RTL physical Mushaf spread orientation (odd/earlier page on the right, even/next page on the left).

---

## 3. Verified Technical Facts & Constraints

1. **Host Environment**: macOS 27.2.1 on Apple Silicon (`arm64`), Rust `1.85.0` (`stable-aarch64-apple-darwin` at `~/.cargo/bin`), Apple CommandLineTools `clang`, Node `v26.13.0`, npm `11.20.0`.
2. **Medina Mushaf Geometry (Verified from `Quranflash.pkg` / `app.nw`)**:
   - Standard 604 Mushaf pages (`1..=604`) map to `page3.xhtml`..`page606.xhtml` and `0004.gif`..`0607.gif` (fixed `699×1020` px, ~63 MB total).
   - 54 of 604 pages contain multiple surahs; only **8 ayahs** in the entire Quran split across a page boundary (`2:94`, `3:181`, `7:164`, `7:179`, `11:109`, `16:111`, `18:54`, `71:11`).
   - `.vBtn` bounding boxes encode exact line-segment regions per `(surah, ayah)` via `.btnScaler` + `.btnContainer` transforms.
3. **Public CORS-Verified Quran Endpoints (Tested via `curl` with `Origin` header)**:
   - `https://api.quran.com/api/v4/...` → `HTTP/2 200`, `access-control-allow-origin: *` (translations, chapters, recitations metadata).
   - `https://everyayah.com/data/{ReciterFolder}/{SSSAAA}.mp3` → `HTTP/2 200`, `access-control-allow-origin: *`, `content-type: audio/mpeg` (direct per-ayah MP3s).
   - `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/...` → `HTTP/2 200`, `access-control-allow-origin: *` (Arabic, Indonesian, English classic tafsirs in clean JSON).
4. **Tilawa SDK (`@tilawa/core@next` = `1.0.0-rc.1`, MIT)**:
   - `@tilawa/core/web` + `onnxruntime-web` (≥ 1.19); `full` model = 67.8 MB (`spliced-clean@1-int8`), `lite` model = 24.7 MB (`spliced-clean-lite@1-int8`).
   - Supports `startFreeRecitation()`, `startMemorization({ surah, fromAyah, toAyah }, options)`, `listen(session)`, and low-level `session.pushAudio(samples: Float32Array, sampleRate: number)`.
   - Ships `@tilawa/core/assets/ref-v2.json` (complete Uthmani word index `{ surah, ayah, word }`), used for live word display, mistake snippets, and offline Arabic search.
   - Known limits: checks word/memorization mistakes only (no tajweed), fast *hadr* and kids' voices not well-supported yet, `1.0.0-rc.1` preview can occasionally false-alarm or miss mistakes; requires HTTPS or `localhost` on Web.

---

## 4. Approaches Considered & Selected

| Approach | Summary | Trade-offs | Decision |
|---|---|---|---|
| **1. Single Codebase: Web-First PWA + Tauri v2 (macOS & Windows-ready)** | Lightweight Vite + TypeScript frontend + `@tilawa/core/web` (`onnxruntime-web`) wrapped in Tauri v2 (Rust + native WKWebView on macOS / WebView2 on Windows) with a thin `PlatformAdapter`. | UI layer uses native OS WebView instead of pure Rust widgets; WASM ONNX uses slightly more CPU than native C++ ONNX (still real-time on Apple Silicon / modern CPUs). Delivers instant startup, offline macOS `.app`/`.dmg`, future Windows installer, AND identical zero-backend public Web PWA. | **Selected (Agreed by user)** |
| **2. Tauri v2 + Node Sidecar / Rust `ort` Port** | Same UI, but runs Tilawa in Node or reimplements Tilawa in Rust. | Node sidecar bloats desktop app and cannot run in browsers; rewriting Tilawa's alignment + checker in Rust risks accuracy drift and breaks upstream model updates. | Rejected |
| **3. 100% Pure Rust GUI (`iced`/`egui` + `ort`)** | Pure Rust desktop UI with no WebView. | Weak Arabic RTL + harakat typography compared to WebKit/CoreText; cannot ship an equally fast, crisp Web PWA; requires full Rust rewrite of Tilawa. | Rejected |

---

## 5. Product & UX Design (Modern Tarteel-Inspired)

### Visual Direction & Layout
- **Mushaf-first canvas**: Light Paper, Warm Sepia, and Dark Night themes (dark mode gently inverts/tints the mushaf scan while preserving legibility).
- **Configurable 1-Page / 2-Page RTL Spread**: User-selectable option in the top bar and settings (`1 Halaman` / `2 Halaman`; defaults to 2-page RTL spread on wide screens where odd/earlier page is on the right and even/next page is on the left, 1-page on narrow/mobile viewports).
- **Minimal auto-hiding chrome**:
  - Compact top bar: Surah/Juz/Page switcher pill, Search (`Cmd/Ctrl+K`), 1/2-page toggle, Hifz blur toggle, Theme & Settings.
  - Compact floating bottom dock: Murottal mini-player + prominent Tarteel-style Mic/Tasmi' trigger button.
  - Keyboard shortcuts: `←`/`→` (RTL-aware page turn), `Space` (play/pause audio), `M` (toggle Tasmi' mic), `H` (toggle Hifz blur), `F` (focus mode), `Cmd/Ctrl+K` (quick jump & search).

### Core Reading & Study Workflows
1. **Ayah Selection**: Clicking/tapping any ayah highlights all its line segments and shows a sleek action popover / side panel: **Putar Murottal**, **Tafsir & Terjemahan**, **Bookmark / Highlight / Catatan**, and **Tasmi' dari sini**.
2. **Murottal Player**: Reciter selector (default *Mishary Al-Afasy*, *our call*), play/pause, prev/next ayah, auto-advance across ayahs & pages, repeat (`1x`/`2x`/`3x`/`5x`/`∞`) per ayah or range, playback speed (`0.75x`–`1.5x`), next-2-ayah prefetch, automatic local caching of played MP3s, plus **Unduh Surah untuk Offline**.
3. **Tafsir, Terjemahan & Catatan Drawer**: Right drawer (desktop) / bottom sheet (mobile) synced to the active ayah with tabs for **Terjemahan** (default Bahasa Indonesia, *our call*), **Tafsir** (default Jalalayn Indonesia / Ibn Kathir, *our call*), and **Catatan**. External HTML/text is sanitized before rendering and cached offline per `(resource, surah, ayah)`.
4. **Navigation, Search & Bookmarks (`Cmd/Ctrl+K`)**: Unified palette with tabs for **Surah** (114), **Juz** (30), **Halaman** (1–604), **Cari Ayat** (instant offline Arabic search via `ref-v2.json`), and **Bookmark & Catatan**.

### Tarteel-Like Recitation & Per-Surah Tasmi' (`@tilawa/core`)
1. **First-Time Model Setup**: Downloads Tilawa's ONNX model once (67.8 MB `full` on desktop, 24.7 MB `lite` on constrained devices) with progress bar, cancel button, and clear privacy note (*audio diproses 100% di perangkat*).
2. **Mode A — Baca Bebas (`startFreeRecitation`)**: Tap Mic and recite from anywhere; Tilawa tracks continuously across surahs/pages, auto-navigates to the matching page, highlights the active ayah, and displays a compact word-by-word Uthmani ribbon.
3. **Mode B — Tasmi' / Mode Hafalan (`startMemorization`, Per-Surah)**:
   - Opening Tasmi' shows a compact start sheet scoped to **one surah**:
     - If the active page (or 2-page spread) contains 1 surah: pre-fills that surah with quick chips for **Halaman ini** (or pilih Halaman Kanan / Kiri / Keduanya bila mode 2 halaman dan masih satu surat), **Seluruh surat**, or **Rentang ayat** (`fromAyah`..`toAyah`).
     - If the page contains multiple surahs (e.g., Juz 30): lists the surahs on the visible page(s) so the user selects one surah in 1 tap.
   - **Split-ayah rule (8 edge-case ayahs in Medina Mushaf, *our call*)**: When starting page-scoped Tasmi' on one of the 8 pages that begins mid-ayah, the trailing fragment of the previous page's ayah stays unmasked as read-only context, and `startMemorization` starts at the first ayah that begins on the page (while covering any ayah starting on the page through its end).
   - **Blur / Hide-and-Reveal**: Masks ayah bounding boxes in the target passage on the mushaf with paper-matched overlays; reveals ayahs smoothly as Tilawa confirms progress, with tap-to-peek and reveal-all escape hatches. Live Uthmani word ribbon stays hidden while blurred unless peeking or reviewing a mistake *(our call)*.
   - **Mistake Tracking & Post-Session Summary**: Confirmed `wrong_word`, `omitted_word`, `added_word`, and `skipped_passage` events softly flag the ayah on the mushaf (visual-only by default; optional subtle cue off by default, *our call*). Stopping displays a summary (surah & range, duration, ayahs covered, mistakes with exact Uthmani word highlighted + 1-click murottal playback of that ayah) and saves to local **Riwayat Tasmi'**.

---

## 6. Architecture, Platform Adapter & Public Release Pipeline

### Asset Pipeline & Repo Hygiene
- **Small, Clean Git Repo (CI-friendly)**: Neither `Quranflash.pkg` (125.8 MB) nor the ~63 MB extracted page scans are committed to Git (`.gitignore` excludes `Quranflash.pkg`, `public/mushaf/pages/`, and bundled build assets).
- **Normalized Metadata (`data/mushaf-map.json` & `data/catalog.json`)**: Pre-computed compact JSON (`~400 KB`) mapping pages `1..604` to normalized percentage coordinates `[x, y, w, h]` in `699×1020` space plus surah/juz/reciter/translation/tafsir catalogs.
- **Asset Sourcing Separation**:
  - *Local/dev script*: `scripts/extract-mushaf.mjs` (or `.py`) can extract local `pages/` + `mushaf-map.json` from `Quranflash.pkg` on this Mac for local testing and personal builds.
  - *Public Web CI & Public Desktop Releases*: Configure `VITE_MUSHAF_BASE_URL` pointing to an open-attribution King Fahd Complex / QUL Medina Mushaf image CDN/R2 bucket (or public release asset pack fetcher), with clear KFGQPC attribution in the app's About screen — ensuring **zero proprietary Quranflash files** are redistributed publicly.

### Single Frontend + Cross-Platform `PlatformAdapter`
- **Desktop Target (Tauri v2 — macOS `.app`/`.dmg` now, Windows `.msi`/`.exe`-ready)**:
  - Rust backend uses cross-platform Tauri `app_data_dir()` (never hardcodes `~/Library/Application Support`) for local disk cache (audio MP3, tafsir/translation JSON, Tilawa 68 MB ONNX model via custom `ModelStorage`, bookmarks, notes, tasmi' history).
  - Bundled `pages/` served locally via Tauri custom protocol/asset loader for ~1 ms offline page loads; ORT `.wasm` files bundled locally so offline Tasmi' never needs the network after model download.
  - Cross-platform native microphone streaming via Rust `cpal` (CoreAudio on macOS, WASAPI on Windows) streaming mono `f32` PCM via Tauri Channel into `session.pushAudio(samples, sampleRate)` — eliminating WKWebView `getUserMedia` scheme restrictions and working identically on macOS and Windows.
  - **macOS Signing & Entitlements**:
    - Includes `NSMicrophoneUsageDescription` in `Info.plist` and Hardened Runtime entitlements (`com.apple.security.device.audio-input` + JIT/unsigned-executable-memory if needed by WKWebView/WASM).
    - Local dev uses a consistent local/ad-hoc identity; public `.dmg` release pipeline supports Apple Developer ID signing + notarization env vars (and standard Tauri NSIS/MSI bundler config for future Windows CI builds).
- **Web Target (Static PWA)**:
  - Builds via `npm run build` into a pure static `dist/` deployable to Cloudflare Pages, Vercel, or Netlify via Git CI without a backend server.
  - Lazy-loads visible mushaf page(s) (~100 KB) + prefetches adjacent 2 pages, caching via Service Worker + Cache API; stores bookmarks, notes, and tasmi' history in IndexedDB; uses browser `getUserMedia` via Tilawa `listen(session)` and caches the Tilawa ONNX model + ORT `.wasm` in Cache API.

---

## 7. Summary of Decisions

### Explicitly Decided by the User
1. Core features: Medina Mushaf reading, murottal while reading, tafsir, translation, Tarteel-inspired modern UI, and `tilawa.dev` offline tasmi'.
2. Architecture: Single codebase supporting offline fast desktop (Tauri v2) + equally fast Web PWA.
3. Distribution plan: Intended for **public distribution** later (Web PWA + macOS `.dmg` + future Windows installer).
4. Tasmi' scope: **Per-surah** (no cross-surah chaining needed), and **1-page / 2-page spread** as a user-selectable option.

### Calls / Defaults Made by Us (Please Check While Reading)
1. **App name & ID**: `Ayat` (`com.rifizzu.ayat`).
2. **Public open APIs from v1**: Use `api.quran.com/api/v4` + `everyayah.com` + `spa5k/tafsir_api` (all CORS-verified) instead of relying on Quranflash's private `enterprise.quranflash.com` CDN.
3. **Gitignored mushaf assets + `VITE_MUSHAF_BASE_URL`**: Keep `Quranflash.pkg` and extracted scans out of Git; support local extraction for dev/personal builds and open-attribution KFGQPC/QUL assets for public Web/desktop releases.
4. **8 split-ayah edge cases**: Unmask the trailing fragment of a previous page's ayah as context and begin page-scoped Tasmi' at the first ayah starting on that page.
5. **Defaults**: Indonesian UI labels, Bahasa Indonesia translation default, Indonesian Jalalayn / Ibn Kathir tafsir default, Mishary Al-Afasy reciter default, visual-only mistake indicator (sound cue off by default), and deferring extra mushaf styles (Warsh/Douri) & prayer times to v2.

---

## 8. What's Left to the Builder

- Frontend framework choice (lightweight Preact, React, Svelte, or clean Vanilla TypeScript + Vite) and CSS styling system.
- Benchmarking GIF vs lossless WebP for mushaf page scans (preserving calligraphy crispness).
- Exact Rust crate versions (`tauri` v2, `cpal`, `serde`, `serde_json`, `reqwest` if needed) and Tauri v2 capability/entitlement files.
- Early verification spike of `@tilawa/core/web` single-threaded WASM latency + `cpal` → `session.pushAudio()` inside macOS `WKWebView`.
- Multi-line ayah unmasking granularity during Blur/Hifz mode (whole-ayah reveal vs progressive line-segment reveal).
- Unit/integration test suite and verification commands for both Web PWA (`npm run build`) and macOS Tauri v2 (`tauri build`).
