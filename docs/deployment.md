# Panduan deployment Monee: dari nol sampai aplikasi berjalan

> **Perubahan arsitektur (16 November 2026):** Bagian 1–20 mendeskripsikan deployment awal yang memakai Access All traffic dan data lokal; sebagian instruksi di sana sudah tidak berlaku untuk source sekarang. Untuk deployment baru/perubahan produksi, ikuti **Bagian 21**. Jangan ikuti checklist lama yang meminta Access All traffic atau menyatakan D1 tidak diperlukan.

Diperbarui dan dicocokkan dengan sumber resmi melalui tools pada **29 Oktober 2026**.

Panduan ini dibuat untuk **pemilik aplikasi yang belum pernah melakukan deployment**. Semua langkah ditulis berurutan, dengan contoh nilai yang benar-benar dipakai proyek Monee saat ini. Kamu tidak perlu memahami istilah hosting terlebih dahulu; setiap istilah penting dijelaskan saat muncul.

Ikuti jalur utama **bagian 1 sampai 11 secara berurutan**. Jangan melompat, karena beberapa langkah memakai hasil dari langkah sebelumnya. Setiap bagian jalur utama diakhiri dengan **checklist** dan **hasil yang diharapkan**; lanjutkan hanya jika hasilnya sesuai.

**Batas pemeriksaan:** isi panduan dicocokkan dengan source proyek, bantuan CLI Wrangler yang terpasang dan dokumentasi resmi daring. Menulis panduan ini tidak membuat repository, melakukan commit, mengubah akun Cloudflare/Groq, atau membuktikan deployment publikmu berhasil. Label pada dashboard dapat berbeda karena bahasa atau pembaruan UI; jika berbeda, cari kata kunci yang disebutkan.

**Jika kamu sudah menyelesaikan sebagian langkah** (misalnya sudah memiliki repository, sudah mengaktifkan Zero Trust Free, atau sudah memasang metode pembayaran PayPal), lewati langkah tersebut dan catat hasilnya di lembar catatan. Jangan mengulang pembayaran atau membuat Worker kedua. Periksa setiap bagian dengan checklist yang tersedia.

---

## Daftar isi

