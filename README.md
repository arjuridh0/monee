# Monee

PWA pencatat keuangan pribadi berbahasa Indonesia dengan maskot interaktif. Ledger akun disimpan di Cloudflare D1 dan disinkronkan ke cache IndexedDB per akun/perangkat. Alur akun baru memakai email dan PIN 6 digit; verifikasi Cloudflare hanya saat daftar, aktivasi akun lama, atau pemulihan PIN. Sesi diperpanjang oleh aktivitas pengguna dan berakhir setelah 30 hari tidak aktif. Kunci PIN perangkat merupakan pengaturan tambahan yang opsional. Aktifkan alur ini dengan migrasi D1 dan secret `AUTH_PIN_PEPPER` sesuai [deployment bagian 21](docs/deployment.md#21-akun-lintas-perangkat-dan-sesi-monee).

## Menjalankan

Gunakan Node 22.23.4 atau patch Node 22 yang lebih baru dan jalankan dari root proyek:

```powershell

npm.cmd ci

npm.cmd run dev

```

`npm run build` menghasilkan frontend di `dist/`; `npm run preview` membuka frontend saja. `npm run dev:worker` membangun frontend lalu menjalankan Worker lokal; `npm run deploy:check` memeriksa bundling deployment tanpa mempublikasikan; `npm run deploy` mempublikasikan build yang sudah dibuat. Untuk setup Access/secret lihat [deployment](docs/deployment.md). Perintah pemeriksaan tersedia: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:mascots`, serta setelah build `npm run test:e2e`, `npm run test:pwa`, `npm run test:voice:e2e`, dan `npm run benchmark`.

## Pasang sebagai aplikasi

Setelah login dan pengaturan pertama selesai, Monee menampilkan ajakan pasang ketika browser menawarkan pemasangan. Tombol **Pasang** membuka dialog browser setelah ditekan. Ajakan tidak menutupi navbar atau formulir; **Nanti** menyembunyikannya selama 7 hari di browser itu. Pemasangan manual tetap tersedia di **Atur → Aplikasi dan penyimpanan**.

Di Safari iPhone/iPad, **Cara pasang** menjelaskan menu **Bagikan → Tambah ke Layar Utama**. Ajakan disembunyikan saat Monee sudah dibuka sebagai aplikasi atau browser mengirim konfirmasi pemasangan. Browser menentukan kapan pemasangan otomatis tersedia; lihat [kriteria pemasangan Chrome](https://web.dev/articles/install-criteria). Pengujian event terkontrol dan emulasi iPhone tidak membuktikan instalasi OS pada perangkat fisik.

## Voice dan struk

Voice memakai **Groq `whisper-large-v3` melalui Cloudflare Worker**. Pemilik deployment memasang secret `GROQ_API_KEY`; Worker memverifikasi sesi Monee dan membatasi request per akun sebelum meneruskan audio ke Groq. Catat membuka layar suara; ketuk ikon mikrofon untuk mulai merekam. Tidak ada checkbox; keterangan pengiriman audio tetap terlihat. Browser mengirim rekaman maksimal 30 detik/10 MiB ke `/api/transcribe`. Teks diparsing secara deterministik menjadi draft yang wajib diperiksa. Input teks/manual tetap tersedia.

Struk memakai **Google Gemini `gemini-3.5-flash-lite` melalui Worker `/api/receipt`** setelah pemilik memasang secret `GEMINI_API_KEY`. Foto JPEG/PNG/WebP maksimal 10 MB hanya dikirim setelah menekan Baca otomatis; memilih foto tidak mengunggahnya. Item hasil OCR wajib diperiksa dan dipilih bucket-nya sebelum disimpan; input manual tetap tersedia. Foto tidak masuk ledger/backup Monee. Kebijakan data Google mengikuti paket API yang dipakai. Petunjuk pemasangan ada di [deployment bagian 8.10](docs/deployment.md#810-aktifkan-ocr-google-gemini-opsional). Akurasi provider nyata masih memerlukan pengujian dengan key pemilik.

## Struktur

- `src/`: aplikasi, finance engine, IndexedDB, keamanan, voice, struk, tema dan PWA.

- `server/index.ts`, `server/accounts.ts`, dan `wrangler.jsonc`: autentikasi sesi, API ledger D1, voice/OCR, secret dan Static Assets.

- `migrations/`: skema D1 untuk akun, sesi, ledger tersinkron, dan idempotensi operasi.

- `public/`: font lokal, ikon aplikasi/PWA dan konfigurasi hosting.
- `mascots/`: engine Canvas 2.5D; `png/` dan `png2_5d/` dipertahankan untuk desain.

- `design/monee.pen`: sumber desain.

- `tools/studio/index.html`: studio aset; jalankan `python -m http.server 8765` dari root, lalu buka `/tools/studio/index.html`.

- `tests/` dan `tools/`: pengujian aktif serta tooling render/QA.

Semua maskot, termasuk pemilih tema, memakai Canvas 2.5D. Carousel berputar tanpa ujung melalui tombol, keyboard, roda gulir, atau swipe. Model GLB, decoder Draco dan dependensi Three.js telah dihapus.

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

| [11 Implementasi aset](docs/11-asset-implementation-guide.md) | Engine Canvas 2.5D dan tooling |
| [12 Desain](docs/12-uiux-design-gates.md) | Frame dan aturan desain aktif |

| [Deployment](docs/deployment.md) | Panduan dari GitHub sampai aplikasi berjalan: hosting, login email, key server, uji voice/PWA dan rollback |

| [Task](docs/task.md) | Status serta pekerjaan tersisa |

Cloudflare Worker menyajikan Static Assets dan API akun/AI. Cloudflare D1 menyimpan ledger akun yang tersinkron antarperangkat; IndexedDB menyimpan cache per akun dan antrean perubahan offline. Hasil pemeriksaan produksi dicatat di laporan lokal. Pengujian perangkat fisik dan akurasi audio/struk asli perlu dibedakan dari tes otomatis yang memakai data sintetis; panduan deployment memuat langkahnya.


## Laporan dan kebersihan proyek

Hanya satu laporan lokal: `LOCAL_REPORT.md`, diabaikan Git. Perintah E2E aplikasi, PWA, voice dan benchmark memperbarui bagian hasil masing-masing di file yang sama. Hasil lama dari suite yang sama diganti; screenshot dan JSON QA tidak disimpan otomatis. Pemeriksaan tetap berjalan di browser dengan profil sementara dan data sintetis. Tes backup menggunakan buffer memori.

Untuk pemeriksaan lengkap, jalankan berurutan:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:mascots
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:pwa
npm.cmd run test:voice:e2e
npm.cmd run benchmark
```

`dist/`, cache Vite, `*.tsbuildinfo`, dan artefak QA lama dapat dibuat ulang. Jangan menghapus profil browser pengguna, IndexedDB, `.wrangler/state`, file credential atau backup pemulihan untuk menghemat ruang. Profil browser QA yang diketahui asalnya di `.local/` boleh dibersihkan setelah proses pengujiannya berhenti. Dump data, kredensial dan keluaran diagnostik tetap di-ignore; `migrations/*.sql` dan template `.dev.vars.example` tanpa nilai rahasia tetap masuk Git. `design/monee.pen` dan PNG referensi adalah sumber desain, bukan cache aplikasi. Dokumentasi inti tetap di `docs/`; hasil audit harian tidak dibuat menjadi dokumen terpisah. Laporan lokal bisa berisi jejak error; periksa isinya sebelum membagikan.
