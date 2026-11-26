# Ayat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build **Ayat**, a single-codebase modern Tarteel-inspired Medina Mushaf reader and offline Tasmi' app shipping as an offline native Apple Silicon macOS Tauri v2 `.app`/`.dmg` (Windows-ready) and a fast static public Web PWA.

**Architecture:** A lightweight Vite + React + TypeScript frontend owns the Mushaf viewer, RTL spread navigation, Murottal player, Tafsir/Translation/Notes drawer, offline Arabic search, and `@tilawa/core/web` Tasmi' engine, talking to a thin `PlatformAdapter` interface. On Web, `PlatformAdapter` uses `VITE_MUSHAF_BASE_URL` + Service Worker Cache API + IndexedDB + browser `getUserMedia`; on Desktop (Tauri v2), it uses a cross-platform Rust backend (`app_data_dir()` disk cache, local bundled mushaf pages, and native `cpal` microphone PCM streaming into `session.pushAudio()`).

**Tech Stack:** TypeScript, React 19, Vite 6, Vitest + jsdom, `@tilawa/core@1.0.0-rc.1`, `onnxruntime-web@1.30.0`, Tauri v2 (`@tauri-apps/cli@2.12.6`, `@tauri-apps/api@2.12.5`, Rust 1.85, `tauri`, `cpal`, `serde`, `serde_json`), hand-written PWA Service Worker (`public/sw.js`).

