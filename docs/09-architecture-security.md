# 09 — Technical Architecture & Security

> Mobile-first dengan tablet/laptop/desktop responsif. Status implementasi mengikuti [task](task.md). Voice memakai Groq melalui Worker dengan secret hosting; struk v1 menyiapkan review dan antarmuka provider tanpa model OCR.

## 1. Stack (final)

| Layer | Pilihan | Alasan |
|---|---|---|
| App shell | **React 18 + Vite + TypeScript** (strict) | PWA matang, ecosystem animasi, type safety (TypeScript strict) |
| PWA | **vite-plugin-pwa** (Workbox) | Service worker, installable, offline cache |
| UI | Tailwind CSS + komponen custom + **ReactBits** (FlipCard, CodeSlots, RubberSegment, FuseButton) | Cepat, token-driven (design system dok 04); ReactBits untuk interaksi finance yang khas |
| Animasi | **motion** (framer-motion v12) | Sheet, spring, micro-interaction; juga dependensi ReactBits |
| Ikon | **Lucide React** | Satu set ikon konsisten; menggantikan hugeicons di ReactBits |
| Data | **IndexedDB** via wrapper ringan (idb ±2KB) | Lokal, gratis, async native |
| State | **Zustand** (+ derived selectors) | Ringan; derived finance state = pure functions terpisah (testable) |
| STT | **Groq Whisper-large-v3** melalui Worker `/api/transcribe` | Secret pemilik hanya di server; pengguna tidak memasukkan key |
| Selector maskot | **Three.js** + DRACOLoader lokal (lazy-load) | Membuat snapshot WebP dari GLB maskot aktif untuk carousel CSS; renderer tetap snapshot dengan fallback Canvas 2.5D |
| 2.5D Maskot | **Canvas 2D** (`mascots/` engine procedural) | Dashboard maskot ngintip — ringan, tidak butuh WebGL |
| Chart | SVG custom ringan (tanpa lib berat) | Hanya 2 chart v1 — pakai lib besar = overkill |
| Testing | **Vitest** (unit) + Playwright (E2E smoke) | Aturan #14: deterministic & testable; TDD red→green di finance engine |
| Deploy | Cloudflare Worker + Static Assets `./dist` | SPA dan API satu origin; Access melindungi produksi/preview |

**Batas sistem:** ledger tidak memakai database cloud/Supabase atau sinkronisasi. Cloudflare Worker menjadi backend voice dan Cloudflare Access menjadi autentikasi hosting. Parser tetap rule-based lokal, tanpa LLM umum; chart tetap SVG ringan.

## 2. Arsitektur Aplikasi

```text
monee/
|-- public/                   # models, Draco decoder, fonts, icons, hosting headers
|-- mascots/                  # Canvas engine and source mockups for design
|-- design/monee.pen          # active design source
|-- server/index.ts           # protected transcription endpoint
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
|   |   |-- mascot/           # canvas wrapper, events, selector snapshots
|   |   |-- voice/            # recorder, parser, consent, review
|   |   `-- ocr/              # receipt input/review, recognizer contract, atomic persistence
|   |-- core/
|   |   |-- finance/          # pure calculations and guards
|   |   |-- db/               # schema, repositories, migrations, change notifications
|   |   |-- security/         # PIN hash and lockout
|   |   |-- mascot/           # model filename mapping
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
         -> POST /api/transcribe -> Access JWT/rate limit -> Groq (secret server)
         → teks → parser (pure, offline) → draft → review UI → save (jalur normal)
