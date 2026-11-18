# 07 — AI Features Specification (Voice Input & OCR)

> Voice: `src/features/voice/` dan `src/core/stt/transcribe.ts`. OCR memakai Google Gemini melalui Worker dan wajib ditinjau sebelum disimpan.
> Parser berjalan lokal, review menyimpan satu draft per konfirmasi dengan undo 2 detik.
> Batas pengujian: request voice otomatis menggunakan mock, belum secret hosting/audio asli. Status integrasi dan pekerjaan tersisa: [task](task.md).

## A. VOICE INPUT (v1 / MVP)

## A1. Flow

```text
Buka aplikasi -> login email + PIN akun Monee (PIN perangkat opsional)
Tap Catat -> layar suara (Ketik manual / Scan struk tersedia)
-> ketuk ikon mic untuk mulai; tanpa checkbox atau rekam otomatis
-> MediaRecorder merekam bahasa Indonesia, maksimal 30 detik
-> stop manual atau deteksi jeda bila didukung
-> POST /api/transcribe pada origin sendiri, FormData field file, maksimal 10 MiB
-> Worker memverifikasi sesi akun Monee dan rate limit pengguna
-> Groq whisper-large-v3 mengembalikan teks
-> parser lokal deterministik -> draft -> review/koreksi -> simpan (undo 2 detik)
```

Tidak ada formulir API key untuk pengguna. Pemilik memasang secret dan akses hosting sekali sesuai [deployment](deployment.md). Sesi akun Monee mengizinkan pemakaian layanan; PIN perangkat opsional melindungi ledger pada perangkat dan tidak menggantikan otorisasi server.

**Fallback:** izin mic ditolak, layanan belum disiapkan, timeout, kuota/rate limit atau offline memberi pesan dan tindakan lokal; teks/manual tetap tersedia dan isi form dipertahankan.

**Sesi akun habis:** respons redirect/401 dikenali sebagai sesi yang perlu diperbarui. Tautan **Masuk ulang layanan suara** menuju `/auth/refresh`, lalu kembali ke halaman login akun Monee pada deployment PIN akun. Cloudflare Access hanya memverifikasi email saat pendaftaran/pemulihan melalui `/auth/bootstrap`. Endpoint API dan navigasi pemulihan tidak memakai fallback service worker. Login ulang memerlukan internet; input manual lokal tetap tersedia sesuai status sesi perangkat.

## A2. STT - Groq Whisper-large-v3 melalui server terkelola

