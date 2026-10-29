# 10 — QA / Test Plan & Product Backlog

> Kontrak regresi dan backlog aktif. Status pelaksanaan ada pada [task](task.md); daftar kasus berikut bukan klaim bahwa perubahan terbaru sudah diuji.

## 1. Strategi Testing

| Level | Alat | Cakupan |
|---|---|---|
| Unit — finance engine | Vitest | Semua rumus dok 08 (30 test cases wajib + edge) |
| Unit — parser | Vitest | Semua pola dok 07 A3 (normalisasi angka, multi-transaksi, confidence) |
| Unit — sweep & recurring | Vitest | Idempotency, periode custom, lazily triggered |
| Komponen | Vitest + Testing Library | Sheet, carousel (snap logic), goal drag reorder |
| E2E smoke | Playwright | Onboarding → transaksi → sweep → goal lifecycle |
| Visual regression | Playwright screenshots | Dashboard, carousel, theme per maskot |
| Manual device | — | Android low-end sebagai target mobile, tablet dan laptop/desktop; pisahkan hasil perangkat fisik dari emulasi viewport browser |

**Prinsip: semua perhitungan keuangan deterministic → snapshot testing untuk contoh user (1jt → 400rb; +500rb → 600rb; sweep; dsb).**

## 2. Unit Test — Finance Engine (checklist dari dok 08 §12)

- 1. Allocation dasar: income 1jt → 400/200/250/100/50 (rb).
- 2. Income tambahan mid-month → jatah naik proporsional, progress turun.
- 3. Jatah 100rb + expense 10rb → progress 10%.
- 4. Expense 120rb dari jatah 100rb, `allowOverbudget=false` → ditolak.
- 5. Expense 120rb dari jatah 100rb, `allowOverbudget=true` → tersimpan, 120%.
- 6. Expense melebihi saldo walau jatah cukup → ditolak (`ERR_SALDO_KURANG`).
- 7. Setoran melebihi jatah Tabungan → boleh, saldo turun, Allocation naik.
- 8. Setoran melebihi saldo → ditolak.
- 9. Sweep = saldo akhir, bukan Σ sisa bucket (kasus satu bucket overspend).
- 10. Sweep saldo 0 → record tetap dibuat + periode terkunci.
- 11. Dua bulan terlewat → dua record sweep, urut, idempotent.
- 12. Setoran manual mengurangi sweep 1:1, tanpa dobel hitung.
- 13. Setoran 500rb → Allocation 500rb, goal 1 terisi.
- 14. Overflow goal: target 400rb, setor 500rb → goal 1 fulfilled, 100rb ke goal 2.
- 15. "Gunakan" goal → Allocation turun tepat 1×, saldo utama tetap.
- 16. "Gunakan" saat Allocation < target → ditolak, status kembali active.
- 17. Pengeluaran bebas Allocation → goal terakhir bisa regress ke active.
- 18. Drag reorder → recompute progress.
- 19. Hapus goal terisi → dana kembali ke unallocated.
- 20. Pengeluaran darurat (source=sisa) → hanya Sisa turun.
- 21. Investasi (source=sisa + note) → hanya Sisa turun, saldo utama tetap.
- 22. Refund parsial 25rb dari expense 100rb → terpakai 75rb, saldo +25rb.
- 23. Refund di periode tersweep → ditolak.
- 24. Edit income turun → sisa jatah negatif, expense baru ditolak.
- 25. Edit income turun sampai saldo negatif → saldo negatif, outflow diblokir, sweep 0.
- 26. Periode custom start-25 → boundary transaksi benar.
- 27. Recurring: klik "Catat gaji" 2× di periode sama → tetap 1 transaksi.
- 28. Progress saat jatah 0 → 0 (tidak NaN/Infinity).
- 29. Soft delete → semua derived recompute, riwayat tidak hilang.
- 30. Import backup → derived identik dengan export.

## 3. Unit Test — Voice Parser

- "tadi makan nasi goreng dua puluh lima ribu" → Expense/Makan/25000/hari ini.
- "kemarin ngopi 22rb sama parkir 3rb" → 2 transaksi, tanggal kemarin.
- "gajian 5 juta" → Income/Gaji/5000000.
- "setor tabungan 500rb" → savings_deposit + bucket Tabungan.
- "setengah juta buat beli baju" → Belanja/500000.
- "beli 20rb" → draft kategori kosong + flag review (ambigu).
- Tanpa nominal → reject + pesan klarifikasi.
- Angka numerik & verbal campur: "27.5rb" / "dua puluh tujuh koma lima ribu".
- Multi-split dengan "trus", "dan".
- Semua output punya confidence score.