```

- Finance snapshot dihitung ulang dari data mentah yang konsisten; pemilihan lima transaksi terbaru tidak mengurutkan seluruh histori.
- Three.js (carousel maskot) = lazy-loaded — hanya dimuat saat layar pilih maskot pertama kali.

### Konsistensi data dan sesi

- `core/db/close-periods.ts` membaca profil, ledger, bucket, dan sweep terbaru serta membuat sweep yang belum ada dalam satu transaksi `readwrite`. Unique index period key tetap menjadi perlindungan tambahan; penutupan yang sudah selesai bersifat no-op.
- Cache Zustand dibangun dari snapshot IndexedDB yang konsisten lintas store. Guard penulisan membaca data di dalam transaksi; cache UI tidak menentukan izin outflow.
- Preferensi nama/maskot/format memakai mutasi field dengan pemeriksaan stale, sehingga penyimpanan preferensi tidak menulis kembali kredensial lama. Unlock membaca profil/PIN terbaru; restore/reset dan perubahan data menginvalidasi sesi/cache terkait.
- `core/db/changes.ts` hanya mengirim token revisi melalui event storage untuk refresh tab lain. Kredensial dan ledger tetap di IndexedDB. Foreground/unlock dan pergantian hari WIB memicu pemeriksaan periode serta refresh.
- Konfigurasi awal periode prospektif disimpan sebagai `Profile.periodChanges`; key sweep historis tidak ditulis ulang. Detail tabungan menjaga koreksi `goal-use:<id>` dan `Goal.usedAt` dalam transaksi yang sama. Kontrak lengkap pada dok 08.

## 4. PWA & Offline

- **Precache:** Workbox menyimpan app shell JS/CSS/HTML, ikon `public/icons/`, font lokal `public/fonts/*.woff2`, dan decoder lokal `public/draco/*.{js,wasm}`. Offline membutuhkan satu kunjungan online hingga service worker aktif dan cache selesai; bukan jaminan pada kunjungan pertama yang sudah offline.
- **GLB:** dikecualikan dari precache. Request `/mascots/3d/*.glb` memakai `CacheFirst`, cache `monee-mascot-models-v1`, maksimal tiga entry selama satu tahun. Hanya model yang sudah berhasil diminta tersedia dari cache; model lain memakai fallback 2.5D saat offline. Browser dapat membersihkan cache.
- **Install:** `src/pwa/PwaControls.tsx` menampilkan aksi Pasang ketika `beforeinstallprompt` disediakan browser. Tidak mengklaim instalasi berhasil sebelum respons browser; dukungan berbeda antarbrowser.
- **Update:** registrasi `prompt`; versi baru menawarkan Perbarui sekarang/Nanti. Penerapan dan reload terjadi setelah pengguna memilih memperbarui, agar formulir yang belum selesai tidak tertimpa reload otomatis.
- **Penyimpanan:** `navigator.storage.persist()` diminta lewat aksi pengguna dan hasil browser ditampilkan. Persistent storage tidak menggantikan backup dan tidak melindungi dari penghapusan data browser oleh pengguna.
- **Versi:** `package.json` adalah sumber tunggal, diekspor `src/app/version.ts` dan dipakai UI serta metadata HTML hasil build. Versi dokumen tidak dianggap versi paket.
- **Voice:** MediaRecorder -> Worker -> Groq -> parser lokal -> review. Input teks/manual tetap offline; layanan nyata dan perangkat mengikuti [task](task.md).

## 5. Security & Privacy

### PIN
- 6 digit, disimpan sebagai **SHA-256 + salt** (bukan plain) di IndexedDB.
- Lock otomatis saat app dibuka dari background ≥5 menit.
- Salah 3× → delay progresif 5s/15s/60s.
- State lockout `{ attempts, lockedUntil }` disimpan di IndexedDB dan **bertahan lintas reload/restart**. Reset hanya setelah PIN benar. Jangan simpan di memori saja.
- **Tanpa pemulihan v1** (keputusan user: "tanpa dulu") → layar peringatan keras saat set PIN + reminder export. Tercatat sebagai risiko yang disadari user.

### Data
- Ledger dan perhitungan tetap lokal di IndexedDB; Worker menerima audio voice sementara, tidak mengunggah database atau menyinkronkan ledger.
- Browser mengirim audio ke `/api/transcribe` pada origin sendiri setelah persetujuan; Worker meneruskan ke endpoint Groq tetap. Ucapan bisa memuat detail finansial.
- IndexedDB pada origin milik sendiri (HTTPS) — terisolasi per browser/profil.
- `GROQ_API_KEY` hanya secret Worker, tidak masuk bundle, IndexedDB, localStorage atau backup. Credential BYOK lama dibersihkan saat aplikasi dibuka; credential pada import tidak diaktifkan.
- Export backup: sembilan store lokal masuk envelope JSON berversi dengan credential voice dikecualikan (default plain JSON dengan peringatan privasi). Enkripsi opsional memakai Web Crypto AES-GCM 256-bit + PBKDF2-HMAC-SHA-256 250.000 iterasi, salt acak 16 byte, IV acak 12 byte. Restore tidak memerlukan API key pengguna.
- Import: batas 20 MB, validasi skema/record/referensi sebelum satu transaksi atomik yang mengganti seluruh store; overwrite perlu persetujuan eksplisit. File rusak atau passphrase salah tidak mengubah DB.
- Hapus semua data: PIN 6 digit diverifikasi, hash/salt profil diperiksa ulang dalam transaksi readwrite yang mencakup semua store, kemudian semua store dibersihkan atomik. Mutasi PIN bersamaan menyebabkan stale dan membatalkan reset; sesudah commit Zustand dibersihkan dan aplikasi kembali ke onboarding.
- Integritas keuangan: periode yang sudah disweep bersifat immutable. Tambah/edit/hapus/refund ditolak di layer engine, bukan hanya disembunyikan di UI.
- Saldo periode boleh negatif akibat koreksi income/expense pada periode terbuka; outflow baru diblokir sampai pulih. Kompartemen Sisa/Allocation selalu nonnegatif, termasuk setelah edit/delete/import.

### Privacy
- Voice: audio transit melalui Worker ke endpoint HTTPS Groq tetap (redirect ditolak), lalu dilepas dari memori Monee. Worker tidak menyimpan atau mencatat audio/transkrip pada log aplikasi. Teks diparsing lokal; catatan draft yang dikonfirmasi menjadi ledger. Retensi provider mengikuti [kebijakan Groq](https://console.groq.com/docs/your-data) dan pengaturan akun pemilik; jangan menjanjikan provider tidak pernah menyimpan audio.
- Struk v1: foto hanya di memori sesi untuk preview/review manual; OCR otomatis dan upload belum aktif karena model/provider belum dipilih.
- Tanpa analytics/tracker pihak ketiga.

### Akses dan batas server voice

- Cloudflare Access email OTP dengan allowlist pemilik/undangan melindungi **semua trafik produksi dan preview**, termasuk aset, domain custom dan `workers.dev`; login ini tidak membuat sinkronisasi ledger. PIN tetap kontrol lokal dan tidak mengotorisasi API.
- Worker memakai `jose` untuk verifikasi tanda tangan JWT Access terhadap JWKS issuer tetap, `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`, `ACCESS_AUD`, expiry dan subject. Token/config invalid atau binding limiter hilang ditolak sebelum memanggil Groq.
- Binding `AI_RATE_LIMIT`: 10 request/60 detik per subject terverifikasi. Limit Cloudflare bersifat perkiraan per lokasi, bukan batas global atau jaminan biaya. Kuota provider tetap ditangani. [Perilaku limiter](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
- Hanya `POST /api/transcribe` dengan FormData `file` maksimal 10 MiB; UI merekam maksimal 30 detik. Model/provider/endpoint ditetapkan server, tidak dapat dipilih lewat request browser. API tidak menjadi proxy umum.
- Browser mendeteksi redirect/401 Access dan menawarkan **Masuk ulang layanan suara** melalui GET `/auth/refresh`. Jalur ini melewati cache navigasi PWA, dilindungi Access, lalu Worker mengembalikan 302 ke `/`. Reload shell biasa tidak memastikan login ulang; service worker mengecualikan `/api`, `/cdn-cgi/` dan `/auth/refresh` dari fallback navigasi.
- CSP browser hanya mengizinkan koneksi origin sendiri; tidak ada key `VITE_*` atau koneksi browser langsung ke Groq. Respons API tidak di-cache.

## 6. Deploy & Operasi

- `npm run build` menghasilkan `dist/`; konfigurasi Wrangler root menyajikannya sebagai Static Assets dengan fallback SPA dan `run_worker_first` untuk `/api`, `/api/*` dan `/auth/refresh`.
- `npm run dev:worker` = build + `wrangler dev`; `npm run deploy:check` = build + dry-run deploy; `npm run deploy` = `wrangler deploy` (buat build terpisah sebelumnya).
- Target rilis adalah Worker dengan GitHub integration atau CLI. Publikasi, Access policy dan secret akun pemilik masih perlu disiapkan; langkah ada di [deployment](deployment.md).
- Pemilik memasang secret `GROQ_API_KEY` serta server vars `ACCESS_TEAM_DOMAIN` dan `ACCESS_AUD`. `keep_vars: true` menjaga vars dashboard ketika deploy ulang. Jangan commit credential; `.dev.vars.example` hanya placeholder dan `.dev.vars` di-ignore.
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
