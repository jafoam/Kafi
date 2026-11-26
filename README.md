# Kafi

**Kafi** adalah aplikasi pembaca **Mushaf Madinah (15 baris)** dan **Tasmi'** (koreksi hafalan Al-Qur'an secara real-time dan offline-capable) berbasis web (PWA), dengan target deployment utama di **Cloudflare Pages** (ukuran build web di bawah 25 MB). Aplikasi desktop native (Tauri v2) disiapkan menyusul setelah rilis web stabil.

## Fitur Utama

- **Mushaf Madinah 15 Baris** — tampilan 1 atau 2 halaman (otomatis/manual), mode fokus, tema Terang / Sepia / Malam, serta navigasi cepat Surah, Juz, Halaman, dan pencarian teks Arab (`⌘K` / `Ctrl+K`).
- **Tasmi' & Pelacakan Bacaan Real-Time** — pengenalan bacaan Al-Qur'an langsung di browser menggunakan model streaming on-device (`@tilawa/core` + ONNX Runtime WebGPU/WASM), lengkap dengan Hifz Blur (sembunyikan ayat) dan ringkasan riwayat Tasmi'.
- **Murottal, Terjemahan & Tafsir** — pemutar audio per ayat dengan pengulangan dan kecepatan, terjemahan Indonesia & Inggris, Tafsir Kemenag RI serta tafsir klasik, plus bookmark, highlight, dan catatan pribadi yang tersimpan lokal.
- **PWA Offline-Ready** — Service Worker + Cache API + IndexedDB untuk menyimpan halaman mushaf, audio, terjemahan, tafsir, dan model Tasmi' secara lokal.

---

## Pengembangan & Build Web (Cloudflare Pages)

### Prasyarat

- **Node.js** 20+ dan `npm`

### Jalankan Lokal

```bash
npm install
npm run dev
```

Jika ingin menguji halaman Mushaf secara lokal tanpa CDN eksternal, ekstrak aset dari `Quranflash.pkg` atau `/Applications/Quranflash.app`:

```bash
npm run extract:mushaf
```

Perintah tersebut mengekstrak 604 halaman Mushaf Madinah ke `public/mushaf/pages/` (gitignored) serta menghasilkan `src/data/mushaf-map.json` dan `src/data/catalog.json`.

### Build & Deploy ke Cloudflare Pages (< 25 MB)

Build produksi web dirancang agar **seluruh output `dist/` (~6.6 MB) dan setiap file individual berada jauh di bawah batas 25 MiB Cloudflare Pages**:

- **ONNX Runtime WASM** (27 MB mentah) dikirim sebagai `dist/ort/*.wasm.gz` (~6,6 MB, di bawah batas 25 MiB). Aplikasi mengunduh dan membukanya di browser (`src/services/ort-wasm.ts`) lalu memberikannya ke ONNX Runtime; bila gagal, `@tilawa/core` memuat dari CDN `tilawa.dev`. `VITE_ORT_WASM_PATH` tetap bisa dipakai untuk self-host di R2/CDN. Service worker menyimpan file ini (cache-first) sehingga hanya diunduh sekali, dan model Tasmi' diminta `navigator.storage.persist()` agar tidak dihapus browser.
- **Halaman Mushaf** (`001.gif`–`604.gif`) tidak masuk repositori dan disajikan melalui `VITE_MUSHAF_BASE_URL` (misalnya Cloudflare R2 atau CDN statis dengan header CORS).

```bash
# Build produksi untuk Cloudflare Pages
VITE_MUSHAF_BASE_URL="https://cdn.example.com/mushaf/pages" npm run build
```

Konfigurasi di **Cloudflare Pages**:
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variable:** `VITE_MUSHAF_BASE_URL=https://<bucket-atau-cdn-anda>/mushaf/pages`

> Pastikan host aset Mushaf mematuhi ketentuan atribusi **King Fahd Glorious Qur'an Printing Complex (KFGQPC)** dan mengirimkan header CORS agar dapat di-cache oleh Service Worker.

### Deploy otomatis (GitHub Actions)

Setiap push ke `main` menjalankan [`deploy-web.yml`](.github/workflows/deploy-web.yml): typecheck, tes, build, lalu `wrangler pages deploy` ke proyek Pages `kafi`. Job memakai environment GitHub `cloudflare`; tambahkan di **Settings → Environments → cloudflare** (atau secret level repo):