## 4. E2E Smoke (Playwright)

1. **Onboarding pertama (D56), lima langkah:** nama → pemasukan opsional → allocation default → pilih Mochi → PIN. Cabang isi: satu `income` normal periode berjalan, saldo dan jatah muncul tanpa field saldo awal. Cabang Lewati: tidak ada transaksi (termasuk Rp0), dashboard empty state "Belum ada pemasukan bulan ini". Setelah kedua cabang selesai, reload/buka ulang/login/unlock tidak mengulang onboarding atau tawaran pemasukan dan tidak menduplikasi transaksi. Instalasi PWA dengan data onboarding selesai tetap memakai alur pengguna lama.
2. Tambah expense manual → saldo turun, progress naik, maskot reaksi.
3. Ganti maskot via carousel → theme berubah, persist setelah reload.
4. Tambah income mid-month → jatah bucket naik.
5. Simulasi pergantian bulan (mock clock) → sweep = saldo akhir, record dibuat, periode lama terkunci, periode baru mulai 0.
6. Setoran → goal terisi → "Gunakan" → kompartemen berkurang, saldo utama tidak berubah.
7. Export → wipe → import → state identik.
8. PIN salah 3× → delay; PIN benar → masuk.
9. Offline mode (setelah load) → semua fungsi inti jalan.
10. Reduced motion → animasi mati, fungsi utuh.
11. **Navbar hanya di 4 tab root** (D42): assert navbar **tidak ada** di onboarding, lock screen, quick-add sheet, voice mode, dan scan struk; **ada** di Home/Riwayat/Tabungan/Atur.
12. **Pindah tab** (D43): pill aktif bergeser (bukan fade), konten keluar/masuk parallax, ikon pop, maskot berubah state → total ≤ 300ms. Dengan `prefers-reduced-motion` → fade 120ms tanpa spring.
13. **Responsive** (D44): di 768px sidebar muncul dan bottom nav hilang; di <768px sebaliknya.
14. **Empty State** (D45): akun baru tanpa transaksi → Riwayat tampil empty state (maskot `idle`, judul, 1 CTA utama, 1 link sekunder), **navbar tetap ada** dan CTA leads ke Quick-Add. Tidak ada tombol kedua yang sama-sama primary.
15. **Error State** (D45): paksa pembacaan IndexedDB gagal → tampil error state (maskot `sad`, badge merah, chip kode error, tombol "Coba Lagi"). Klik "Coba Lagi" → retry + skeleton → list muncul. Assertion: ada 1 tombol retry, ada kalimat assurance, dan **tidak ada** kata "gagal" tanpa aksi.
16. **Notch navbar** (D45): bar navbar terpotong cekungan di tengah, tombol bulat 60px duduk **di dalam** cekungan (bukan menempel di atas bar), 4 item dibagi simetris 2 kiri/2 kanan, dan tidak ada item yang tumpang tindih dengan tombol.
17. **Hard cap** (D47): expense melebihi sisa jatah bucket non-overbudget → ditolak, chip `ERR_JATAH_HABIS` tampil, isi form tidak hilang. Bucket Tabungan boleh melewati jatah.
18. **Cek saldo** (D47): setelah setoran besar, expense dengan jatah cukup tapi saldo kurang → ditolak (`ERR_SALDO_KURANG`).
19. **Lockout persist** (D52): salah PIN 3× → reload halaman → lockout masih aktif dengan sisa waktu yang benar.
20. **Periode terkunci** (D53): setelah sweep, tambah/edit/hapus/refund transaksi bertanggal periode lama → ditolak (`ERR_PERIODE_TERKUNCI`).
21. **Goal regress** (D49): goal fulfilled, lalu Allocation dipakai untuk pengeluaran bebas sampai di bawah target → status goal kembali `active`, tombol "Gunakan" hilang.

### 4.1 Regresi editor Alokasi Bucket

- `tests/db/allocation-actions.test.ts`: simpan seluruh persentase + izin, penolakan input invalid tanpa perubahan DB, snapshot basi, dan dua penyimpanan konkuren.
- `tests/ui/settings.test.tsx`: preset 40/20/25/10/5, custom dengan lima switch, total live 100%, simpan ke DB/store/snapshot, dan konflik basi yang mempertahankan sheet.

### 4.2 Regresi Kelola Kategori

