<div align="center">

<img src="public/icons/icon-192.png" width="96" height="96" alt="Kafi">

# Kafi

Pembaca Mushaf Madinah 15 baris dan pendamping hafalan Al-Qur'an dengan Tasmi' yang berjalan langsung di perangkat.

[![Deploy web](https://github.com/jafoam/Kafi/actions/workflows/deploy-web.yml/badge.svg)](https://github.com/jafoam/Kafi/actions/workflows/deploy-web.yml)
[![Rilis](https://img.shields.io/github/v/release/jafoam/Kafi?include_prereleases&label=rilis)](https://github.com/jafoam/Kafi/releases)
![Platform](https://img.shields.io/badge/platform-Web%20%C2%B7%20Android%20%C2%B7%20macOS-informational)
[![Lisensi: GPL-3.0](https://img.shields.io/badge/lisensi-GPL--3.0-blue)](LICENSE)

[Buka versi web](https://kafi.zudd.in) · [Unduh APK Android](https://github.com/jafoam/Kafi/releases) · [Laporkan masalah](https://github.com/jafoam/Kafi/issues/new/choose)

</div>

> [!NOTE]
> Kafi masih dalam tahap **alpha**. Fitur dan format data masih dapat berubah antarversi.

## Fitur

**Mushaf**
- Mushaf Madinah 15 baris (cetakan 1405 dan 1441) yang dirender dari font glyph QCF, tajam di semua ukuran layar.
- Mode satu halaman, dua halaman, dan gulir; tema Terang, Sepia, dan Malam; mode fokus.
- Pewarnaan tajwid opsional beserta panduan hukumnya.
- Navigasi cepat per surah, juz, dan halaman, serta pencarian teks Arab (`⌘K` / `Ctrl+K`).

**Tasmi' dan hafalan**
- Pengenalan bacaan secara langsung dengan model streaming on-device ([`@tilawa/core`](https://tilawa.dev/), ONNX Runtime WebGPU/WASM). Audio tidak dikirim ke server.
- Penanda kesalahan per kata, Hifz Blur untuk menyembunyikan ayat, latihan ulang kesalahan, dan riwayat sesi.
- Uji Acak berdasarkan rentang juz atau surah, serta jadwal muraja'ah berbasis *spaced repetition*.

**Murottal, terjemahan, dan tafsir**
- Audio per ayat dari sepuluh qari dengan transisi tanpa jeda, pengulangan, pengaturan kecepatan, dan mode talaqqi.
- Terjemahan Indonesia dan Inggris, terjemahan per kata, Tafsir Kemenag RI, dan tafsir klasik.
- Bookmark, highlight, dan catatan pribadi, dengan sinkronisasi terenkripsi antarperangkat yang bersifat opsional.

**Offline**
- Halaman mushaf, audio, terjemahan, tafsir, dan model Tasmi' dapat disimpan untuk dipakai tanpa koneksi.

## Platform

| Platform | Status | Cara memasang |
| --- | --- | --- |
| Web (PWA) | Tersedia | Buka [kafi.zudd.in](https://kafi.zudd.in), lalu pasang dari menu browser |
| Android 7.0+ (arm64) | Alpha | Unduh APK dari [Releases](https://github.com/jafoam/Kafi/releases) |
| macOS | Dalam pengembangan | Build dari sumber (lihat di bawah) |
| Windows | Direncanakan | — |

> [!IMPORTANT]
> Pada iPhone, versi web yang dipasang ke Home Screen belum dapat memutar audio murottal. Gunakan Safari secara langsung untuk sementara.

## Memulai pengembangan

Prasyarat: **Node.js 20+** dan npm.

```bash
git clone https://github.com/jafoam/Kafi.git
cd Kafi
npm install
npm run fetch:fonts   # unduh 604 font halaman QCF (±47 MB, tidak disimpan di repositori)
npm run dev
```

Aplikasi berjalan di `http://localhost:5173`.

### Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan Vite |
| `npm run build` | Build produksi ke `dist/` |
| `npm test` | Menjalankan seluruh tes (Vitest) |
| `npm run typecheck` | Pemeriksaan tipe TypeScript |
| `npm run verify:mushaf` | Mencocokkan data mushaf offline dengan rujukan Tanzil |
| `npm run fetch:fonts` | Mengunduh font halaman QCF v1 |
| `npm run fetch:pages`, `fetch:pages-v2`, `fetch:words` | Membangun ulang data halaman dan terjemahan per kata dari Quran.com API |
| `npm run android:build` | Build APK Android |

### Variabel lingkungan

Semua bersifat opsional.

| Variabel | Fungsi |
| --- | --- |
| `VITE_MUSHAF_BASE_URL` | Lokasi gambar halaman mushaf di CDN (misalnya Cloudflare R2) |
| `VITE_ORT_WASM_PATH` | Lokasi runtime ONNX WASM jika di-*host* sendiri |
| `VITE_SYNC_URL` | Alamat layanan sinkronisasi (`sync-worker/`) |

### Struktur proyek

```
src/
  components/   Komponen antarmuka (mushaf, dock audio, Tasmi', panel)
  services/     Logika inti: audio, Tasmi', sinkronisasi, unduhan, pencarian
  platform/     Adapter penyimpanan untuk web dan Tauri
  data/         Data mushaf, katalog surah, dan daftar sumber
public/         Service worker, manifest PWA, ikon
src-tauri/      Aplikasi native (Tauri v2, Rust) untuk Android dan desktop
sync-worker/    Cloudflare Worker untuk sinkronisasi terenkripsi
scripts/        Skrip pengambilan dan verifikasi data
tests/          Tes unit dan integrasi
```

## Pengujian

```bash
npm test
npm run typecheck
```

`npm run verify:mushaf` memeriksa bahwa 6.236 ayat pada data mushaf offline muncul lengkap, tepat sekali, dan berurutan; bahwa jumlah kata setiap ayat sesuai rujukan Tanzil; bahwa setiap halaman cetakan 1405 dimulai dari ayat yang benar; dan bahwa setiap glyph tergambar pada font halamannya. Pemeriksaan yang sama juga berjalan di `npm test`. Tambahkan `--refresh` untuk mengunduh ulang data rujukan.

Pemeriksaan ini tidak memverifikasi bentuk huruf dan harakat di dalam glyph (bergantung pada font Kompleks Raja Fahd) maupun pewarnaan tajwid.

## Deployment

### Web (Cloudflare Pages)

Setiap *push* ke `main` menjalankan [`deploy-web.yml`](.github/workflows/deploy-web.yml): typecheck, tes, build, lalu `wrangler pages deploy` ke proyek Pages `kafi`.

Konfigurasi yang dibutuhkan pada environment GitHub `cloudflare`:
- Secret `CLOUDFLARE_API_TOKEN` (izin *Cloudflare Pages: Edit*) dan `CLOUDFLARE_ACCOUNT_ID`.
- Variable opsional `VITE_MUSHAF_BASE_URL`, `VITE_ORT_WASM_PATH`, dan `VITE_SYNC_URL`.

Runtime ONNX WASM (±27 MB) dikirim dalam bentuk terkompresi (`dist/ort/*.wasm.gz`, ±6,6 MB) agar setiap file tetap di bawah batas 25 MiB Cloudflare Pages, lalu dibuka di browser oleh `src/services/ort-wasm.ts`.

### Android

Build tanpa SDK lokal: jalankan workflow [**Build Android APK**](.github/workflows/build-android.yml) dari tab **Actions**, lalu unduh artefaknya.

Build lokal membutuhkan **JDK 17**, **Android SDK dan NDK** (`ANDROID_HOME`, `NDK_HOME`), dan target Rust Android:

```bash
rustup target add aarch64-linux-android
npm run fetch:fonts
npm run android:init
npm run android:build    # APK
npm run android:aab      # Android App Bundle
```

Identitas aplikasi: `com.zuddin.kafi`, `minSdkVersion 24`. Audio yang diunduh disimpan melalui `PlatformAdapter` (`cache_put` di Rust menulis ke `app_data_dir/cache/audio/`), sehingga jalur penyimpanannya sama di web, desktop, dan Android.

### Sinkronisasi

`sync-worker/` adalah Cloudflare Worker yang menyimpan data pengguna di Workers KV. Data dienkripsi di perangkat dengan AES-GCM menggunakan kunci yang diturunkan dari kode sinkronisasi pengguna, sehingga server hanya menerima data terenkripsi dan tidak pernah menerima kode tersebut.

```bash
cd sync-worker
npx wrangler deploy
```

## Kontribusi

Laporan bug dan usulan fitur dapat diajukan melalui [Issues](https://github.com/jafoam/Kafi/issues/new/choose). Untuk kontribusi kode, baca [CONTRIBUTING.md](CONTRIBUTING.md) terlebih dahulu.

## Sumber data dan atribusi

Daftar ini juga tersedia di aplikasi melalui menu ☰ → **Tentang & Sumber Data** (`src/data/acknowledgements.ts`).

### Mushaf dan teks
- **[Kompleks Percetakan Al-Qur'an Raja Fahd (KFGQPC)](https://qurancomplex.gov.sa/)**: halaman Mushaf Madinah 15 baris dan font glyph QCF.
- **[Quran.com API v4](https://api-docs.quran.com/)**: tata letak halaman, font QCF v1 dan font tajwid, terjemahan (Kemenag RI, Kompleks Raja Fahd, The Sabiq Company, Saheeh International, M.A.S. Abdel Haleem, A. Yusuf Ali, transliterasi), terjemahan per kata, dan tafsir (Al-Muyassar, Ibnu Katsir, Ath-Thabari, Al-Qurthubi, As-Sa'di).
- **[Tanzil](https://tanzil.net/)** (CC BY 3.0): teks Utsmani untuk pencarian dan Tasmi', serta data rujukan untuk `verify:mushaf`.
- **[eQuran.id](https://equran.id/)**: Tafsir Kemenag RI berbahasa Indonesia.
- **[Tafsir API](https://github.com/spa5k/tafsir_api)**: Tafsir As-Sa'di dan Al-Mukhtashar berbahasa Indonesia.
- **[Amiri](https://github.com/aliftype/amiri)** (SIL OFL 1.1): glyph basmalah dan nama surah, di-*subset* dan disertakan bersama lisensinya di `src/assets/fonts/`.

### Murottal
- **[EveryAyah](https://everyayah.com/)**: audio per ayat dari Mishary Alafasy, Mahmoud Khalil Al-Husary, Abdul Basit, Muhammad Siddiq Al-Minshawi, Abdurrahman As-Sudais, Saad Al-Ghamdi, Maher Al-Muaiqly, Saud Ash-Shuraim, Abu Bakr Ash-Shatri, dan Hani Ar-Rifai.

### Tasmi' dan model
- **[Tilawa](https://tilawa.dev/)** (`@tilawa/core`, MIT): engine pengenalan bacaan on-device beserta model `spliced-clean` (CC BY 4.0).
- **[Tarteel `tlog`](https://huggingface.co/datasets/tarteel-ai/tlog)** (CC BY) dan **[QUD Technologies Quranic Universal Ayahs](https://huggingface.co/datasets/QUD-Technologies/quranic-universal-ayahs)** (CC BY): dataset audio pelatihan dan evaluasi.
- **[Muaalem](https://huggingface.co/obadx/muaalem-model-v3_2)** dan **[`quran-transcript`](https://github.com/obadx/quran-transcript)** (MIT): model guru dan fonemisasi rujukan.
- **[k2-fsa Icefall](https://github.com/k2-fsa/icefall)** (Apache-2.0): arsitektur streaming Zipformer.
- **[ONNX Runtime](https://github.com/microsoft/onnxruntime)** (MIT): inferensi WebGPU dan WASM di browser.

## Lisensi

Kode sumber Kafi dirilis di bawah [GNU General Public License v3.0](LICENSE) atau versi yang lebih baru. Anda bebas menggunakan, mempelajari, mengubah, dan mendistribusikan ulang Kafi, dengan syarat setiap karya turunan yang didistribusikan juga dirilis beserta kode sumbernya di bawah lisensi yang sama.

Lisensi ini hanya berlaku untuk kode Kafi. Teks Al-Qur'an, font mushaf, terjemahan, tafsir, audio murottal, dan model Tasmi' tetap tunduk pada ketentuan masing-masing sumber yang tercantum pada bagian [Sumber data dan atribusi](#sumber-data-dan-atribusi).
