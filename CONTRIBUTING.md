# Panduan Kontribusi

Terima kasih atas minat Anda untuk berkontribusi pada Kafi.

## Sebelum memulai

- Untuk perubahan besar, buka [issue](https://github.com/jafoam/Kafi/issues/new/choose) terlebih dahulu agar pendekatannya dapat didiskusikan.
- Perubahan pada teks Al-Qur'an, tata letak mushaf, atau data rujukan harus dapat ditelusuri ke sumber yang tercantum di README dan lolos `npm run verify:mushaf`.

## Alur kerja

1. *Fork* repositori, lalu buat *branch* dari `main`:
   ```bash
   git switch -c feat/nama-fitur
   ```
2. Siapkan lingkungan pengembangan:
   ```bash
   npm install
   npm run fetch:fonts
   npm run dev
   ```
3. Pastikan pemeriksaan berikut lolos sebelum membuka *pull request*:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
4. Buka *pull request* ke `main` dan isi templatnya.

## Konvensi

- **Pesan commit** mengikuti [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `style:`, `test:`, `docs:`, `chore:`.
- **Nama branch** menggunakan awalan yang sama, misalnya `feat/…`, `fix/…`, `docs/…`.
- **Teks antarmuka** ditulis dalam Bahasa Indonesia.
- Sertakan tes untuk logika baru di `tests/`.
- Untuk perubahan tampilan, sertakan tangkapan layar ukuran ponsel dan desktop di *pull request*.

## Lisensi

Dengan mengirimkan kontribusi, Anda setuju bahwa kontribusi tersebut dirilis di bawah [GPL-3.0-or-later](LICENSE), sama seperti bagian lain proyek ini.
