# 07 — AI Features Specification (Voice Input & OCR)

> Voice: `src/features/voice/` dan `src/core/stt/transcribe.ts`. Persiapan OCR v1 memiliki alur review manual; model/provider belum dipilih.
> Parser berjalan lokal, review menyimpan satu draft per konfirmasi dengan undo 2 detik.
> Batas pengujian: request voice otomatis menggunakan mock, belum secret hosting/audio asli. Status integrasi dan pekerjaan tersisa: [task](task.md).

## A. VOICE INPUT (v1 / MVP)

## A1. Flow

```text
Buka aplikasi -> login kode email Cloudflare Access (pemilik/undangan) -> PIN lokal
Tap mic di quick-add -> persetujuan pengiriman audio sebelum merekam
-> MediaRecorder merekam bahasa Indonesia, maksimal 30 detik
-> stop manual atau deteksi jeda bila didukung
-> POST /api/transcribe pada origin sendiri, FormData field file, maksimal 10 MiB
-> Worker memverifikasi JWT Access dan rate limit pengguna
-> Groq whisper-large-v3 mengembalikan teks
-> parser lokal deterministik -> draft -> review/koreksi -> simpan (undo 2 detik)
```

Tidak ada formulir API key untuk pengguna. Pemilik memasang secret dan akses hosting sekali sesuai [deployment](deployment.md). Sesi email Access mengizinkan pemakaian layanan; PIN melindungi sesi ledger pada perangkat dan tidak menggantikan otorisasi server.

**Fallback:** izin mic ditolak, layanan belum disiapkan, timeout, kuota/rate limit atau offline memberi pesan dan tindakan lokal; teks/manual tetap tersedia dan isi form dipertahankan.

**Sesi Access habis:** klien memakai redirect manual dan mengenali respons redirect/401 sebagai `VoiceAccessError`. UI menampilkan tautan **Masuk ulang layanan suara** ke `/auth/refresh`. Navigasi GET ini wajib melalui jaringan, sehingga Cloudflare Access dapat menampilkan login email; setelah login Worker merespons 302 ke `/`. Reload biasa dapat dibalas shell PWA dari cache dan tidak cukup untuk memperbarui sesi layanan. `/api`, `/cdn-cgi/` dan `/auth/refresh` dikecualikan dari fallback navigasi service worker. Login ulang memerlukan internet; input manual pada shell yang sudah di-cache tetap tersedia.

## A2. STT - Groq Whisper-large-v3 melalui server terkelola