- `tests/db/category-actions.test.ts`: edit kategori dengan snapshot, tambah kategori, nama duplikat, perlindungan identitas Tabungan/default, penolakan perubahan basi, validasi input, dan penghapusan hanya bila kategori belum direferensikan transaksi atau pemasukan rutin.
- `tests/ui/settings.test.tsx`: daftar 14 kategori, edit/persist nama-ikon-warna, CRUD kategori khusus, serta larangan menghapus kategori yang dipakai transaksi.

### 4.3 Regresi Pemasukan Rutin

- `tests/db/recurring-actions.test.ts`: create/edit dengan snapshot, validasi nama/nominal/tanggal/kategori, nonaktif, hapus template tanpa menghapus transaksi historis.
- `tests/ui/settings.test.tsx`: CRUD Atur, toggle aktif, hitung ulang kartu jatuh tempo, dan menjaga transaksi yang sudah dicatat.
- `tests/finance/recurring.test.ts` + `tests/ui/session.test.tsx`: template aktif dan jatuh tempo saja yang ditawarkan; pencatatan manual tetap idempotent.

### 4.4 Regresi Backup

- `tests/db/backup.test.ts`: round-trip sembilan store, enkripsi/dekripsi, passphrase salah tanpa mutasi, envelope/versi rusak, referensi kategori putus, dan alokasi bukan 100%.
- `tests/ui/settings.test.tsx`: peringatan privasi export dan konfirmasi overwrite wajib sebelum import.
- Batas file 20 MB; enkripsi AES-GCM/PBKDF2 diuji otomatis. File plain tetap memerlukan penyimpanan privat karena berisi hash PIN dan data keuangan.

### 4.5 Regresi Hapus Semua Data

- `tests/db/delete-all.test.ts`: PIN salah, hash profil basi, dan pengosongan kesembilan store setelah PIN benar.
- `tests/ui/settings.test.tsx`: checkbox wajib, salah PIN tidak mengubah DB, PIN benar membersihkan DB dan state sesi.

### 4.6 Regresi voice terkelola dan otorisasi

- Browser hanya memanggil `/api/transcribe` pada origin sendiri dengan FormData `file`, tanpa key Groq/Authorization provider. Pengaturan menampilkan penjelasan layanan; dialog voice meminta persetujuan audio per sesi dan menyediakan teks/manual, tanpa input API key.
- Credential BYOK lama dibersihkan saat inisialisasi aplikasi dan tidak dipakai lagi. Backup export/import tidak mengaktifkan secret yang disisipkan; restore tidak meminta key pengguna.
- Server menolak konfigurasi hilang, JWT tanpa tanda tangan valid/issuer salah/audience salah/kedaluwarsa/subject kosong sebelum memanggil Groq. PIN dan consent browser tidak menggantikan otorisasi server.
- Uji metode/path salah, multipart invalid, MIME tidak didukung, file kosong/lebih dari 10 MiB, binding limiter hilang, rate limit, timeout, abort, error/429 Groq dan respons provider invalid. Error ke browser tidak memuat secret, audio/transkrip atau body provider mentah.
- Pastikan endpoint/provider/model ditetapkan server, JWT diverifikasi dengan issuer/JWKS tepercaya dan `AI_RATE_LIMIT` memakai subject terverifikasi (10/60 detik). Tes terkontrol tidak membuktikan limit Cloudflare global; binding aslinya perkiraan per lokasi.
- Worker tidak menyimpan/log isi audio atau transkrip; API no-store dan tidak masuk antrean service worker. CSP browser hanya `connect-src 'self'`.
- Pada hosting nyata, periksa **All traffic** Access melindungi produksi/preview/domain terkait; email allowlist masuk lewat OTP, email lain ditolak. Uji sesi habis serta API tanpa login. Tidak ada bukti akses aman hanya dari mock JWT/E2E lokal.
- Simulasikan redirect Access dan 401 setelah shell PWA di-cache: tampil **Masuk ulang layanan suara** dengan href `/auth/refresh`, navigasi benar-benar melewati jaringan, login email kembali lalu Worker 302 ke `/`. Uji denylist `/api`, `/cdn-cgi/` dan `/auth/refresh`; tidak ada HTML shell yang menutupi endpoint autentikasi/API. Reload biasa bukan bukti sesi diperbarui. Input manual/offline shell tetap berfungsi.
- Uji recorder 30 detik, background/lock, hasil terlambat, Safari MP4, draft dan undo; parser tetap lokal deterministik dan pengguna selalu review sebelum save.

## 5. Manual QA — Device Matrix

| Device | Fokus |
|---|---|
| Android low-end (2-3GB RAM, tanpa WebGPU) | latensi STT Groq + fallback manual, animasi lancar (target 60fps, bukan jaminan), cold start |
| Android mid (WebGPU on) | STT Groq, PWA install |
| Desktop Chrome | Keyboard nav, mouse eye-tracking, layout max-width |
| iOS Safari (opsional) | PWA limitasi, sheet gesture |

