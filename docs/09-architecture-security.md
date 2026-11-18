# 09 — Technical Architecture & Security

> Mobile-first dengan tablet/laptop/desktop responsif. Voice memakai Groq dan struk memakai Gemini melalui Worker dengan secret hosting. Pengiriman dimulai dengan tindakan rekam/baca eksplisit tanpa checkbox; sesi akun Monee, validasi server dan review hasil tetap wajib.

## 1. Stack (final)

| Layer | Pilihan | Alasan |
|---|---|---|
| App shell | **React 18 + Vite + TypeScript** (strict) | PWA matang, ecosystem animasi, type safety (TypeScript strict) |
| PWA | **vite-plugin-pwa** (Workbox) | Service worker, installable, offline cache |
| UI | Tailwind CSS + komponen custom + **ReactBits** (FlipCard, CodeSlots, RubberSegment, FuseButton) | Cepat, token-driven (design system dok 04); ReactBits untuk interaksi finance yang khas |
| Animasi | **motion** (framer-motion v12) | Sheet, spring, micro-interaction; juga dependensi ReactBits |
| Ikon | **Lucide React** | Satu set ikon konsisten; menggantikan hugeicons di ReactBits |
| Data perangkat | **IndexedDB** via wrapper ringan (idb ±2KB) | Cache akun, PIN lokal, dan antrean kerja offline |
| Ledger akun | **Cloudflare D1** melalui Worker dan sesi akun | Sumber data tersinkron antarperangkat |
| State | **Zustand** (+ derived selectors) | Ringan; derived finance state = pure functions terpisah (testable) |
| STT | **Groq Whisper-large-v3** melalui Worker `/api/transcribe` | Secret pemilik hanya di server; pengguna tidak memasukkan key |
| OCR | **Gemini 3.5 Flash-Lite** melalui Worker `/api/receipt` | Foto dikirim setelah Baca otomatis; respons JSON divalidasi dan direview sebelum masuk ledger |
| Selector maskot | **Canvas 2.5D** + carousel CSS | Tiga canvas memakai engine yang sama, tanpa model 3D atau decoder |
| 2.5D Maskot | **Canvas 2D** (`mascots/` engine procedural) | Dashboard maskot ngintip — ringan, tidak butuh WebGL |
| Chart | SVG custom ringan (tanpa lib berat) | Hanya 2 chart v1 — pakai lib besar = overkill |
| Testing | **Vitest** (unit) + Playwright (E2E smoke) | Aturan #14: deterministic & testable; TDD red→green di finance engine |
| Deploy | Cloudflare Worker + Static Assets `./dist` | SPA dan API satu origin; Access melindungi bootstrap, sesi akun melindungi API |

**Batas sistem:** Cloudflare Access memvalidasi email saat daftar, aktivasi atau pemulihan melalui bootstrap; Worker mengelola sesi Monee dan seluruh akses API ledger. D1 menyimpan ledger bersama, sedangkan IndexedDB menyimpan cache terisolasi per akun dan antrean offline. Parser voice tetap rule-based lokal; Gemini hanya dipakai untuk ekstraksi struk. Chart tetap SVG ringan. Kategori lama dipertahankan pada model/backup, sementara input dan grafik pengguna memakai bucket.

## 2. Arsitektur Aplikasi