- **Browser:** `transcribeAudio` di `src/core/stt/transcribe.ts` hanya mengirim audio ke endpoint tetap `/api/transcribe`; tidak memegang secret, memilih endpoint provider, atau mengirim Authorization Groq.
- **Server:** Cloudflare Worker memanggil endpoint tetap `https://api.groq.com/openai/v1/audio/transcriptions` menggunakan secret `GROQ_API_KEY`, model `whisper-large-v3`, bahasa `id`; respons sukses ke browser hanya `{ text: string }`.
- **Batas:** rekaman UI 30 detik, file 10 MiB; server memvalidasi multipart, MIME/ukuran, timeout dan respons provider. Batas durasi UI bukan pembuktian panjang audio dari klien yang dimodifikasi.
- **Akses:** seluruh trafik produksi dan preview dilindungi Cloudflare Access email OTP dengan allowlist email pemilik/undangan. Worker memverifikasi JWT dengan `jose`, termasuk tanda tangan, issuer `ACCESS_TEAM_DOMAIN`, audience `ACCESS_AUD`, expiry dan subject. Konfigurasi hilang/token invalid ditolak; provider tidak dipanggil.
- **Rate limit:** binding `AI_RATE_LIMIT`, 10 request/60 detik per subject Access terverifikasi. Ini batas perkiraan per lokasi Cloudflare, bukan pembatas biaya/kuota global yang ketat. Respons provider 429 juga ditangani. [Batas dan akurasi limiter](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
- **Biaya:** pemilik menanggung penggunaan akun Groq dan hosting. Kuota Groq terpisah dari Cloudflare; tidak ada janji gratis selamanya. [Limit Groq](https://console.groq.com/docs/rate-limits).
- **Tidak ada download model**; voice membutuhkan internet dan dukungan format MediaRecorder pada perangkat yang dipakai.

Alasan perubahan dari BYOK: pengguna nonteknis dapat langsung memakai voice setelah login dan persetujuan, tanpa membuka akun provider atau menyalin secret. Trade-off: pemilik mengelola akses, secret, penggunaan dan biaya, sedangkan audio melewati Worker serta Groq.

## A3. Parser — Rule-based (deterministic, offline)

**Kenapa bukan LLM:** keputusan D16 — gratis, offline, deterministic, testable (semua perhitungan dan parsing harus bisa diuji). Parsing transaksi bukan tugas yang butuh kreativitas LLM.

**Input yang harus ditangani:**

| Ujaran | Hasil draft |
|---|---|
| "tadi makan nasi goreng dua puluh lima ribu" | Expense, Makan, 25000 |
| "kemarin ngopi 22rb sama parkir 3rb" | 2 transaksi: Kopi 22000 (Minum), Parkir 3000 (Transport) |
| "gajian 5 juta" | Income, Gaji, 5000000 |
| "beli baju 150 ribu kemarin" | Expense, Belanja, 150000, tanggal kemarin |
| "setor tabungan 500rb" | `savings_deposit`, 500000 → Allocation |
| "pakai dana darurat 200rb buat bengkel" | `savings_expense` source=sisa, 200000, note "Darurat: bengkel" |
| "beli reksadana 1 juta dari tabungan" | `savings_expense` source=sisa, 1000000, note "Pindah ke investasi" |

**Komponen parser:**
1. **Normalisasi angka Indonesia**: "dua puluh lima ribu" → 25000; "22rb", "22k", "5jt" → angka; "setengah juta" → 500000.
2. **Deteksi nominal**: pola angka (verbal/numerik) — regex + kamus kata-angka.
3. **Deteksi tanggal**: "tadi/kemarin/hari ini/besok/5 maret" → tanggal absolut; default hari ini.
4. **Kamus kategori** (indonesia informal → kategori):
   - makan/nasi/gojek/dine|ayam/bakso/mie/warung → Makan
   - ngopi/kopi/minum/teh/boba → Minum
   - parkir/bensin/angkot/gojek(ojek)/kereta → Transport
   - pulsa/kuota/data → Pulsa/Data
   - beli/baju/checkout/shopping → Belanja
   - nonton/game/hiburan → Hiburan
   - sedekah/donasi/infak → Sedekah
   - edukasi/kursus/buku → Edukasi
   - tabungan/setor/nabung → Tabungan (setoran!)
   - gaji/gajian/salary → Income-Gaji
   - bonus/thr/rejeki → Income-Bonus
   - hadiah/dikasih/dapat dari → Income-Hadiah
   - freelance/project/kerjaan → Income-Freelance
5. **Split multi-transaksi**: konjungsi "sama", "dan", "trus", "terus", koma → pecah jadi beberapa clause → masing-masing 1 draft.
6. **Deteksi type** (urutan prioritas):
   - kata darurat/investasi/reksa/saham/emas + konteks tabungan → `savings_expense` (source default `sisa`)
   - pakai/ambil/tarik/gunakan dengan tabungan/sumber → `savings_expense`; sumber yang tidak disebut jelas perlu review
   - kata setor/nabung/tabungan tanpa konteks pengeluaran tabungan → `savings_deposit`
   - kata income (gaji/bonus/hadiah/freelance/dapat) → `income`
   - selain itu → `expense`
7. **Bucket inference**: nama bucket non-Tabungan yang disebut eksplisit dipakai bila tersedia. Model konfigurasi saat ini belum memiliki mapping kategori→bucket. Tanpa nama eksplisit, gunakan `profile.defaultBucketId` yang masih valid + flag perlu review; jangan mengasumsikan bucket default selalu bernama Kebutuhan Pokok. `savings_deposit` otomatis bucket Tabungan; `savings_expense` tanpa bucket/kategori.

**Confidence & ambiguity:**
- Draft memiliki confidence deterministik dan daftar field yang perlu diperiksa (kategori/bucket/tanggal/sumber). Review menampilkan daftar itu; kategori yang tidak dikenali tetap kosong dan wajib dipilih.
- Tidak ada nominal terdeteksi → tolak dengan maskot confused + minta ulang: "Nominalnya berapa nih? coba ulang atau isi manual".
- Ambigu berat ("beli 20rb") → draft dengan kategori kosong + focus langsung ke field itu.

**Parser adalah pure function** → unit test penuh (dok 10): input string → output draft. Tidak boleh ada random/undeterministic.

## A4. Batas v1

- 1 bahasa: Indonesia.
- Durasi ujaran: single utterance per sesi mic (bukan rekaman panjang).
- Tidak ada wake-word / always-listening. Mic aktif hanya saat sheet dibuka & tombol ditekan.
- Privasi: audio **dikirim melalui Worker ke Groq untuk transcribe** lalu dilepas dari memori Monee; teks hasil transcribe diproses lokal. Tidak disimpan setelah transcribe (D34).
- Audio tidak disimpan Monee. Transkrip berada di memori review; catatan draft yang dikonfirmasi disimpan bersama transaksi. Ucapan dapat memuat informasi finansial, sehingga pengguna menyetujui pengiriman audio pada setiap sesi dialog sebelum merekam.
- Worker tidak menyimpan atau mencatat isi audio/transkrip pada log aplikasi. Retensi provider mengikuti [kebijakan data Groq](https://console.groq.com/docs/your-data) dan pengaturan akun pemilik; jangan menjanjikan provider tidak pernah menyimpan audio.
- Secret hanya di hosting, tidak di bundle, IndexedDB atau backup. Credential BYOK lama dibersihkan saat aplikasi dibuka dan credential yang disisipkan ke file import tidak diaktifkan. Restore tidak memerlukan pengguna memasukkan key.
- Tutup dialog, kunci sesi, atau pindah ke background membatalkan capture/request. Mic dilepas juga bila izin baru diberikan setelah UI ditutup. Tanpa Web Audio, tombol berhenti dan batas 30 detik tetap berfungsi.
- Offline/layanan belum tersedia/izin ditolak: pengguna bisa membuat draft dari teks atau kembali ke formulir manual. Draft tidak pernah disimpan otomatis. Multi-transaksi direview satu per satu; melewati draft tidak menulis transaksi.

---

## B. STRUK v1 - persiapan OCR

G-9a/G-9b menjadi alur input gambar dan review multi-item. Pengenalan teks otomatis belum tersedia: **belum ada model/provider, API key OCR, atau panggilan OCR nyata**. Jangan menampilkan angka/item contoh sebagai hasil pembacaan struk pengguna.

## B1. Alur saat provider belum dipilih

1. Buka Scan struk dari Quick-Add; pilih JPEG/PNG/WebP maksimal 10 MB melalui pemilih berkas/galeri. Browser mobile dapat menawarkan kamera; belum ada viewfinder kamera khusus.
2. Tampilkan preview foto sementara serta status bahwa mesin pembaca belum diatur.
3. Pengguna mengisi/mengoreksi item secara manual: nama/catatan, nominal, kategori, tanggal dan bucket.
4. Tambah, koreksi atau hapus sampai 50 item, lalu periksa total dan validasi. Tombol gabung item pada rancangan belum tersedia.
5. Konfirmasi Simpan semua item menulis seluruh batch dalam satu transaksi database atomik, tanpa undo batch. Setiap expense tepat satu bucket; kategori/bucket yang tidak valid wajib diperbaiki. Semua aturan jatah, saldo, periode terkunci dan batas integer aman tetap berlaku. Kegagalan tidak menyimpan sebagian item; retry batch identik tidak menggandakan transaksi.
6. Tutup/reset sesi melepaskan foto sementara; foto tidak menjadi attachment transaksi atau bagian backup.

Kategori tidak mempunyai mapping kategori-ke-bucket otomatis dalam konfigurasi sekarang. Default bucket hanya boleh memakai bucket default profil yang masih valid dan tetap dapat dikoreksi pada review.

## B2. Batas provider

UI capture/review dan validasi ledger dipisahkan dari fungsi pengenalan. Antarmuka provider menerima gambar sementara dan menghasilkan draft item/metadata untuk review, dengan dukungan pembatalan dan error. Provider default berstatus belum dikonfigurasi; antarmuka ini tidak berarti model sudah dipasang atau teks sudah dibaca.

Lokasi integrasi: `src/features/ocr/provider.ts`. Kontrak `ReceiptRecognizer` pada `receipt.ts` menerima `(image: File, signal: AbortSignal)` dan menghasilkan `Promise<ReceiptResult>` dengan `items: { label: string; amount: number }[]`, serta `merchant`, `date` (YYYY-MM-DD), dan `total` opsional. Nominal adalah rupiah utuh positif. Semua keluaran provider dinormalisasi ulang sebelum masuk review. Provider tidak boleh menyimpan ledger sendiri atau mengabaikan pembatalan. Pembatalan dan hasil yang terlambat tidak mengganti draft aktif.

Metadata retry di store `settings` hanya mencatat keanggotaan ID transaksi per batch; tidak mengandung foto. Metadata dan ledger ditulis atomik, tanpa versi schema baru.

Pemilihan model ditunda hingga tersedia keputusan tentang akurasi struk Indonesia, latensi/perangkat, biaya, endpoint/key dan privasi. Opsi lokal maupun cloud belum dikunci. Jangan menambahkan model, key palsu, env API generik atau fallback layanan tanpa keputusan pengguna.

## B3. Privasi

- Scaffold sekarang menggunakan gambar di memori lokal, tanpa upload, penyimpanan IndexedDB, atau penyertaan foto dalam export/backup.
- Hanya field transaksi yang dikonfirmasi disimpan. Keluar dari alur, reset, atau penguncian sesi harus melepaskan gambar dan membatalkan proses yang belum selesai.
- Jika model cloud dipilih kelak, jelaskan penyedia, data yang dikirim dan retensi, minta persetujuan sebelum upload, lalu tinjau endpoint, penyimpanan key, CSP serta pembatalannya.
- Klaim seluruh OCR pasti lokal atau gratis belum dapat dibuat. Tidak ada key OCR yang perlu diisi pada hosting saat ini.
