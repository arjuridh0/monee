# Status dan tugas Monee

Diperbarui: 18 November 2026. Dokumen ini melacak pekerjaan produk; bukti pemeriksaan terbaru dan arsip audit disatukan di `LOCAL_REPORT.md` pada root proyek (lokal, diabaikan Git). Jangan membuat tracker atau laporan QA baru.

## Implementasi saat ini

- Pencatatan, onboarding, bucket, tabungan/goal, riwayat/grafik, pengaturan, backup dan PWA tersedia. Ledger akun berada di D1; IndexedDB per perangkat menjadi cache dan antrean perubahan offline.
- Ajakan pemasangan PWA tersedia setelah login/onboarding saat browser siap, dengan penundaan 7 hari, panduan Safari iPhone/iPad dan akses manual dari pengaturan. Pemasangan OS tetap memerlukan pilihan pengguna.
- Alur email + PIN akun 6 digit sudah aktif di production dengan migrasi 0002 dan AUTH_PIN_PEPPER. Cloudflare memverifikasi daftar/aktivasi/pemulihan saja; sesi diperpanjang oleh aktivitas pengguna selama 30 hari. Kunci perangkat tambahan opsional.
- Data legacy tidak menghalangi login; impor opsional melalui pengaturan dengan backup dan konfirmasi penggantian ledger. Kredensial PIN akun dan kunci perangkat terpisah dari ledger tersinkron.
- Semua maskot memakai Canvas 2.5D; GLB, decoder Draco dan renderer Three.js telah dihapus. Carousel berputar melalui tombol, keyboard, swipe dan wheel.
- Kontras kartu tabungan pada sisi balik Beranda, label total dan ikon kembali diuji pada ketiga tema. Carousel mendukung swipe sentuh asli dan lintasan kiri/kanan simetris tanpa memasang ulang Canvas.
- Voice memakai Worker `/api/transcribe`, Groq `whisper-large-v3`, sesi akun Monee, rate limit per akun, secret server, tindakan rekam eksplisit dan review draft lokal.
- OCR memakai Worker `/api/receipt` dan Google Gemini. Secret `GEMINI_API_KEY` dipasang di hosting; foto dikirim setelah menekan Baca otomatis dan hasil wajib diperiksa sebelum disimpan.
- Artefak QA lama, cache regeneratif, skrip audit sekali pakai serta UI kategori yang tidak terhubung telah dibersihkan. Model data kategori dan validasi backup dipertahankan untuk kompatibilitas data. Alat QA aktif memperbarui satu laporan lokal.

## Verifikasi dan pekerjaan tersisa

- Hasil lint, typecheck, unit, mascot, build, browser, PWA, voice dan benchmark setelah pembersihan dicatat pada bagian suite terkait di laporan lokal. Emulasi tidak membuktikan perilaku perangkat fisik atau akurasi provider nyata.
- Uji Android/tablet/laptop fisik: instalasi OS, izin mic/kamera, background/lock, touch, keyboard dan performa.
- Uji layanan Groq/Gemini pada hosting dengan sesi akun Monee serta suara/struk asli; cek timeout, offline, kuota dan review draft. Pemeriksaan ready=true hanya memastikan konfigurasi. Jangan menyimpan key di frontend atau laporan.
- Login PIN akun, onboarding, pemakaian ulang sesi, pembacaan/perubahan ledger melalui dua sesi terpisah, penolakan API tanpa sesi, header/cache, deep-link dan pembaruan PWA sudah diperiksa di production. Pemeriksaan browser baru/perangkat fisik dan offline production tetap perlu; dua sesi HTTP tidak setara dengan dua perangkat fisik.
- Evaluasi ukuran chunk JavaScript utama yang masih memunculkan peringatan build.
- Keuangan pada cache IndexedDB tidak terenkripsi saat tersimpan. PIN membatasi UI, bukan mengenkripsi database; sumber ledger tersinkron berada di D1. Hapus semua data menghapus ledger akun dari semua perangkat.

## Sesudah v1

Recurring expense/subscription, reminder dan insight/forecast masih di luar v1. Pemulihan PIN akun tersedia melalui verifikasi Access pada alur baru. Uji provider nyata dan pemeriksaan perangkat fisik tetap perlu sebelum rilis. Lihat [PRD](01-product-brief-prd.md), [AI](07-ai-features.md), [QA](10-qa-backlog.md), dan [deployment](deployment.md).