```text
monee/
|-- public/                   # fonts, icons, favicon, hosting headers
|-- mascots/                  # Canvas engine and source mockups for design
|-- design/monee.pen          # active design source
|-- server/                   # account/PIN/sync APIs and protected AI endpoints
|-- migrations/               # versioned D1 schema, not a data backup
|-- wrangler.jsonc            # assets, rate limiter and deployment
|-- src/
|   |-- app/                  # session, routes, dev-only UI playground
|   |-- components/
|   |   |-- charts/           # native SVG finance charts
|   |   |-- layout/           # responsive workspace and analytics
|   |   |-- navigation/       # bottom nav / sidebar via RootNav
|   |   |-- reactbits/        # app adaptations and license/provenance
|   |   `-- ui/               # controls, Dialog, feedback
|   |-- features/
|   |   |-- onboarding/
|   |   |-- transactions/     # Quick-Add and guarded persistence
|   |   |-- savings/
|   |   |-- history/
|   |   |-- settings/         # buckets, allocation, periods, backup, recurring income
|   |   |-- security/         # PIN UI and session lifecycle
|   |   |-- mascot/           # canvas wrapper, events, looping selector
|   |   |-- voice/            # explicit capture, parser, local draft review
|   |   `-- ocr/              # receipt input/review, recognizer contract, atomic persistence
|   |-- core/
|   |   |-- finance/          # pure calculations and guards
|   |   |-- db/               # schema, repositories, migrations, change notifications
|   |   |-- security/         # PIN hash and lockout
|   |   |-- http/             # same-origin service readiness
|   |   `-- stt/              # same-origin transcription client
|   |-- hooks/
|   |-- store/
|   |-- pwa/
|   |-- types/
|   `-- theme/
|-- tests/                    # finance, db, security, voice, ocr, ui, theme, setup
`-- tools/                    # active QA, benchmark, renderer and one asset studio
```

**Prinsip:** semua logika uang hidup di `core/finance` sebagai **pure functions** (input: transactions+config → output: derived state). UI hanya render. Ini yang membuat semua deterministic & bisa dites jutaan skenario dalam milidetik.

## 3. Data Flow

```
UI action → repository (idb) → data mentah tersimpan
          → finance engine recompute (pure) → Zustand store update → UI render
Voice    → MediaRecorder (browser) → Blob
         -> POST /api/transcribe -> Monee session/rate limit -> Groq (server secret)
         → teks → parser (pure, offline) → draft → review UI → save (jalur normal)
