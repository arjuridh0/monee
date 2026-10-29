# Monee

PWA pencatat keuangan pribadi berbahasa Indonesia dengan maskot interaktif. Data keuangan disimpan di IndexedDB pada browser dan origin yang sama; login email Cloudflare Access membatasi akses aplikasi, tanpa sinkronisasi antarperangkat. Mobile-first, responsif di tablet dan desktop.

## Menjalankan

Gunakan Node 22 (minimal 22.12) dan jalankan dari root proyek:

```powershell
npm.cmd ci
npm.cmd run dev
```

`npm run build` menghasilkan frontend di `dist/`; `npm run preview` membuka frontend saja. `npm run dev:worker` membangun frontend lalu menjalankan Worker lokal; `npm run deploy:check` memeriksa bundling deployment tanpa mempublikasikan; `npm run deploy` mempublikasikan build yang sudah dibuat. Untuk setup Access/secret lihat [deployment](docs/deployment.md). Perintah pemeriksaan tersedia: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:mascots`, serta setelah build `npm run test:e2e`, `npm run test:pwa`, `npm run test:voice:e2e`, dan `npm run benchmark`.

## Voice dan struk

Voice memakai **Groq `whisper-large-v3` melalui Cloudflare Worker**. Pemilik deployment memasang secret `GROQ_API_KEY` sekali di hosting serta konfigurasi Cloudflare Access. Pengguna cukup login lewat kode email yang diizinkan, membuka PIN lokal dan menyetujui pengiriman audio; tidak perlu akun Groq atau memasukkan API key. Browser mengirim rekaman maksimal 30 detik/10 MiB ke `/api/transcribe` pada origin yang sama. Worker memverifikasi sesi Access, membatasi request per pengguna, lalu meneruskan audio ke Groq. Teks diparsing secara deterministik di browser menjadi draft yang wajib diperiksa. Input teks/manual tetap tersedia. Pengujian layanan dengan secret hosting dan audio asli masih diperlukan.

Alur struk v1 menyiapkan pilih foto/kamera, review beberapa item dan penyimpanan transaksi, serta batas antarmuka provider. **Model/provider OCR belum dipilih dan pengenalan teks otomatis belum tersedia.** Foto hanya di memori sesi, tidak masuk ledger/backup dan belum diunggah. Pilihan pemrosesan model lokal atau cloud ditentukan kemudian; provider cloud memerlukan penjelasan serta persetujuan pengiriman foto.

## Struktur

- `src/`: aplikasi, finance engine, IndexedDB, keamanan, voice, struk, tema dan PWA.
- `server/index.ts` dan `wrangler.jsonc`: endpoint voice terotorisasi, secret/binding hosting serta Static Assets.
- `public/`: GLB teroptimasi, decoder Draco, font, ikon dan konfigurasi hosting.
- `mascots/`: engine Canvas 2.5D; `png/` dan `png2_5d/` dipertahankan untuk desain.
- `design/monee.pen`: sumber desain.
- `tools/studio/index.html`: studio aset; jalankan `python -m http.server 8765` dari root, lalu buka `/tools/studio/index.html`.
- `tests/` dan `tools/`: pengujian aktif serta tooling render/QA.

Maskot harian memakai Canvas 2.5D. Selector membuat snapshot WebP frontal dari GLB secara lazy, dengan fallback 2.5D dan daftar sederhana untuk reduced-motion. Sumber model tunggal ada di `public/mascots/3d/`.

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [01 Produk](docs/01-product-brief-prd.md) | Lingkup dan keputusan produk |
| [02 Alur](docs/02-ia-user-flow.md) | Navigasi dan perjalanan pengguna |
| [03 Interaksi](docs/03-ux-interaction.md) | Form, validasi dan perilaku UI |
| [04 Tema](docs/04-design-system-theme.md) | Token Warm Clay dan komponen |
| [05 Maskot](docs/05-mascot-asset-guide.md) | Karakter dan aset |
| [06 Selector](docs/06-carousel-selector.md) | Carousel dan preview tema |
| [07 Voice/OCR](docs/07-ai-features.md) | Provider, review dan privasi |
| [08 Data](docs/08-data-model.md) | Rumus dan kontrak ledger |
| [09 Arsitektur](docs/09-architecture-security.md) | Sistem, PWA dan keamanan |
| [10 QA](docs/10-qa-backlog.md) | Cakupan regresi dan backlog |
| [11 Implementasi aset](docs/11-asset-implementation-guide.md) | Engine, GLB dan tooling |
| [12 Desain](docs/12-uiux-design-gates.md) | Frame dan aturan desain aktif |
| [Deployment](docs/deployment.md) | Panduan dari GitHub sampai aplikasi berjalan: hosting, login email, key server, uji voice/PWA dan rollback |
| [Task](docs/task.md) | Status serta pekerjaan tersisa |

Cloudflare Worker dengan Static Assets menjadi sasaran hosting karena voice memerlukan endpoint server. Ledger tetap di IndexedDB; Supabase tidak diperlukan. Publikasi, instalasi OS/perangkat fisik, Groq nyata, dan pemilihan model OCR masih perlu diselesaikan; panduan deployment memuat langkahnya.