## 6. Definition of Done (per fitur)

1. Unit test lulus (finance/parser masing-masing).
2. Lint + typecheck bersih.
3. Dites di HP kentang tanpa lag.
4. Aksesibilitas dasar (kontras, target sentuh, label).
5. Maskot bereaksi bila relevan (sesuai peta dok 03).
6. Panggilan eksternal yang membawa data hanya pada fitur/provider yang disetujui pengguna; voice Groq dijelaskan sebelum mengirim audio dan scaffold struk belum mengunggah gambar.
7. **Navigasi sesuai D42/D43/D44/D55 diverifikasi di viewport 320/375/768/1024/1440px** — navbar hanya di empat tab root, sidebar muncul di ≥768px, konten fluid dan analitik sesuai breakpoint, tanpa overflow. Reduced-motion menghasilkan frame statis/daftar sederhana dan tidak terus menjalankan loop render tersembunyi.
8. **Aturan finansial dok 08 diverifikasi**: hard cap non-Tabungan, cek saldo, sweep dari saldo akhir, periode terkunci, kompartemen tidak negatif, goal derived tanpa `savedAmount`.

## 7. Backlog aktif

- Struk v1: pilih gambar melalui pemilih berkas/galeri, draft manual multi-item, tambah/hapus/koreksi dan penyimpanan atomik lewat validasi finance; provider default belum dikonfigurasi. Kamera bergantung pada pemilih berkas browser; viewfinder khusus dan gabung item belum tersedia. Jangan mengklaim pengenalan gambar dari tes workflow.
- Pilih provider/model OCR sebelum uji akurasi atau performa pengenalan; tentukan key, biaya, dukungan perangkat dan persetujuan upload bila cloud.
- Sesudah v1: recurring expense/subscription, reminder, insight/forecast dan pemulihan PIN. Backend saat ini hanya endpoint voice terkelola; sinkronisasi ledger tetap di luar scope.
- Hosting dan perangkat fisik mengikuti [task](task.md) dan [deployment](deployment.md).

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Lupa PIN tanpa pemulihan | Peringatan keras + checkbox saat set; reminder export periodik; (fase 2: pertanyaan pemulihan) |
| Whisper lambat di HP kentang | Progress UI jujur + fallback input manual selalu tersedia |
| Parser salah paham slang | Review selalu sebelum save; highlight confidence; kamus kategori extensible |
| Render 3D gagal di perangkat lama | Fallback ke **procedural 2.5D** atau nonaktifkan carousel — bukan placeholder PNG |
| IndexedDB dibersihkan browser (jarang, saat storage pressure) | PWA + persistent storage request (`navigator.storage.persist()`); export reminder |
| Setor tabungan besar di awal bulan lalu saldo tidak cukup untuk belanja | Ini perilaku yang disengaja (D47). UI menjelaskan `ERR_SALDO_KURANG` dan menawarkan kurangi setoran, bukan melonggarkan aturan |
| Data besar? | Tidak — <10MB/tahun (dok 08 §10) |
| Tes UI bertimer bisa melewati deadline saat mesin terbebani | Vitest dibatasi dua worker tanpa menambah timeout/retry atau mengurangi assertion; jika berulang, diagnosis timing dan gunakan clock terkontrol pada kasus yang sesuai |

## 9. Perintah dan batas bukti

Dari root, jalankan `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, dan `npm run test:mascots`. Setelah build, `npm run test:e2e`, `npm run test:pwa`, `npm run test:voice:e2e` dan `npm run benchmark` memakai harness aktif di `tools/`. Hasil/screenshot adalah artefak lokal yang dapat dibuat ulang; tidak perlu disimpan bersama source GitHub.

Pengujian otomatis sebelum cleanup pernah memakai request Groq tiruan. Sebelum rilis, lakukan smoke test secret hosting, login email Access dan ujaran nyata pada perangkat target: izin mic ditolak/diterima, rekam/stop otomatis, jaringan putus/kuota, review/koreksi, background/lock serta Safari MP4. Akurasi memerlukan corpus ujaran nyata dan tidak dapat disimpulkan dari parser deterministik.

Klaim kesiapan hosting membutuhkan respons URL publik, header/cache, deep-link, update service worker dan instalasi perangkat. Hasil viewport emulasi tidak membuktikan perilaku perangkat fisik. Status verifikasi perubahan terbaru selalu dicatat pada [task](task.md), bukan disalin dari gate historis.