```

- Finance snapshot dihitung ulang dari data mentah yang konsisten; pemilihan lima transaksi terbaru tidak mengurutkan seluruh histori.
- Engine Canvas dan dialog suara/struk dimuat sesuai kebutuhan. Tidak ada runtime Three.js.

### Konsistensi data dan sesi

- `core/db/close-periods.ts` membaca profil, ledger, bucket, dan sweep terbaru serta membuat sweep yang belum ada dalam satu transaksi `readwrite`. Unique index period key tetap menjadi perlindungan tambahan; penutupan yang sudah selesai bersifat no-op.
- Cache Zustand dibangun dari snapshot IndexedDB yang konsisten lintas store. Guard penulisan membaca data di dalam transaksi; cache UI tidak menentukan izin outflow.
- Preferensi nama/maskot/format memakai mutasi field dengan pemeriksaan stale, sehingga penyimpanan preferensi tidak menulis kembali kredensial lama. Unlock membaca profil/PIN terbaru; restore/reset dan perubahan data menginvalidasi sesi/cache terkait.
- `core/db/changes.ts` hanya mengirim token revisi melalui event storage untuk refresh tab lain. Kredensial dan ledger tetap di IndexedDB. Foreground/unlock dan pergantian hari WIB memicu pemeriksaan periode serta refresh.
- Konfigurasi awal periode prospektif disimpan sebagai `Profile.periodChanges`; key sweep historis tidak ditulis ulang. Detail tabungan menjaga koreksi `goal-use:<id>` dan `Goal.usedAt` dalam transaksi yang sama. Kontrak lengkap pada dok 08.

## 4. PWA & Offline

- **Precache:** Workbox menyimpan app shell JS/CSS/HTML, ikon, favicon dan font lokal. Offline membutuhkan satu kunjungan online hingga service worker aktif dan cache selesai; bukan jaminan pada kunjungan pertama yang sudah offline.
- **Aset pensiun:** model GLB dan decoder Draco sudah dihapus. `src/pwa/retired-assets.ts` hanya membersihkan cache model lama; tidak menghapus cache ledger atau penyimpanan lain.
- **Install:** `PwaInstallPrompt` menawarkan pemasangan ketika browser mendukung, sedangkan `PwaControls` menyediakan pengaturan tambahan. iPhone/iPad mendapat panduan manual. Instalasi native memerlukan tindakan pengguna dan dukungannya berbeda antarbrowser.
- **Update:** registrasi `prompt`; versi baru menawarkan Perbarui sekarang/Nanti. Penerapan dan reload terjadi setelah pengguna memilih memperbarui, agar formulir yang belum selesai tidak tertimpa reload otomatis.
- **Penyimpanan:** `navigator.storage.persist()` diminta lewat aksi pengguna dan hasil browser ditampilkan. Persistent storage tidak menggantikan backup dan tidak melindungi dari penghapusan data browser oleh pengguna.
- **Versi:** `package.json` adalah sumber tunggal, diekspor `src/app/version.ts` dan dipakai UI serta metadata HTML hasil build. Versi dokumen tidak dianggap versi paket.
- **Voice:** MediaRecorder -> Worker -> Groq -> parser lokal -> review. Input teks/manual tetap offline; layanan nyata dan perangkat mengikuti [task](task.md).

## 5. Security & Privacy

### PIN akun dan kunci perangkat

Alur akun terbaru: email + PIN akun 6 digit di Worker; daftar/aktivasi/pemulihan memakai verifikasi Access satu kali. D1 menyimpan email terverifikasi, hash PBKDF2-SHA256 100.000 iterasi dengan salt unik dan HMAC pepper rahasia. Kredensial tidak masuk sinkronisasi ledger. Batas gagal per akun dan IP persisten di D1; lima kegagalan memicu jeda 15 menit. Sesi hanya diperpanjang oleh aktivitas eksplisit, bukan polling. Perubahan/pemulihan PIN mencabut seluruh sesi sebelumnya. Lihat deployment bagian 21 untuk cutover dan keterbatasan keamanan PIN pendek.

Keterangan berikut hanya mengenai **kunci perangkat opsional**, bukan PIN akun:
- 6 digit, disimpan sebagai **SHA-256 + salt** (bukan plain) di IndexedDB.
- PIN mengunci tampilan aplikasi, tidak mengenkripsi ledger IndexedDB. Kunci perangkat dan backup terenkripsi tetap diperlukan untuk perlindungan data lokal; pembatasan PIN antarmuka tidak melindungi penyimpanan yang sudah dapat dibaca penyerang.
- Lock otomatis saat app dibuka dari background ≥5 menit.
- Salah 3× → delay progresif 5s/15s/60s.
- State lockout `{ attempts, lockedUntil }` disimpan di IndexedDB dan **bertahan lintas reload/restart**. Reset hanya setelah PIN benar. Jangan simpan di memori saja.
- **Tanpa pemulihan v1** (keputusan user: "tanpa dulu") → layar peringatan keras saat set PIN + reminder export. Tercatat sebagai risiko yang disadari user.

### Data
- Ledger akun disimpan di D1 dan dicache dalam IndexedDB per akun/per perangkat. Worker tidak mencatat record ledger ke log aplikasi.
- Hash/salt kunci perangkat tidak disinkronkan sebagai ledger; PIN akun dikirim melalui HTTPS ke Worker untuk diverifikasi dan hanya disimpan sebagai hash berpepper. PIN mengunci tampilan perangkat, bukan mengenkripsi cache IndexedDB.
- Operasi sync memakai revisi per record, ID operasi idempoten, cursor berurutan, isolasi account_id, batas payload, allowlist field, dan review konflik eksplisit.
- Login bootstrap memakai JWT Access yang diverifikasi terhadap issuer/AUD tetap. Worker menerbitkan cookie acak `HttpOnly`, `Secure`, `SameSite=Strict`; hanya hash cookie disimpan. Sesi bergulir 30 hari sejak aktivitas, tanpa batas umur maksimum absolut.
- Perubahan API yang mengubah data memeriksa Origin same-origin. Logout mencabut sesi; reset ledger menghapus record dan operasi akun dari D1, tetapi mempertahankan akun dan sesi.
- Browser mengirim audio ke `/api/transcribe` pada origin sendiri setelah pengguna mengetuk mic; Worker meneruskan ke endpoint Groq tetap. Ucapan bisa memuat detail finansial.
- IndexedDB pada origin milik sendiri (HTTPS) — terisolasi per browser/profil.
- `GROQ_API_KEY` hanya secret Worker, tidak masuk bundle, IndexedDB, localStorage atau backup. Credential BYOK lama dibersihkan saat aplikasi dibuka; credential pada import tidak diaktifkan.
- Export backup: sembilan store lokal masuk envelope JSON berversi dengan credential voice dikecualikan (default plain JSON dengan peringatan privasi). Enkripsi opsional memakai Web Crypto AES-GCM 256-bit + PBKDF2-HMAC-SHA-256 250.000 iterasi, salt acak 16 byte, IV acak 12 byte. Restore tidak memerlukan API key pengguna.
- Import: batas 20 MB, validasi skema/record/referensi sebelum satu transaksi atomik yang mengganti seluruh store; overwrite perlu persetujuan eksplisit. File rusak atau passphrase salah tidak mengubah DB.
- Hapus semua data: jika PIN perangkat aktif, PIN diverifikasi sebelum request reset; Worker menghapus ledger cloud dan operasi sync akun setelah pemeriksaan same-origin/session. Setelah respons sukses, store lokal dibersihkan dan state aplikasi kembali ke onboarding. Akun serta sesi tetap aktif agar ledger baru bisa dibuat.
- Integritas keuangan: periode yang sudah disweep bersifat immutable. Tambah/edit/hapus/refund ditolak di layer engine, bukan hanya disembunyikan di UI.
- Saldo periode boleh negatif akibat koreksi income/expense pada periode terbuka; outflow baru diblokir sampai pulih. Kompartemen Sisa/Allocation selalu nonnegatif, termasuk setelah edit/delete/import.

### Privacy
- Voice: audio transit melalui Worker ke endpoint HTTPS Groq tetap (redirect ditolak), lalu dilepas dari memori Monee. Worker tidak menyimpan atau mencatat audio/transkrip pada log aplikasi. Teks diparsing lokal; catatan draft yang dikonfirmasi menjadi ledger. Retensi provider mengikuti [kebijakan Groq](https://console.groq.com/docs/your-data) dan pengaturan akun pemilik; jangan menjanjikan provider tidak pernah menyimpan audio.
- Struk: foto hanya di memori sesi untuk preview dan dikirim melalui Worker ke Gemini setelah Baca otomatis. Memilih foto tidak mengunggahnya. Hasil wajib direview; foto tidak masuk ledger atau backup. Retensi provider mengikuti paket API Google yang dipakai.
- Tanpa analytics/tracker pihak ketiga.

### Akses dan batas server

- Cloudflare Access email OTP memvalidasi identitas di `/auth/bootstrap`. Konfigurasi produksi harus melindungi jalur tersebut saja; aset dan API ledger dapat diakses tanpa Access challenge karena Worker mewajibkan sesi Monee. Jangan menghapus Access bootstrap sebelum versi Worker, D1, dan kebijakan jalur yang baru siap bersama.
- Pada bootstrap, Worker memakai `jose` untuk verifikasi tanda tangan JWT Access terhadap JWKS issuer tetap, `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`, `ACCESS_AUD`, expiry dan subject. Endpoint AI memverifikasi sesi akun Monee serta binding limiter sebelum memanggil provider; klien tidak mengirim API key provider.
- Binding `AI_RATE_LIMIT`: 10 request/60 detik per account ID terverifikasi. `AUTH_RATE_LIMIT` membatasi bootstrap. Limit Cloudflare bersifat perkiraan per lokasi, bukan batas global atau jaminan biaya. Kuota provider tetap ditangani.
- Hanya `POST /api/transcribe` dengan FormData `file` maksimal 10 MiB; UI merekam maksimal 30 detik. Model/provider/endpoint ditetapkan server, tidak dapat dipilih lewat request browser. API tidak menjadi proxy umum.
- Browser mendeteksi redirect/401 sesi dan menawarkan **Masuk ulang layanan suara** melalui GET `/auth/refresh`. Pada deployment PIN akun, Worker mengarahkan ke `/` untuk login Monee; bootstrap verifikasi email tetap di `/auth/bootstrap`. API dan navigasi pemulihan dikecualikan dari fallback PWA.
- CSP browser hanya mengizinkan koneksi origin sendiri; tidak ada key `VITE_*` atau koneksi browser langsung ke Groq. Respons API tidak di-cache.
- `enable_request_signal` di `wrangler.jsonc` mengaktifkan sinyal putusnya client untuk compatibility date proyek. Handler meneruskan pembatalan ke fetch provider. Tanpa opt-in tersebut, tes AbortSignal Node saja tidak membuktikan pembatalan koneksi pada Worker produksi. [Dokumentasi Cloudflare](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-requestsignal-for-incoming-requests).

## 6. Deploy & Operasi

- `npm run build` menghasilkan `dist/`; konfigurasi Wrangler root menyajikannya sebagai Static Assets dengan fallback SPA dan `run_worker_first` untuk `/api`, `/api/*`, `/auth/refresh` dan `/auth/bootstrap`.
- `npm run dev:worker` = build + `wrangler dev`; `npm run deploy:check` = build + dry-run deploy; `npm run deploy` = `wrangler deploy` (buat build terpisah sebelumnya).
- Target rilis adalah Worker dengan GitHub integration atau CLI. Konfigurasi publikasi, Access policy dan secret dilakukan per lingkungan; langkah ada di [deployment](deployment.md).
- Pemilik memasang secret `AUTH_PIN_PEPPER`, `GROQ_API_KEY` dan `GEMINI_API_KEY`, serta konfigurasi Access `ACCESS_TEAM_DOMAIN` dan `ACCESS_AUD`. `keep_vars: true` menjaga vars dashboard ketika deploy ulang. Jangan commit credential; `.dev.vars.example` hanya placeholder dan `.dev.vars` di-ignore.
- Tooling Wrangler/Miniflare memakai override `undici` 7.30.1 yang kompatibel untuk [perbaikan keamanan dependency](https://github.com/nodejs/undici/releases/tag/v7.30.1); pertahankan lockfile dan tinjau ulang kompatibilitas saat menaikkan versi.
- Pantau kuota hosting/provider tanpa mencatat audio, transkrip, secret atau ledger. Hosting HTTPS pada root origin; perpindahan origin memerlukan export/import data.

## 7. Performance Budget (target)

| Metrik | Target |
|---|---|
| Cold start (dashboard siap) | < 1s di HP kentang |
| Ukuran shell (gzipped) | < 200 KB JS initial |
| Interaksi (FAB → sheet) | < 100ms |
| Maskot 2.5D render | target 60fps, frame budget < 4ms (belum diukur di perangkat fisik) |
| Transisi tab (D43) | total ≤ 300ms, frame budget animasi < 4ms, maks 3 layer stagger |
| Recompute finance (1 tahun data) | < 50ms |
| Memori maskot canvas | stabil (tidak ada leak — object pooling untuk partikel confetti) |

## 8. Migration Strategy

- IndexedDB saat ini skema v2 dengan migrasi v1; perubahan metadata opsional kompatibel tidak membuat store baru. Perubahan struktur store/index memerlukan versi dan migrasi idempotent.
- Backup export tetap kompatibel maju-minor (skema versioned di file backup).
