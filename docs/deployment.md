# Panduan deployment Monee: dari GitHub sampai aplikasi berjalan

Diperbarui dan dicocokkan dengan sumber resmi melalui tools pada **26 Oktober 2026**.

Panduan ini ditujukan untuk pemilik aplikasi yang baru pertama kali menyiapkan hosting ini. Ikuti jalur utama bagian 1-10 secara berurutan. Setiap tahap memiliki hasil yang perlu diperiksa sebelum melanjutkan. Perintah terminal memakai **PowerShell di Windows**.

**Batas pemeriksaan:** isi panduan dicocokkan dengan source proyek, bantuan CLI Wrangler yang terpasang dan dokumentasi resmi daring. Penulisan panduan ini tidak membuat repository, melakukan commit, mengubah akun Cloudflare/Groq, atau membuktikan deployment publikmu berhasil. Label dashboard dapat berbeda karena bahasa atau pembaruan UI; tautan resmi disertakan di tahap terkait.

## Daftar isi

1. [Hasil akhir dan hal yang perlu disiapkan](#1-hasil-akhir-dan-hal-yang-perlu-disiapkan)
2. [Periksa komputer dan proyek](#2-periksa-komputer-dan-proyek)
3. [Buat repository GitHub dan upload source](#3-buat-repository-github-dan-upload-source)
4. [Siapkan Cloudflare dan login email](#4-siapkan-cloudflare-dan-login-email)
5. [Hubungkan GitHub dan deploy Worker pertama](#5-hubungkan-github-dan-deploy-worker-pertama)
6. [Pasang perlindungan Access ke Worker](#6-pasang-perlindungan-access-ke-worker)
7. [Buat key Groq dan isi konfigurasi server](#7-buat-key-groq-dan-isi-konfigurasi-server)
8. [Uji aplikasi dan voice dari URL publik](#8-uji-aplikasi-dan-voice-dari-url-publik)
9. [Pasang PWA dan uji offline](#9-pasang-pwa-dan-uji-offline)
10. [Checklist selesai dan serah akses pengguna](#10-checklist-selesai-dan-serah-akses-pengguna)
11. [Backup dan pindah perangkat](#11-backup-dan-pindah-perangkat)
12. [Update aplikasi dan rollback](#12-update-aplikasi-dan-rollback)
13. [Domain sendiri bila diperlukan](#13-domain-sendiri-bila-diperlukan)
14. [Jalur alternatif lewat CLI](#14-jalur-alternatif-lewat-cli)
15. [Pengembangan lokal dan file env](#15-pengembangan-lokal-dan-file-env)
16. [Jika ingin mengaktifkan preview](#16-jika-ingin-mengaktifkan-preview)
17. [Troubleshooting](#17-troubleshooting)
18. [Biaya, kuota dan batas fitur](#18-biaya-kuota-dan-batas-fitur)

## 1. Hasil akhir dan hal yang perlu disiapkan

### Bentuk sistem yang akan dipasang

```text
Source di laptop -> repository GitHub -> Cloudflare Workers Builds
                                      -> frontend + API dalam satu Worker

Pengguna -> login kode email Access -> PIN lokal Monee -> aplikasi
                                                      -> rekaman dengan persetujuan
                                                      -> /api/transcribe
                                                      -> Groq Whisper -> teks -> review

Data transaksi -> IndexedDB di browser pengguna
```

Target rilis pertama adalah satu URL HTTPS, misalnya `https://monee.SUBDOMAIN_AKUN.workers.dev`. Subdomain aslinya akan diberikan Cloudflare. Aplikasi dipasang pada root `/`, bukan dalam subfolder seperti `/monee/`.

| Yang disiapkan | Untuk apa | Perlu dimiliki pengguna biasa? |
|---|---|---|
| Akun GitHub | Menyimpan source dan memicu build | Tidak |
| Akun Cloudflare | Hosting Worker dan pengaturan Access | Tidak |
| Organisasi Zero Trust di akun Cloudflare | Login email dan daftar orang yang boleh masuk | Tidak |
| Akun/project Groq dan satu API key | Layanan transkripsi suara | Tidak |
| Email yang aktif | Menerima kode masuk | Ya |
| Domain sendiri | Alamat khusus bila diinginkan | Tidak wajib |
| Supabase, D1 atau database server | Tidak digunakan oleh ledger Monee saat ini | Tidak diperlukan |

Pengguna biasa tidak perlu memahami GitHub, env atau API key. Mereka menerima URL, memasukkan kode email, membuat/membuka PIN lokal, lalu memakai aplikasi.

**Perlu diketahui sebelum mulai:**

- Awali dengan paket Free yang tersedia dan periksa ringkasan paket sebelum menyetujui layanan berbayar.
- Onboarding **Zero Trust Free tetap meminta detail pembayaran** menurut panduan resmi; langkah onboarding Free tersebut tidak dikenakan biaya. Siapkan metode pembayaran yang diterima bila dashboard memintanya. [Setup Zero Trust](https://developers.cloudflare.com/cloudflare-one/setup/).
- Data per browser/perangkat/origin terpisah. Login dengan email sama di laptop dan HP tidak menyinkronkan transaksi.
- Groq sudah diintegrasikan untuk voice. **OCR otomatis belum terpasang modelnya**; pilih foto dan review manual tersedia. Menambahkan key Groq tidak otomatis mengaktifkan OCR.
- Tentukan alamat utama sebelum memasukkan data sungguhan. Bila pindah origin kemudian, gunakan export/import, seperti bagian 11.

## 2. Periksa komputer dan proyek

### 2.1 Pasang alat jika belum tersedia

1. Pasang Git for Windows dari [situs Git resmi](https://git-scm.com/install/windows).
2. Pasang **Node.js 22.x, minimal 22.12**, dari [unduhan Node.js resmi](https://nodejs.org/en/download). Pilih versi 22 dari pilihan versi, karena `package.json` proyek membatasi Node ke major 22. Jangan langsung memakai major terbaru yang berbeda.
3. Tutup dan buka kembali PowerShell setelah instalasi.

Jalankan:

```powershell
git --version
node --version
npm.cmd --version
Set-Location -LiteralPath 'D:/PROJECT2/monee'
Get-Location
Test-Path package.json
Test-Path wrangler.jsonc
Get-Content .node-version
```

**Hasil yang diharapkan:** Git/npm dapat dipanggil, Node menampilkan `v22.x`, lokasi menunjuk folder proyek, kedua `Test-Path` bernilai `True`, dan `.node-version` berisi `22`.

Di Windows, gunakan `npm.cmd` agar tidak tersangkut kebijakan eksekusi `npm.ps1`. Jangan menyalin prompt terminal seperti `PS D:>` bersama perintah.

### 2.2 Pastikan isi proyek yang benar

File ini harus ada di root yang nanti tampak di GitHub:

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

`tests/` dan tooling aktif dipertahankan untuk memeriksa perubahan. Keduanya bukan data pengguna dan tidak otomatis menjadi isi frontend `dist/`. Jangan menghapus source/aset yang dirujuk hanya untuk mengurangi daftar file.

Periksa `wrangler.jsonc`. Nilai proyek saat panduan ditulis:

| Pengaturan | Nilai proyek |
|---|---|
| `name` | `monee` |
| `main` | `server/index.ts` |
| Assets directory / binding | `./dist` / `ASSETS` |
| Fallback | `single-page-application` |
| Worker lebih dulu | `/api`, `/api/*`, `/auth/refresh` |
| `keep_vars` | `true` |
| Rate limiter | `AI_RATE_LIMIT`, namespace `1001`, 10 request/60 detik |

Untuk awal, pertahankan nama `monee`. Bila memilih nama lain, ubah `name` di file tersebut sebelum commit, lalu gunakan nama yang sama di Cloudflare. Nomor namespace limiter bukan ID database dan tidak perlu dibuat sebagai database. Bila akun sudah memakai namespace `1001` untuk limiter lain, pilih angka positif lain yang belum dipakai dan commit perubahan tersebut. [Binding limiter](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

### 2.3 Pasang dependensi dan periksa paket deployment

```powershell
npm.cmd ci
npm.cmd run deploy:check
```

Jalankan perintah satu per satu; lanjutkan hanya jika perintah sebelumnya selesai tanpa error.

**Hasil yang diharapkan:** dependensi terpasang; frontend dibangun ke `dist/`; Wrangler menampilkan binding `ASSETS` dan `AI_RATE_LIMIT`, lalu keluar karena `--dry-run`. Ini belum mengunggah aplikasi dan belum memeriksa kebijakan/kuota akun hosting.

Peringatan chunk Vite di atas 500 kB sudah diketahui; bedakan peringatan tersebut dari build yang benar-benar gagal. Jangan menjalankan `npm audit fix --force` atau mengubah lockfile secara acak untuk melewati kegagalan.

## 3. Buat repository GitHub dan upload source

### 3.1 Buat repository kosong di website

1. Login ke [GitHub](https://github.com).
2. Klik **+ > New repository**.
3. Pilih akun pemilik, nama repository `monee`, dan **Private** untuk awal.
4. Biarkan pilihan menambahkan README, .gitignore dan license kosong. Proyek lokal sudah memiliki file-file sendiri.
5. Klik **Create repository**.
6. Salin URL HTTPS repository. Contoh format: `https://github.com/GANTI_USERNAME/monee.git`.

Nama repository boleh berbeda dari nama Worker; yang harus sama adalah nama Worker dashboard dengan `wrangler.jsonc`. [Membuat repository resmi](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository).

### 3.2 Inisialisasi Git dan identitas commit

Di PowerShell, tetap di `D:/PROJECT2/monee`:

```powershell
Test-Path .git
```

Jika hasilnya **False**, jalankan:

```powershell
git init -b main
```

Jika sudah **True**, gunakan repository yang ada; periksa `git status`, `git branch --show-current` dan `git remote -v` terlebih dahulu. Jangan menimpa remote atau mengganti branch tanpa mengetahui keadaan repository.

Atur identitas untuk repository ini. Ganti teks contoh dengan milikmu:

```powershell
git config user.name "Nama Kamu"
git config user.email "EMAIL_COMMIT_KAMU"
```

Nama commit boleh berbeda dari username GitHub. Email dapat memakai email terverifikasi atau alamat `noreply` yang disediakan pada **GitHub > Settings > Emails**. Identitas commit bukan password login. [Nama Git](https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git), [email commit](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).

### 3.3 Periksa ignore sebelum commit

```powershell
git status --short --untracked-files=normal
git check-ignore -v -- .env .dev.vars .wrangler/state/example node_modules/example dist/index.html artifacts/example .local/example
git add --dry-run .
```

`git check-ignore` di atas memeriksa nama contoh; kamu tidak perlu membuat file secret untuk menjalankannya.

**Yang harus di-ignore:** `node_modules/`, `dist/`, `artifacts/`, `.local/`, `.wrangler/`, file env/credential asli dan pengaturan agent lokal. **Yang boleh masuk:** `.dev.vars.example` karena hanya placeholder, `.gitignore`, source, lockfile, aset runtime, tes/tooling aktif dan docs inti.

Jika file sudah pernah dilacak Git, ignore tidak menghentikan pelacakannya. Periksa file tersebut sebelum push; jangan memakai `git add -f` untuk memaksa secret masuk. [Aturan ignore](https://docs.github.com/en/get-started/git-basics/ignoring-files), [arti hasil check-ignore](https://git-scm.com/docs/git-check-ignore).

### 3.4 Commit pertama dan push

Setelah daftar file benar:

```powershell
git add .
git diff --cached --stat
git diff --cached --name-only
```

Periksa daftar staged sekali lagi. Setelah yakin:

```powershell
git commit -m "Prepare Monee for deployment"
git remote add origin "https://github.com/GANTI_USERNAME/monee.git"
git remote -v
git push -u origin main
```

Ganti `GANTI_USERNAME` dan nama repository sebelum menjalankan. Bila `origin` sudah ada, jangan menjalankan `remote add` lagi; cocokkan URL yang ditampilkan dengan repository tujuan.

Git for Windows dapat membuka browser untuk autentikasi melalui Git Credential Manager. Login ke akun pemilik repository dan selesaikan permintaan otorisasi. Password akun GitHub bukan password untuk operasi Git HTTPS; bila autentikasi browser tidak muncul, ikuti [Git Credential Manager](https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git). Jangan memasang token dalam URL remote.

**Hasil yang diharapkan:** refresh halaman repository GitHub, branch `main` menampilkan `package.json` dan `wrangler.jsonc` langsung di root, beserta source. Folder dependensi, build, artefak dan secret tidak terlihat. Dasar alur ini mengikuti [panduan GitHub untuk source lokal](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

## 4. Siapkan Cloudflare dan login email

### 4.1 Buat akun dan organisasi Zero Trust

1. Daftar/login ke [dashboard Cloudflare](https://dash.cloudflare.com).
2. Pilih akun yang akan memiliki aplikasi.
3. Buka **Zero Trust** dari dashboard.
4. Bila diminta onboarding, pilih team name, misalnya `monee-keluarga` jika masih tersedia.
5. Pilih paket **Free**, periksa ringkasan dan lengkapi detail pembayaran yang diminta.
6. Setelah aktif, buka **Zero Trust > Settings** dan catat team domain lengkap, misalnya `monee-keluarga.cloudflareaccess.com`.

Team domain ini berbeda dari alamat `workers.dev`. Catatan contoh bukan nilai yang harus disalin mentah. [Lokasi team name/domain](https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/).

### 4.2 Tambahkan login One-time PIN

1. Buka **Zero Trust > Integrations > Identity providers**.
2. Klik **Add new identity provider**.
3. Pilih **One-time PIN** dan selesaikan penambahannya.

Organisasi baru saat ini memakai Cloudflare identity provider sebagai default. OTP tidak boleh diasumsikan sudah tersedia. Kita menambahkannya agar pengguna cukup memakai email, tanpa akun Cloudflare.

**Hasil yang diharapkan:** One-time PIN terlihat di daftar identity provider. [Konfigurasi dan perilaku OTP resmi](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

### 4.3 Buat kebijakan email yang diizinkan

1. Buka **Zero Trust > Access controls > Policies > Add a policy**.
2. Nama: misalnya `Monee - email yang diizinkan`.
3. Action: **Allow**.
4. Pilih session duration yang kamu inginkan, misalnya 1 hari jika tersedia. Ini masa sesi login, bukan masa berlaku kode email.
5. Pada **Include**, pilih selector **Emails**.
6. Isi emailmu sendiri secara lengkap. Jika perlu, tambahkan alamat lengkap orang yang diundang.
7. Simpan kebijakan.

Jangan gunakan `Everyone` atau seluruh domain `gmail.com`. Jika menambahkan syarat **Login Methods = One-time PIN**, letakkan sebagai **Require**, bukan tambahan Include; beberapa Include digabung dengan OR dan dapat memperluas izin. Tidak perlu menambahkan syarat itu untuk mengikuti langkah awal ini.

**Hasil yang diharapkan:** kebijakan Allow hanya memuat alamat yang kamu pilih. [Mengelola kebijakan](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/policy-management/), [cara aturan kebijakan digabung](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).

## 5. Hubungkan GitHub dan deploy Worker pertama

### 5.1 Impor repository yang sudah terisi

1. Kembali ke dashboard utama Cloudflare.
2. Buka **Workers & Pages > Create application**.
3. Pilih **GitHub** / impor repository Git milikmu.
4. Bila diminta memasang **Cloudflare Workers and Pages** GitHub App, pilih akun GitHub yang benar dan **Only select repositories > monee**.
5. Selesaikan **Install & Authorize**, lalu pilih repository `monee` pada Cloudflare.

Repository Private dapat dipilih setelah GitHub App diberi akses. Jika repository tidak terlihat, periksa izin instalasi GitHub App; tidak perlu mengubah repository menjadi Public. [Integrasi GitHub resmi](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/).

Jika ini Worker pertama dan Cloudflare meminta subdomain akun, pilih nama unik yang tersedia. URL Worker akan berbentuk `NAMA_WORKER.SUBDOMAIN_AKUN.workers.dev`. Catat alamat yang benar; subdomain akun Workers berbeda dari team domain Zero Trust. Pengaturan subdomain berada pada halaman Workers & Pages di bagian **Your subdomain**. [Pengaturan workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

### 5.2 Isi pengaturan build

| Kolom | Isi untuk proyek ini |
|---|---|
| Worker/project name | `monee`, sama persis dengan `name` di `wrangler.jsonc` |
| Production branch / Git branch | `main` |
| Root directory | Root repository; biarkan default/kosong jika file proyek langsung di root |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Build variable | `NODE_VERSION` = `22` jika UI menyediakan; file `.node-version` juga sudah menentukan 22 |
| API token deployment | Pilihan otomatis Cloudflare untuk awal |
| Groq key pada pengaturan build | Kosong; dipasang sebagai runtime secret di bagian 7 |

Gunakan perintah `npm`, bukan `npm.cmd`, di kolom build Cloudflare karena lingkungan build-nya Linux. Dependensi dipasang oleh Workers Builds; `package-lock.json` harus ikut repository. Static Assets memakai `./dist` dari konfigurasi Wrangler. Model atau key tidak dipasang di kolom framework.

**Build variables** hanya tersedia saat build; konfigurasi API Monee akan dipasang di **Settings > Variables and Secrets** sesudah Worker tersedia. [Arti kolom build resmi](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Node 22 bukan default Cloudflare yang boleh diasumsikan. Jika opsi Node tidak tampak saat membuat proyek, `.node-version` yang sudah di-commit menentukan 22; pengaturan tambahan berada di **Settings > Build > Build Variables and Secrets**. [Versi build image dan override](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

### 5.3 Jalankan deployment dan baca log

1. Klik **Save and Deploy** / **Deploy**.
2. Tunggu tahap pengambilan source, pemasangan dependensi, build dan deploy selesai.
3. Pastikan status berhasil, bukan hanya build frontend selesai.
4. Buka URL produksi `workers.dev` yang ditampilkan dan catat alamatnya.

**Hasil yang diharapkan:** UI Monee dapat dimuat. Voice belum siap karena Access dan secret belum lengkap; itu sesuai urutan pemasangan. Jangan mulai membagikan URL sebelum bagian 6-8 selesai.

Cloudflare mensyaratkan nama Worker dashboard sama dengan `name` pada Wrangler. Jika wizard menawarkan proyek Pages statis atau mengganti konfigurasi menjadi upload aset saja, kembali ke alur Worker dengan source/konfigurasi ini. [Membuat Worker dari Git](https://developers.cloudflare.com/workers/ci-cd/builds/).

### 5.4 Matikan preview build untuk rilis awal

1. Buka **Worker > Settings > Build > Branch control**.
2. Pastikan production branch `main`.
3. Hapus centang **Enable Preview Builds**, lalu simpan.

Sebagian akun lama dapat menampilkan istilah build non-production. Jalur utama panduan ini menyiapkan produksi dahulu. Preview baru mempunyai konfigurasi tersendiri; detail ada di bagian 16. [Pengaturan branch resmi](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).

## 6. Pasang perlindungan Access ke Worker

### 6.1 Hubungkan kebijakan email

1. Buka **Workers & Pages > monee > Access**.
2. Klik **Protect this Worker behind Access**.
3. Pilih **All traffic**.
4. Pada **Authentication policy**, pilih existing policy yang kamu buat: `Monee - email yang diizinkan`.
5. Periksa session duration dan klik **Apply Access**.

Jangan memilih `Previews only` untuk melindungi produksi. Perlindungan pada tingkat Worker mencakup domain yang terhubung dengannya, termasuk `workers.dev`, custom domain dan preview. [Langkah Access untuk satu Worker](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

### 6.2 Pastikan pengguna dapat memilih OTP

Buka **Zero Trust > Access controls > Applications**. Temukan aplikasi yang dibuat untuk Worker `monee`, lalu **Configure**.

- Periksa kebijakan yang terpasang: Allow yang dimaksud hanya berisi email pemilik/undangan.
- Di pengaturan **Login methods**, izinkan/pilih **One-time PIN**. Jika ada pembatasan identity provider untuk aplikasi ini, sertakan One-time PIN.
- Bila masih ada Allow lain yang terlalu luas, perbaiki; menambahkan kebijakan sempit tidak otomatis membatalkan kebijakan luas yang sudah ada.

Jangan membuat aplikasi Access lain untuk hostname yang sama hanya karena sudah ada aplikasi Worker. Konfigurasi Access yang bertumpuk dapat menghasilkan kebijakan atau AUD berbeda.

### 6.3 Uji akses sebelum memasang Groq

1. Buka jendela **Incognito/InPrivate baru**.
2. Kunjungi URL produksi yang dicatat di bagian 5.
3. Pilih login email/One-time PIN.
4. Masukkan email yang ada di kebijakan dan klik **Send login code**.
5. Buka inbox/spam, salin kode terbaru dan selesaikan **Sign in**.
6. Setelah berhasil, aplikasi Monee terbuka.
7. Tutup jendela privat. Jika punya email lain yang tidak diizinkan, uji dari sesi privat baru.

**Hasil yang diharapkan:** pengunjung tanpa sesi diminta login; email yang kamu izinkan dapat masuk; email lain tidak mendapat akses. UI OTP dapat menyatakan kode sudah dikirim meskipun alamat diblokir; jangan menganggap tulisan itu membuktikan izin berhasil. Gunakan kode terbaru, sebelum masa berlakunya habis.

Pengujian akses memakai sesi browser baru, karena shell PWA yang sudah di-cache dapat tetap terbuka offline dengan kontrol PIN lokal.

## 7. Buat key Groq dan isi konfigurasi server

### 7.1 Buat key di akun pengelola

1. Daftar/login ke [Groq Console](https://console.groq.com).
2. Pilih organisasi/project yang akan dipakai Monee bila akun mempunyai beberapa project.
3. Buka [API Keys](https://console.groq.com/keys).
4. Klik **Create API Key**, beri nama yang mudah dikenali, misalnya `monee-production`, lalu selesaikan pembuatannya.
5. Simpan nilai lengkap key pada penyimpanan pribadi yang aman. Jangan tempel ke source, chat publik atau screenshot panduan.

Label tambahan pada dialog yang memerlukan login belum diverifikasi dari akunmu. Akun dengan peran Owner/Developer dapat mengelola key. [Quickstart Groq](https://console.groq.com/docs/quickstart).

**Model yang digunakan kode ini adalah `whisper-large-v3`, tanpa akhiran `-turbo`.** Tidak ada kolom pemilihan model di UI Monee. Jika organisasimu membatasi model, izinkan model tersebut pada tingkat organisasi dan project; izin project tidak mengalahkan blok organisasi. [Speech to Text](https://console.groq.com/docs/speech-to-text), [model permissions](https://console.groq.com/docs/model-permissions).

Untuk memeriksa pembatasan: buka **Settings > Organization > Limits** untuk organisasi, atau pilih project lalu **Settings > Projects > Limits** untuk project tersebut. Cari model **whisper-large-v3** yang dipakai kode ini.

### 7.2 Ambil dua nilai Access yang diperlukan

**A. Team domain**

Dari **Zero Trust > Settings**, ambil team domain. Nilai untuk Monee harus berbentuk:

```text
https://NAMA_TEAM_KAMU.cloudflareaccess.com
```

Ganti nama contoh dengan team milikmu. Jangan pakai alamat aplikasi `workers.dev`, URL login lengkap, atau path tambahan.

**B. Application Audience (AUD)**

1. Buka **Zero Trust > Access controls > Applications**.
2. Temukan aplikasi Access yang melindungi Worker ini.
3. Pilih **Configure**.
4. Buka **Additional settings**.
5. Salin **Application Audience (AUD) Tag**.

Kode Monee mengharapkan AUD 64 karakter heksadesimal. Ini berbeda dari account ID, API token Cloudflare, application ID dan client ID. Bila aplikasi Access dihapus/dibuat ulang, ambil AUD barunya. [Lokasi AUD dan validasi JWT resmi](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

### 7.3 Tambahkan runtime variables dan secret

1. Buka **Workers & Pages > monee > Settings > Variables and Secrets**.
2. Jika UI membedakan **Production** dan **Previews Base**, pilih **Production**.
3. Klik **Add**, lalu isi ketiga entri berikut:

| Nama, huruf besar persis | Jenis | Nilai |
|---|---|---|
| `ACCESS_TEAM_DOMAIN` | Text / Variable | Team domain lengkap dengan `https://` |
| `ACCESS_AUD` | Text / Variable | AUD aplikasi Access Worker ini |
| `GROQ_API_KEY` | **Secret** | Key Groq lengkap dari langkah 7.1 |

4. Tempel nilai tanpa tanda kutip tambahan, spasi atau baris baru.
5. Klik **Deploy** untuk menerapkan perubahan.

**Hasil yang diharapkan:** dua variable tampil dengan nilai yang tepat; nama Secret terlihat tetapi nilainya disembunyikan. Pastikan versi yang baru menjadi deployment aktif. [Memasang secret melalui dashboard](https://developers.cloudflare.com/workers/configuration/secrets/).

**Tidak perlu membuat `.env` produksi di GitHub.** Dashboard memberikan nilai runtime ke Worker. File `.dev.vars` hanya untuk kebutuhan lokal, lihat bagian 15. Jangan memberi nama `VITE_GROQ_API_KEY`: awalan Vite dapat memasukkan nilai ke browser. [Env Vite dan secret](https://vite.dev/guide/env-and-mode).

`keep_vars: true` pada konfigurasi proyek mempertahankan variable dashboard pada deployment Wrangler berikutnya. Secret juga dipertahankan pada deployment biasa; jangan menghapus/mengganti nama binding/variable ketika mengubah konfigurasi. [Konfigurasi Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/), [perilaku deployment dan secret](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

### 7.4 Periksa binding yang ikut deployment

`ASSETS` dan `AI_RATE_LIMIT` didefinisikan dalam `wrangler.jsonc`; keduanya bukan nilai teks yang kamu isi di tabel variable.

- `ASSETS` menyajikan hasil build `dist/`.
- `AI_RATE_LIMIT` membatasi permintaan per identitas Access terverifikasi, dengan konfigurasi 10/60 detik.
- Tidak perlu membuat D1, Supabase, bucket R2 atau database baru untuk menjalankan voice/ledger saat ini.
- Jika deployment menolak binding limiter, baca pesan persisnya dan periksa dukungan akun. Jangan menghapus limiter atau membuka API sebagai jalan pintas.

Tanpa konfigurasi yang lengkap/valid, Worker menolak voice sebelum menghubungi Groq. Login PIN lokal saja tidak mengizinkan pemakaian API.

## 8. Uji aplikasi dan voice dari URL publik

Lakukan bagian ini setelah deployment aktif memiliki tiga nilai server dan perlindungan Access. Ini tahap yang membuktikan layanan akunmu berjalan; hasil tes lokal belum menggantikannya.

### 8.1 Login dan selesaikan onboarding Monee

1. Buka URL produksi melalui browser biasa yang akan kamu pakai.
2. Login OTP memakai email yang diizinkan.
3. Untuk data browser yang masih kosong, isi **Nama panggilan**.
4. Pada langkah pemasukan, boleh isi nominal percobaan, misalnya Rp1.000.000, agar draft pengeluaran mempunyai saldo dan jatah untuk uji.
5. Lanjutkan pengaturan alokasi dan pilihan maskot.
6. Buat dan ulangi **PIN 6 digit**, baca persetujuan yang ditampilkan, kemudian **Selesai & masuk**.
7. Pastikan Beranda terbuka. Reload, buka PIN dan pastikan onboarding tidak diminta ulang.

Kode email Cloudflare dan PIN Monee berbeda. Kode email diterima melalui email; PIN Monee kamu tentukan sendiri untuk data di browser tersebut.

Jika ini ledger sungguhan, gunakan pemasukan sungguhan yang sesuai atau Lewati; jangan menambahkan nominal contoh ke pembukuan pribadi yang sudah berisi data.

### 8.2 Uji input manual terlebih dahulu

1. Tekan tombol tambah transaksi.
2. Isi pengeluaran kecil yang tidak melebihi saldo/jatah, pilih kategori dan bucket yang benar.
3. Simpan, periksa Riwayat dan saldo, lalu reload untuk memastikan transaksi bertahan.

**Hasil yang diharapkan:** transaksi tersimpan tepat sekali, saldo sesuai, tidak hilang setelah reload. Bila pemasukan dilewati, penolakan pengeluaran tanpa saldo adalah aturan finance, bukan bukti hosting gagal.

### 8.3 Uji Groq melalui fitur voice

1. Buka tambah transaksi, lalu **Catat dengan suara**.
2. Baca dan centang persetujuan pengiriman audio pada sesi itu.
3. Tekan **Mulai rekam**.
4. Izinkan mikrofon bila browser meminta.
5. Ucapkan singkat, misalnya: **“makan 25rb”**.
6. Tekan **Berhenti rekam**. Batas rekaman UI 30 detik; pendeteksi jeda juga dapat menghentikan rekaman.
7. Tunggu teks dan draft muncul.
8. Periksa nominal, tanggal, jenis transaksi, kategori dan bucket; koreksi bila perlu.
9. Simpan satu kali, tunggu periode undo selesai, lalu periksa Riwayat.

**Hasil yang diharapkan:** pengguna tidak pernah diminta key; rekaman menjadi teks melalui server, lalu draft diperiksa sebelum menjadi transaksi. Jika saldo/jatah tidak cukup, koreksi data atau uji dengan pemasukan yang sesuai, bukan melewati guard finance.

Model transkripsi tidak menjamin semua ucapan/slang selalu benar. Teks kemudian diparsing secara lokal; ini tidak menambahkan chatbot atau LLM umum ke aplikasi.

### 8.4 Periksa request bila voice gagal

Di Chrome/Edge laptop:

1. Tekan **F12** atau **Ctrl+Shift+I**.
2. Buka tab **Network**, lalu filter `transcribe`.
3. Ulangi satu rekaman pendek.
4. Klik request **POST /api/transcribe**.
5. Periksa **Status Code** dan tab **Response**.

Sukses menghasilkan `200` dengan JSON `{"text":"..."}`. URL request browser harus berada pada origin Monee. Tidak seharusnya ada panggilan browser langsung ke `api.groq.com` atau header Authorization berisi key Groq; hubungan ke Groq terjadi di server.

Jangan membagikan cookie sesi, key, audio, transkrip pribadi atau HAR lengkap saat meminta bantuan. Status HTTP, URL tanpa informasi rahasia dan pesan error biasanya cukup. [Memeriksa request dengan DevTools](https://developer.chrome.com/docs/devtools/network/reference).

Jika kamu membuka `/api/transcribe` langsung lewat address bar setelah login, respons **405** adalah wajar: address bar melakukan GET, sedangkan transkripsi memerlukan POST beserta berkas. Itu bukan pengujian transkripsi sukses.

### 8.5 Uji login ulang dan pengguna yang tidak diizinkan

- Uji jendela privat baru: tanpa sesi harus diminta login.
- Uji alamat email di luar daftar izin jika tersedia: tidak boleh memperoleh akses.
- Bila voice mengatakan sesi berakhir, pilih **Masuk ulang layanan suara**. Link menuju `/auth/refresh` akan mencapai jaringan/Access, lalu kembali ke aplikasi setelah login. Jangan hanya mengandalkan reload, karena shell PWA bisa berasal dari cache.
- Setelah kembali, buka PIN jika diminta, lalu rekam ulang. Audio gagal tidak otomatis diantrekan atau dikirim ulang.
- Jika ada domain/URL lain yang terhubung ke Worker, periksa dari sesi baru juga.

## 9. Pasang PWA dan uji offline

### 9.1 Android

1. Gunakan Chrome pada URL produksi HTTPS.
2. Login dan tunggu aplikasi selesai terbuka.
3. Buka **Atur**, lalu bagian **Aplikasi dan penyimpanan** bila terlihat.
4. Bila tombol **Pasang Monee** tersedia, pilih dan konfirmasikan dialog browser.
5. Jika tombol tidak tersedia, periksa menu browser untuk **Install app/Pasang aplikasi/Tambahkan ke layar utama**; ketersediaannya mengikuti browser.
6. Buka ikon yang terpasang dan pastikan aplikasi dapat dibuka kembali.

Tombol install tidak tersedia di semua browser/sesi. Dialog browser yang diterima belum membuktikan seluruh perilaku OS/perangkat berjalan; periksa ikon dan hasil buka ulang. [Panduan memasang aplikasi web di Android](https://support.google.com/chrome/answer/9658361?hl=id&co=GENIE.Platform%3DAndroid).

### 9.2 iPhone/iPad

Buka URL melalui Safari, pilih menu berbagi/opsi halaman, lalu **Add to Home Screen/Tambahkan ke Layar Utama** dan konfirmasikan. Pada versi yang menampilkan pilihan membuka sebagai web app, aktifkan sesuai kebutuhan. Posisi menu bergantung versi iOS/iPadOS. [Panduan Apple](https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios).

### 9.3 Laptop dan pemeriksaan offline

- Chrome/Edge dapat menawarkan ikon install pada address bar/menu; gunakan jika tersedia.
- Setelah satu kunjungan online dan cache selesai, tutup dan buka ulang PWA.
- Aktifkan mode pesawat, lalu buka ulang dari ikon atau reload.
- Buka PIN lokal, periksa data yang sebelumnya tersimpan dan coba input teks/manual sesuai saldo.
- Voice dan login email awal tetap memerlukan internet.
- Matikan mode pesawat dan periksa voice kembali.

**Hasil yang diharapkan:** shell yang sudah di-cache serta data lokal tetap tersedia offline. Kunjungan pertama yang sudah offline tidak diharapkan berhasil. Model maskot yang belum pernah di-cache dapat memakai fallback; jangan menganggap setiap aset otomatis tersedia offline.

## 10. Checklist selesai dan serah akses pengguna

Aplikasi baru dapat dianggap **terhosting dan berjalan pada akunmu** setelah checklist ini diperiksa:

- [ ] Source sudah ada di repository GitHub yang benar, tanpa file credential asli.
- [ ] Build dan deploy produksi Cloudflare selesai, sesuai commit yang dimaksud.
- [ ] URL produksi HTTPS terbuka tanpa error aset/missing script.
- [ ] Worker Access memakai **All traffic** dan kebijakan email yang tepat.
- [ ] Sesi privat tanpa login diminta login; alamat yang diizinkan berhasil masuk.
- [ ] Email yang tidak diizinkan tidak mendapat akses.
- [ ] `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` dan secret `GROQ_API_KEY` terpasang pada **runtime Production**.
- [ ] Rekaman suara asli menghasilkan teks/draft tanpa input key pengguna.
- [ ] Review dan simpan transaksi berfungsi, termasuk penolakan jatah/saldo bila relevan.
- [ ] Reload deep-link seperti `/riwayat`, `/tabungan` dan `/atur` tetap berfungsi.
- [ ] Data tetap ada setelah reload; onboarding hanya sekali untuk data lokal yang sudah selesai.
- [ ] Aplikasi dicoba di HP sasaran dan tablet/laptop yang akan dipakai.
- [ ] PWA/offline dicoba setelah cache; voice kembali berfungsi ketika online.
- [ ] Jalur **Masuk ulang layanan suara** dapat digunakan ketika sesi perlu diperbarui.
- [ ] Setelah uji, backup diunduh dan disimpan secara pribadi.

Untuk mengundang orang, edit kebijakan email bagian 4.3, tambahkan alamat lengkapnya, lalu berikan **URL aplikasi dan instruksi login**. Jangan membagikan key Groq atau PIN lokalmu. Pengguna baru membuat ledger dan PIN pada browsernya sendiri; email bukan mekanisme berbagi satu ledger.

OCR otomatis tidak termasuk bukti checklist ini: provider/model belum dipasang. Fitur review struk manual dapat dicoba, tetapi tidak boleh dilaporkan sebagai pengenalan teks otomatis yang berhasil.

## 11. Backup dan pindah perangkat

Lakukan sesudah percobaan dan sebelum pembaruan berisiko, mengganti domain atau membersihkan penyimpanan browser.

### Export

1. Buka **Atur > Export Backup**.
2. Pilih opsi enkripsi dengan passphrase bila diinginkan.
3. Unduh JSON dan simpan di lokasi pribadi.
4. Jika dienkripsi, simpan passphrase secara terpisah. Lupa passphrase tidak dapat diperbaiki hanya dengan login email.

### Import

1. Pada browser/origin tujuan, login Access dan buka aplikasi.
2. Buka **Atur > Import Backup**, pilih file dan masukkan passphrase jika dienkripsi.
3. Baca konfirmasi: **import mengganti data lokal**, bukan menggabungkan.
4. Selesaikan konfirmasi, buka PIN yang berlaku sesuai data hasil pemulihan jika diminta, lalu periksa saldo/riwayat.

Backup ledger tidak memuat secret Groq atau foto struk. Tidak perlu memasukkan key pengguna setelah restore. Menyalin URL yang sama ke perangkat lain tidak menyalin IndexedDB; export/import adalah pemindahan manual, bukan sinkronisasi.

## 12. Update aplikasi dan rollback

### 12.1 Update rutin melalui GitHub

1. Export backup jika perubahan menyangkut data/schema.
2. Ubah source di laptop dan jalankan pemeriksaan yang relevan.
3. Tinjau perubahan sebelum commit:

```powershell
Set-Location -LiteralPath 'D:/PROJECT2/monee'
git status --short
git diff --stat
git add .
git diff --cached --stat
git diff --cached --name-only
```

4. Setelah daftar benar, commit dan push:

```powershell
git commit -m "Update Monee"
git push origin main
```

5. Buka halaman build Cloudflare; cocokkan commit, tunggu build/deploy berhasil.
6. Buka aplikasi dan terima **Perbarui sekarang** saat banner update muncul setelah pekerjaan/form diselesaikan.
7. Ulangi pemeriksaan singkat login, saldo, input manual dan voice.

Pengaturan runtime dashboard tidak perlu disalin menjadi source setiap kali commit. Setelah deploy, tetap periksa variable/secret/binding bila konfigurasinya ikut berubah. [Alur Git ke Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

### 12.2 Jika rilis baru rusak

1. Buka **Workers & Pages > monee > Deployments**.
2. Temukan versi yang sebelumnya berhasil.
3. Klik menu **tiga titik > Rollback** dan konfirmasikan sesuai dashboard.
4. Periksa deployment aktif, login dan voice kembali.
5. Periksa policy Access, AUD dan runtime settings setelah rollback.
6. Di source, perbaiki atau revert commit bermasalah supaya push berikutnya tidak menerbitkan masalah yang sama.

Rollback memulihkan versi aplikasi, bukan transaksi IndexedDB. Ia tidak membatalkan migrasi data di perangkat. Resource terhubung dan perubahan di luar versi juga perlu diperiksa; jangan menganggap rollback mengembalikan semua keadaan akun. [Rollback resmi](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## 13. Domain sendiri bila diperlukan

`workers.dev` cukup untuk jalur utama; domain pribadi bukan syarat aplikasi berjalan. Domain pribadi mempunyai biaya registrasi/perpanjangan tersendiri.

Jika memiliki domain:

1. Pastikan zone domain sudah **Active** pada akun Cloudflare.
2. Buka **Workers & Pages > monee > Settings > Domains & Routes > Add > Custom Domain**.
3. Isi hostname, misalnya `uang.DOMAIN_KAMU`.
4. Konfirmasikan **Add Custom Domain** dan tunggu status DNS/sertifikat siap.
5. Buka hostname HTTPS dari sesi privat dan ulangi login/voice.
6. Tetapkan satu alamat utama untuk penggunaan harian.

Cloudflare membuat record DNS yang diperlukan. Hostname dengan CNAME yang sudah ada perlu diperiksa sebelum diganti; jangan menghapus record domain lain secara sembarang. [Syarat dan cara Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Worker-level Access melindungi domain yang terkait. Hindari menambahkan aplikasi Access hostname lain dengan AUD berbeda tanpa menyesuaikan backend. Jika pindah dari `workers.dev` ke domain pribadi, **export data dari origin lama dan import di origin baru**. Shell/IndexedDB/PWA pada kedua alamat berbeda; tampilan kosong di alamat baru bukan bukti data lama terhapus.

## 14. Jalur alternatif lewat CLI

Gunakan ini bila memilih deploy manual. Jalur CLI adalah alternatif bagian 5, bukan kewajiban tambahan setelah GitHub berhasil.

```powershell
Set-Location -LiteralPath 'D:/PROJECT2/monee'
npm.cmd ci
npm.cmd run deploy:check
npx.cmd wrangler login
npx.cmd wrangler whoami
```

Login membuka browser; otorisasi akun Cloudflare yang benar. `whoami` membantu memastikan akun yang akan dipakai. Jika muncul beberapa akun, pilih akun tempat Zero Trust disiapkan. Tidak perlu menaruh API token Cloudflare ke source untuk login interaktif ini.

Setelah pemeriksaan dan akun benar:

```powershell
npm.cmd run deploy
```

Deployment ini memakai hasil `dist/` dari `deploy:check`. Jika source berubah sesudahnya, jalankan build lagi sebelum deploy. Catat URL yang diberikan Wrangler, lalu ikuti **bagian 6-10** untuk Access, secret dan pengujian.

Untuk secret lewat prompt CLI setelah Worker ada, tersedia:

```powershell
npx.cmd wrangler secret put GROQ_API_KEY
```

Tempel nilai hanya pada prompt yang meminta secret, bukan sebagai argumen command line. Perintah ini membuat versi dan menerapkannya. Dua variable Access tetap dapat diisi melalui dashboard sesuai bagian 7. [Login/deploy Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/), [perilaku secret put](https://developers.cloudflare.com/workers/configuration/secrets/).

Jika ingin build otomatis dari GitHub setelah membuat Worker lewat CLI, buka **Worker > Settings > Builds > Connect**, hubungkan repository dan gunakan pengaturan bagian 5. Pastikan nama Worker tetap cocok dengan Wrangler.

## 15. Pengembangan lokal dan file env

| Perintah | Hasil |
|---|---|
| `npm.cmd run dev` | Frontend Vite lokal; tidak menjalankan backend voice |
| `npm.cmd run preview` | Preview frontend yang sudah dibangun; tidak memasang API |
| `npm.cmd run dev:worker` | Build frontend dan jalankan Worker lokal |
| `npm.cmd run deploy:check` | Build/bundling dry-run; tidak publish |
| `npm.cmd run deploy` | Publish Worker dan assets hasil build yang tersedia |

Untuk kebutuhan pengembangan server lokal saja:

```powershell
if (-not (Test-Path -LiteralPath .dev.vars)) {
  Copy-Item -LiteralPath .dev.vars.example -Destination .dev.vars
}
```

Jalankan hanya jika `.dev.vars` belum ada agar tidak menimpa konfigurasi lokal. Isi nilai secara pribadi dan pastikan file tetap di-ignore. Pengembangan lokal Monee memakai `.dev.vars`; production utama memakai dashboard runtime settings. [Env pengembangan Cloudflare](https://developers.cloudflare.com/workers/local-development/environment-variables/).

**Key lokal saja tidak membuat voice lokal langsung berfungsi.** Worker tetap memerlukan JWT Access valid; tidak ada bypass autentikasi pengembangan. Untuk pemilik yang ingin mencoba aplikasi normal, gunakan deployment produksi yang sudah dilindungi dan dikonfigurasi. Penyiapan pengembangan dengan Access valid merupakan alur pengembang tersendiri, bukan syarat mengikuti panduan rilis ini.

## 16. Jika ingin mengaktifkan preview

Lewati bagian ini untuk rilis pertama. Konfigurasi proyek saat ini menyiapkan produksi; panduan utama mematikan preview build.

Dokumentasi terbaru memakai **Worker Previews**, dengan default command `npx wrangler preview`. Preview baru **tidak mewarisi** vars, secret dan binding produksi. Ia memerlukan konfigurasi `previews`, pengaturan **Previews Base** dan secret tersendiri. Mengaktifkan checkbox preview saja belum cukup untuk membuat voice pada preview berjalan.

Jika nanti diperlukan:

1. Tentukan kebutuhan dan kuota preview secara terpisah.
2. Siapkan konfigurasi preview yang kompatibel dengan assets dan limiter.
3. Pasang variable Access serta secret pada scope preview yang tepat.
4. Pastikan Access **All traffic** tetap terpasang.
5. Uji domain preview, penolakan tanpa izin dan voice secara tersendiri.
6. Jangan menggunakan command deploy produksi sebagai Preview command.

Pada model baru, perubahan secret base tidak otomatis diterapkan ke semua preview aktif yang sudah dibuat. Akun lama dapat memakai mekanisme preview lama dengan perilaku berbeda; periksa jenisnya sebelum migrasi. [Konfigurasi Worker Previews](https://developers.cloudflare.com/workers/previews/configuration/).

## 17. Troubleshooting

Baca pesan pertama yang gagal, bukan hanya baris terakhir. Pisahkan tahap Git, build, Access, runtime server dan provider.

### GitHub dan build

| Gejala | Pemeriksaan/tindakan |
|---|---|
| `git` / `node` tidak dikenali | Pasang alat bagian 2, lalu buka ulang terminal. |
| `npm.ps1 cannot be loaded` | Pakai `npm.cmd` pada PowerShell. |
| `Author identity unknown` | Isi `git config user.name` dan `user.email` pada repository. |
| `remote origin already exists` | Jalankan `git remote -v`, cocokkan tujuan; tidak perlu menambah remote kedua. |
| Push meminta password / authentication failed | Selesaikan login Git Credential Manager; password website tidak digunakan untuk Git HTTPS. |
| `non-fast-forward` pada push pertama | Repository remote mungkin sudah memiliki commit, misalnya README otomatis. Periksa riwayat; jangan langsung force push. Pakai repository kosong untuk langkah awal atau selaraskan riwayat dengan benar. |
| Repository tidak muncul di Cloudflare | Periksa akun GitHub dan akses GitHub App ke repository Private tersebut. |
| `package.json` tidak ditemukan | Root directory salah atau proyek tersimpan dalam folder tambahan di repository. |
| Peringatan/error `EBADENGINE` | Periksa log versi Node. Gunakan major 22, minimal 22.12, dan pastikan `.node-version` ikut commit. |
| Wrangler name mismatch | Nama project dashboard harus sama dengan `name` di `wrangler.jsonc`. |
| `dist` tidak ada saat deploy | Pastikan build command `npm run build` berjalan lebih dulu dan berhasil. |
| Dependency install gagal | Pertahankan lockfile; periksa versi Node/npm dan pesan resolver. Jangan menghapus lockfile atau memakai force sebagai langkah awal. |
| Web muncul tetapi API menjadi HTML/404 | Periksa bahwa project adalah Worker dengan `server/index.ts`, binding assets dan `run_worker_first`; periksa juga cache service worker lama. |

### Login email dan Access

| Gejala | Pemeriksaan/tindakan |
|---|---|
| Zero Trust meminta detail pembayaran | Onboarding Free saat ini masih mensyaratkannya. Periksa paket; tanpa menyelesaikan aktivasi Access, alur email panduan ini belum siap. |
| Login hanya menawarkan akun Cloudflare | Tambahkan One-time PIN di Identity providers dan izinkan pada login methods aplikasi Access. |
| Tidak menerima kode email | Periksa alamat persis di Allow policy dan inbox/spam. Alamat yang diblokir tidak menerima email walau halaman menyatakan kode dikirim. |
| Kode tidak berlaku | Pakai kode terakhir dan minta kode baru bila kedaluwarsa; jangan memakai ulang kode lama. |
| URL produksi terbuka tanpa login dari sesi privat baru | Periksa Worker Access **All traffic**, bukan Previews only; periksa Allow yang terlalu luas. |
| Voice selalu meminta masuk ulang setelah login berhasil | Periksa `ACCESS_TEAM_DOMAIN`, AUD aplikasi Worker yang benar dan aplikasi Access hostname yang bertumpuk. Ambil AUD dari Additional settings. |
| Reload tidak memperbarui sesi | Gunakan **Masuk ulang layanan suara** menuju `/auth/refresh`, bukan menghapus seluruh data browser. |
| Tidak ada menu Access pada Worker | Pastikan akun/izin dan Zero Trust aktif; cocokkan UI dengan [panduan resmi Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/). Jangan melonggarkan backend agar lolos tanpa Access. |

### Voice dan data

| Status/gejala | Arti dan langkah berikutnya |
|---|---|
| `503` dari API Monee | Konfigurasi server belum lengkap/valid atau limiter tidak tersedia. Periksa runtime **Production**, nama/case ketiga nilai, format team/AUD/key dan binding limiter. |
| `401` atau redirect login | Sesi perlu login ulang atau JWT tidak cocok. Gunakan link login ulang; jika berulang periksa team/AUD. |
| `403` | Periksa kebijakan akses dan origin permintaan. Model yang diblokir Groq diperiksa di provider; penolakan provider disanitasi oleh Worker menjadi `502`. |
| `400` | Unggahan rekaman tidak valid/format tidak didukung. Coba rekam pendek melalui browser yang mendukung MediaRecorder. |
| `413` | Ukuran rekaman melewati batas aplikasi 10 MiB; buat rekaman lebih singkat. |
| `429` | Limiter Monee atau kuota Groq tercapai. Tunggu, periksa pemakaian di Groq; jangan membuat loop retry. |
| `502` | Provider gagal/key salah/izin model tertolak/respons tidak valid. Periksa key dan izin **whisper-large-v3** pada org/project Groq serta status provider. |
| `504` | Permintaan terlalu lama. Coba jaringan stabil dan rekaman pendek; input teks tetap dapat digunakan. |
| Mikrofon tidak meminta izin atau ditolak | Pakai HTTPS, cek izin situs dan OS, lalu coba lagi. Jangan memakai browser di dalam aplikasi lain bila mikrofon tidak didukung. |
| Teks ada tetapi transaksi tidak tersimpan | Periksa review dan aturan saldo/jatah/periode; voice tidak otomatis menyimpan. |
| Saldo kosong di HP lain/domain baru | IndexedDB terpisah. Gunakan export/import; login email sama tidak menyinkronkan ledger. |
| Gambar struk tidak dibaca otomatis | Provider OCR belum dipilih. Mengisi secret voice tidak memasang adapter OCR. |
| Data hilang setelah clear site data | Penyimpanan lokal memang dihapus. Pulihkan backup; login cloud tidak mengembalikan ledger. |
| Cloudflare menampilkan error resource/CPU | Periksa Metrics akun, ukuran/lamanya rekaman dan log error yang tidak memuat isi audio. Dukungan paket Free tetap dibatasi resource; diagnosis diperlukan sebelum memutuskan perubahan paket. |

Nilai secret disembunyikan setelah disimpan; jangan membuktikan key benar dengan menampilkannya di frontend atau mencetaknya ke log. Jika key diduga pernah terpublikasi, cabut/ganti di Groq dan pasang secret baru; menambahkan ignore saja tidak menghilangkan key dari riwayat Git.

## 18. Biaya, kuota dan batas fitur

### 18.1 Periksa tiga layanan secara terpisah

| Layanan | Yang perlu diperiksa |
|---|---|
| GitHub | Repository dan batas akun yang dipilih |
| Cloudflare Workers / Builds | Request dinamis, CPU, resource dan build minutes |
| Cloudflare Zero Trust/Access | Paket, seat pengguna dan status aktivasi |
| Groq | Kuota organisasi/project, model yang diizinkan, pemakaian dan billing |
| Domain pribadi | Registrasi dan perpanjangan bila digunakan |

Workers Free saat sumber diperiksa menyediakan batas 100.000 request Worker/hari dan 10 ms CPU/request. Aset statis memiliki perhitungan tersendiri; build otomatis juga mempunyai batas. Baca angka yang berlaku di akun sebelum membagikan akses lebih luas. [Harga Workers](https://developers.cloudflare.com/workers/platform/pricing/), [batas Workers](https://developers.cloudflare.com/workers/platform/limits/), [batas Builds](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).

Limiter aplikasi adalah perkiraan per lokasi Cloudflare, bukan pagu tagihan global. Ketersediaan binding pada akun sasaran tetap dibuktikan ketika deployment pemilik berhasil. Kuota Groq berlaku pada akun/org/project yang sesuai, bukan jatah gratis baru untuk setiap pengguna Monee. Pantau [Limits Groq](https://console.groq.com/settings/limits) dan [penjelasan rate limits](https://console.groq.com/docs/rate-limits). Jangan menganggap memilih Free pada satu layanan membuat semua layanan gratis tanpa batas.

### 18.2 Privasi dan fitur yang belum ada

Audio yang disetujui dikirim melalui Worker Monee ke Groq. Worker tidak menyimpan audio/transkrip pada storage/log aplikasi; hasil yang kamu konfirmasikan menjadi transaksi lokal. Retensi dan pengaturan data provider mengikuti akun serta [kebijakan data Groq](https://console.groq.com/docs/your-data); jangan menjanjikan audio tidak pernah keluar perangkat atau provider tidak pernah menyimpan apa pun.

Deploy ini menyediakan aplikasi, voice terkelola dan review struk manual. Hal berikut belum otomatis muncul dari pemasangan hosting:

- OCR otomatis sampai model/provider dan adapter disiapkan.
- Sinkronisasi atau backup cloud ledger.
- Pemulihan data/PIN melalui email login.
- Jaminan akurasi transkripsi pada semua ucapan.
- Jaminan instalasi/performa yang sama pada seluruh perangkat.

Status implementasi lain berada di [task](task.md), rincian voice/OCR di [spesifikasi AI](07-ai-features.md), dan arsitektur di [dokumen keamanan](09-architecture-security.md).