- **Browser:** `transcribeAudio` di `src/core/stt/transcribe.ts` hanya mengirim audio ke endpoint tetap `/api/transcribe`; tidak memegang secret, memilih endpoint provider, atau mengirim Authorization Groq.
- **Server:** Cloudflare Worker memanggil endpoint tetap `https://api.groq.com/openai/v1/audio/transcriptions` menggunakan secret `GROQ_API_KEY`, model `whisper-large-v3`, bahasa `id`; respons sukses ke browser hanya `{ text: string }`.
- **Batas:** rekaman UI 30 detik, file 10 MiB; server memvalidasi multipart, MIME/ukuran, timeout dan respons provider. Batas durasi UI bukan pembuktian panjang audio dari klien yang dimodifikasi.
- **Akses:** Cloudflare Access melindungi `/auth/bootstrap` dengan allowlist email pemilik/undangan. Worker memverifikasi JWT melalui `jose` dan membuat cookie sesi Monee; endpoint AI kemudian memverifikasi sesi akun tersebut serta origin permintaan. Konfigurasi hilang atau sesi invalid ditolak; provider tidak dipanggil.
- **Rate limit:** binding `AI_RATE_LIMIT`, 10 request/60 detik per akun dan layanan. Ini batas perkiraan per lokasi Cloudflare, bukan pembatas biaya/kuota global yang ketat. Respons provider 429 juga ditangani. [Batas dan akurasi limiter](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
- **Redirect provider:** gunakan `redirect: 'manual'` dan tolak respons 3xx. Runtime Workers tidak mendukung `redirect: 'error'`; mode manual menjaga key, audio, dan gambar tetap dikirim hanya ke endpoint provider yang ditetapkan.
- **Biaya:** pemilik menanggung penggunaan akun Groq dan hosting. Kuota Groq terpisah dari Cloudflare; tidak ada janji gratis selamanya. [Limit Groq](https://console.groq.com/docs/rate-limits).
- **Tidak ada download model**; voice membutuhkan internet dan dukungan format MediaRecorder pada perangkat yang dipakai.

Alasan perubahan dari BYOK: pengguna nonteknis dapat langsung memakai voice setelah login dan mengetuk mikrofon, tanpa membuka akun provider atau menyalin secret. Trade-off: pemilik mengelola akses, secret, penggunaan dan biaya, sedangkan audio melewati Worker serta Groq.

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

## B. STRUK v1 - OCR Google Gemini

G-9a/G-9b menjadi alur input gambar dan review multi-item. Keputusan pengguna 5 November 2026: gunakan Google AI Studio/Gemini. Browser mengirim foto yang disetujui ke `/api/receipt`; Worker memverifikasi JWT Access, membatasi request, dan memanggil `gemini-3.5-flash-lite` dengan secret `GEMINI_API_KEY`. Koneksi provider hanya terjadi di server. Respons JSON divalidasi dan dibuka sebagai draft yang harus diperiksa pengguna; input manual tetap tersedia.

## B1. Alur pembacaan dan review

1. Buka Scan struk dari Quick-Add; pilih JPEG/PNG/WebP maksimal 10 MB melalui pemilih berkas/galeri. Browser mobile dapat menawarkan kamera; belum ada viewfinder kamera khusus.
2. Tampilkan preview dan keterangan pengiriman ke Gemini, tanpa checkbox. **Baca otomatis** menampilkan loading yang dapat dibatalkan; foto tidak dikirim sebelum pengguna menekan tombol.
3. Pengguna memeriksa/mengoreksi item: nama/catatan, nominal, tanggal dan bucket. Pilihan kategori dihapus dari antarmuka; ID kategori lama dipertahankan secara internal untuk kompatibilitas ledger dan backup.
4. Tambah, koreksi atau hapus sampai 50 item, lalu periksa total dan validasi. Tombol gabung item pada rancangan belum tersedia.
5. Konfirmasi Simpan semua item menulis seluruh batch dalam satu transaksi database atomik, tanpa undo batch. Setiap expense tepat satu bucket; kategori/bucket yang tidak valid wajib diperbaiki. Semua aturan jatah, saldo, periode terkunci dan batas integer aman tetap berlaku. Kegagalan tidak menyimpan sebagian item; retry batch identik tidak menggandakan transaksi.
6. Tutup/reset sesi melepaskan foto sementara; foto tidak menjadi attachment transaksi atau bagian backup.

Kategori tidak mempunyai mapping kategori-ke-bucket otomatis dalam konfigurasi sekarang. Default bucket hanya boleh memakai bucket default profil yang masih valid dan tetap dapat dikoreksi pada review.

## B2. Batas provider

UI capture/review dan validasi ledger dipisahkan dari fungsi pengenalan. Antarmuka provider menerima gambar sementara dan menghasilkan draft item/metadata untuk review, dengan dukungan pembatalan dan error. Provider default memakai endpoint Worker pada origin sendiri. Tanpa secret server yang valid, pengguna mendapat pesan konfigurasi dan dapat melanjutkan manual.

Lokasi integrasi: `src/features/ocr/provider.ts`. Kontrak `ReceiptRecognizer` pada `receipt.ts` menerima `(image: File, signal: AbortSignal)` dan menghasilkan `Promise<ReceiptResult>` dengan `items: { label: string; amount: number }[]`, serta `merchant`, `date` (YYYY-MM-DD), dan `total` opsional. Nominal adalah rupiah utuh positif. Semua keluaran provider dinormalisasi ulang sebelum masuk review. Provider tidak boleh menyimpan ledger sendiri atau mengabaikan pembatalan. Pembatalan dan hasil yang terlambat tidak mengganti draft aktif.

Metadata retry di store `settings` hanya mencatat keanggotaan ID transaksi per batch; tidak mengandung foto. Metadata dan ledger ditulis atomik, tanpa versi schema baru.

Model dipilih berdasarkan [dukungan gambar dan structured output resmi](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). Akurasi dan latensi struk Indonesia memerlukan pengujian provider nyata dengan key pemilik; pengujian tiruan hanya membuktikan alur, validasi dan penanganan kegagalan.

## B3. Privasi

- Foto disimpan sementara di memori browser. Pengiriman ke Gemini melalui Worker hanya dimulai dengan tombol Baca otomatis; foto tidak masuk IndexedDB atau export/backup Monee.
- Hanya field transaksi yang dikonfirmasi disimpan. Keluar dari alur, reset, atau penguncian sesi harus melepaskan gambar dan membatalkan proses yang belum selesai.
- UI menyebut Google Gemini dan menautkan ketentuannya. Paket gratis dapat menggunakan input untuk peningkatan model dan peninjauan manusia; pengguna perlu menutupi informasi pribadi sebelum upload. Ketentuan dan retensi Google tidak ditentukan oleh kebijakan penyimpanan Monee.
- `GEMINI_API_KEY` hanya secret hosting. CSP browser tetap membatasi koneksi ke origin Monee; browser tidak menerima key atau menghubungi Gemini langsung.
