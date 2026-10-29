# Status dan tugas Monee

Diperbarui: 26 Oktober 2026. Tracker ini mencatat pekerjaan aktif; kontrak produk, uang, privasi dan desain berada pada dokumen 01-12.

## Dasar implementasi

Core pencatatan, onboarding/PIN, alokasi, tabungan/goal, riwayat/grafik, pengaturan, backup, PWA, maskot dan voice sudah tersedia. Data tetap lokal per browser/origin. Voice beralih ke Groq `whisper-large-v3` melalui Cloudflare Worker, dengan secret pemilik di hosting dan login email Cloudflare Access. Pengguna tidak memasukkan API key; parser tetap lokal deterministik. Implementasi voice terkelola dan verifikasi lokal selesai; deployment serta pengujian layanan nyata masih menunggu pemilik. Pembacaan otomatis struk tetap belum tersedia; hasil uji workflow tidak membuktikan akurasi model OCR.

Cleanup mempertahankan satu sumber GLB runtime di `public/mascots/3d/`, satu studio di `tools/studio/index.html`, tooling dan tes aktif, sumber desain beserta PNG yang dirujuk, dan dokumentasi inti. Riwayat laporan/rencana tidak menjadi tracker tambahan.

## Pekerjaan aktif

- [x] Siapkan alur struk v1: pemilih gambar/galeri, review, tambah/koreksi/hapus item, total mengikuti format Rupiah, dan simpan seluruh batch atomik lewat guard finance. Provider belum dikonfigurasi. Gabung item dan viewfinder kamera khusus belum tersedia.
- [ ] Tetapkan model/provider OCR, kebutuhan key dan persetujuan pengguna sebelum menambahkan pengenalan atau upload. Kontrak provider disiapkan; belum ada model, key OCR atau hasil pengenalan nyata.
- [x] Implementasi voice terkelola: Worker `/api/transcribe`, JWT Access, rate limit, secret server, consent tanpa key, pembersihan credential lama, CSP same-origin serta login ulang `/auth/refresh` yang melewati cache PWA.
- [x] Verifikasi lokal terbaru: 648 tes di 66 file lulus; typecheck, lint, build, dan bundling Wrangler dry-run lulus. Audit dependency 29 Okt 2026 menemukan 4 temuan Low pada dependency build PWA `deepmerge@4.3.1` melalui Workbox; advisory belum menetapkan versi perbaikan, sementara perbaikan otomatis npm menyarankan downgrade major plugin yang tidak dipilih. Browser: 23 skenario aplikasi, 18 layout dan 27 audit aksesibilitas tanpa pelanggaran; voice 14 layout; PWA pada 3 profil emulasi menguji update/offline serta login ulang yang melewati cache. Worker lokal menolak API tanpa konfigurasi dan menjaga routing JSON. Respons provider terkontrol; belum membuktikan suara nyata, Access publik atau instalasi perangkat fisik. Build masih memberi peringatan chunk di atas 500 kB.
- [ ] Pemilik menghubungkan GitHub ke Cloudflare Worker (Node 22 >=22.23.4; build `npm run build`, deploy `npm run deploy`) atau memakai CLI. Lindungi All traffic produksi/preview dengan email OTP allowlist, isi secret `GROQ_API_KEY` serta vars `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`; verifikasi penolakan tanpa login. Belum ada publikasi yang dibuktikan.
- [ ] Sesudah hosting: periksa MIME aset, header/cache, refresh deep-link, service worker/update, offline setelah cache, dan pemisahan data per origin.
- [ ] Uji perangkat fisik: Android sasaran, tablet/laptop, instalasi OS, izin mic/kamera, background/lock, touch/keyboard dan performa. Emulasi viewport tidak menggantikan bukti perangkat.
- [ ] Uji Groq dengan secret hosting, sesi email Access dan suara nyata: izin ditolak/diterima, rekam/stop, timeout/kuota/offline, koreksi draft, background/lock dan format Safari MP4. Akurasi ujaran nyata belum diklaim.

## Sesudah v1

Recurring expense/subscription, reminder, insight/forecast dan pemulihan PIN belum menjadi implementasi v1. Sinkronisasi, cloud backup, serta wallet/integrasi bank tidak termasuk arsitektur saat ini. Detail keputusan: [PRD](01-product-brief-prd.md), [AI](07-ai-features.md), [QA](10-qa-backlog.md), [deployment](deployment.md).