1. [Peta perjalanan dan kosakata](#1-peta-perjalanan-dan-kosakata)
2. [Persiapan bahan dan keputusan](#2-persiapan-bahan-dan-keputusan)
3. [Periksa komputer Windows](#3-periksa-komputer-windows)
4. [Pastikan source sudah di GitHub](#4-pastikan-source-sudah-di-github)
5. [Siapkan Cloudflare, Zero Trust, dan pembayaran](#5-siapkan-cloudflare-zero-trust-dan-pembayaran)
6. [Hubungkan GitHub dan deploy Worker pertama](#6-hubungkan-github-dan-deploy-worker-pertama)
7. [Pasang Access pada Worker](#7-pasang-access-pada-worker)
8. [Buat key Groq dan isi konfigurasi server](#8-buat-key-groq-dan-isi-konfigurasi-server)
9. [Uji aplikasi dan voice](#9-uji-aplikasi-dan-voice)
10. [Pasang PWA dan uji offline](#10-pasang-pwa-dan-uji-offline)
11. [Serah terima ke pengguna lain](#11-serah-terima-ke-pengguna-lain)
12. [Backup dan pindah perangkat](#12-backup-dan-pindah-perangkat)
13. [Update aplikasi dan rollback](#13-update-aplikasi-dan-rollback)
14. [Domain sendiri bila diperlukan](#14-domain-sendiri-bila-diperlukan)
15. [Jalur alternatif lewat CLI](#15-jalur-alternatif-lewat-cli)
16. [Pengembangan lokal dan file env](#16-pengembangan-lokal-dan-file-env)
17. [Jika ingin mengaktifkan preview](#17-jika-ingin-mengaktifkan-preview)
18. [Troubleshooting](#18-troubleshooting)
19. [Biaya, kuota dan batas fitur](#19-biaya-kuota-dan-batas-fitur)
20. [Lampiran](#20-lampiran)

---

## 1. Peta perjalanan dan kosakata

### 1.1 Gambaran besar

```text
Laptop kamu
  |  source code
  v
GitHub (repository private)
  |  Cloudflare mengambil source dan menjalankan build
  v
Cloudflare Workers Builds
  |  menghasilkan frontend + API dalam satu Worker
  v
URL HTTPS: https://monee.SUBDOMAIN_KAMU.workers.dev
  |
  |  masuk melalui Access hanya pada /auth/bootstrap
  v
Pengguna -> sesi Monee (cookie aman, 30 hari idle) -> ledger akun D1
                                                   |
                                                   +-> voice: audio -> Worker -> Groq Whisper -> teks
                                                   |
                                                   +-> cache dan antrean offline: IndexedDB per perangkat
```

Yang perlu dipahami sejak awal:

- **Aplikasi dan API berada di satu Worker.** Frontend statis dan endpoint `/api/transcribe` dilayani dari alamat yang sama.
- **Access memvalidasi identitas saat bootstrap akun.** Worker menerbitkan sesi Monee; API memeriksa sesi tersebut.
- **PIN perangkat opsional.** PIN hanya mengunci cache lokal dan tidak pernah dikirim ke cloud.
- **Data keuangan tidak disimpan di cloud.** Ledger ada di IndexedDB browser. Login email yang sama di perangkat lain tidak menyinkronkan data.
- **Groq hanya dipakai untuk mengubah suara menjadi teks.** Key Groq disimpan sebagai secret di server, bukan di browser.

### 1.2 Siapa yang butuh akun apa

| Yang disiapkan | Siapa yang membuat | Dipakai untuk | Pengguna biasa perlu? |
|---|---|---|---|
| Akun GitHub | Pemilik | Menyimpan source dan memicu build | Tidak |
| Akun Cloudflare | Pemilik | Hosting Worker, Access, secret | Tidak |
| Zero Trust Free di Cloudflare | Pemilik | Login email dan daftar orang yang boleh masuk | Tidak |
| Akun Groq + API key | Pemilik | Transkripsi suara | Tidak |
| Email aktif | Setiap pengguna | Menerima kode login Access | Ya |
| Metode pembayaran Cloudflare | Pemilik | Verifikasi paket Free (tagihan $0) | Tidak |
| Domain sendiri | Pemilik, opsional | Alamat khusus | Tidak wajib |

**Pacarmu/pengguna lain tidak perlu akun Cloudflare.** Kamu hanya menambahkan alamat emailnya ke daftar izin. Saat membuka aplikasi, dia memasukkan email sendiri dan menerima kode OTP.

### 1.3 Kosakata singkat

| Istilah | Arti sederhana |
|---|---|
| **Repository** | Folder proyek yang disimpan di GitHub |
| **Commit** | Rekaman perubahan pada repository |
| **Push** | Mengirim commit dari laptop ke GitHub |
| **Worker** | Program yang berjalan di server Cloudflare; di proyek ini sekaligus menyajikan aplikasi dan API voice |
| **Workers Builds** | Layanan Cloudflare yang otomatis menjalankan build setelah kamu push ke GitHub |
| **Build** | Proses mengubah source menjadi file siap pakai di `dist/` |
| **Deploy** | Proses menerbitkan hasil build ke URL publik |
| **Zero Trust** | Layanan Cloudflare untuk mengatur siapa yang boleh mengakses aplikasi |
| **Access** | Lapisan login di depan Worker; memakai kebijakan email |
| **OTP** | Kode sekali pakai yang dikirim ke email |
| **AUD** | Application Audience, pengenal aplikasi Access yang dipakai server untuk memeriksa token |
| **Secret** | Nilai rahasia (misalnya API key) yang disimpan di server dan tidak ditampilkan lagi |
| **Variable** | Nilai konfigurasi biasa (bukan rahasia) yang dibaca Worker |
| **IndexedDB** | Penyimpanan data lokal di browser |
| **PWA** | Aplikasi web yang bisa dipasang ke layar utama dan dibuka seperti aplikasi |
| **Origin** | Kombinasi alamat dan port, misalnya `https://monee.abc.workers.dev` |

### 1.4 Aturan keselamatan

1. Jangan pernah menempelkan `GROQ_API_KEY`, password, kode OTP, atau isi `.dev.vars` ke GitHub, chat, screenshot, atau dokumen ini.
2. Jangan memberi nama variable dengan awalan `VITE_`. Vite dapat memasukkan nilai berawalan `VITE_` ke browser.
3. Jangan memakai `Everyone` atau seluruh domain email pada kebijakan Access.
4. Jangan membagikan PIN Monee. PIN adalah kunci data pribadi di perangkat.
5. Jangan menghapus lockfile atau menjalankan `npm audit fix --force` hanya untuk melewati error.
6. Jangan menganggap data aman hanya karena aplikasi memakai login email. Backup tetap tanggung jawab pemilik.

---

## 2. Persiapan bahan dan keputusan

### 2.1 Checklist bahan

Siapkan sebelum mulai:

- [ ] Laptop Windows yang dipakai untuk mengelola proyek.
- [ ] Koneksi internet yang stabil.
- [ ] Browser modern: Chrome, Edge, atau Firefox versi terbaru.
- [ ] Email pemilik yang aktif dan bisa dibuka (untuk verifikasi Cloudflare dan login Access).
- [ ] Email pengguna lain yang akan diizinkan (misalnya email pacar), jika ada.
- [ ] Akun GitHub.
- [ ] Metode pembayaran untuk verifikasi Zero Trust Free: PayPal yang terhubung ke kartu Mandiri, atau kartu Visa/Mastercard.
- [ ] Nomor HP untuk verifikasi akun Groq bila diminta.
- [ ] Waktu kurang lebih 60-120 menit untuk percobaan pertama.

### 2.2 Perkiraan biaya

| Layanan | Paket yang dipakai | Biaya |
|---|---|---|
| GitHub | Free | $0 |
| Cloudflare Workers | Free | $0, dengan batas pemakaian |
| Cloudflare Zero Trust/Access | Free | $0 untuk hingga 50 pengguna (periksa halaman paket) |
| Groq | Free/tier yang tersedia di akunmu | Mengikuti kuota akun |
| Domain sendiri | Opsional | Biaya registrasi/perpanjangan terpisah |

**Soal metode pembayaran:** Cloudflare meminta detail pembayaran saat onboarding Zero Trust Free, tetapi paketnya **$0**. Ini verifikasi, bukan langganan berbayar. Kadang bank menampilkan notifikasi otorisasi sementara; periksa mutasi dan jangan panik. Detail penanganan ada di bagian 5.3.

### 2.3 Lembar catatan

Isi catatan pribadi (bukan di-commit ke GitHub) saat kamu melewati langkah-langkah:

| Catatan | Nilai kamu |
|---|---|
| Tanggal mulai | |
| Email akun Cloudflare | |
| Nama team Zero Trust | |
| Team domain | `https://________________.cloudflareaccess.com` |
| URL Worker | `https://monee.________________.workers.dev` |
| AUD aplikasi Access | |
| Email yang diizinkan | |
| Session duration Access | |
| Nama key Groq | |
| Lokasi key Groq disimpan | |
| Tanggal uji voice berhasil | |

Contoh pengisian (jangan disalin mentah):

```text
Team domain : https://monee-keluarga.cloudflareaccess.com
URL Worker  : https://monee.SUBDOMAIN_KAMU.workers.dev
AUD         : 64 karakter heksadesimal dari Additional settings
Email izin  : emailkamu@gmail.com, emailpasangan@gmail.com
```

### 2.4 Keputusan yang harus dibuat sekarang

1. **Nama team Zero Trust.** Pilih nama yang mudah diingat, misalnya `monee-keluarga`. Nama ini akan menjadi bagian dari alamat login.
2. **Email yang diizinkan.** Putuskan email pemilik dan email pengguna lain sejak awal. Bisa ditambah nanti.
3. **Session duration Access.** Berapa lama pengguna tetap login sebelum diminta kode email lagi. Untuk dua pengguna pribadi, 1 minggu atau 1 bulan lebih nyaman; 24 jam lebih aman di perangkat bersama.
4. **Alamat utama.** Pakai `workers.dev` dulu. Pindah domain nanti berarti export/import data, jadi putuskan sebelum mengisi data sungguhan.
5. **Nama Worker.** Proyek memakai `monee`. Pertahankan agar cocok dengan `wrangler.jsonc`.

---

## 3. Periksa komputer Windows

Bagian ini hanya membutuhkan **Git** dan **Node.js**. PHP/Laragon tidak dipakai untuk deployment Monee.

### 3.1 Buka PowerShell yang benar

1. Tekan tombol **Start**.
2. Ketik `PowerShell`.
3. Klik **Windows PowerShell** (bukan Command Prompt).
4. Jendela akan menampilkan prompt seperti `PS C:\Users\ACER>`.

Jika kamu menyalin perintah dari panduan ini, salin **hanya perintahnya**, bukan tulisan `PS ...>` di depannya.

### 3.2 Pasang Git dan Node jika belum ada

1. Pasang Git for Windows dari [situs resmi Git](https://git-scm.com/install/windows). Klik **Next** dengan pilihan default sampai selesai.
2. Pasang **Node.js 22.23.4 atau patch 22.x yang lebih baru** dari [halaman unduhan Node.js](https://nodejs.org/en/download). Pilih versi 22, jangan major lain.
3. Tutup **semua** jendela PowerShell, lalu buka PowerShell baru. Perubahan PATH hanya terbaca oleh terminal yang dibuka setelah instalasi.

Jika sebelumnya kamu pernah memasang Node versi lain, pastikan perintah `node` menunjuk versi 22.23.4 atau lebih baru dalam major 22.

### 3.3 Verifikasi alat

Jalankan satu per satu:

```powershell
git --version
node --version
npm.cmd --version
```

**Hasil yang diharapkan:**

```text
git version 2.x.x
v22.23.4
10.x.x
```

Jika `node` menampilkan versi lain, tutup terminal dan buka lagi. Jika masih salah, periksa urutan PATH atau instalasi Node.

### 3.4 Masuk ke folder proyek

```powershell
Set-Location -LiteralPath 'D:/PROJECT2/monee'
Get-Location
Test-Path package.json
Test-Path wrangler.jsonc
Get-Content .node-version
```

**Hasil yang diharapkan:**

- `Get-Location` menampilkan `D:\PROJECT2\monee`.
- Kedua `Test-Path` bernilai `True`.
- `.node-version` berisi `22.23.4`.

Jika `Test-Path` bernilai `False`, kamu berada di folder yang salah. Jangan lanjut sebelum path benar.

### 3.5 Periksa file penting

Pastikan file/folder berikut ada di root proyek:

```text
package.json
package-lock.json
.node-version
.gitignore
wrangler.jsonc
index.html
src/
server/index.ts
public/
mascots/
tests/
tools/
docs/
```

`tests/` dan `tools/` memang dipertahankan untuk pemeriksaan. Keduanya bukan data pengguna dan tidak otomatis masuk ke frontend `dist/`.

Periksa juga `wrangler.jsonc`. Nilai proyek saat panduan ditulis:

| Pengaturan | Nilai proyek |
|---|---|
| `name` | `monee` |
| `main` | `server/index.ts` |
| Assets directory / binding | `./dist` / `ASSETS` |
| Fallback | `single-page-application` |
| Worker lebih dulu | `/api`, `/api/*`, `/auth/refresh` |
| `keep_vars` | `true` |
| `compatibility_flags` | `["enable_request_signal"]` agar pembatalan client diteruskan ke pekerjaan voice/OCR |
| Rate limiter | `AI_RATE_LIMIT`, namespace `1001`, 10 request/60 detik |

Untuk awal, pertahankan nama `monee`. Jika memilih nama lain, ubah `name` di file tersebut sebelum commit, lalu gunakan nama yang sama di Cloudflare. Nomor namespace limiter bukan ID database dan tidak perlu dibuat sebagai database. Jika akun sudah memakai namespace `1001` untuk limiter lain, pilih angka positif lain yang belum dipakai dan commit perubahan tersebut.

### 3.6 Pasang dependensi

```powershell
npm.cmd ci
```

**Apa yang terjadi:** npm membaca `package-lock.json` dan memasang dependensi yang persis tercatat. Folder `node_modules/` akan dibuat atau diperbarui.

**Hasil yang diharapkan:** perintah selesai tanpa error. Peringatan kecil tentang dependency deprecated biasanya tidak menghentikan proses.

**Jika gagal:**

| Pesan | Arti dan tindakan |
|---|---|
| `EBADENGINE` | Node tidak sesuai. Pasang Node 22.23.4+ dan buka ulang terminal. |
| `EUSAGE` / lockfile tidak cocok | Jangan hapus lockfile. Periksa apakah `package.json` dan `package-lock.json` berasal dari commit yang sama. |
| `ECONNRESET` / timeout | Periksa koneksi, coba ulang. Jangan langsung mengganti registry. |
| `npm.ps1 cannot be loaded` | Gunakan `npm.cmd`, bukan `npm`. |

### 3.7 Uji bundling deployment

```powershell
npm.cmd run deploy:check
```

Perintah ini menjalankan `npm run build` lalu `wrangler deploy --dry-run`. Artinya: frontend dibangun dan konfigurasi Worker diperiksa, tetapi **tidak ada yang diunggah**.

**Hasil yang diharapkan:**

- Build Vite selesai dan folder `dist/` terisi.
- Wrangler menampilkan binding `ASSETS` dan `AI_RATE_LIMIT`.
- Wrangler keluar dengan kode sukses karena `--dry-run`.

Peringatan ukuran chunk Vite di atas 500 kB sudah diketahui dan bukan kegagalan build. Bedakan peringatan dari error yang benar-benar menghentikan proses.

### 3.8 Pemeriksaan kualitas opsional

Tidak wajib untuk deployment pertama, tetapi berguna sebelum mengubah kode:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

Hasil yang diharapkan: typecheck dan lint tanpa error; seluruh tes lulus.

### 3.9 Checklist bagian 3

- [ ] PowerShell baru sudah dibuka setelah instalasi.
- [ ] `git --version` berhasil.
- [ ] `node --version` menampilkan v22.23.4 atau patch 22.x lebih baru.
- [ ] Folder proyek benar dan `package.json`/`wrangler.jsonc` ada.
- [ ] `npm.cmd ci` selesai tanpa error.
- [ ] `npm.cmd run deploy:check` menampilkan `ASSETS` dan `AI_RATE_LIMIT`.

---

## 4. Pastikan source sudah di GitHub

Ada dua kemungkinan. Pilih salah satu; jangan mengulang langkah yang sudah selesai.

### 4.1 Tentukan jalur

Jalankan:

```powershell
git status
git branch --show-current
git remote -v
git log --oneline -3
```

- Jika `git remote -v` menampilkan `origin` dan `git log` memiliki commit, kamu berada di **Jalur A**.
- Jika belum ada repository atau remote, gunakan **Jalur B**.

### 4.2 Jalur A: repository sudah ada (kondisi proyek saat ini)

Saat panduan ini diperbarui, proyek Monee berada pada kondisi berikut:

- Repository contoh: `https://github.com/arjuridh0/monee.git`
- Branch: `main`
- Contoh commit deployment: `5264f84 Prepare Monee for deployment`

Gunakan remote yang benar-benar tampil di `git remote -v` pada komputermu. Commit boleh berbeda; yang penting branch `main` sudah ter-push.

Periksa ulang di komputermu:

```powershell
git status
git log --oneline -1
git remote -v
```

**Hasil yang diharapkan:**

- `git status` menyatakan `nothing to commit, working tree clean` atau hanya file yang memang belum ingin di-commit.
- Commit terakhir sudah ada.
- Remote `origin` menunjuk repository Monee milikmu.

Buka repository di browser dan pastikan `package.json` serta `wrangler.jsonc` terlihat di root. Jika repository private, pastikan kamu login dengan akun GitHub yang benar.

Jika working tree kotor karena ada perubahan yang belum di-commit, jangan langsung `git reset --hard`. Periksa dulu:

```powershell
git status --short
git diff --stat
git diff
```

Commit perubahan yang memang ingin disimpan, atau simpan di tempat lain. Jangan menghapus pekerjaan yang belum kamu pahami.

### 4.3 Jalur B: buat repository baru dari nol

Lakukan hanya jika belum punya repository.

1. Login ke [GitHub](https://github.com).
2. Klik **+** di kanan atas, lalu **New repository**.
3. Pilih akun pemilik.
4. Nama repository: `monee`.
5. Pilih **Private**.
6. **Jangan** centang "Add a README file", "Add .gitignore", atau "Choose a license". Proyek sudah punya file sendiri.
7. Klik **Create repository**.
8. Salin URL HTTPS yang muncul, misalnya `https://github.com/USERNAME/monee.git`.

Kembali ke PowerShell:

```powershell
Set-Location -LiteralPath 'D:/PROJECT2/monee'
Test-Path .git
```

Jika **False**:

```powershell
git init -b main
```

Atur identitas commit. Ganti dengan nama dan email milikmu:

```powershell
git config user.name "Nama Kamu"
git config user.email "email-commit-kamu@example.com"
```

Identitas commit bukan password GitHub. Email boleh memakai email terverifikasi atau alamat `noreply` dari **GitHub > Settings > Emails**.

### 4.4 Periksa ignore sebelum commit

```powershell
git status --short --untracked-files=normal
git check-ignore -v -- .env .dev.vars .wrangler/state/example node_modules/example dist/index.html artifacts/example .local/example LOCAL_REPORT.md
git add --dry-run .
```

Perhatikan bagian penting:

- **Harus diabaikan:** `node_modules/`, `dist/`, `artifacts/`, `.local/`, `LOCAL_REPORT.md`, `.wrangler/`, `.dev.vars`, file `.env` asli, file key/sertifikat, dan pengaturan agent lokal.
- **Boleh masuk:** source, `package.json`, `package-lock.json`, `.node-version`, `.gitignore`, `wrangler.jsonc`, aset runtime di `public/`, `mascots/`, tes/tooling, dan docs.

Jangan memakai `git add -f` untuk memaksa file rahasia masuk. Jika file rahasia sudah pernah ter-commit, menghapusnya di commit baru tidak menghapus dari riwayat; ganti key tersebut di provider.

### 4.5 Commit dan push

Setelah daftar file benar:

```powershell
git add .
git diff --cached --stat
git diff --cached --name-only
```

Baca daftar yang akan di-commit. Jika ada file aneh, hentikan dan periksa. Jika sudah yakin:

```powershell
git commit -m "Prepare Monee for deployment"
git remote add origin "https://github.com/USERNAME/monee.git"
git remote -v
git push -u origin main
```

- Ganti `USERNAME` dengan username GitHub-mu.
- Jika `origin` sudah ada, **jangan** menjalankan `remote add` lagi. Cukup cocokkan URL dengan `git remote -v`.
- Git for Windows dapat membuka browser untuk login. Selesaikan otorisasi di browser. Password website GitHub bukan password untuk push HTTPS; gunakan Git Credential Manager atau personal access token sesuai petunjuk GitHub.

### 4.6 Verifikasi di GitHub

Buka repository di browser. Pastikan:

- Branch `main` terlihat.
- `package.json`, `package-lock.json`, `wrangler.jsonc`, `.node-version` ada di root.
- `src/`, `server/`, `public/`, `mascots/`, `tests/`, `tools/`, `docs/` ada.
- Tidak ada `node_modules/`, `dist/`, `.dev.vars`, atau file key.

### 4.7 Checklist bagian 4

- [ ] `git remote -v` menunjuk repository yang benar.
- [ ] Branch `main` sudah di-push.
- [ ] File proyek terlihat di GitHub.
- [ ] Tidak ada secret/credential di repository.
- [ ] Working tree bersih atau hanya berisi perubahan yang disengaja.

---

## 5. Siapkan Cloudflare, Zero Trust, dan pembayaran

Bagian ini paling sering membuat pemula berhenti, terutama karena permintaan metode pembayaran. Ikuti perlahan.

**Jika kamu sudah berhasil membuat akun Cloudflare, memilih paket Free, dan menyimpan metode pembayaran**, lewati 5.1-5.3. Mulai dari 5.4 untuk mencatat team domain. Jangan mengulang onboarding atau menambahkan metode pembayaran kedua tanpa alasan.

### 5.1 Buat akun Cloudflare

1. Buka [dashboard Cloudflare](https://dash.cloudflare.com).
2. Klik **Sign up** jika belum punya akun.
3. Masukkan email pemilik dan password.
4. Buka email, klik tautan verifikasi.
5. Login kembali ke dashboard.

**Hasil yang diharapkan:** kamu masuk ke dashboard Cloudflare dan melihat daftar akun/domain (bisa kosong jika akun baru).

**Catatan:** email akun Cloudflare tidak harus sama dengan email yang nanti login ke aplikasi. Namun, untuk pemakaian pribadi, menyamakan keduanya lebih mudah diingat.

### 5.2 Buka Zero Trust dan pilih paket Free

1. Dari dashboard, cari menu **Zero Trust** (sebagian akun menampilkan **Cloudflare One**).
2. Jika diminta onboarding, isi nama organisasi/team. Contoh: `monee-keluarga`.
3. Pilih paket **Free**.
4. Baca ringkasan paket. Pastikan yang dipilih adalah paket **$0**, bukan paket berbayar.
5. Lanjutkan sampai onboarding meminta metode pembayaran.

**Jangan memilih paket berbayar** hanya karena tombolnya lebih menonjol. Paket Free sudah cukup untuk dua pengguna.

### 5.3 Lengkapi metode pembayaran

#### 5.3.1 Kenapa diminta, padahal Free?

Cloudflare mensyaratkan profil pembayaran untuk mengaktifkan Zero Trust, termasuk paket Free. Tidak ada tagihan langganan pada paket Free. Metode pembayaran dipakai untuk verifikasi dan sebagai cadangan jika kamu nanti memilih fitur berbayar.

Yang diterima Cloudflare (saat panduan ditulis): **Visa, Mastercard, American Express, Discover, UnionPay, PayPal, Apple Pay, Google Pay, dan Link**.

#### 5.3.2 Jalur yang disarankan: PayPal

Jika kartu Mandiri-mu sudah terhubung ke PayPal tetapi input kartu langsung selalu ditolak, coba urutan ini:

1. Buka **Manage Account** (Kelola Akun) di dashboard Cloudflare.
2. Pilih **Billing**.
3. Pilih **Payment Methods** (Metode Pembayaran).
4. Klik **Add Payment Method** (Tambah Metode Pembayaran).
5. Pilih **PayPal**.
6. Jendela PayPal akan terbuka. Login ke akun PayPal-mu.
7. Pilih kartu Mandiri sebagai sumber dana, lalu setujui.
8. Kembali ke Cloudflare. Pastikan PayPal muncul di daftar metode pembayaran.
9. Baru kembali ke onboarding **Zero Trust** dan pilih paket **Free**; gunakan PayPal yang sudah tersimpan.

Jika kamu sudah terlanjur berada di layar pembayaran Zero Trust, buka tab baru ke dashboard utama Cloudflare, lakukan langkah 1-8 di tab itu, lalu kembali ke tab onboarding dan refresh halaman.

**Kenapa cara ini lebih sering berhasil:** PayPal diproses sebagai metode pembayaran tersendiri, bukan sebagai input nomor kartu langsung. Beberapa bank di Indonesia juga lebih konsisten mengotorisasi transaksi lewat PayPal.

**Hasil yang diharapkan:** PayPal terlihat sebagai metode pembayaran aktif, dan onboarding Zero Trust dapat diselesaikan tanpa error.

Kadang muncul notifikasi dari bank tentang otorisasi. Itu bukan tagihan paket Free. Jika ragu, cek mutasi beberapa hari kemudian; jangan mengulang transaksi berkali-kali.

#### 5.3.3 Jika memakai kartu langsung

Gunakan kartu **Visa/Mastercard** (kredit atau debit yang mendukung transaksi internasional). Sebelum mencoba:

1. Buka aplikasi **Livin' by Mandiri**.
2. Cari pengaturan kartu debit.
3. Aktifkan **transaksi online** dan **transaksi internasional** jika tersedia.
4. Pastikan saldo cukup untuk otorisasi sementara.
5. Isi nama dan alamat billing **persis** seperti data bank.
6. Gunakan browser biasa/incognito, matikan VPN dan pemblokir iklan.
7. Selesaikan popup 3-D Secure dari bank.

Jika kartu tetap ditolak, jangan mengulang puluhan kali. Ganti jalur (PayPal) atau gunakan kartu lain.

#### 5.3.4 Jika PayPal juga ditolak

Periksa satu per satu:

- Akun PayPal sudah terverifikasi (email dan kartu sudah dikonfirmasi).
- Kartu Mandiri mengizinkan transaksi online/internasional.
- Nama dan alamat di PayPal sama dengan data bank.
- Tidak ada batas transaksi internasional pada kartu.
- Coba dari browser lain atau jaringan lain.
- Coba tambahkan metode pembayaran dari halaman **Billing**, bukan dari layar paywall Zero Trust.

Alternatif yang masih wajar:

- **Virtual Debit Card Livin' by Mandiri** (fitur resmi Mandiri). Cloudflare kadang menerima kartu debit virtual, kadang menolak; hasilnya tidak dijamin.
- Kartu Visa/Mastercard dari bank lain (misalnya Jenius, Jago, Blu, SeaBank). Debit sering diterima, tetapi tidak dijamin.

**Jangan memakai jasa "virtual credit card" pihak ketiga** yang menjual nomor kartu. Risikonya besar: data kartu bocor, kartu dicabut, atau akun Cloudflare diblokir.

Jika semua jalur gagal, hubungi dukungan Cloudflare melalui dashboard dan jelaskan bahwa kamu ingin memakai Zero Trust Free. Jangan mengakali dengan membuat banyak akun.

#### 5.3.5 Verifikasi pembayaran

Sebelum lanjut, pastikan:

- [ ] Paket yang aktif adalah **Free**.
- [ ] Metode pembayaran tersimpan (PayPal atau kartu).
- [ ] Tidak ada tagihan langganan yang tidak kamu inginkan.
- [ ] Onboarding Zero Trust selesai dan dashboard Zero Trust dapat dibuka.

### 5.4 Tentukan team name dan catat team domain

1. Buka **Zero Trust > Settings**.
2. Cari **Team domain** (bisa berada di bagian **General/Umum**).
3. Catat nilai lengkapnya.

Formatnya:

```text
https://NAMA_TEAM_KAMU.cloudflareaccess.com
```

Contoh:

```text
https://monee-keluarga.cloudflareaccess.com
```

**Penting:**

- Ini **bukan** alamat `workers.dev`.
- Jangan menambahkan path, spasi, atau garis miring di akhir.
- Nilai ini nanti diisi sebagai `ACCESS_TEAM_DOMAIN`.

### 5.5 Tambahkan login One-time PIN

1. Buka **Zero Trust > Integrations > Identity providers**.
2. Klik **Add new identity provider**.
3. Pilih **One-time PIN**.
4. Simpan/aktifkan.

**Hasil yang diharapkan:** One-time PIN muncul di daftar identity provider.

Jika menu bernama lain, cari kata kunci **Identity providers**, **Login methods**, atau **Authentication**. Tujuannya satu: pengguna bisa memilih login dengan email dan kode OTP, bukan hanya akun Cloudflare.

### 5.6 Buat kebijakan email yang diizinkan

1. Buka **Zero Trust > Access controls > Policies**.
2. Klik **Add a policy**.
3. Nama: `Monee - email yang diizinkan`.
4. Action: **Allow**.
5. Session duration: pilih yang tersedia. Untuk dua pengguna pribadi, **1 minggu** atau **1 bulan** lebih nyaman. Jika perangkat dipakai bergantian, pilih **24 jam**. Ini adalah lama sesi login, bukan masa berlaku kode email; kode OTP hanya berlaku beberapa menit.
6. Pada **Include**, pilih selector **Emails**.
7. Masukkan email pemilik, misalnya `emailkamu@gmail.com`.
8. Klik **Add**/tambah baris lagi, lalu masukkan email pengguna lain, misalnya `emailpasangan@gmail.com`.
9. Simpan kebijakan.

**Jangan:**

- Memilih `Everyone`.
- Memasukkan seluruh domain seperti `gmail.com`.
- Menambahkan `Login Methods = One-time PIN` sebagai **Include** tambahan. Jika ingin mensyaratkannya, letakkan sebagai **Require**, bukan Include. Beberapa aturan Include digabung dengan OR dan bisa memperluas izin.

**Hasil yang diharapkan:** kebijakan Allow hanya berisi alamat email yang kamu pilih.

### 5.7 Verifikasi kebijakan

Buka kembali kebijakan dan periksa:

- [ ] Action = Allow.
- [ ] Hanya ada email yang kamu kenali.
- [ ] Tidak ada `Everyone` atau domain luas.
- [ ] Session duration sesuai keputusanmu.
- [ ] One-time PIN tersedia sebagai identity provider.

### 5.8 Checklist bagian 5

- [ ] Akun Cloudflare sudah terverifikasi.
- [ ] Zero Trust Free aktif.
- [ ] Metode pembayaran tersimpan (PayPal/kartu).
- [ ] Team domain dicatat.
- [ ] One-time PIN tersedia.
- [ ] Kebijakan Allow berisi email yang benar.

---

## 6. Hubungkan GitHub dan deploy Worker pertama

Pastikan bagian 4 selesai: source sudah ada di GitHub dan branch `main` terlihat.

### 6.1 Buka Workers & Pages

1. Kembali ke dashboard utama Cloudflare.
2. Buka **Workers & Pages** (sebagian akun: **Compute (Workers)**).
3. Klik **Create application** / **Create**.
4. Pilih tab **Workers**, bukan **Pages**.
5. Pilih **Import a repository** / **Connect to Git**.

Jangan memilih template, upload manual, atau alur **Pages**. Proyek ini sudah memiliki konfigurasi Wrangler sendiri.

**Cara membedakan alur Pages dan Workers:**

| Jika layar menampilkan... | Kamu berada di... |
|---|---|
| Framework preset, **Build output directory**, "Deploy a site from your account" | **Pages** — salah jalur, kembali |
| **Build command**, **Deploy command**, Root directory, Build variables | **Workers** — jalur yang benar |

Monee harus memakai **Workers** karena memiliki `server/index.ts`, `wrangler.jsonc`, binding `ASSETS`, dan rate limiter. Alur Pages tidak menjalankan konfigurasi Worker tersebut.

### 6.2 Pasang GitHub App

1. Jika Cloudflare meminta akses GitHub, klik **Connect GitHub**.
2. Pilih akun GitHub yang memiliki repository `monee`.
3. Pilih **Only select repositories**.
4. Pilih repository `monee`.
5. Klik **Install & Authorize**.

Repository Private tetap bisa dipakai setelah GitHub App diberi akses. Kamu tidak perlu mengubah repository menjadi Public.

### 6.3 Pilih repository dan isi pengaturan dasar

| Kolom | Isi |
|---|---|
| Repository | `monee` milikmu |
| Branch | `main` |
| Root directory | Kosongkan/default (proyek ada di root repository) |
| Worker name | `monee` — harus sama dengan `name` di `wrangler.jsonc` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |

**Catatan nama:** kolom **Worker name** atau **Project name** biasanya muncul di layar sebelum **Build settings**, saat kamu memilih repository. Jika tidak terlihat di layar build, kembali satu layar. Nama bisa terisi otomatis dari nama repository (`monee`); itulah yang diinginkan. Nama project di dashboard Cloudflare harus sama dengan `name` pada `wrangler.jsonc`. Jika kamu mengganti nama Worker, ubah juga `wrangler.jsonc` dan commit ulang.

Jika layar pengaturan build menampilkan **Framework preset** atau **Build output directory**, kamu berada di alur **Pages**. Kembali ke **Workers**; jangan melanjutkan form Pages.

### 6.4 Isi pengaturan build

| Kolom | Isi untuk Monee |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Root directory | Kosongkan/default |
| Build variables | Kosong; jangan isi `GROQ_API_KEY` di sini |
| Node version | Biarkan mengikuti `.node-version` (berisi `22.23.4`). Jika UI meminta `NODE_VERSION`, isi `22.23.4` atau `22`. |

**Tidak ada kolom Build output directory di Workers.** Folder aset `./dist` sudah ditentukan di `wrangler.jsonc`, jadi jangan mencari atau mengisinya. Jika kolom itu muncul, kamu sedang di alur Pages.

Gunakan perintah `npm`, bukan `npm.cmd`, di Cloudflare karena lingkungan build-nya Linux.

Workers Builds membaca `.node-version` atau build variable `NODE_VERSION`. Saat panduan ditulis, Node 22.23.4 tersedia di image build Cloudflare dan default-nya adalah Node 24.22.1. Karena proyek membatasi Node ke major 22, `.node-version` yang sudah di-commit harus dipertahankan: jangan menghapusnya.

**Build variables hanya untuk build.** Key Groq adalah **runtime secret**, dipasang di bagian 8, bukan di kolom build.

### 6.5 Deploy pertama

1. Klik **Save and Deploy** atau **Deploy**.
2. Tunggu beberapa menit. Kamu akan melihat tahapan:
   - mengambil source,
   - memasang dependensi (`npm ci`),
   - menjalankan build,
   - menjalankan deploy.
3. Baca log dari atas ke bawah. Pastikan tahap **deploy** berhasil, bukan hanya build frontend.
4. Setelah selesai, Cloudflare menampilkan URL produksi.

**Hasil yang diharapkan:** build dan deploy sukses; URL berbentuk:

```text
https://monee.SUBDOMAIN_KAMU.workers.dev
```

Catat URL tersebut di lembar catatan.

### 6.6 Buka URL pertama kali

1. Buka URL Worker di browser.
2. Karena Access belum dipasang, aplikasi akan langsung terbuka.
3. Pastikan halaman Monee tampil, bukan error 404/500 atau halaman template Cloudflare.

**Jangan bagikan URL ini dulu.** Siapa pun yang tahu alamatnya bisa membukanya sebelum Access dipasang. Lanjutkan ke bagian 7 segera.

Jika muncul error:

| Gejala | Pemeriksaan |
|---|---|
| `package.json` tidak ditemukan | Root directory salah. Pastikan kosong/default dan file ada di root repo. |
| Build gagal di `tsc` | Buka log; jalankan `npm run build` di laptop untuk melihat error yang sama. |
| Deploy gagal karena nama | Pastikan Worker name `monee` sama dengan `wrangler.jsonc`. |
| Halaman hanya template | Pastikan memilih Worker dengan `server/index.ts`, bukan project Pages statis. |
| `dist` tidak ada | Build command harus `npm run build` dan harus sukses sebelum deploy. |

### 6.7 Matikan preview build untuk rilis awal

1. Buka Worker `monee`.
2. Masuk **Settings > Build > Branch control**.
3. Pastikan production branch `main`.
4. Hapus centang **Enable Preview Builds**.
5. Simpan.

Preview tidak mewarisi secret/variable produksi. Untuk rilis pertama, matikan agar tidak ada URL tambahan yang membingungkan.

### 6.8 Checklist bagian 6

- [ ] GitHub App terhubung hanya ke repository `monee`.
- [ ] Worker name `monee`.
- [ ] Build command `npm run build`.
- [ ] Deploy command `npm run deploy`.
- [ ] Build dan deploy sukses.
- [ ] URL `workers.dev` tercatat dan halaman Monee terbuka.
- [ ] Preview build dimatikan.

---

## 7. Pasang Access pada Worker

Sekarang kita memasang "pintu login" di depan aplikasi.

### 7.1 Proteksi Access (konfigurasi awal, tidak berlaku untuk versi akun D1)

Bagian ini merekam konfigurasi saat aplikasi hanya memakai data lokal. Versi sekarang harus mengikuti konfigurasi path bootstrap di [bagian 21.2](#212-atur-cloudflare-access-untuk-bootstrap); jangan menerapkan **All traffic**.

### 7.2 Verifikasi aplikasi Access

1. Buka **Zero Trust > Access controls > Applications**.
2. Temukan aplikasi untuk Worker `monee`.
3. Klik **Configure**.
4. Periksa:
   - kebijakan Allow hanya berisi email yang benar;
   - **Login methods** mengizinkan **One-time PIN**;
   - tidak ada Allow lain yang terlalu luas.
5. Simpan jika ada perubahan.

**Jangan membuat aplikasi Access baru untuk hostname yang sama.** Konfigurasi bertumpuk dapat menghasilkan AUD berbeda dan membuat voice gagal.

### 7.3 Uji login email

1. Buka jendela **Incognito/InPrivate** baru.
2. Kunjungi URL `workers.dev` milikmu.
3. Kamu akan melihat halaman login Cloudflare Access.
4. Pilih login dengan email/One-time PIN.
5. Masukkan email yang ada di kebijakan.
6. Klik **Send login code** / **Kirim kode masuk**.
7. Buka inbox (dan folder spam).
8. Salin kode terbaru.
9. Masukkan kode dan klik **Sign in** / **Masuk**.

**Hasil yang diharapkan:** setelah kode benar, aplikasi Monee terbuka.

Jika email tidak menerima kode:

- Periksa ejaan alamat di kebijakan.
- Periksa spam/junk.
- Pastikan email yang diketik sama persis dengan yang diizinkan.
- Minta kode baru jika kode lama kedaluwarsa.
- Ingat: halaman Access bisa tetap mengatakan "kode dikirim" meskipun alamat tidak diizinkan. Jangan menganggap tulisan itu bukti izin berhasil.

### 7.4 Uji email yang tidak diizinkan

Jika kamu punya email lain:

1. Buka jendela privat baru.
2. Masukkan email yang **tidak** ada di kebijakan.
3. Coba minta kode dan login.

**Hasil yang diharapkan:** email tersebut tidak memperoleh akses ke aplikasi.

### 7.5 Perilaku untuk pengguna lain

Pengguna yang emailnya ditambahkan:

- Tidak perlu akun Cloudflare.
- Cukup memasukkan email dan kode OTP.
- Akan diminta login lagi setelah session duration berakhir.
- Masuk ke akun yang sama di semua perangkat; PIN opsional hanya berlaku pada perangkat yang memasangnya.

### 7.6 Checklist bagian 7

- [ ] Access melindungi `/auth/bootstrap` saja sesuai bagian 21.2.
- [ ] Kebijakan email benar.
- [ ] One-time PIN tersedia.
- [ ] Login dengan email yang diizinkan berhasil.
- [ ] Email yang tidak diizinkan ditolak.
- [ ] API Worker menolak sesi Monee yang tidak valid meskipun halaman shell dapat dimuat.

---

## 8. Buat key Groq dan isi konfigurasi server

Sampai di sini aplikasi sudah bisa dibuka, tetapi voice belum bisa memanggil Groq karena tiga nilai server belum diisi.

### 8.1 Buat akun Groq

1. Buka [Groq Console](https://console.groq.com).
2. Daftar/login memakai Google, GitHub, atau email.
3. Selesaikan verifikasi yang diminta (misalnya verifikasi email atau nomor HP).
4. Pastikan kamu bisa membuka dashboard Groq.

**Catatan:** ketersediaan paket gratis dan verifikasi dapat berbeda menurut negara/akun. Jika Groq meminta verifikasi tambahan, ikuti petunjuk di konsol.

### 8.2 Buat API key

1. Buka [API Keys](https://console.groq.com/keys).
2. Klik **Create API Key**.
3. Nama: `monee-production`.
4. Selesaikan pembuatan.
5. Salin nilai lengkap key **sekarang**. Setelah dialog ditutup, nilai lengkap biasanya tidak ditampilkan lagi.
6. Simpan di password manager atau catatan pribadi yang aman. Jangan tempel ke GitHub/chat/screenshot.

Jika key hilang, buat key baru dan ganti secret di Cloudflare.

### 8.3 Pastikan model diizinkan

Kode Monee memakai model **`whisper-large-v3`**, tanpa akhiran `-turbo`. Tidak ada pilihan model di UI Monee.

Periksa izin model:

1. Buka **Settings > Organization > Limits** untuk organisasi, atau
2. Pilih project lalu **Settings > Projects > Limits** untuk project.

Pastikan `whisper-large-v3` diizinkan. Jika organisasi memblokir model, izin di level project tidak mengalahkan blokir organisasi.

### 8.4 Salin team domain

Dari **Zero Trust > Settings**, ambil team domain. Nilai yang benar:

```text
https://NAMA_TEAM_KAMU.cloudflareaccess.com
```

Jangan memakai:

- alamat `workers.dev`;
- URL halaman login lengkap;
- path tambahan;
- spasi atau garis miring di akhir.

### 8.5 Salin AUD aplikasi Access

1. Buka **Zero Trust > Access controls > Applications**.
2. Temukan aplikasi Access untuk Worker `monee`.
3. Klik **Configure**.
4. Buka **Additional settings**.
5. Salin **Application Audience (AUD) Tag**.

AUD yang diharapkan berupa **64 karakter heksadesimal**.

Jangan tertukar dengan:

- Account ID Cloudflare;
- API token Cloudflare;
- Application ID;
- Client ID.

Jika aplikasi Access dihapus dan dibuat ulang, AUD berubah. Ambil nilai baru.

### 8.6 Isi Variables and Secrets

1. Buka **Workers & Pages > monee > Settings > Variables and Secrets**.
2. Jika ada pilihan scope, pilih **Production**.
3. Klik **Add**.
4. Tambahkan tiga entri berikut, satu per satu:

| Nama (huruf besar, persis) | Jenis | Nilai |
|---|---|---|
| `ACCESS_TEAM_DOMAIN` | Text / Variable | `https://NAMA_TEAM_KAMU.cloudflareaccess.com` |
| `ACCESS_AUD` | Text / Variable | AUD 64 karakter dari langkah 8.5 |
| `GROQ_API_KEY` | **Secret** | Key Groq lengkap dari langkah 8.2 |

5. Tempel nilai tanpa tanda kutip tambahan, spasi di awal/akhir, atau baris baru.
6. Simpan.
7. Klik **Deploy** untuk menerapkan versi baru.

**Hasil yang diharapkan:**

- Dua variable terlihat dengan nilainya.
- `GROQ_API_KEY` terlihat namanya, tetapi nilainya disembunyikan.
- Deployment baru menjadi versi aktif.

### 8.7 Hal yang tidak perlu dilakukan

- **Tidak perlu** membuat `.env` produksi di GitHub. Nilai diberikan oleh dashboard Cloudflare.
- D1 diperlukan untuk ledger akun lintas perangkat; siapkan binding-nya sesuai bagian 21.1.
- **Jangan** memberi nama `VITE_GROQ_API_KEY`. Awalan `VITE_` dapat membocorkan nilai ke browser.
- **Jangan** menaruh key Groq di build variables.

`keep_vars: true` pada `wrangler.jsonc` membantu mempertahankan variable dashboard saat deploy berikutnya. Tetap periksa setelah deploy jika konfigurasi berubah.

### 8.8 Binding yang sudah otomatis

Dua binding ini berasal dari `wrangler.jsonc` dan **bukan** nilai yang kamu isi manual. D1 `DB` memerlukan UUID sesuai bagian 21.1:

- `ASSETS` — menyajikan hasil build `dist/`.
- `AI_RATE_LIMIT` — membatasi voice dan OCR per akun; `AUTH_RATE_LIMIT` membatasi bootstrap akun.

Tidak perlu membuat database untuk limiter. Jika deployment menolak binding limiter, baca pesan error dan periksa dukungan akun; jangan menghapus limiter sebagai jalan pintas.

### 8.9 Checklist bagian 8

- [ ] Key Groq dibuat dan disimpan aman.
- [ ] Model `whisper-large-v3` diizinkan.
- [ ] `ACCESS_TEAM_DOMAIN` benar.
- [ ] `ACCESS_AUD` benar (64 karakter).
- [ ] `GROQ_API_KEY` bertipe Secret.
- [ ] Deployment baru sudah diterapkan.
- [ ] Tidak ada key di GitHub atau build variables.

### 8.10 Aktifkan OCR Google Gemini (opsional)

Versi perbaikan November 2026 menghubungkan tombol **Baca otomatis** ke endpoint Worker `/api/receipt`, lalu ke model `gemini-3.5-flash-lite`. Jalur ini memerlukan deployment kode terbaru; input item manual tetap tersedia bila key belum dipasang.

1. Buka [API keys di Google AI Studio](https://aistudio.google.com/api-keys) dan pilih project untuk key OCR milikmu.
2. Di Cloudflare, buka **Workers & Pages > monee > Settings > Variables and Secrets > Add**.
3. Pilih jenis **Secret**, isi nama `GEMINI_API_KEY`, lalu tempel nilai key. Jangan memasukkannya ke build variables, `wrangler.jsonc`, atau variabel berawalan `VITE_`.
4. Simpan dan **Deploy** agar secret tersedia untuk Worker. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, dan binding `AI_RATE_LIMIT` tetap diperlukan; jangan melepas Access.
5. Buka Monee > **Catat > Scan struk**. Pilih JPEG/PNG/WebP maksimal 10 MB, setujui pengiriman foto, lalu pilih **Baca otomatis**.
6. Periksa nama item, nominal, tanggal, bucket, dan perbedaan total sebelum memilih **Simpan semua item**. Hasil AI tidak disimpan otomatis.
7. Uji dulu memakai struk contoh tanpa informasi pribadi. Google menjelaskan bahwa input layanan gratis dapat digunakan untuk peningkatan model dan ditinjau manusia; perlakuan data pada layanan berbayar berbeda. Baca [ketentuan Gemini](https://ai.google.dev/gemini-api/terms) sesuai project yang dipakai. Monee tidak menyimpan foto pada ledger/backup; hal itu tidak menentukan retensi Google.

Jika sesi Access habis, pilih **Masuk ulang pembaca struk**. Bila key belum dipasang, kuota penuh, hasil tidak terbaca, atau koneksi gagal, pengguna tetap dapat mengisi item secara manual. Pengujian dengan respons tiruan tidak membuktikan akurasi OCR pada struk asli.

---

## 9. Uji aplikasi dan voice

Lakukan pengujian dari URL publik, bukan hanya di laptop. Hasil tes lokal tidak menggantikan pengujian hosting.

### 9.1 Login dan onboarding

1. Buka URL produksi di browser biasa yang akan kamu pakai sehari-hari.
2. Login dengan email yang diizinkan dan kode OTP.
3. Jika data browser masih kosong, aplikasi menampilkan onboarding.
4. Isi **Nama panggilan**.
5. Pada langkah pemasukan, isi nominal percobaan, misalnya `Rp1.000.000`, agar ada saldo untuk uji.
6. Lanjutkan pengaturan alokasi.
7. Pilih maskot.
8. Buat **PIN 6 digit**, lalu ulangi.
9. Baca dan setujui persetujuan yang ditampilkan.
10. Klik **Selesai & masuk**.
11. Pastikan Beranda terbuka.
12. Reload halaman, buka PIN, dan pastikan onboarding tidak diminta lagi.

Jika ini ledger sungguhan, jangan menambahkan nominal contoh ke pembukuan yang sudah berisi data. Gunakan pemasukan sungguhan atau lewati langkah pemasukan.

### 9.2 Uji input manual

1. Tekan tombol tambah transaksi.
2. Isi pengeluaran kecil yang tidak melebihi saldo/jatah.
3. Pilih kategori dan bucket yang benar.
4. Simpan.
5. Periksa Riwayat dan saldo.
6. Reload halaman dan pastikan transaksi tetap ada.

**Hasil yang diharapkan:** transaksi tersimpan tepat sekali, saldo sesuai, dan data bertahan setelah reload.

Jika pemasukan dilewati, penolakan pengeluaran tanpa saldo adalah aturan finance, bukan bukti hosting gagal.

### 9.3 Uji voice

1. Buka tambah transaksi.
2. Pilih **Catat dengan suara**.
3. Baca dan centang persetujuan pengiriman audio untuk sesi itu.
4. Tekan **Mulai rekam**.
5. Izinkan mikrofon saat browser meminta.
6. Ucapkan kalimat pendek, misalnya: **"makan 25rb"**.
7. Tekan **Berhenti rekam**. Batas UI 30 detik; deteksi jeda juga dapat menghentikan rekaman.
8. Tunggu teks dan draft muncul.
9. Periksa nominal, tanggal, jenis transaksi, kategori, dan bucket.
10. Koreksi jika perlu.
11. Simpan sekali.
12. Tunggu periode undo selesai, lalu periksa Riwayat.

**Hasil yang diharapkan:** pengguna tidak pernah diminta key Groq; audio diproses di server, teks muncul, dan draft harus diperiksa sebelum menjadi transaksi.

Model transkripsi tidak menjamin semua ucapan/slang benar. Parser tetap berjalan lokal dan tidak menambahkan chatbot/LLM umum ke aplikasi.

### 9.4 Periksa request di DevTools jika voice gagal

Di Chrome/Edge laptop:

1. Tekan **F12** atau **Ctrl+Shift+I**.
2. Buka tab **Network**.
3. Ketik `transcribe` di filter.
4. Ulangi satu rekaman pendek.
5. Klik request **POST /api/transcribe**.
6. Periksa **Status Code** dan tab **Response**.

Sukses menghasilkan `200` dengan JSON berisi `"text"`.

URL request harus berada di origin Monee. Tidak boleh ada panggilan browser langsung ke `api.groq.com` atau header Authorization berisi key Groq; hubungan ke Groq terjadi di server.

**Jangan membagikan** cookie sesi, key, audio, transkrip pribadi, atau file HAR lengkap saat meminta bantuan. Status HTTP, URL tanpa informasi rahasia, dan pesan error biasanya cukup.

### 9.5 Uji login ulang dan sesi

- Buka jendela privat baru: tanpa sesi harus diminta login.
- Tunggu hingga session duration habis, atau keluar dari Access, lalu buka lagi.
- Jika voice mengatakan sesi berakhir, pilih **Masuk ulang layanan suara**.
- Link tersebut menuju `/auth/refresh`, melewati cache PWA, lalu kembali ke aplikasi setelah login.
- Setelah kembali, buka PIN jika diminta, lalu rekam ulang.

Audio yang gagal tidak otomatis diantrekan atau dikirim ulang.

### 9.6 Arti status API

| Status | Arti | Tindakan |
|---|---|---|
| `200` | Transkripsi berhasil | Lanjutkan review draft |
| `400` | Audio tidak valid/format tidak didukung | Rekam ulang pendek dengan browser yang mendukung MediaRecorder |
| `401` | Sesi Access tidak valid/kedaluwarsa | Login ulang lewat link yang disediakan |
| `403` | Kebijakan/origin ditolak | Periksa Access dan origin request |
| `405` | Membuka `/api/transcribe` lewat address bar (GET) | Wajar; pengujian harus lewat fitur voice (POST) |
| `413` | Rekaman melebihi 10 MB (10 MiB) | Buat rekaman lebih singkat |
| `429` | Rate limit Monee atau kuota Groq | Tunggu; jangan retry berulang |
| `502` | Groq menolak/fail (key, izin model, provider) | Periksa key dan izin `whisper-large-v3` |
| `503` | Konfigurasi server belum lengkap/valid | Periksa tiga nilai di Production dan binding limiter |
| `504` | Timeout | Coba jaringan stabil dan rekaman pendek |

### 9.7 Checklist bagian 9

- [ ] Login OTP berhasil.
- [ ] Onboarding selesai dan PIN berfungsi.
- [ ] Input manual tersimpan dan bertahan setelah reload.
- [ ] Voice menghasilkan teks dan draft.
- [ ] Draft dapat dikoreksi dan disimpan.
- [ ] Request `POST /api/transcribe` menghasilkan `200`.
- [ ] Login ulang berfungsi.
- [ ] Tidak ada key Groq di browser/Network.

---

## 10. Pasang PWA dan uji offline

### 10.1 Android

1. Buka URL produksi memakai Chrome.
2. Login dan tunggu aplikasi selesai terbuka.
3. Buka **Atur**, lalu bagian **Aplikasi dan penyimpanan** jika tersedia.
4. Jika tombol **Pasang Monee** muncul, klik dan konfirmasi.
5. Jika tidak muncul, buka menu browser dan cari **Install app / Pasang aplikasi / Tambahkan ke layar utama**.
6. Buka ikon yang terpasang.
7. Tutup dan buka lagi untuk memastikan aplikasi berjalan.

Tombol install tidak selalu tersedia. Dialog yang muncul belum membuktikan seluruh perilaku OS berjalan; periksa ikon dan hasil buka ulang.

### 10.2 iPhone/iPad

1. Buka URL di **Safari**.
2. Ketuk tombol **Share/Bagikan**.
3. Pilih **Add to Home Screen / Tambahkan ke Layar Utama**.
4. Konfirmasi.
5. Buka ikon dari layar utama.

Posisi menu bergantung versi iOS/iPadOS.

### 10.3 Laptop

- Chrome/Edge dapat menawarkan ikon install di address bar atau menu.
- Gunakan jika tersedia; jika tidak, aplikasi tetap bisa dipakai di tab biasa.

### 10.4 Uji offline

1. Buka PWA sekali saat online dan tunggu cache selesai.
2. Tutup aplikasi.
3. Aktifkan mode pesawat.
4. Buka lagi dari ikon atau reload.
5. Buka PIN.
6. Periksa data yang sebelumnya tersimpan.
7. Coba input manual sesuai saldo.
8. Voice dan login email awal tetap memerlukan internet.

**Hasil yang diharapkan:** shell yang sudah di-cache dan data lokal tetap tersedia offline. Kunjungan pertama saat sudah offline tidak diharapkan berhasil. Model maskot yang belum pernah di-cache dapat memakai fallback.

### 10.5 Checklist bagian 10

- [ ] PWA terpasang di HP/tablet yang akan dipakai.
- [ ] Aplikasi dapat dibuka dari ikon.
- [ ] Data tetap ada setelah buka ulang.
- [ ] Offline: shell dan data lokal tersedia.
- [ ] Online kembali: voice berfungsi.

---

## 11. Serah terima ke pengguna lain

Bagian ini untuk mengizinkan pacar/pengguna lain memakai aplikasi.

### 11.1 Tambahkan emailnya

1. Buka **Zero Trust > Access controls > Policies**.
2. Edit kebijakan `Monee - email yang diizinkan`.
3. Tambahkan email lengkap pengguna baru.
4. Simpan.
5. Pastikan kebijakan masih hanya berisi email yang dikenal.

Tidak perlu membuat akun Cloudflare untuknya.

### 11.2 Kirim instruksi

Gunakan template ini dan ganti bagian dalam kurung:

```text
Halo, ini aplikasi pencatat keuangan Monee:
[URL_WORKER]

Cara masuk:
1. Buka link di atas.
2. Masukkan email kamu: [EMAIL_PASANGAN]
3. Klik "Send login code".
4. Buka email, salin kode terbaru, lalu masukkan.
5. Buat PIN 6 digit sendiri dan selesaikan pengaturan awal.

Catatan:
- Kamu tidak perlu akun Cloudflare.
- Data keuangan tersimpan di browser/HP kamu masing-masing, tidak sinkron dengan punyaku.
- Jangan bagikan PIN atau kode email ke siapa pun.
- Untuk memasang di HP: buka menu browser -> "Pasang aplikasi"/"Tambahkan ke layar utama".
```

### 11.3 Jelaskan pemisahan data

Hal yang harus dipahami pengguna baru:

- Ledger-nya **terpisah** dari ledger pemilik.
- Login email yang sama di perangkat lain tidak menyinkronkan data.
- Backup/export dilakukan sendiri-sendiri.
- Menghapus data situs di browser akan menghapus ledger lokal; pulihkan dari backup.
- Voice memakai kuota Groq milik pemilik deployment.

### 11.4 Checklist final

Aplikasi baru dianggap **terhosting dan berjalan pada akunmu** setelah semua ini diperiksa:

- [ ] Source ada di repository GitHub yang benar, tanpa credential asli.
- [ ] Build dan deploy produksi Cloudflare selesai.
- [ ] URL HTTPS terbuka tanpa error aset.
- [ ] Access melindungi `/auth/bootstrap`; shell aplikasi tidak memunculkan OTP di setiap navigasi.
- [ ] API tanpa sesi Monee ditolak.
- [ ] Email yang diizinkan berhasil masuk.
- [ ] Email yang tidak diizinkan ditolak.
- [ ] `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, dan `GROQ_API_KEY` terpasang di runtime **Production**.
- [ ] Voice dengan suara asli menghasilkan teks/draft tanpa input key pengguna.
- [ ] Review dan simpan transaksi berfungsi, termasuk penolakan saldo/jatah.
- [ ] Reload deep-link seperti `/riwayat`, `/tabungan`, `/atur` berfungsi.
- [ ] Data bertahan setelah reload.
- [ ] PWA/offline diuji di perangkat sasaran.
- [ ] Jalur **Masuk ulang layanan suara** berfungsi.
- [ ] Backup diunduh dan disimpan pribadi.

OCR otomatis tidak termasuk checklist ini: provider/model belum dipasang. Review struk manual dapat dicoba, tetapi jangan dilaporkan sebagai pengenalan teks otomatis yang berhasil.

---

## 12. Backup dan pindah perangkat

Lakukan setelah percobaan dan sebelum pembaruan berisiko, mengganti domain, atau membersihkan penyimpanan browser.

### 12.1 Export

1. Buka **Atur > Export Backup**.
2. Pilih opsi enkripsi dengan passphrase bila diinginkan.
3. Unduh file JSON.
4. Simpan di lokasi pribadi.
5. Jika dienkripsi, simpan passphrase terpisah. Lupa passphrase tidak dapat diperbaiki hanya dengan login email.

### 12.2 Import

1. Di browser/origin tujuan, login Access dan buka aplikasi.
2. Buka **Atur > Import Backup**.
3. Pilih file dan masukkan passphrase jika dienkripsi.
4. Baca konfirmasi: **import mengganti data lokal**, bukan menggabungkan.
5. Selesaikan konfirmasi.
6. Buka PIN yang berlaku sesuai data hasil pemulihan jika diminta.
7. Periksa saldo dan riwayat.

Backup ledger tidak memuat secret Groq atau foto struk. Tidak perlu memasukkan key pengguna setelah restore. Menyalin URL ke perangkat lain tidak menyalin IndexedDB; export/import adalah pemindahan manual.

---

## 13. Update aplikasi dan rollback

### 13.1 Update rutin melalui GitHub

1. Export backup jika perubahan menyangkut data/schema.
2. Ubah source di laptop.
3. Jalankan pemeriksaan yang relevan:

```powershell
Set-Location -LiteralPath 'D:/PROJECT2/monee'
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

4. Tinjau perubahan sebelum commit:

```powershell
git status --short
git diff --stat
git add .
git diff --cached --stat
git diff --cached --name-only
```

5. Commit dan push:

```powershell
git commit -m "Update Monee"
git push origin main
```

6. Buka halaman build Cloudflare; cocokkan commit yang sedang dibangun.
7. Tunggu build/deploy sukses.
8. Buka aplikasi; saat banner update muncul, pilih **Perbarui sekarang** setelah pekerjaan/form selesai.
9. Uji singkat: login, saldo, input manual, voice.

Pengaturan runtime dashboard tidak perlu disalin ke source setiap commit. Setelah deploy, periksa variable/secret/binding jika konfigurasinya ikut berubah.

### 13.2 Jika rilis baru rusak

1. Buka **Workers & Pages > monee > Deployments**.
2. Temukan versi yang sebelumnya berhasil.
3. Klik menu tiga titik, pilih **Rollback**.
4. Konfirmasi.
5. Periksa deployment aktif, login, dan voice.
6. Periksa policy Access, AUD, dan runtime settings setelah rollback.
7. Di source, perbaiki atau revert commit bermasalah agar push berikutnya tidak menerbitkan masalah yang sama.

Rollback memulihkan versi aplikasi, bukan transaksi IndexedDB. Ia tidak membatalkan migrasi data di perangkat. Resource terkait dan perubahan di luar versi juga perlu diperiksa.

---

## 14. Domain sendiri bila diperlukan

`workers.dev` cukup untuk jalur utama. Domain pribadi bukan syarat aplikasi berjalan dan memiliki biaya registrasi/perpanjangan.

Jika memiliki domain:

1. Pastikan zone domain sudah **Active** di akun Cloudflare.
2. Buka **Workers & Pages > monee > Settings > Domains & Routes > Add > Custom Domain**.
3. Isi hostname, misalnya `uang.DOMAIN_KAMU`.
4. Konfirmasi dan tunggu DNS/sertifikat siap.
5. Buka hostname HTTPS dari sesi privat dan ulangi login/voice.
6. Tetapkan satu alamat utama untuk penggunaan harian.

Cloudflare membuat record DNS yang diperlukan. Jangan menghapus record domain lain secara sembarangan.

Worker-level Access melindungi domain yang terkait. Hindari aplikasi Access hostname lain dengan AUD berbeda tanpa menyesuaikan backend. Jika pindah dari `workers.dev` ke domain pribadi, **export data dari origin lama dan import di origin baru**. Shell/IndexedDB/PWA pada kedua alamat berbeda.

---

## 15. Jalur alternatif lewat CLI

Gunakan ini bila memilih deploy manual. Jalur CLI adalah alternatif bagian 6, bukan kewajiban tambahan setelah GitHub berhasil.

```powershell
Set-Location -LiteralPath 'D:/PROJECT2/monee'
npm.cmd ci
npm.cmd run deploy:check
npx.cmd wrangler login
npx.cmd wrangler whoami
```

Login membuka browser; otorisasi akun Cloudflare yang benar. `whoami` membantu memastikan akun yang akan dipakai. Jika ada beberapa akun, pilih akun tempat Zero Trust disiapkan.

Setelah pemeriksaan dan akun benar:

```powershell
npm.cmd run deploy
```

Deployment memakai hasil `dist/` dari `deploy:check`. Jika source berubah sesudahnya, build ulang sebelum deploy. Catat URL, lalu ikuti **bagian 7-11** untuk Access, secret, dan pengujian.

Untuk secret lewat CLI:

```powershell
npx.cmd wrangler secret put GROQ_API_KEY
```

Tempel nilai hanya pada prompt yang meminta secret, bukan sebagai argumen command line. Perintah ini membuat versi dan menerapkannya. Dua variable Access tetap dapat diisi melalui dashboard.

Jika ingin build otomatis dari GitHub setelah Worker dibuat lewat CLI, buka **Worker > Settings > Builds > Connect**, hubungkan repository, dan gunakan pengaturan bagian 6.

---

## 16. Pengembangan lokal dan file env

| Perintah | Hasil |
|---|---|
| `npm.cmd run dev` | Frontend Vite lokal; tidak menjalankan backend voice |
| `npm.cmd run preview` | Preview frontend yang sudah dibangun; tidak memasang API |
| `npm.cmd run dev:worker` | Build frontend dan jalankan Worker lokal |
| `npm.cmd run deploy:check` | Build/bundling dry-run; tidak publish |
| `npm.cmd run deploy` | Publish Worker dan assets hasil build yang tersedia |

Untuk kebutuhan pengembangan server lokal:

```powershell
if (-not (Test-Path -LiteralPath .dev.vars)) {
  Copy-Item -LiteralPath .dev.vars.example -Destination .dev.vars
}
```

Jalankan hanya jika `.dev.vars` belum ada agar tidak menimpa konfigurasi lokal. Isi nilai secara pribadi dan pastikan file tetap di-ignore.

**Key lokal saja tidak membuat voice lokal langsung berfungsi.** Worker tetap memerlukan JWT Access valid; tidak ada bypass autentikasi pengembangan. Untuk mencoba aplikasi normal, gunakan deployment produksi yang sudah dilindungi dan dikonfigurasi.

---

## 17. Jika ingin mengaktifkan preview

Lewati bagian ini untuk rilis pertama. Konfigurasi proyek saat ini menyiapkan produksi; panduan utama mematikan preview build.

Dokumentasi terbaru memakai **Worker Previews**, dengan default command `npx wrangler preview`. Preview **tidak mewarisi** vars, secret, dan binding produksi. Ia memerlukan konfigurasi `previews`, pengaturan **Previews Base**, dan secret tersendiri.

Jika nanti diperlukan:

1. Tentukan kebutuhan dan kuota preview secara terpisah.
2. Siapkan konfigurasi preview yang kompatibel dengan assets dan limiter.
3. Pasang variable Access serta secret pada scope preview yang tepat.
4. Lindungi hanya `/auth/bootstrap` dengan aplikasi Access; API harus tetap melewati pemeriksaan sesi Monee di Worker.
5. Jangan gunakan Access **All traffic** untuk konfigurasi arsitektur sekarang. Uji domain preview, bootstrap, penolakan API tanpa sesi, dan voice secara terpisah.
6. Jangan memakai command deploy produksi sebagai Preview command.

Perubahan secret base tidak otomatis diterapkan ke semua preview aktif. Akun lama dapat memakai mekanisme preview lama dengan perilaku berbeda.

---

## 18. Troubleshooting

Baca pesan pertama yang gagal, bukan hanya baris terakhir. Pisahkan masalah menjadi: Git/build, pembayaran, Access/login, runtime server, dan provider.

### 18.1 Pembayaran Zero Trust

| Gejala | Pemeriksaan/tindakan |
|---|---|
| Zero Trust meminta kartu | Normal untuk onboarding Free. Tambahkan PayPal/kartu; paket tetap $0. |
| Kartu Mandiri ditolak berulang | Aktifkan transaksi online/internasional di Livin'; isi alamat billing persis; coba PayPal. |
| PayPal tidak muncul | Tambahkan PayPal dari **Billing > Payment Methods**, bukan dari layar paywall. |
| PayPal terhubung tetapi pembayaran gagal | Pastikan akun PayPal terverifikasi dan sumber dana valid. |
| Notifikasi otorisasi dari bank | Bisa terjadi saat verifikasi; periksa mutasi, jangan mengulang transaksi berkali-kali. |
| Diminta paket berbayar | Kembali dan pilih **Free**; jangan menyetujui tagihan yang tidak diinginkan. |
| Semua metode gagal | Hubungi dukungan Cloudflare; jangan memakai jasa kartu virtual pihak ketiga. |

### 18.2 GitHub dan build

| Gejala | Pemeriksaan/tindakan |
|---|---|
| `git` / `node` tidak dikenali | Pasang alat bagian 3, buka ulang terminal. |
| `npm.ps1 cannot be loaded` | Pakai `npm.cmd` di PowerShell. |
| `Author identity unknown` | Isi `git config user.name` dan `user.email`. |
| `remote origin already exists` | Jalankan `git remote -v`; jangan menambah remote kedua. |
| Push meminta password / authentication failed | Selesaikan Git Credential Manager; password website tidak dipakai untuk Git HTTPS. |
| `non-fast-forward` pada push pertama | Jangan force push. Periksa riwayat dan selaraskan. |
| Repository tidak muncul di Cloudflare | Periksa akses GitHub App ke repository Private. |
| `package.json` tidak ditemukan | Root directory salah. |
| `EBADENGINE` | Gunakan Node major 22 minimal 22.23.4; pastikan `.node-version` ikut commit. |
| Build memakai Node salah | Isi `NODE_VERSION=22.23.4` atau `22` di build variables. |
| Wrangler name mismatch | Worker name harus sama dengan `name` di `wrangler.jsonc`. |
| `dist` tidak ada saat deploy | Pastikan `npm run build` berhasil sebelum deploy. |
| Dependency install gagal | Pertahankan lockfile; periksa Node/npm dan pesan resolver. |
| Web muncul tetapi API menjadi HTML/404 | Pastikan Worker memakai `server/index.ts`, binding assets, dan `run_worker_first`. |

### 18.3 Access dan login

| Gejala | Pemeriksaan/tindakan |
|---|---|
| Login hanya menawarkan akun Cloudflare | Tambahkan One-time PIN dan izinkan di login methods aplikasi. |
| Tidak menerima kode | Periksa alamat di Allow policy dan folder spam. Alamat yang diblokir tidak menerima kode meski halaman menyatakan terkirim. |
| Kode tidak berlaku | Pakai kode terbaru; minta kode baru jika kedaluwarsa. |
| Halaman Monee terbuka tanpa login | Aset aplikasi memang publik. Pastikan `/auth/bootstrap` tetap dilindungi Access dan Worker menolak `/api/*` tanpa sesi Monee yang valid; cek uji API tanpa sesi pada bagian 21. |
| Login meminta masuk ulang terus | Periksa `ACCESS_TEAM_DOMAIN`, AUD yang benar, aplikasi Access untuk `/auth/bootstrap`, dan masa idle sesi Monee 30 hari. |
| Sesi Monee perlu diperbarui | Buka `/auth/bootstrap` untuk autentikasi ulang lewat Access; endpoint API memakai cookie sesi Monee, bukan JWT Access langsung. |
| Tidak ada menu Access | Pastikan Zero Trust aktif dan akun punya izin. Jangan melonggarkan backend agar lolos tanpa Access. |
| Pengguna baru tidak bisa masuk | Pastikan emailnya sudah ditambahkan dan disimpan di policy. |

### 18.4 Voice, API, dan data

| Status/gejala | Arti dan langkah berikutnya |
|---|---|
| `503` dari API | Konfigurasi server belum lengkap/valid atau limiter tidak tersedia. Periksa runtime Production, nama/case nilai, format team/AUD/key, dan binding limiter. |
| `401`/redirect login | Sesi perlu login ulang atau JWT tidak cocok. Periksa team/AUD. |
| `403` | Periksa kebijakan akses dan origin. Model yang diblokir Groq diperiksa di provider; Worker menyamarkan penolakan provider menjadi `502`. |
| `400` | Audio tidak valid/format tidak didukung. Rekam pendek dengan browser yang mendukung MediaRecorder. |
| `413` | Rekaman melebihi 10 MB (10 MiB). Buat lebih singkat. |
| `429` | Limiter Monee atau kuota Groq tercapai. Tunggu; jangan loop retry. |
| `502` | Key salah, izin model ditolak, atau provider gagal. Periksa key dan `whisper-large-v3`. |
| `504` | Permintaan terlalu lama. Coba jaringan stabil dan rekaman pendek. |
| Mikrofon tidak meminta izin | Pakai HTTPS, periksa izin situs/OS, dan buka di browser biasa. |
| Teks ada tetapi transaksi tidak tersimpan | Periksa review dan aturan saldo/jatah/periode; voice tidak otomatis menyimpan. |
| Saldo kosong di HP lain | IndexedDB terpisah. Gunakan export/import; login email tidak menyinkronkan ledger. |
| Gambar struk tidak dibaca otomatis | Provider OCR belum dipilih; secret voice tidak memasang OCR. |
| Data hilang setelah clear site data | Penyimpanan lokal dihapus. Pulihkan backup; login cloud tidak mengembalikan ledger. |
| Cloudflare error resource/CPU | Periksa Metrics, ukuran/lamanya rekaman, dan log error tanpa isi audio. |

Nilai secret disembunyikan setelah disimpan. Jangan membuktikan key benar dengan menampilkannya di frontend atau mencetaknya ke log. Jika key diduga bocor, cabut di Groq dan pasang secret baru.

---

## 19. Biaya, kuota dan batas fitur

### 19.1 Periksa layanan secara terpisah

| Layanan | Yang perlu diperiksa |
|---|---|
| GitHub | Repository dan batas akun |
| Cloudflare Workers/Builds | Request dinamis, CPU, resource, build minutes |
| Cloudflare Zero Trust/Access | Paket, seat pengguna, status aktivasi |
| Groq | Kuota org/project, model yang diizinkan, pemakaian |
| Domain pribadi | Registrasi dan perpanjangan |

Workers Free saat sumber diperiksa menyediakan batas 100.000 request Worker/hari dan 10 ms CPU/request. Aset statis memiliki perhitungan tersendiri; build otomatis juga punya batas. Baca angka yang berlaku di akunmu sebelum membagikan akses lebih luas.

Limiter aplikasi adalah perkiraan per lokasi Cloudflare, bukan pagu tagihan global. Kuota Groq berlaku pada akun/org/project yang sesuai, bukan jatah gratis baru untuk setiap pengguna Monee. Jangan menganggap memilih Free pada satu layanan membuat semua layanan gratis tanpa batas.

### 19.2 Privasi dan fitur yang belum ada

Audio yang disetujui dikirim melalui Worker Monee ke Groq. Worker tidak menyimpan audio/transkrip pada storage/log aplikasi; hasil yang dikonfirmasi menjadi transaksi lokal. Retensi dan pengaturan data provider mengikuti akun serta kebijakan data Groq. Jangan menjanjikan audio tidak pernah keluar perangkat atau provider tidak pernah menyimpan apa pun.

Deploy ini menyediakan aplikasi, voice terkelola, dan pembacaan struk Gemini dengan review manual setelah secret pada bagian 8.10 dipasang. Hal berikut belum otomatis muncul dari pemasangan hosting:

- OCR otomatis jika `GEMINI_API_KEY` belum dipasang, atau project tidak memiliki akses/kuota untuk model.
- Sinkronisasi atau backup cloud ledger.
- Pemulihan data/PIN melalui email login.
- Jaminan akurasi transkripsi pada semua ucapan.
- Jaminan instalasi/performa yang sama pada seluruh perangkat.

Status implementasi lain ada di [task](task.md), rincian voice/OCR di [spesifikasi AI](07-ai-features.md), dan arsitektur di [dokumen keamanan](09-architecture-security.md).

---

## 20. Lampiran

### Lampiran A. Lembar catatan deployment

Simpan di catatan pribadi, **jangan commit**:

```text
Tanggal deployment :
Akun Cloudflare   :
Team Zero Trust    :
Team domain        :
URL Worker         :
AUD Access         :
Session duration   :
Email diizinkan    :
Key Groq dibuat    : ya/tidak, tanggal ...
Key Groq disimpan  : (nama password manager/lokasi)
Commit terakhir    :
Catatan uji voice  :
```

### Lampiran B. Perintah cepat

```powershell
# Pemeriksaan awal
Set-Location -LiteralPath 'D:/PROJECT2/monee'
git --version
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run deploy:check

# Pemeriksaan kualitas
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test

# Git
git status --short
git diff --stat
git add .
git diff --cached --stat
git commit -m "Update Monee"
git push origin main

# CLI alternatif (opsional)
npx.cmd wrangler login
npx.cmd wrangler whoami
npm.cmd run deploy
npx.cmd wrangler secret put GROQ_API_KEY
```

### Lampiran C. Alur data dan keamanan

```text
Perangkat baru -> Cloudflare Access (email OTP) -> /auth/bootstrap -> cookie sesi Monee
Perangkat aktif -> cookie sesi bergulir (30 hari sejak aktivitas terakhir)
Browser -> Worker (memverifikasi sesi) -> D1 (ledger tersinkron per akun)
        -> IndexedDB per akun (cache dan antrean perubahan offline)
PIN opsional -> hanya mengunci ledger lokal pada perangkat tersebut
Voice -> sesi Monee -> Worker -> Groq Whisper -> draft lokal -> konfirmasi -> sinkronisasi D1
```

Batas keamanan yang perlu diingat:

- Access melindungi jalur `/auth/bootstrap`; API dilindungi sesi Monee yang diverifikasi Worker.
- PIN lokal bersifat opsional, hanya mengunci perangkat, dan tidak dikirim ke D1.
- Key Groq hanya ada di server.
- Ledger tersimpan di D1 dan tersalin ke IndexedDB per perangkat; ekspor backup tetap disarankan.

### Lampiran D. Tautan resmi

**Alat dan GitHub**

- [Git for Windows](https://git-scm.com/install/windows)
- [Unduhan Node.js](https://nodejs.org/en/download)
- [Membuat repository GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- [Mengatur nama Git](https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git)
- [Mengatur email commit](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)
- [Mengabaikan file](https://docs.github.com/en/get-started/git-basics/ignoring-files) dan [arti `git check-ignore`](https://git-scm.com/docs/git-check-ignore)
- [Git Credential Manager](https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git)
- [Import source lokal ke GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

**Cloudflare**

- [Profil billing dan metode pembayaran](https://developers.cloudflare.com/billing/get-started/create-billing-profile/)
- [FAQ billing](https://developers.cloudflare.com/billing/understand/faq/)
- [Update informasi billing](https://developers.cloudflare.com/billing/get-started/update-billing-info/)
- [Setup Zero Trust](https://developers.cloudflare.com/cloudflare-one/setup/)
- [Lokasi team domain](https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/)
- [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Mengelola Access policy](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/policy-management/) dan [cara aturan digabung](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Integrasi GitHub dengan Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Ikhtisar Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Pengaturan build](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Image build dan versi Node](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Branch control](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Subdomain workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Access untuk Worker](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Validasi JWT Access dan lokasi AUD](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Secret Worker](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Konfigurasi Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/) dan [perintah Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/)
- [Perilaku deployment dan secret](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [Binding rate limit](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [Custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Worker Previews](https://developers.cloudflare.com/workers/previews/configuration/)
- [Env pengembangan lokal](https://developers.cloudflare.com/workers/local-development/environment-variables/)
- [Harga Workers](https://developers.cloudflare.com/workers/platform/pricing/), [batas Workers](https://developers.cloudflare.com/workers/platform/limits/), [batas Builds](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)

**Groq**

- [Quickstart Groq](https://console.groq.com/docs/quickstart)
- [Speech to Text](https://console.groq.com/docs/speech-to-text)
- [Izin model](https://console.groq.com/docs/model-permissions)
- [Limits](https://console.groq.com/settings/limits) dan [rate limits](https://console.groq.com/docs/rate-limits)
- [Kebijakan data Groq](https://console.groq.com/docs/your-data)
- [Env Vite dan secret](https://vite.dev/guide/env-and-mode)

**PWA**

- [Memasang aplikasi web di Android](https://support.google.com/chrome/answer/9658361?hl=id&co=GENIE.Platform%3DAndroid)
- [Menambahkan situs ke Layar Utama di iPhone](https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios)
- [Memeriksa request dengan DevTools](https://developer.chrome.com/docs/devtools/network/reference)

### Lampiran E. Riwayat dokumen

| Tanggal | Perubahan |
|---|---|
| 26 Oktober 2026 | Versi awal panduan deployment |
| 29 Oktober 2026 | Node minimum 22.23.4; verifikasi dependency dan build |
| 29 Oktober 2026 | Revisi step-by-step: pembayaran PayPal/Mandiri, pemisahan jalur repo, detail Access, Groq, pengujian, serah terima, lampiran |

## 21. Akun lintas perangkat dan sesi Monee

Bagian ini menjadi acuan alur akun terbaru, menggantikan petunjuk login OTP rutin dan migrasi otomatis pada bagian lama. Status rollout dan bukti pengujian dicatat di `LOCAL_REPORT.md`, bukan disimpulkan dari keberadaan source.

### 21.1 Database dan secret

Database `monee` sudah terikat sebagai `DB` dengan ID `f054fb21-fe31-4b0c-a475-6e7e81a1dd59`. Jangan membuat database kedua.

1. Backup ledger produksi sebelum cutover autentikasi.
2. Jalankan `npx wrangler d1 migrations apply monee --remote`. Migrasi `0002_pin_auth.sql` menambah `account_credentials`, `auth_verifications`, dan `auth_attempts`; akun dan ledger lama tetap dipertahankan.
3. Buat secret acak kriptografis minimal 32 karakter, lalu simpan sebagai runtime secret `AUTH_PIN_PEPPER` lewat `npx wrangler secret put AUTH_PIN_PEPPER`. Jangan memakai nilai QA, PIN pengguna, atau memasukkannya ke `VITE_*`, Git, maupun laporan.
4. Pertahankan `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, limiter, dan secret Groq/Gemini. `keep_vars: true` menjaga vars dashboard.
5. Untuk lokal, terapkan migrasi dengan `--local` dan isi `.dev.vars` yang di-ignore. `npm run dev` hanya frontend; `npm run dev:worker` menjalankan Worker.

Keberadaan `AUTH_PIN_PEPPER` mengaktifkan autentikasi baru di server. Tanpa secret tersebut, sesi/bootstrap lama tetap didukung untuk kompatibilitas rollback; endpoint PIN gagal tertutup. Frontend baru memerlukan persiapan secret sebelum rollout agar formulir login berfungsi. Mengganti pepper membuat hash PIN lama tidak cocok: pengguna harus memulihkan PIN melalui email, jadi jangan rotasi tanpa rencana.

### 21.2 Cloudflare Access untuk verifikasi email

Login rutin email + PIN ditangani Monee. Access dipakai untuk membuktikan kepemilikan email saat daftar, aktivasi akun lama, dan lupa PIN.

1. Pada aplikasi Access, lindungi public hostname `monee.arjuridho77.workers.dev`, path `auth/bootstrap`. Subdomain harus mencakup `monee`; jangan hanya melindungi `arjuridho77.workers.dev`.
2. Gunakan metode **One-time PIN** dan policy Allow dengan daftar email pribadi yang diizinkan. Jangan membuka pendaftaran untuk semua email.
3. Atur application session duration dan policy session duration **15 menit** untuk aplikasi verifikasi ini. JWT yang lebih tua dari 15 menit ditolak oleh Monee. Durasi ini terpisah dari sesi Monee 30 hari.
4. Jangan memasang tujuan Workers yang mencakup seluruh URL Worker pada aplikasi Access tersebut. Pastikan tidak ada aplikasi/policy host luas yang masih menantang `/`, aset, `/api/auth/login`, `/api/session`, atau API ledger.
5. Pertahankan AUD yang sesuai dengan aplikasi path ini. Periksa dari browser privat: `/` membuka form Monee, API tanpa cookie mendapat 401, sedangkan alur **Buat akun → Verifikasi email** melewati challenge Access.

Verifikasi selalu dimulai melalui tombol Monee. Membuka `/auth/bootstrap` langsung tanpa transaksi verifikasi menghasilkan penolakan. Monee mengikat transaksi ke cookie browser, memverifikasi tanda tangan/issuer/audience/waktu JWT, dan membatasi penyelesaian bukti menjadi satu kali dalam 10 menit. Sesi Access yang sudah terverifikasi dalam 15 menit boleh digunakan kembali. Jika konfigurasi lama masih menyimpan sesi panjang, keluar dari sesi Access di `/cdn-cgi/access/logout`, kembali ke Monee, lalu mulai verifikasi lagi.

### 21.3 Alur pengguna dan data lama

- Masuk: email + PIN akun 6 digit. Perangkat yang sudah login langsung membuka ledger; kunci perangkat tambahan nonaktif pada akun baru.
- Daftar: verifikasi email sekali → buat dan konfirmasi PIN → onboarding nama, pemasukan, alokasi, maskot. PIN tidak diminta lagi di akhir onboarding.
- Akun versi lama: pilih **Aktifkan PIN akun versi lama**, verifikasi dengan email lama, lalu buat PIN akun. Identitas Access mengarah ke ID akun lama sehingga ledger tidak diduplikasi.
- Lupa PIN: verifikasi email → buat PIN baru. Mengubah atau memulihkan PIN mencabut semua sesi lama; perangkat yang menyelesaikannya mendapat sesi baru.
- PIN akun disimpan sebagai hash PBKDF2-SHA256 100.000 iterasi dengan salt unik dan HMAC pepper di Worker. PIN perangkat lama tetap lokal dan tidak otomatis dijadikan kredensial akun.
- Setelah login, tarik data cloud sebelum memutuskan perlu onboarding. Data lokal lama tidak menghalangi login. Impor opsional ada di **Atur → Data & Backup → Data lama di browser ini**.
- Impor lama mengganti ledger hanya setelah konfirmasi eksplisit dan unduhan backup terenkripsi akun saat ini. Metadata sinkronisasi dan kunci perangkat saat ini dipertahankan; sumber data lama tidak dihapus. Periksa konflik sebelum menyelesaikan impor.
- Pengaturan keamanan membedakan **Ganti PIN akun** dan kunci perangkat opsional. Kunci perangkat dapat dinonaktifkan dengan PIN perangkat saat ini.

### 21.4 Sesi dan batas keamanan

Cookie sesi acak memakai `HttpOnly`, `Secure`, `SameSite=Strict`; database hanya menyimpan hash token. `POST /api/session/activity` memperpanjang sesi 30 hari setelah interaksi pengguna atau pembukaan app yang terlihat. Request sinkronisasi/readiness dan polling tidak memperpanjangnya. Tidak ada batas umur absolut selama aktif. Menghapus cookie, memakai browser baru, logout, pemulihan PIN, atau pencabutan sesi dapat meminta login lagi.

Lima kegagalan PIN per akun dalam 15 menit memicu jeda 15 menit. Batas akun/IP disimpan di D1 dan ditambah limiter Worker; pesan login tidak mengungkap apakah email terdaftar. PIN 6 digit tetap lebih lemah daripada password panjang/passkey, terutama bila database dan pepper sama-sama bocor. Batas hosting gratis bukan jaminan kapasitas tanpa batas; ukur CPU login pada edge sebelum menyebutnya lolos produksi.

Cache IndexedDB tidak dienkripsi oleh PIN dan dapat dipakai offline pada perangkat yang pernah diverifikasi dalam 30 hari. Pencabutan sesi dari perangkat lain baru diketahui saat perangkat tersambung kembali. Pengguna harus melindungi perangkat/OS mereka dan memakai logout pada perangkat bersama.

### 21.5 Pengujian dan rollout

1. Jalankan `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, dan `npm run deploy:check`.
2. Jalankan `npm run test:auth:e2e`: browser nyata, build production, workerd dan D1 lokal, tetapi identitas Access sintetis bertanda tangan. Harness hanya bind ke loopback dan tidak boleh dideploy. Tes ini tidak membuktikan pengiriman email atau batas CPU edge.
3. Terapkan migrasi yang menambah tabel, siapkan pepper, cocokkan Access sesuai 21.2, lalu deploy build yang sudah diuji. Pertahankan hostname supaya cache/data browser lama tetap tersedia.
4. Uji production dengan akun pemilik: aktivasi akun lama, login email/PIN browser baru, data lintas perangkat, lupa PIN, perubahan PIN, logout, penolakan tanpa sesi, voice/OCR, dan CPU/error rate login. Jangan mengarang hasil bila sesi/OTP belum tersedia.
5. Simpan hasil di satu `LOCAL_REPORT.md` yang di-ignore. Bersihkan script dan gambar pemeriksaan sementara setelah selesai.

Rollback: pulihkan versi Worker/frontend sebelumnya bila smoke test gagal. Biarkan tabel tambahan tetap ada. Jangan menghapus akun/ledger maupun pepper sebagai tindakan rollback spontan; versi lama mengabaikan kredensial PIN akun dan memakai Access bootstrap semula. Periksa ulang policy Access dan AUD sebelum mengaktifkan jalur lama.