- Secret `CLOUDFLARE_API_TOKEN` (izin *Cloudflare Pages: Edit*) dan `CLOUDFLARE_ACCOUNT_ID`.
- Variable opsional `VITE_MUSHAF_BASE_URL` dan `VITE_ORT_WASM_PATH`.

### Pengujian & Type Check

```bash
npm test
npm run typecheck
```

---

## Aplikasi Desktop (Tahap Berikutnya)

Kode fondasi desktop native (macOS & Windows) menggunakan **Tauri v2** sudah tersedia di `src-tauri/`, namun fokus pengembangan saat ini adalah versi **Web**. Panduan build desktop akan dilengkapi setelah rilis web.

---

## Tech Stack

| Lapisan | Teknologi |
| --- | --- |
| Frontend & UI | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/) |
| Speech / Tasmi' Engine | [`@tilawa/core`](https://tilawa.dev/) (WebGPU / WASM streaming inference) |
| ML Runtime | [ONNX Runtime Web](https://onnxruntime.ai/) (`onnxruntime-web`) |
| Offline & Storage | Service Worker, Cache API, IndexedDB, Web Audio API (`AudioWorklet`) |
| Testing | [Vitest](https://vitest.dev/), [jsdom](https://github.com/jsdom/jsdom) |
| Hosting Web | [Cloudflare Pages](https://pages.cloudflare.com/) |
| Desktop (Upcoming) | [Tauri v2](https://v2.tauri.app/) & [Rust](https://www.rust-lang.org/) |

---

## Acknowledgements & Sumber Data

Kafi dibangun di atas kerja keras komunitas open-source dan lembaga penyedia data Al-Qur'an. Terima kasih sebesar-besarnya kepada:

### Engine Tasmi' & Model AI
- **[Tilawa (`tilawa.dev`)](https://tilawa.dev/)** (`@tilawa/core`, MIT) — engine pengenalan bacaan dan koreksi hafalan Al-Qur'an on-device, beserta hosting CDN untuk model `spliced-clean` / `spliced-clean-lite` (CC BY 4.0) dan runtime ONNX.
- **[Tarteel — `tlog`](https://huggingface.co/datasets/tarteel-ai/tlog)** (CC-BY) — dataset audio pelatihan & evaluasi di balik model Tilawa.
- **[QUD Technologies — Quranic Universal Ayahs](https://huggingface.co/datasets/QUD-Technologies/quranic-universal-ayahs)** (CC-BY) — dataset audio dan benchmark alignment Al-Qur'an.
- **[Muaalem (`obadx/muaalem-model-v3_2`)](https://huggingface.co/obadx/muaalem-model-v3_2)** & **[`quran-transcript`](https://github.com/obadx/quran-transcript)** (MIT) — model guru, inventaris fonem, dan fonemisasi referensi.
- **[k2-fsa Icefall](https://github.com/k2-fsa/icefall)** (Apache-2.0) — arsitektur streaming Zipformer dan pipeline ekspor ONNX.
- **[ONNX Runtime](https://github.com/microsoft/onnxruntime)** (MIT) — mesin inferensi WebGPU & WASM di browser.

### Teks, Mushaf, Terjemahan, Tafsir & Audio
- **[King Fahd Glorious Qur'an Printing Complex (KFGQPC)](https://qurancomplex.gov.sa/)** — halaman Mushaf Madinah 15 baris.
- **[Tanzil (`tanzil.net`)](https://tanzil.net/)** — teks Al-Qur'an Utsmani sebagai referensi pencarian dan pencocokan bacaan.
- **[Quran.com API v4 (`api.quran.com`)](https://api-docs.quran.com/)** — terjemahan (Kemenag RI, Kompleks Raja Fahd, The Sabiq Company, Saheeh International, M.A.S. Abdel Haleem, A. Yusuf Ali, Transliterasi) dan tafsir (Al-Muyassar, Ibn Kathir, Al-Tabari, Al-Qurtubi, Al-Sa'di).
- **[eQuran.id (`equran.id`)](https://equran.id/)** — API Tafsir Kemenag RI berbahasa Indonesia.
- **[EveryAyah (`everyayah.com`)](https://everyayah.com/)** — audio murottal per ayat dari para qari (Mishary Alafasy, Al-Husary, Abdul Basit, Al-Minshawy, As-Sudais, Al-Ghamdi, Al-Muaiqly, Al-Shuraim, Al-Shatri, Hani Ar-Rifai).