**Spec:** [docs/superpowers/specs/2026-11-26-ayat-reader-design.md](file:///Users/rifizzu/Ayat/docs/superpowers/specs/2026-11-26-ayat-reader-design.md)

## Global Constraints

- **App identity:** App name `Ayat`, bundle identifier `com.rifizzu.ayat`.
- **Host & target platforms:** macOS `arm64` `.app`/`.dmg` via Tauri v2 (`WKWebView`, no Chromium or Node bundled), cross-platform Rust backend ready for Windows (`app_data_dir()`, `cpal`), plus zero-backend static Web PWA (`dist/`).
- **Repo & licensing hygiene:** `Quranflash.pkg` (125.8 MB) and extracted `public/mushaf/pages/` (~63 MB) MUST be `.gitignore`d and never committed to Git; Web CI supports `VITE_MUSHAF_BASE_URL`.
- **Public CORS-verified data providers:** Translations via `api.quran.com/api/v4` (default `33` Indonesian Kemenag), Indonesian Tafsir via `equran.id/api/v2/tafsir/{surah}` (default) + Arabic/English Tafsirs via `api.quran.com/api/v4/tafsirs/{id}/by_ayah/{s}:{a}` (`16` Muyassar, `14` Ibn Kathir, `169` English Ibn Kathir, etc.), Murottal MP3 via `everyayah.com/data/{subfolder}/{SSSAAA}.mp3` (default `Alafasy_128kbps`).
- **On-device Tilawa privacy & scope:** `@tilawa/core@1.0.0-rc.1` + `onnxruntime-web@1.30.0` (matching `tilawa.dev/v1/manifest.json`), audio never leaves device, ORT `.wasm`/`.mjs` served locally from `/ort/`, Tasmi' is **per-surah** (no cross-surah chaining), UI discloses non-tajweed limitation, and 1-page / 2-page RTL spread is user-selectable.
- **UI copy & defaults:** Indonesian UI labels by default, visual-only Tasmi' mistake feedback (sound cue off by default), Mushaf RTL spread puts odd/earlier page on the right and even/next page on the left.

## Review Focus

1. **Path traversal / malformed cache keys in Rust disk cache** — keys containing `..`, `/`, `\`, or null bytes must be rejected with an error before any filesystem path is joined (tested in Task 8).
2. **Async race conditions during rapid ayah switching** — selecting ayah B while ayah A's audio MP3 or tafsir fetch is still in flight must ignore A's stale response and never play or display A (tested in Tasks 3 & 5).
3. **XSS / unsafe HTML from external tafsir or translation payloads** — `<script>`, `<iframe>`, `on*` handlers, and `javascript:` links must be stripped before DOM insertion (tested in Task 3).
4. **Corrupt local storage / offline network failures** — invalid JSON in persisted state or failed `fetch` calls while offline must fall back cleanly to defaults/cache without crashing (tested in Tasks 2 & 3).
5. **Medina Mushaf boundary & Tasmi' edge cases** — the 8 split ayahs (`2:94`, `3:181`, `7:164`, `7:179`, `11:109`, `16:111`, `18:54`, `71:11`), 54 multi-surah pages (e.g. page 604), pages 1 & 604 in 2-page RTL spread, and non-confirmed (`suspected`/`resolved`/`uncertain`) checker events must never corrupt Tasmi' bounds or mistake counts (tested in Tasks 1, 4, 6).

---

## File Structure

```text
/Users/rifizzu/Ayat/
├── .gitignore                        # Excludes Quranflash.pkg, public/mushaf/pages/, dist/, target/
├── package.json                      # Dependencies & scripts (dev, build, test, extract:mushaf, tauri)
├── tsconfig.json                     # Strict TypeScript config
├── vite.config.ts                    # Vite + React + ORT wasm asset copy + Vitest config
├── index.html                        # App entry HTML + PWA manifest & theme meta
├── scripts/
│   └── extract-mushaf.mjs            # Extracts pages 1..604 + mushaf-map.json + catalog.json from Quranflash.pkg/app.nw
├── public/
│   ├── manifest.webmanifest          # PWA manifest
│   ├── sw.js                         # Offline Service Worker (shell, mushaf pages, /ort/, API/audio cache)
│   ├── icons/                        # App SVG/PNG icons
│   ├── ort/                          # (build-copied, gitignored) onnxruntime-web@1.30.0 .wasm/.mjs
│   └── mushaf/pages/                 # (extracted, gitignored) 001.gif..604.gif
├── src/
│   ├── main.tsx                      # React root mount + SW registration
│   ├── App.tsx                       # Top-level app shell composing reader, audio, drawer, and tasmi'
│   ├── data/
│   │   ├── types.ts                  # Shared domain types (PageMap, AyahBox, Catalog, UserState, TasmiTypes)
│   │   ├── mushaf-map.json           # (generated, committed ~400KB) 604 pages normalized [x,y,w,h] + indices
│   │   └── catalog.json              # (generated, committed) 114 surahs, 30 juzs, public reciters/translations/tafsirs
│   ├── platform/
│   │   ├── types.ts                  # PlatformAdapter & MicHandle interfaces
│   │   ├── web-adapter.ts            # IndexedDB + Cache API + VITE_MUSHAF_BASE_URL + browser mic
│   │   ├── tauri-adapter.ts          # Tauri invoke/Channel bindings for disk cache, asset URLs, native cpal mic
│   │   ├── index.ts                  # Runtime selector (Tauri vs Web)
│   │   └── register-sw.ts            # Safe Service Worker registration (Web only)
│   ├── services/
│   │   ├── user-store.ts             # Bookmarks, highlights, notes, settings, last-read, tasmi' history
│   │   ├── sanitize.ts               # Strict HTML sanitizer for external tafsir/translation snippets
│   │   ├── quran-api.ts              # Public CORS API fetchers + cache-through + surah batch audio downloader
│   │   ├── arabic-search.ts          # Offline Uthmani & surah search over @tilawa/core/assets/ref-v2.json
│   │   ├── audio-controller.ts       # Murottal player state machine (repeat, auto-advance, prefetch, abort)
│   │   ├── tasmi-logic.ts            # Pure per-surah passage calculator (split-ayah/multi-surah) + Tilawa event reducer
│   │   └── tilawa-controller.ts      # @tilawa/core/web lifecycle, model storage, free & memorization sessions
│   ├── state/
│   │   └── reader-logic.ts           # Pure RTL 1/2-page spread math, keyboard mapping, page clamping
│   ├── components/
│   │   ├── MushafPage.tsx            # Single 699x1020 page + interactive ayah overlays + Hifz blur masks
│   │   ├── MushafSpread.tsx          # Responsive 1-page / 2-page RTL spread container
│   │   ├── TopBar.tsx                # Compact top bar (Surah/Juz/Page pill, Search, 1/2-page, Hifz, Theme)
│   │   ├── NavPalette.tsx            # Cmd+K modal (Surah, Juz, Halaman, Cari Ayat, Bookmark)
│   │   ├── AyahPopover.tsx           # Contextual ayah action bar (Play, Tafsir, Bookmark, Tasmi')
│   │   ├── AudioDock.tsx             # Floating bottom dock (Murottal mini-player + prominent Mic/Tasmi' trigger)
│   │   ├── StudyDrawer.tsx           # Slide-over / bottom sheet (Terjemahan, Tafsir, Catatan)
│   │   ├── TasmiSheet.tsx            # Per-surah Tasmi' start picker, model download progress & privacy note
│   │   ├── RecitationRibbon.tsx      # Live word-by-word Uthmani tracker bar
│   │   └── TasmiSummaryModal.tsx     # Post-session mistake review + 1-click audio replay + history
│   └── styles/
│       ├── tokens.css                # Light Paper, Warm Sepia, Dark Night CSS custom properties
│       └── app.css                   # Clean Tarteel-inspired layout & component styles
├── src-tauri/
│   ├── Cargo.toml                    # tauri 2, cpal, serde, serde_json
│   ├── build.rs                      # tauri_build::build()
│   ├── tauri.conf.json               # Ayat bundle config (macOS .dmg + Windows NSIS/MSI + asset protocol)
│   ├── Info.plist                    # NSMicrophoneUsageDescription
│   ├── Entitlements.plist            # Hardened Runtime audio-input & WKWebView entitlements
│   ├── capabilities/default.json     # Tauri v2 capability permissions
│   └── src/
│       ├── main.rs                   # Desktop entrypoint
│       ├── lib.rs                    # Tauri builder & command registration
│       ├── cache.rs                  # Cross-platform app_data_dir() safe key-validated disk cache & KV store
│       └── mic.rs                    # Cross-platform cpal mono f32 audio stream -> Tauri Channel
└── tests/
    ├── extract-mushaf.test.ts
    ├── platform-store.test.ts
    ├── quran-services.test.ts
    ├── reader-logic.test.ts
    ├── audio-controller.test.ts
    ├── tasmi-logic.test.ts
    └── pwa.test.ts
```

---

### Task 1: Project Scaffold, Git Init, Asset Extractor & Normalized Mushaf Data

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `src/data/types.ts`, `scripts/extract-mushaf.mjs`
- Generate: `src/data/mushaf-map.json`, `src/data/catalog.json`, `public/mushaf/pages/001.gif`..`604.gif` (gitignored)
- Test: `tests/extract-mushaf.test.ts`

**Interfaces:**
- Consumes: `/Users/rifizzu/Ayat/Quranflash.pkg` (or `/Applications/Quranflash.app/Contents/Resources/app.nw`)
- Produces:
  - `src/data/types.ts`: `AyahKey` (`"${number}:${number}"`), `NormRect` (`[x: number, y: number, w: number, h: number]`), `AyahSegment` (`{ surah: number; ayah: number; boxes: NormRect[] }`), `PageEntry` (`{ page: number; image: string; surahs: number[]; ayahs: AyahSegment[]; leadingSplitAyah?: AyahKey }`), `MushafMap` (`{ width: 699; height: 1020; pages: PageEntry[]; ayahToPage: Record<AyahKey, number>; surahToPage: Record<number, number> }`), `Catalog` (`{ surahs: SurahInfo[]; juzs: JuzInfo[]; reciters: ReciterInfo[]; translations: ResourceInfo[]; tafsirs: TafsirInfo[] }`)
  - `scripts/extract-mushaf.mjs`: exports `parsePageXhtml(html: string, pageNum: number)` and CLI runner producing `src/data/mushaf-map.json`, `src/data/catalog.json`, and `public/mushaf/pages/001.gif`..`604.gif`

- [x] **Step 1: Initialize Git repo, `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, and `src/data/types.ts`**

Create `.gitignore` ignoring `Quranflash.pkg`, `public/mushaf/pages/`, `public/ort/`, `dist/`, `node_modules/`, `src-tauri/target/`, `src-tauri/resources/mushaf/`, `.DS_Store`.
Create `package.json` with `react`, `react-dom`, `@tilawa/core@1.0.0-rc.1`, `onnxruntime-web@1.30.0`, `@tauri-apps/api@2.12.5`, and devDeps `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `jsdom`, `@tauri-apps/cli@2.12.6`, `adm-zip` (for clean cross-platform zip reading in `extract-mushaf.mjs`). Configure `vite.config.ts` to copy `node_modules/onnxruntime-web/dist/ort-wasm*.{wasm,mjs}` into `public/ort/` on dev/build and enable Vitest `jsdom` environment. Run `git init && npm install`.

- [x] **Step 2: Write the failing test in `tests/extract-mushaf.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { parsePageXhtml } from "../scripts/extract-mushaf.mjs";

describe("extract-mushaf", () => {
  it("normalizes btnScaler + btnContainer + vBtn geometry into 0..100 percentages", () => {
    const sample = `
      <div class="btnScaler" style="transform:scale(1.5195652173913);transform-origin:top left;">
        <div class="btnContainer" style="left:-70px;top:-70px;transform:scale(1.09,1.09);">
          <div class="vBtn" id="v1_1" style="top:288px;left:186px;width:110px;height:25px;"></div>
        </div>
      </div><img src="../../imgs/0004.gif" width="699"/>`;
    const parsed = parsePageXhtml(sample, 1);
    expect(parsed.ayahs).toHaveLength(1);
    expect(parsed.ayahs[0]).toMatchObject({ surah: 1, ayah: 1 });
    const [x, y, w, h] = parsed.ayahs[0].boxes[0];
    expect(x).toBeGreaterThan(0);
    expect(x + w).toBeLessThan(100);
    expect(y).toBeGreaterThan(0);
    expect(y + h).toBeLessThan(100);
  });

  it("extracts all 604 pages, 54 multi-surah pages, and exact 8 split ayahs", () => {
    const map = JSON.parse(fs.readFileSync("src/data/mushaf-map.json", "utf8"));
    const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));
    expect(map.pages).toHaveLength(604);
    expect(map.ayahToPage["1:1"]).toBe(1);
    expect(map.ayahToPage["114:6"]).toBe(604);
    expect(map.pages.filter((p: { surahs: number[] }) => p.surahs.length > 1)).toHaveLength(54);
    const splits = map.pages
      .filter((p: { leadingSplitAyah?: string }) => p.leadingSplitAyah)
      .map((p: { leadingSplitAyah: string }) => p.leadingSplitAyah);
    expect(splits).toEqual(["2:94", "3:181", "7:164", "7:179", "11:109", "16:111", "18:54", "71:11"]);
    expect(catalog.surahs).toHaveLength(114);
    expect(catalog.juzs).toHaveLength(30);
    expect(catalog.reciters.some((r: { id: string }) => r.id === "Alafasy_128kbps")).toBe(true);
    expect(catalog.translations.some((t: { id: number }) => t.id === 33)).toBe(true);
    expect(fs.existsSync("public/mushaf/pages/001.gif")).toBe(true);
    expect(fs.existsSync("public/mushaf/pages/604.gif")).toBe(true);
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/extract-mushaf.test.ts`
Expected: FAIL with module `../scripts/extract-mushaf.mjs` not found.

- [x] **Step 4: Implement `scripts/extract-mushaf.mjs` and run extraction**

Implement `parsePageXhtml(html, pageNum)` applying exact nested transform math:
- Read `btnScaler` `scale(S)`, `btnContainer` `left: L`, `top: T`, `scale(SX, SY)`, and each `.vBtn` `id="v{s}_{a}(_{p})?"` with `left`, `top`, `width`, `height`.
- Compute pixel box in `699×1020`: `px = S * (L + SX * left)`, `py = S * (T + SY * top)`, `pw = S * SX * width`, `ph = S * SY * height`; normalize to `0..100` (rounded to 3 decimals) and clamp into `[0, 100]`.
- Group boxes by `(surah, ayah)` preserving reading order; detect `leadingSplitAyah` whenever the first ayah on page `P` already appeared on page `P - 1`; set `ayahToPage` to the first page where each ayah begins (ignore non-ayah helper IDs if any).
- Populate `src/data/catalog.json` with all 114 surahs (Arabic + Latin names, ayah counts, Meccan/Medinan, start page from `chapters.xml`), 30 juzs, curated verified public EveryAyah reciters (default `Alafasy_128kbps`, plus `Husary_128kbps`, `Abdul_Basit_Murattal_192kbps`, `Minshawy_Murattal_128kbps`, `Abdurrahmaan_As-Sudais_192kbps`, `Ghamadi_40kbps`, `MaherAlMuaiqly128kbps`, `Saood_ash-Shuraym_128kbps`, `Abu_Bakr_Ash-Shaatree_128kbps`, `Hani_Rifai_192kbps`), Quran.com translations (`33`, `134`, `141`, `20`, `85`, `22`, `57`), and tafsirs (`equran-id` Kemenag RI default + Quran.com `16` Muyassar, `14` Ibn Kathir, `15` Tabari, `90` Qurtubi, `91` Sa'di, `169` English Ibn Kathir).
- Read `app.nw` directly from `/Applications/Quranflash.app/Contents/Resources/app.nw` (fallback: unpack `Quranflash.pkg` `Payload` to a temp dir) and extract `001.gif`..`604.gif` into `public/mushaf/pages/`. Also check `git check-ignore Quranflash.pkg public/mushaf/pages/001.gif`.

- [x] **Step 5: Run extraction and tests to verify PASS**

Run: `npm run extract:mushaf && npx vitest run tests/extract-mushaf.test.ts && git check-ignore Quranflash.pkg public/mushaf/pages/001.gif`
Expected: PASS (2 tests pass; both paths reported as gitignored).

- [x] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts src/data/types.ts src/data/mushaf-map.json src/data/catalog.json scripts/extract-mushaf.mjs tests/extract-mushaf.test.ts docs/
git commit -m "chore: scaffold Ayat project and Medina Mushaf asset extractor"
```

---

### Task 2: Platform Adapter & Local User Persistence

**Files:**
- Create: `src/platform/types.ts`, `src/platform/web-adapter.ts`, `src/platform/tauri-adapter.ts`, `src/platform/index.ts`, `src/services/user-store.ts`
- Test: `tests/platform-store.test.ts`

**Interfaces:**
- Consumes: `src/data/types.ts` (`AyahKey`)
- Produces:
  - `src/platform/types.ts`: `PlatformAdapter` (`{ isDesktop: boolean; getPageImageUrl(page: number): Promise<string>; cacheGet(bucket: string, key: string): Promise<Uint8Array | null>; cachePut(bucket: string, key: string, bytes: Uint8Array): Promise<void>; cacheHas(bucket: string, key: string): Promise<boolean>; kvGet(key: string): Promise<string | null>; kvSet(key: string, value: string): Promise<void>; createTilawaStorage(): TilawaModelStorage; startNativeMic?(onChunk: (pcm: Float32Array, sampleRate: number) => void): Promise<() => Promise<void>> }`)
  - `src/platform/web-adapter.ts`: `createWebAdapter(options?: { mushafBaseUrl?: string }): PlatformAdapter` and `resolvePageUrl(page: number, baseUrl?: string): string`
  - `src/platform/tauri-adapter.ts`: `createTauriAdapter(): PlatformAdapter`
  - `src/platform/index.ts`: `getPlatform(): PlatformAdapter`
  - `src/services/user-store.ts`: `UserStore` (`load(): Promise<UserData>`, `toggleBookmark(ayah: AyahKey)`, `setHighlight(ayah: AyahKey, color: HighlightColor | null)`, `setNote(ayah: AyahKey, text: string)`, `updateSettings(patch: Partial<AppSettings>)`, `setLastPage(page: number)`, `addTasmiHistory(record: TasmiSessionRecord)`)

- [ ] **Step 1: Write the failing test in `tests/platform-store.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolvePageUrl } from "../src/platform/web-adapter";
import { createUserStore, DEFAULT_USER_DATA } from "../src/services/user-store";

function createMemoryPlatform(initial?: Record<string, string>) {
  const kv = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    isDesktop: false,
    getPageImageUrl: async (p: number) => resolvePageUrl(p),
    cacheGet: async () => null,
    cachePut: async () => {},
    cacheHas: async () => false,
    kvGet: async (k: string) => kv.get(k) ?? null,
    kvSet: async (k: string, v: string) => { kv.set(k, v); },
    createTilawaStorage: () => ({ get: async () => null, put: async () => {}, delete: async () => {} }),
  };
}

describe("platform & user-store", () => {
  it("normalizes VITE_MUSHAF_BASE_URL with or without trailing slash", () => {
    expect(resolvePageUrl(1, "")).toBe("/mushaf/pages/001.gif");
    expect(resolvePageUrl(604, "https://cdn.example.com/medina/")).toBe("https://cdn.example.com/medina/604.gif");
    expect(resolvePageUrl(15, "https://cdn.example.com/medina")).toBe("https://cdn.example.com/medina/015.gif");
  });

  it("falls back safely to defaults when persisted JSON is corrupt", async () => {
    const store = createUserStore(createMemoryPlatform({ "ayat:user": "{broken-json" }));
    const data = await store.load();
    expect(data).toEqual(DEFAULT_USER_DATA);
  });

  it("persists bookmarks, highlights, notes, settings, and tasmi history", async () => {
    const platform = createMemoryPlatform();
    const store = createUserStore(platform);
    await store.load();
    await store.toggleBookmark("2:255");
    await store.setHighlight("2:255", "amber");
    await store.setNote("2:255", "Ayat Kursi");
    await store.updateSettings({ spreadMode: "single", theme: "sepia" });
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
    expect(reloaded.tasmiHistory).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/platform-store.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement `PlatformAdapter` (`types.ts`, `web-adapter.ts`, `tauri-adapter.ts`, `index.ts`) and `user-store.ts`**

- `web-adapter.ts`: IndexedDB helper for `kvGet`/`kvSet` (falling back to `localStorage` if IndexedDB unavailable in restricted contexts), Cache API (`ayat-cache-v1`) for `cacheGet`/`cachePut`/`cacheHas`, `resolvePageUrl(page, baseUrl)` padding 3 digits (`001.gif`), and default browser Cache API adapter for `createTilawaStorage()`.
- `tauri-adapter.ts`: calls Tauri commands `cache_get`, `cache_put`, `cache_has`, `kv_get`, `kv_set`, `get_mushaf_page_path` (mapped via `convertFileSrc`), and `mic_start`/`mic_stop` using Tauri `Channel<number[]>` to feed `Float32Array` chunks into `onChunk`.
- `user-store.ts`: `DEFAULT_USER_DATA` pins spec defaults (`theme: "light"`, `spreadMode: "auto"`, `reciterId: "Alafasy_128kbps"`, `translationId: 33`, `tafsirId: "equran-id"`, `hifzBlur: false`, `mistakeSound: false`, `lastPage: 1`), validates/merges loaded JSON against defaults, and gracefully recovers from corrupt JSON.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/platform-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/platform src/services/user-store.ts src/data/types.ts tests/platform-store.test.ts
git commit -m "feat: add PlatformAdapter and resilient local UserStore"
```

---

### Task 3: Public Quran Content Services (Murottal, Tafsir, Translation, Sanitizer & Offline Arabic Search)

**Files:**
- Create: `src/services/sanitize.ts`, `src/services/quran-api.ts`, `src/services/arabic-search.ts`
- Test: `tests/quran-services.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter` (`src/platform/types.ts`), `Catalog` (`src/data/catalog.json`), `@tilawa/core/assets/ref-v2.json`
- Produces:
  - `src/services/sanitize.ts`: `sanitizeHtml(input: string): string`
  - `src/services/quran-api.ts`: `buildEveryAyahUrl(reciterFolder: string, surah: number, ayah: number): string`, `createQuranApi(platform: PlatformAdapter, fetcher?: typeof fetch)` returning `{ getTranslation(translationId: number, surah: number, ayah: number, signal?: AbortSignal): Promise<ContentResult>; getTafsir(tafsirId: string, surah: number, ayah: number, signal?: AbortSignal): Promise<ContentResult>; getAudioBlobUrl(reciterFolder: string, surah: number, ayah: number, signal?: AbortSignal): Promise<{ url: string; fromCache: boolean }>; downloadSurahAudio(reciterFolder: string, surah: number, ayahCount: number, onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> }`
  - `src/services/arabic-search.ts`: `normalizeArabic(text: string): string`, `createQuranSearch(refData: RefV2Data, surahs: SurahInfo[])` returning `{ search(query: string, limit?: number): SearchHit[]; getAyahWords(surah: number, ayah: number): string[] }`

- [ ] **Step 1: Write the failing test in `tests/quran-services.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { sanitizeHtml } from "../src/services/sanitize";
import { buildEveryAyahUrl, createQuranApi } from "../src/services/quran-api";
import { normalizeArabic, createQuranSearch } from "../src/services/arabic-search";

describe("sanitizeHtml", () => {
  it("strips script, iframe, inline handlers, and javascript URLs while keeping safe tags", () => {
    const dirty = `<p onclick="alert(1)">Tafsir <b>penting</b><script>evil()</script><iframe src="x"></iframe><a href="javascript:steal()">klik</a><img src=x onerror=alert(2)></p>`;
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain("Tafsir");
    expect(clean).toContain("<b>penting</b>");
    expect(clean).not.toMatch(/script|iframe|onclick|onerror|javascript:/i);
  });
});

describe("quran-api", () => {
  it("formats EveryAyah URLs with 3-digit zero-padded surah and ayah", () => {
    expect(buildEveryAyahUrl("Alafasy_128kbps", 1, 1)).toBe("https://everyayah.com/data/Alafasy_128kbps/001001.mp3");
    expect(buildEveryAyahUrl("Husary_128kbps", 114, 6)).toBe("https://everyayah.com/data/Husary_128kbps/114006.mp3");
  });

  it("caches equran.id Indonesian tafsir per surah so multiple ayahs make 1 network request", async () => {
    const cache = new Map<string, Uint8Array>();
    const platform: any = {
      cacheGet: async (b: string, k: string) => cache.get(`${b}:${k}`) ?? null,
      cachePut: async (b: string, k: string, v: Uint8Array) => { cache.set(`${b}:${k}`, v); },
      cacheHas: async (b: string, k: string) => cache.has(`${b}:${k}`),
    };
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: { tafsir: [{ ayat: 1, teks: "Tafsir ayat 1" }, { ayat: 2, teks: "Tafsir ayat 2" }] },
    }), { status: 200 }));

    const api = createQuranApi(platform, mockFetch as any);
    const a1 = await api.getTafsir("equran-id", 1, 1);
    const a2 = await api.getTafsir("equran-id", 1, 2);
    expect(a1.html).toContain("Tafsir ayat 1");
    expect(a2.html).toContain("Tafsir ayat 2");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns cached content offline when fetch rejects", async () => {
    const enc = new TextEncoder();
    const platform: any = {
      cacheGet: async () => enc.encode(JSON.stringify({ html: "<p>Cached terjemahan</p>" })),
      cachePut: async () => {},
      cacheHas: async () => true,
    };
    const failingFetch = vi.fn(async () => { throw new Error("offline"); });
    const api = createQuranApi(platform, failingFetch as any);
    const res = await api.getTranslation(33, 1, 1);
    expect(res.fromCache).toBe(true);
    expect(res.html).toBe("<p>Cached terjemahan</p>");
    expect(failingFetch).not.toHaveBeenCalled();
  });
});

describe("arabic-search", () => {
  it("normalizes harakat and alef variants and matches Uthmani verses offline", () => {
    expect(normalizeArabic("بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ")).toBe("بسم الله الرحمن");
    const search = createQuranSearch(
      { ayahs: [{ surah: 1, ayah: 1, words: ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"] }] },
      [{ number: 1, name: "Al-Fatiha", arabicName: "الفاتحة", ayahs: 7, page: 1, location: "mecca" }],
    );
    const hits = search.search("بسم الله");
    expect(hits[0]).toMatchObject({ surah: 1, ayah: 1 });
    expect(search.getAyahWords(1, 1)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/quran-services.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement `sanitize.ts`, `quran-api.ts`, and `arabic-search.ts`**

- `sanitize.ts`: parse via `DOMParser` (`text/html`) allowing only safe tags (`p`, `br`, `b`, `strong`, `i`, `em`, `span`, `sup`, `sub`, `h1`..`h4`, `ul`, `ol`, `li`, `blockquote`) and stripping all attributes except safe `class`/`dir`/`lang`; drop `<script>`, `<style>`, `<iframe>`, `<object>`, `<img>` completely.
- `quran-api.ts`: cache-first strategy backed by `PlatformAdapter.cacheGet/Put`:
  - `getTranslation(id, s, a, signal)`: fetches `https://api.quran.com/api/v4/verses/by_key/${s}:${a}?translations=${id}`, sanitizes `verse.translations[0].text`, caches JSON.
  - `getTafsir(id, s, a, signal)`: for `"equran-id"`, fetches `https://equran.id/api/v2/tafsir/${s}` once, caches the full surah array (`tafsir/equran-id_${s}`), and extracts `ayat == a` formatted cleanly as paragraphs; for numeric Quran.com IDs (`"16"`, `"14"`, `"169"`, etc.), fetches `https://api.quran.com/api/v4/tafsirs/${id}/by_ayah/${s}:${a}`, sanitizes `tafsir.text`, and caches per ayah.
  - `getAudioBlobUrl(reciter, s, a, signal)`: checks `cacheGet("audio", "${reciter}_${SSS}${AAA}")`, else fetches EveryAyah MP3, stores bytes in cache, returns `URL.createObjectURL(blob)` (caller or LRU pool revokes old URLs).
  - `downloadSurahAudio(...)`: skips already-cached ayahs, downloads sequentially with small concurrency (3), respects `AbortSignal`, reports progress.
- `arabic-search.ts`: inspect actual `@tilawa/core/assets/ref-v2.json` structure (support both its exact JSON shape and normalized adapter), normalize Arabic diacritics (`[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]`), map alef forms (`[أإآٱ] -> ا`), `ى -> ي`, `ة -> ه`, and provide fast substring search across all 6,236 ayahs + Latin/Arabic surah names.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/quran-services.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/sanitize.ts src/services/quran-api.ts src/services/arabic-search.ts tests/quran-services.test.ts
git commit -m "feat: add public CORS Quran API client, HTML sanitizer, and offline Arabic search"
```

---

### Task 4: Tarteel-Style Mushaf Reader Core & Navigation (`1/2-Page RTL Spread`, Overlays, Themes, `Cmd+K`)

**Files:**
- Create: `src/state/reader-logic.ts`, `src/styles/tokens.css`, `src/styles/app.css`, `src/components/MushafPage.tsx`, `src/components/MushafSpread.tsx`, `src/components/TopBar.tsx`, `src/components/NavPalette.tsx`, `src/components/AyahPopover.tsx`, `src/App.tsx`, `src/main.tsx`, `index.html`
- Test: `tests/reader-logic.test.ts`

**Interfaces:**
- Consumes: `MushafMap` (`src/data/mushaf-map.json`), `Catalog` (`src/data/catalog.json`), `PlatformAdapter`, `UserStore`, `createQuranSearch`
- Produces:
  - `src/state/reader-logic.ts`: `SpreadMode` (`"auto" | "single" | "double"`), `clampPage(page: number): number`, `resolveEffectiveSpread(mode: SpreadMode, viewportWidth: number): "single" | "double"`, `getVisiblePages(currentPage: number, effectiveSpread: "single" | "double"): { rightPage: number; leftPage: number | null }`, `turnPage(currentPage: number, direction: "next" | "prev", effectiveSpread: "single" | "double"): number`, `mapKeyToDirection(key: string): "next" | "prev" | null`
  - `src/components/MushafPage.tsx`: props include `pageEntry`, `imageUrl`, `selectedAyah`, `playingAyah`, `highlights`, `bookmarks`, `blurSet?: Set<AyahKey>`, `revealedSet?: Set<AyahKey>`, `mistakeAyahs?: Map<AyahKey, MistakeBadge>`, `onSelectAyah`, `onPeekAyah`

- [ ] **Step 1: Write the failing test in `tests/reader-logic.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  clampPage,
  resolveEffectiveSpread,
  getVisiblePages,
  turnPage,
  mapKeyToDirection,
} from "../src/state/reader-logic";

describe("reader-logic (RTL Mushaf spread)", () => {
  it("clamps pages to 1..604", () => {
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
    expect(clampPage(605)).toBe(604);
  });

  it("pairs odd page on right and even page on left in 2-page RTL spread", () => {
    expect(getVisiblePages(1, "double")).toEqual({ rightPage: 1, leftPage: 2 });
    expect(getVisiblePages(2, "double")).toEqual({ rightPage: 1, leftPage: 2 });
    expect(getVisiblePages(603, "double")).toEqual({ rightPage: 603, leftPage: 604 });
    expect(getVisiblePages(604, "double")).toEqual({ rightPage: 603, leftPage: 604 });
    expect(getVisiblePages(15, "single")).toEqual({ rightPage: 15, leftPage: null });
  });

  it("advances and reverses pages cleanly across single and double spread", () => {
    expect(turnPage(1, "next", "double")).toBe(3);
    expect(turnPage(3, "prev", "double")).toBe(1);
    expect(turnPage(603, "next", "double")).toBe(603);
    expect(turnPage(1, "prev", "single")).toBe(1);
    expect(turnPage(1, "next", "single")).toBe(2);
  });

  it("maps ArrowLeft to next page and ArrowRight to previous page (RTL physical mushaf)", () => {
    expect(mapKeyToDirection("ArrowLeft")).toBe("next");
    expect(mapKeyToDirection("ArrowRight")).toBe("prev");
    expect(resolveEffectiveSpread("auto", 1200)).toBe("double");
    expect(resolveEffectiveSpread("auto", 800)).toBe("single");
    expect(resolveEffectiveSpread("single", 1440)).toBe("single");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reader-logic.test.ts`
Expected: FAIL with missing module `../src/state/reader-logic`.

- [ ] **Step 3: Implement `reader-logic.ts`, calm Tarteel-inspired CSS themes (`tokens.css`, `app.css`), and core reader components**

- `reader-logic.ts`: exact RTL mushaf math (`rightPage = currentPage % 2 === 1 ? currentPage : currentPage - 1`, `leftPage = rightPage + 1 <= 604 ? rightPage + 1 : null`; `auto` switches to `"double"` at `viewportWidth >= 1024`).
- `tokens.css` & `app.css`: calm, refined Tarteel-inspired aesthetic — Light Paper (`#faf8f3` warm ivory background, `#ffffff` mushaf surface, `#136f5a` deep emerald accent), Warm Sepia (`#f2eadc` parchment), Dark Night (`#111417` canvas with carefully tuned `filter: invert(0.91) hue-rotate(180deg) contrast(0.95)` on the mushaf image only, keeping highlights & UI overlays crisp and un-inverted).
- `MushafPage.tsx`: maintains exact `699 / 1020` aspect ratio; renders `<img>` + percentage-positioned interactive `.ayah-box` overlays for every `AyahSegment` box, supporting hover, active selection, playing highlight, user highlight color, Hifz blur mask (matching page paper tone with subtle blur), tap-to-peek, and mistake badge indicator.
- `MushafSpread.tsx`: renders `leftPage` on the visual left and `rightPage` on the visual right in 2-page spread (with subtle center book-spine shadow), prefetches adjacent 2 pages via `new Image()`, and binds keyboard shortcuts (`ArrowLeft`/`ArrowRight`, `F` focus mode, `Cmd/Ctrl+K` palette).
- `TopBar.tsx`: minimal auto-hiding bar with Surah/Juz/Page pill trigger, Search button, 1/2-page spread switcher (`Auto` / `1 Halaman` / `2 Halaman`), Hifz Blur toggle, and Theme switcher.
- `NavPalette.tsx`: `Cmd/Ctrl+K` modal with 5 tabs: **Surah**, **Juz**, **Halaman**, **Cari Ayat** (wired to `arabic-search.ts`), and **Bookmark & Catatan**.
- `AyahPopover.tsx`: compact floating action bar anchored smoothly when an ayah is selected (**Putar**, **Tafsir & Terjemahan**, **Bookmark**, **Highlight**, **Tasmi' dari sini**).
- Wire `App.tsx`, `main.tsx`, `index.html` so `npm run dev` immediately renders a working, fast Mushaf reader!

- [ ] **Step 4: Run tests and typecheck to verify PASS**

Run: `npx vitest run tests/reader-logic.test.ts && npx tsc --noEmit`
Expected: PASS, 0 TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.tsx src/App.tsx src/state src/styles src/components tests/reader-logic.test.ts
git commit -m "feat: build Tarteel-inspired Mushaf reader with RTL 1/2-page spread and navigation"
```

---

### Task 5: Murottal Audio Player & Tafsir / Terjemahan / Catatan Drawer

**Files:**
- Create: `src/services/audio-controller.ts`, `src/components/AudioDock.tsx`, `src/components/StudyDrawer.tsx`
- Modify: `src/App.tsx`
- Test: `tests/audio-controller.test.ts`

**Interfaces:**
- Consumes: `createQuranApi` (`src/services/quran-api.ts`), `Catalog` (`src/data/catalog.json`), `MushafMap` (`src/data/mushaf-map.json`), `UserStore` (`src/services/user-store.ts`)
- Produces:
  - `src/services/audio-controller.ts`: `nextAyah(surah: number, ayah: number, surahs: SurahInfo[]): { surah: number; ayah: number } | null`, `prevAyah(surah: number, ayah: number, surahs: SurahInfo[]): { surah: number; ayah: number } | null`, `createAudioController(deps)` returning `{ playAyah(surah: number, ayah: number): Promise<void>; togglePlay(): void; pause(): void; next(): Promise<void>; prev(): Promise<void>; setReciter(id: string): void; setRepeat(count: RepeatCount): void; setSpeed(rate: number): void; subscribe(fn: (s: AudioState) => void): () => void; dispose(): void }`

- [ ] **Step 1: Write the failing test in `tests/audio-controller.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { nextAyah, prevAyah, createAudioController } from "../src/services/audio-controller";

const MINI_SURAHS = [
  { number: 1, name: "Al-Fatiha", arabicName: "الفاتحة", ayahs: 7, page: 1, location: "mecca" as const },
  { number: 2, name: "Al-Baqara", arabicName: "البقرة", ayahs: 286, page: 2, location: "medina" as const },
  { number: 114, name: "An-Nas", arabicName: "الناس", ayahs: 6, page: 604, location: "mecca" as const },
];

describe("audio-controller", () => {
  it("steps across surah boundaries and stops at 114:6", () => {
    expect(nextAyah(1, 7, MINI_SURAHS)).toEqual({ surah: 2, ayah: 1 });
    expect(nextAyah(114, 6, MINI_SURAHS)).toBeNull();
    expect(prevAyah(2, 1, MINI_SURAHS)).toEqual({ surah: 1, ayah: 7 });
    expect(prevAyah(1, 1, MINI_SURAHS)).toBeNull();
  });

  it("ignores stale audio load when user rapidly switches ayahs", async () => {
    let resolveFirst!: (v: { url: string; fromCache: boolean }) => void;
    const playedUrls: string[] = [];
    const getAudioBlobUrl = vi.fn((_r: string, _s: number, ayah: number) => {
      if (ayah === 1) return new Promise<{ url: string; fromCache: boolean }>((res) => { resolveFirst = res; });
      return Promise.resolve({ url: `blob:ayah-${ayah}`, fromCache: false });
    });
    const fakeAudio = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null as (() => void) | null,
      play: vi.fn(async function (this: any) { this.paused = false; playedUrls.push(this.src); }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };

    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl,
      createElement: () => fakeAudio as any,
    });

    const p1 = ctrl.playAyah(1, 1);
    const p2 = ctrl.playAyah(1, 2);
    await p2;
    resolveFirst({ url: "blob:ayah-1", fromCache: false });
    await p1;

    expect(playedUrls).toEqual(["blob:ayah-2"]);
  });

  it("repeats current ayah according to repeatCount before advancing", async () => {
    const played: string[] = [];
    const fakeAudio: any = {
      src: "",
      playbackRate: 1,
      paused: true,
      onended: null,
      play: vi.fn(async function (this: any) { this.paused = false; played.push(this.src); }),
      pause: vi.fn(function (this: any) { this.paused = true; }),
    };
    const ctrl = createAudioController({
      surahs: MINI_SURAHS,
      reciterId: "Alafasy_128kbps",
      getAudioBlobUrl: async (_r, s, a) => ({ url: `blob:${s}:${a}`, fromCache: true }),
      createElement: () => fakeAudio,
    });
    ctrl.setRepeat(2);
    await ctrl.playAyah(1, 1);
    await fakeAudio.onended(); // repeat 2 of 2
    await fakeAudio.onended(); // advance to 1:2
    expect(played).toEqual(["blob:1:1", "blob:1:1", "blob:1:2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio-controller.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement `audio-controller.ts`, `AudioDock.tsx`, and `StudyDrawer.tsx`, and wire into `App.tsx`**

- `audio-controller.ts`: uses monotonic request token (`requestSeq`) + `AbortController` so rapid ayah switching cancels in-flight fetches and ignores stale resolutions; supports `repeatCount` (`1 | 2 | 3 | 5 | Infinity`), auto-advance, playback speed (`0.75 | 1 | 1.25 | 1.5`), and background prefetch of the next 2 ayahs via `getAudioBlobUrl`.
- `AudioDock.tsx`: sleek floating bottom dock with Play/Pause, Prev/Next ayah, Reciter dropdown + **Unduh Surah Offline** button with progress indicator, Repeat & Speed toggles, and prominent Tarteel-style emerald Mic/Tasmi' trigger button.
- `StudyDrawer.tsx`: right drawer on desktop / bottom sheet on narrow screens synced to selected or currently playing ayah; tabs for **Terjemahan** (resource selector, default `33` Indonesian Kemenag), **Tafsir** (resource selector, default `equran-id` Kemenag + Arabic/English Quran.com tafsirs), and **Catatan** (bookmark toggle, 4 highlight colors, personal note textarea); cancels stale fetches when ayah changes rapidly and clearly shows offline/cached status.
- Wire into `App.tsx`: auto-turns mushaf page whenever active playing ayah moves onto a page outside the visible spread; bind `Space` to play/pause.

- [ ] **Step 4: Run tests and typecheck to verify PASS**

Run: `npx vitest run tests/audio-controller.test.ts && npx tsc --noEmit`
Expected: PASS, 0 TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/audio-controller.ts src/components/AudioDock.tsx src/components/StudyDrawer.tsx src/App.tsx tests/audio-controller.test.ts
git commit -m "feat: add Murottal audio player and Tafsir/Terjemahan/Notes drawer"
```

---

### Task 6: Tilawa Offline Tasmi' Engine, Hifz Blur-to-Reveal & Session History

**Files:**
- Create: `src/services/tasmi-logic.ts`, `src/services/tilawa-controller.ts`, `src/components/TasmiSheet.tsx`, `src/components/RecitationRibbon.tsx`, `src/components/TasmiSummaryModal.tsx`
- Modify: `src/components/MushafPage.tsx`, `src/App.tsx`
- Test: `tests/tasmi-logic.test.ts`

**Interfaces:**
- Consumes: `MushafMap` (`src/data/mushaf-map.json`), `Catalog` (`src/data/catalog.json`), `PlatformAdapter`, `UserStore`, `createQuranSearch` (`getAyahWords`), `@tilawa/core/web`
- Produces:
  - `src/services/tasmi-logic.ts`: `buildPageTasmiCandidates(pages: PageEntry[], surahs: SurahInfo[]): TasmiPassageOption[]`, `createTasmiState(mode: "free" | "memorization", passage: DeclaredPassage | null): TasmiLiveState`, `reduceTilawaEvent(state: TasmiLiveState, event: EngineEvent, getAyahWords: (s: number, a: number) => string[]): TasmiLiveState`, `computeBlurMask(pageEntry: PageEntry, mode: "off" | "all" | "tasmi", passage: DeclaredPassage | null, revealedAyahs: Set<AyahKey>, peekedAyah: AyahKey | null): Set<AyahKey>`
  - `src/services/tilawa-controller.ts`: `createTilawaController(platform: PlatformAdapter)` returning `{ ensureReady(onProgress, signal): Promise<void>; startFree(onEvent): Promise<void>; startMemorization(passage, onEvent): Promise<void>; stop(): Promise<CheckerEvent[]>; dispose(): void }`

- [ ] **Step 1: Write the failing test in `tests/tasmi-logic.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  buildPageTasmiCandidates,
  createTasmiState,
  reduceTilawaEvent,
  computeBlurMask,
} from "../src/services/tasmi-logic";

const map = JSON.parse(fs.readFileSync("src/data/mushaf-map.json", "utf8"));
const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));

describe("tasmi-logic", () => {
  it("lists each surah separately on multi-surah page 604 (per-surah Tasmi')", () => {
    const p604 = map.pages[603];
    const options = buildPageTasmiCandidates([p604], catalog.surahs);
    expect(options.map((o) => o.surah)).toEqual([112, 113, 114]);
    expect(options[0]).toMatchObject({ surah: 112, fromAyah: 1, toAyah: 4 });
  });

  it("handles split-ayah page 15 by leaving leading 2:94 unmasked and starting at 2:95", () => {
    const p15 = map.pages[14];
    expect(p15.leadingSplitAyah).toBe("2:94");
    const options = buildPageTasmiCandidates([p15], catalog.surahs);
    expect(options[0]).toMatchObject({ surah: 2, fromAyah: 95 });
    const masked = computeBlurMask(p15, "tasmi", { surah: 2, fromAyah: 95, toAyah: options[0].toAyah }, new Set(), null);
    expect(masked.has("2:94")).toBe(false);
    expect(masked.has("2:95")).toBe(true);
  });

  it("combines a 2-page spread option when the same surah spans both pages", () => {
    const options = buildPageTasmiCandidates([map.pages[2], map.pages[3]], catalog.surahs); // pages 3 & 4 (Al-Baqara)
    expect(options.some((o) => o.surah === 2 && o.scopeLabel.includes("2 Halaman"))).toBe(true);
  });

  it("tracks locked words, reveals recited ayahs, and counts only confirmed mistakes", () => {
    let st = createTasmiState("memorization", { surah: 1, fromAyah: 1, toAyah: 7 });
    const words = () => ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"];

    st = reduceTilawaEvent(st, {
      v: 1, type: "position", timeMs: 500, referenceVersion: "ref-v2", state: "locked",
      observed: [{ word: { surah: 1, ayah: 1, word: 2 }, span: { start: { surah: 1, ayah: 1, word: 1 }, end: { surah: 1, ayah: 1, word: 2 } }, confidence: 0.9, cost: 0.1, per: 0.05 }],
      expected: { surah: 1, ayah: 1, word: 3 },
    } as any, words);
    expect(st.activeAyah).toBe("1:1");
    expect(st.revealedAyahs.has("1:1")).toBe(true);

    // suspected -> should NOT appear in confirmedMistakes
    st = reduceTilawaEvent(st, {
      v: 1, type: "checker", id: "m1", timeMs: 900, state: "suspected",
      errorClass: "wrong_word", location: { surah: 1, ayah: 1, word: 3 }, confidence: 0.8,
    } as any, words);
    expect(st.confirmedMistakes).toHaveLength(0);

    // confirmed -> counted once with Uthmani word text
    st = reduceTilawaEvent(st, {
      v: 1, type: "checker", id: "m1", timeMs: 1200, state: "confirmed",
      errorClass: "wrong_word", location: { surah: 1, ayah: 1, word: 3 }, confidence: 0.85,
    } as any, words);
    expect(st.confirmedMistakes).toHaveLength(1);
    expect(st.confirmedMistakes[0].wordText).toBe("ٱلرَّحْمَـٰنِ");

    // resolved later -> removed from confirmedMistakes (self-corrected)
    st = reduceTilawaEvent(st, {
      v: 1, type: "checker", id: "m1", timeMs: 1600, state: "resolved",
      errorClass: "wrong_word", location: { surah: 1, ayah: 1, word: 3 }, confidence: 0.9,
    } as any, words);
    expect(st.confirmedMistakes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tasmi-logic.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement `tasmi-logic.ts`, `tilawa-controller.ts`, and Tasmi' UI components**

- `tasmi-logic.ts`:
  - `buildPageTasmiCandidates(pages, surahs)`: for each visible page, groups ayahs by surah while excluding `page.leadingSplitAyah` from that page's start bound; when 2 pages are visible and share a surah, also includes a combined `"2 Halaman"` option for that surah.
  - `reduceTilawaEvent`: updates `trackerState`, `activeWord`, `activeAyah`, adds recited ayahs to `revealedAyahs`, maintains `mistakesById` so only `state === "confirmed"` events surface in `confirmedMistakes` (updating or removing if a later event marks the same `id` as `resolved` or `uncertain`).
  - `computeBlurMask`: returns the `Set<AyahKey>` to blur on a page (excluding `leadingSplitAyah`, `revealedAyahs`, and `peekedAyah`).
- `tilawa-controller.ts`:
  - Lazily initializes `createTilawa({ wasmPaths: "/ort/", storage: platform.createTilawaStorage(), onProgress, signal })` from `@tilawa/core/web`.
  - When `platform.startNativeMic` is present (Tauri Desktop), streams native `cpal` PCM directly into `session.pushAudio(pcm, sampleRate)`; on Web, calls `tilawa.listen(session)` (`getUserMedia`) and translates `MicrophoneError` into clear Indonesian guidance.
- `TasmiSheet.tsx`: clean modal/popover offering **Baca Bebas** vs **Tasmi' Hafalan (Per Surat)** (showing page surah options, full-surah option, custom `fromAyah..toAyah` inputs, Hifz blur toggle ON by default), first-run model download progress bar + cancel button, privacy line (*"Audio diproses 100% di perangkat"*), and honest capability note (*"Mengecek ketepatan hafalan/kata; belum menilai tajwid atau makhraj"*).
- `RecitationRibbon.tsx`: compact live word-by-word Uthmani tracker (auto-collapsed while blur mode is active unless peeking or a mistake occurs).
- `TasmiSummaryModal.tsx`: post-session review showing surah/range, duration, mistake breakdown by class (`Kata salah`, `Kata terlewat`, `Kata berlebih`, `Ayat terloncat`), Uthmani snippet with flagged word highlighted + 1-click **Dengar Murottal** button, plus tab **Riwayat Tasmi'** persisted in `UserStore`.
- Wire Hifz blur overlays, tap-to-peek, mistake badges, and `M`/`H` shortcuts into `MushafPage.tsx` and `App.tsx`.

- [ ] **Step 4: Run tests and typecheck to verify PASS**

Run: `npx vitest run tests/tasmi-logic.test.ts && npx tsc --noEmit`
Expected: PASS, 0 TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/tasmi-logic.ts src/services/tilawa-controller.ts src/components/TasmiSheet.tsx src/components/RecitationRibbon.tsx src/components/TasmiSummaryModal.tsx src/components/MushafPage.tsx src/App.tsx tests/tasmi-logic.test.ts
git commit -m "feat: integrate Tilawa offline Tasmi', Hifz blur-to-reveal, and session history"
```

---

### Task 7: Static Web PWA (Service Worker, Manifest, Icons & Production Build)

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/icon.svg`, `public/sw.js`, `src/platform/sw-routing.ts`, `src/platform/register-sw.ts`
- Modify: `index.html`, `src/main.tsx`
- Test: `tests/pwa.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter` (`isDesktop` check so SW never registers inside Tauri WKWebView)
- Produces:
  - `src/platform/sw-routing.ts`: `classifyRequest(url: string): "cache-first-static" | "cache-first-media" | "network-first-shell" | "passthrough"`
  - `public/sw.js`: offline caching for app shell, mushaf page scans, `/ort/` WASM files, and public audio/tafsir/translation responses
  - `public/manifest.webmanifest`: installable PWA metadata (`Ayat`, `standalone`, emerald theme `#136f5a`)

- [ ] **Step 1: Write the failing test in `tests/pwa.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { classifyRequest } from "../src/platform/sw-routing";

describe("PWA manifest and SW routing", () => {
  it("routes mushaf pages, ORT wasm, and EveryAyah audio to cache-first strategies", () => {
    expect(classifyRequest("https://ayat.app/mushaf/pages/001.gif")).toBe("cache-first-media");
    expect(classifyRequest("https://ayat.app/ort/ort-wasm-simd-threaded.wasm")).toBe("cache-first-static");
    expect(classifyRequest("https://everyayah.com/data/Alafasy_128kbps/001001.mp3")).toBe("cache-first-media");
    expect(classifyRequest("https://api.quran.com/api/v4/verses/by_key/1:1?translations=33")).toBe("cache-first-media");
    expect(classifyRequest("https://equran.id/api/v2/tafsir/1")).toBe("cache-first-media");
    expect(classifyRequest("https://ayat.app/")).toBe("network-first-shell");
  });

  it("ships a valid webmanifest with Ayat name and standalone display", () => {
    const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.name).toContain("Ayat");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pwa.test.ts`
Expected: FAIL with missing files.

- [ ] **Step 3: Implement `sw-routing.ts`, `public/sw.js`, `register-sw.ts`, `manifest.webmanifest`, and SVG/PNG app icons**

- `public/sw.js`: uses matching URL classification (`ayat-shell-v1`, `ayat-media-v1`), cleans old cache versions on `activate`, only caches `GET` `200` responses, never intercepts `tilawa.dev` model downloads (managed by `@tilawa/core`'s Cache API storage directly).
- `register-sw.ts`: registers `/sw.js` only when `!isDesktop && "serviceWorker" in navigator && import.meta.env.PROD`.
- Link `manifest.webmanifest` and theme-color in `index.html`.

- [ ] **Step 4: Run tests and verify static Web PWA production build**

Run: `npx vitest run tests/pwa.test.ts && npm run build && ls dist/ort/*.wasm`
Expected: PASS; `dist/` builds cleanly and contains copied `ort-wasm*.wasm` files.

- [ ] **Step 5: Commit**

```bash
git add public/manifest.webmanifest public/icons public/sw.js src/platform/sw-routing.ts src/platform/register-sw.ts index.html src/main.tsx tests/pwa.test.ts
git commit -m "feat: add offline PWA Service Worker, manifest, and static build verification"
```

---

### Task 8: Tauri v2 Cross-Platform Rust Backend (Disk Cache, Bundled Mushaf & Native `cpal` Mic)

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/Info.plist`, `src-tauri/Entitlements.plist`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/cache.rs`, `src-tauri/src/mic.rs`
- Test: inline `#[cfg(test)]` unit tests in `src-tauri/src/cache.rs` and `src-tauri/src/mic.rs`

**Interfaces:**
- Consumes: Tauri v2 `app_data_dir()` & `resource_dir()`, frontend `TauriAdapter` command names from Task 2
- Produces (Tauri IPC commands registered in `src-tauri/src/lib.rs`):
  - `cache_get(bucket: String, key: String) -> Result<Option<Vec<u8>>, String>`
  - `cache_put(bucket: String, key: String, bytes: Vec<u8>) -> Result<(), String>`
  - `cache_has(bucket: String, key: String) -> Result<bool, String>`
  - `cache_delete(bucket: String, key: String) -> Result<(), String>`
  - `kv_get(key: String) -> Result<Option<String>, String>`
  - `kv_set(key: String, value: String) -> Result<(), String>`
  - `get_mushaf_page_path(page: u16) -> Result<String, String>`
  - `mic_start(on_chunk: Channel<MicChunk>) -> Result<u32, String>` where `MicChunk { samples: Vec<f32>, sample_rate: u32 }`
  - `mic_stop() -> Result<(), String>`

- [ ] **Step 1: Scaffold `src-tauri/` project config (`Cargo.toml`, `build.rs`, `tauri.conf.json`, `Info.plist`, `Entitlements.plist`, `capabilities/default.json`)**

- `Cargo.toml`: `tauri = { version = "2", features = ["protocol-asset"] }`, `tauri-build = "2"`, `cpal = "0.15"`, `serde = { version = "1", features = ["derive"] }`, `serde_json = "1"`.
- `tauri.conf.json`: `productName: "Ayat"`, `identifier: "com.rifizzu.ayat"`, `frontendDist: "../dist"`, `devUrl: "http://localhost:5173"`, `security.assetProtocol: { enable: true, scope: ["$RESOURCE/**", "$APPDATA/**"] }`, bundle targets `["app", "dmg", "nsis", "msi"]`, macOS `entitlements: "Entitlements.plist"`, and resource mapping for `resources/mushaf/pages/`.
- `Info.plist`: `NSMicrophoneUsageDescription` explaining on-device Quran recitation/tasmi'.
- `Entitlements.plist`: `com.apple.security.device.audio-input` + `com.apple.security.cs.allow-jit` + `com.apple.security.cs.allow-unsigned-executable-memory` (required for Hardened Runtime WKWebView WASM).

- [ ] **Step 2: Write failing Rust unit tests in `src-tauri/src/cache.rs` and `src-tauri/src/mic.rs`**

In `src-tauri/src/cache.rs` (`#[cfg(test)]`):
- `test_rejects_path_traversal_keys`: asserts `safe_cache_path(base, "audio", "../secret")`, `safe_cache_path(base, "../etc", "a")`, `safe_cache_path(base, "audio", "a/b")`, `safe_cache_path(base, "audio", "a\\b")`, and empty keys all return `Err(...)`.
- `test_disk_cache_roundtrip`: writes bytes, asserts `has == true`, reads identical bytes back, deletes the key, asserts `has == false`, and verifies nonexistent key returns `Ok(None)`.

In `src-tauri/src/mic.rs` (`#[cfg(test)]`):
- `test_downmix_stereo_to_mono`: asserts `downmix_to_mono(&[0.5, -0.5, 1.0, 0.0], 2)` returns `[0.0, 0.5]` and `downmix_to_mono(&[0.25, -0.25], 1)` returns `[0.25, -0.25]`.

- [ ] **Step 3: Run `cargo test` to verify compilation/tests fail before implementation**

Run: `PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml`
Expected: FAIL (unimplemented functions).

- [ ] **Step 4: Implement `cache.rs`, `mic.rs`, `lib.rs`, and `main.rs`**

- `cache.rs`: validates `bucket` and `key` strictly against `[A-Za-z0-9._:-]` (rejecting empty, `.`, `..`, `/`, `\`, NUL), creates bucket directories under `app_data_dir()`, writes atomically via temp file + rename so partial writes never corrupt cached files or `user.json`.
- `mic.rs`: uses `cpal::default_host().default_input_device()`, spawns a dedicated audio capture thread controlled by an `AtomicBool` stop flag + `JoinHandle` stored in Tauri managed state (`MicState`), downmixes multi-channel input (`f32`/`i16`/`u16`) to mono `f32`, batches ~100 ms chunks, and sends `MicChunk { samples, sample_rate }` via `tauri::ipc::Channel`. `mic_stop()` sets stop flag and drops stream cleanly (idempotent if already stopped).
- `lib.rs`: registers all 9 IPC commands, resolves `get_mushaf_page_path(page)` validating `1..=604` against `resource_dir()/mushaf/pages/{page:03}.gif` (falling back in dev mode to `../public/mushaf/pages/{page:03}.gif`).

- [ ] **Step 5: Run Rust unit tests to verify PASS**

Run: `PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (all Rust unit tests green).

- [ ] **Step 6: Commit**

```bash
git add src-tauri
git commit -m "feat: add cross-platform Tauri v2 Rust backend for disk cache and native cpal mic"
```

---

### Task 9: End-to-End Integration, macOS `.app`/`.dmg` Build Verification & Docs

**Files:**
- Modify: `src/platform/tauri-adapter.ts`, `package.json`, `scripts/extract-mushaf.mjs`
- Create: `README.md`

**Interfaces:**
- Consumes: All frontend tasks (Tasks 1–7) and Rust commands (Task 8)
- Produces: Verified runnable `src-tauri/target/release/bundle/macos/Ayat.app` (+ `.dmg`), verified static Web PWA `dist/`, and release/deployment guide in `README.md`

- [ ] **Step 1: Sync desktop resource preparation & verify `TauriAdapter` IPC names match `src-tauri/src/lib.rs`**

Add a lightweight script step (`npm run prepare:desktop`) copying gitignored `public/mushaf/pages/` into gitignored `src-tauri/resources/mushaf/pages/` before `tauri build`, and ensure Tauri icon assets exist under `src-tauri/icons/` (generated via `npx tauri icon`). Double-check every `invoke(...)` command name and argument key in `src/platform/tauri-adapter.ts` matches `src-tauri/src/lib.rs` verbatim (`cache_get`, `cache_put`, `cache_has`, `cache_delete`, `kv_get`, `kv_set`, `get_mushaf_page_path`, `mic_start`, `mic_stop`).

- [ ] **Step 2: Run full test suite across TypeScript and Rust**

Run: `npx vitest run && npx tsc --noEmit && PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS across all TS and Rust tests with 0 type errors.

- [ ] **Step 3: Build both targets — Static Web PWA (`dist/`) and macOS arm64 Tauri v2 (`.app` / `.dmg`)**

Run: `npm run build && npm run prepare:desktop && PATH="$HOME/.cargo/bin:$PATH" npx tauri build --bundles app,dmg`
Expected: PASS; `dist/index.html`, `dist/ort/*.wasm`, `src-tauri/target/release/bundle/macos/Ayat.app`, and `.dmg` created cleanly; check `file src-tauri/target/release/bundle/macos/Ayat.app/Contents/MacOS/ayat` confirms `Mach-O 64-bit executable arm64` and app binary size is small (no Chromium bundled).

- [ ] **Step 4: Run live verification checks on built artifacts**

- Check Web PWA locally (`vite preview`) + verify `curl` returns `200` for `/`, `/manifest.webmanifest`, `/sw.js`, `/mushaf/pages/001.gif`, and `/ort/ort-wasm-simd-threaded.wasm`.
- Launch `Ayat.app` on macOS, verify fast cold startup (< 1s) and zero runtime crash logs; note manual interactive mic/Tilawa verification steps for the user (macOS TCC mic prompt requires interactive user approval).
- Verify `git status` confirms `Quranflash.pkg`, `public/mushaf/pages/`, and `src-tauri/resources/mushaf/` remain completely untracked/ignored.

- [ ] **Step 5: Write concise `README.md` and commit**

Document:
1. Local setup & extracting Medina Mushaf assets from `Quranflash.pkg` (gitignored).
2. Running Web dev / building static Web PWA + `VITE_MUSHAF_BASE_URL` for public CDN/Cloudflare Pages CI (with KFGQPC attribution note).
3. Building macOS `.app`/`.dmg` (including Apple Developer ID signing/notarization env vars for public distribution) and Windows `.msi`/`.exe` builds.

```bash
git add README.md package.json scripts/extract-mushaf.mjs src/platform/tauri-adapter.ts src-tauri/icons
git commit -m "docs: finalize Ayat desktop/web packaging and usage guide"
```
