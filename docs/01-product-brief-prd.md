# 01 — Product Brief & PRD
**Produk:** Monee — Personal Money Tracker
**Versi dokumen:** 1.0 (hasil discovery bersama user)
**Status:** Approved — dasar untuk implementation plan

> Produk mobile-first dengan layout responsif untuk tablet, laptop, dan desktop. Status implementasi mengikuti [task](task.md); fitur target dalam PRD tidak otomatis berarti sudah selesai.

---

## 1. Product Brief

### Visi
Monee adalah aplikasi pencatat keuangan pribadi yang membuat disiplin uang terasa ringan dan hidup. Bukan software accounting, bukan e-wallet — sebuah **pencatat + pengingat visual** yang menyenangkan dipakai setiap hari, ditemani karakter maskot yang bereaksi terhadap kebiasaan finansial penggunanya.

> **Useful enough to trust. Simple enough to use. Fun enough to return to. Personal enough to feel mine. Alive enough to have character.**

### Prinsip inti
1. Aplikasi ini **murni pencatat** — tidak terhubung bank, e-wallet, atau uang asli. Tidak ada transfer, tidak ada wallet.
2. **Allocation adalah penjaga untuk bucket non-Tabungan.** Jatah bucket bersifat hard cap: transaksi ditolak kalau melewati jatah. Bucket Tabungan fleksibel (boleh lewat batas) karena menabung lebih awal tidak merugikan. Semua pengeluaran dan setoran tetap dicek terhadap saldo periode.
3. **Karakter-driven experience** ala prinsip Duolingo (bukan clone visual): maskot bereaksi, memberi feedback emosional, dan membuat aplikasi terasa hidup.
4. **Gimmick boleh, asal tidak mengganggu core.**
5. **Ledger lokal, voice dikelola di hosting.** Cloudflare Worker memegang secret Groq; pengguna login email Access dan menyetujui pengiriman audio (D34). Foto struk v1 hanya di memori; model OCR belum dipilih. Provider cloud di masa depan memerlukan persetujuan pengiriman foto (dok 07).

### Pernyataan masalah
Mencatat pengeluaran itu membosankan, jadi tidak konsisten. Alat yang ada terlalu kaku (software accounting) atau terlalu datar (notes app). User butuh pencatatan secepat mungkin (≤5 detik) + cara visual yang menyenangkan untuk sadar posisi keuangannya.

### Pengguna
- User utama: pemilik produk (penggunaan pribadi).
- Pasangan user memakai aplikasi yang sama dengan data terpisah pada perangkat/browser masing-masing. Satu origin dan profil browser menyimpan satu data lokal; tidak ada sinkronisasi antarperangkat.
- Mobile-first, Android sebagai sasaran awal; tablet, laptop, dan desktop tetap didukung. Bottom nav pada <768px, sidebar pada ≥768px, serta konten dan analitik fluid mengikuti D44/D55.

---

## 2. Fitur v1 (MVP)

### F1. Onboarding (sekali, di awal)
Alur berurutan (PIN paling akhir, sesuai permintaan user). **D56:** form pemasukan biasa ditawarkan sebagai langkah opsional saat onboarding pertama. Ini kemudahan UX, bukan mekanisme saldo awal khusus; saldo tetap dihitung dari transaksi.

1. Input nama.
2. **Tambah pemasukan (opsional)**: nominal, kategori pemasukan, tanggal, catatan opsional. Diisi berarti mencatat `income` biasa yang menambah saldo dan jatah bucket. Tombol **Lewati** melanjutkan tanpa membuat transaksi, termasuk tanpa transaksi Rp0.
3. Tawarkan allocation: **default 40/20/25/10/5** atau custom (toggle "boleh lewat batas" per bucket).
4. Pilih maskot (carousel Mochi, Luna, Bumi).
5. Set PIN 6 digit (terakhir, sebelum masuk app).

Setelah selesai: dashboard menampilkan saldo dan jatah jika pemasukan periode berjalan sudah dicatat. Jika langkah pemasukan dilewati, tampil empty state "Belum ada pemasukan bulan ini" + tombol isi income.

Onboarding, termasuk tawaran pemasukan ini, **hanya muncul untuk pengguna baru yang belum menyelesaikan onboarding lokal**. Setelah selesai/login atau unlock PIN, buka ulang aplikasi langsung mengikuti alur pengguna lama; form ini tidak muncul lagi, walaupun sebelumnya dipilih Lewati. Instalasi PWA atau reload dengan data onboarding yang masih ada tidak mengulang onboarding. Ini bukan pembuatan pemasukan otomatis atau prompt setiap sesi.

### F2. Transaksi
- **Field wajib (ledger utama):** type (pemasukan/pengeluaran), nominal, kategori, tanggal, **bucket** (wajib untuk pengeluaran). Ledger tabungan tidak memakai kategori (lihat F5).
- **Field optional:** catatan (progressive disclosure). Catatan **wajib** untuk pengeluaran tabungan.
- Form default terbuka di tab **Pengeluaran**; tab Pemasukan tersedia untuk ganti.
- **Aturan keras: 1 pengeluaran = tepat 1 bucket.** Tidak ada multi-bucket. Pengeluaran tabungan tidak memakai bucket.
- **Validasi ganda:** nominal harus ≤ sisa jatah bucket (kecuali bucket `allowOverbudget`) **dan** ≤ saldo periode. Gagal salah satu = transaksi ditolak dengan pesan spesifik.
- Refund = **pengurang expense lama** (saldo & sisa bucket kembali), **bukan income baru**. Refund hanya boleh sebelum periode disweep.
- Setoran tabungan dicatat sebagai `savings_deposit`, bukan expense biasa. Kategori Tabungan diisi otomatis, catatan opsional.
- Pengeluaran tabungan dicatat sebagai `savings_expense` dengan sumber `sisa` atau `allocation`, tanpa kategori, catatan wajib.

### F3. Transaksi Recurring (Shortcut Pemasukan)
- Contoh: gaji Rp10.000.000 setiap tanggal 25 → disimpan sebagai **template** `RecurringIncome`.
- Sistem **tidak** membuat transaksi otomatis. Dashboard menampilkan kartu "Gaji bulan ini belum dicatat" + tombol **"Catat gaji"** sekali klik.
- Idempotent per periode: template yang sama maksimal menghasilkan satu transaksi per periode.
- V1: recurring **income** saja (recurring expense/subscription = fase 2).

### F4. Allocation (inti produk)
- 5 bucket default: Kebutuhan Pokok 40%, Pulsa & Transport 20%, Tabungan 25%, Sedekah 10%, Fun 5%. Total wajib 100%.
- **Jatah bucket = % tetap × TOTAL income bulan berjalan** (bukan saldo saat itu).
  - Contoh: income 1jt → Kebutuhan Pokok = 400rb. Tengah bulan dapat 500rb → income total 1,5jt → jatah otomatis jadi 600rb.
- Buckets fully customizable: tambah, hapus (selain menyisakan minimal 1), rename, ubah %, icon, warna.
- Setiap bucket punya toggle **`allowOverbudget`**. Default `false` untuk semua bucket kecuali Tabungan (`true`).
- **Bucket progress = terpakai ÷ jatah.** Progress state: <75% normal, 75-89% aware, 90-99% warning, ≥100% danger.
- **Hard cap:** bucket dengan `allowOverbudget = false` menolak transaksi yang melewati sisa jatah. Bucket Tabungan boleh lewat batas.
- **Cek saldo:** setiap outflow dari saldo periode (expense dan setoran) harus ≤ saldo periode. Jatah cukup tapi saldo tidak cukup = ditolak. Pengeluaran tabungan tidak dicek ke saldo periode karena uangnya sudah keluar saat setoran/sweep.
- Income turun karena edit/hapus → jatah turun, transaksi lama tetap ada, bucket ditandai lewat jatah, dan pengeluaran baru diblokir sampai jatah pulih.

### F5. Tabungan (2 kompartemen, halaman terpisah)
Tabungan punya **halaman sendiri** dengan ledger sendiri. Kartu saldo di dashboard bisa di-flip untuk pindah antara dashboard utama dan halaman tabungan (D39). Dua kompartemen tidak pernah dicampur dengan saldo periode.

**Kompartemen A — "Sisa":**
- Sumber **satu-satunya**: sweep saldo akhir periode. Bukan jumlah sisa jatah per bucket, bukan jatah Tabungan yang tidak terpakai.
- Sweep jalan lazy saat app dibuka setelah periode berakhir, mencatat satu `MonthSweep` (termasuk nominal 0), lalu mengunci periode itu.
- Cara pakai: `savings_expense` dengan sumber `sisa` + catatan wajib. Contoh: "Darurat: bengkel", "Pindah ke investasi".
- Investasi mengurangi Sisa. Tidak ada pelacakan untung/rugi di v1.

**Kompartemen B — "Dari Allocation":**
- Sumber **satu-satunya**: setoran tabungan (`savings_deposit`) yang dicatat user. Setoran langsung masuk kompartemen saat itu juga.
- Jatah bucket Tabungan (25%) hanya pengingat dan batas lunak; setoran boleh melebihi jatah.
- **Wishlist goals:** multiple goals, urutan bisa di-drag, terisi **berurutan dari atas**. Progress derived, tanpa angka tersimpan.
- Goal tercapai → tombol **"Gunakan"** → membuat satu `savings_expense` sumber `allocation`, goal jadi `used`. Kalau Allocation sudah terpakai untuk hal lain sampai di bawah target, tombol ditolak setelah recompute.
- Pengeluaran tabungan bebas juga boleh dari Allocation tanpa lewat goal.
- **Semua pengeluaran tabungan masuk ledger tabungan, tanpa kategori, hanya catatan. Saldo utama & bucket tidak tersentuh.**
- Setoran lebih awal memindahkan uang dari sweep masa depan ke Allocation. Tidak menciptakan uang baru.

### F6. Dashboard (Home)
Urutan informasi berdasarkan kepentingan:
1. **FlipCard saldo.** Depan: dashboard utama (saldo periode + bucket + transaksi). Belakang: tampilan Tabungan (total, Sisa, Allocation, goals, ledger ringkas, aksi setor/pakai). Swap mengganti seluruh isi tampilan, bukan sekadar angka di kartu. Tidak mencampur dua saldo.
2. Bucket progress ringkas **4+1 (grid 2 kolom + 1 lebar)**.
3. Kartu shortcut gaji kalau template jatuh tempo dan belum dicatat bulan ini.
4. Transaksi terbaru (5 terakhir).
5. FAB "+ quick add" di tengah bawah.
- Bulan pertama / belum ada income: empty state "Belum ada pemasukan bulan ini" + CTA isi income. Tidak ada saldo awal otomatis.

### F7. AI Voice Input
- Flow: **Speak -> Worker dengan login Access -> Groq Whisper-large-v3 -> teks -> parser lokal deterministik -> draft -> review -> save.**
- Bahasa Indonesia informal ("tadi makan nasi goreng dua puluh lima ribu" → Expense, Makan, 25000).
- Input numerik & verbal angka ("25rb", "25k", "dua puluh lima ribu").
- Multi-transaksi dalam satu kalimat ("kemarin ngopi 22rb sama parkir 3rb" → 2 transaksi).
- Confidence rendah → minta klarifikasi (maskot nanya balik).
- Detail teknis: dokumen 07.

### F8. Maskot & Theme
- 3 karakter: **Mochi** (putih-hijau, The Gentle Seraphim), **Luna** (biru furry, The Playful Cat), **Bumi** (kuning, The Cheerful Yobao).
- Halaman pemilihan: carousel CSS 3D dengan **snapshot WebP frontal dari GLB**, dibuat sekali melalui Three.js + DRACOLoader lokal saat maskot dipilih. Fallback Canvas 2.5D dan daftar sederhana reduced-motion tersedia. Selector mempertahankan renderer snapshot dan menyediakan preview tema dengan pemulihan saat batal/gagal Apply (dok 06).
- Dashboard & keseharian: maskot digambar **2.5D Canvas procedural engine** (folder `mascots/`) — 14 state seragam, dihubungkan ke event finansial lewat state machine berprioritas. Cold start <1 detik dan <50KB adalah target performa; hasil perangkat fisik belum diklaim.
- Theme per maskot: hanya **accent color + background tone**; struktur UI & tipografi tetap.
- Interaksi maskot: 14 state (idle, gabut, greeting, tap, pet, happy, angry, sad, surprised, listening, thinking, annoyed, celebrate, sleepy).

### F9. History & Filter
- Daily, weekly, monthly, yearly.
- Filter: kategori, type, nominal, tanggal, bucket, keyword.

### F10. Atur (Settings & Profile di header atas)
- Ubah nama, PIN, mascot, theme, allocation, kategori, currency format.
- Export/import backup (file JSON).
- Notifikasi, recurring income.
- Semua konfigurasi onboarding bisa diubah di sini.

### F11. Security
- PIN 6 digit (diset di onboarding, bisa diganti di settings).
- **Tanpa pemulihan PIN di v1** (PIN dan ledger tetap lokal). Peringatan keras saat set PIN + ajakan rajin export backup.
- App lock: PIN diminta setiap kali app dibuka.
- Lockout salah PIN disimpan di IndexedDB (`attempts`, `lockedUntil`) sehingga tetap berlaku setelah reload atau app ditutup.

### F12. Charts (minimal)
- Spending by category (bulan berjalan).
- Income vs expense (bulan berjalan).
- Setiap chart harus menjawab: "insight apa yang didapat user?"

---

### F13. Struk v1 (persiapan OCR)
- Pilih foto lewat pemilih berkas/galeri; browser mobile dapat menawarkan kamera. Preview sementara dan review beberapa item sebelum menyimpan transaksi.
- Tambah/koreksi/hapus item dan pilih kategori serta bucket; satu pengeluaran tetap satu bucket dan melewati validasi finance. Penggabungan item dan viewfinder kamera khusus belum tersedia.
- Antarmuka provider disiapkan, tetapi model, key, biaya dan pengenalan teks otomatis belum tersedia. Pengisian item manual tetap diperlukan sampai provider dipilih.
- Foto tidak disimpan atau diunggah pada scaffold sekarang. Pemrosesan lokal/cloud diputuskan kemudian dengan persetujuan pengguna (dok 07).

## 3. Sesudah v1

| Fitur | Alasan tunda |
|---|---|
| Recurring expense & subscription tracking | Fokus dulu income berulang |
| Gamifikasi (streak, XP, badge) | Wishlist completion sudah cukup untuk v1; jangan buat sistem game sebelum core stabil |
| Bill reminder & notifikasi | Perlu permission + scheduling |
| Spending insights / forecast | Butuh data historis dulu |
| Sync antar device | Tidak dibutuhkan (data terpisah per HP adalah keputusan) |
| Cloud backup | Export/import manual sudah cukup untuk v1 |
| Multiple wallet / transfer / bank integration | **Ditolak permanen** — ini pencatat, bukan wallet (keputusan user) |

---

## 4. Decision Log (terkunci)

| # | Keputusan | Alasan |
|---|---|---|
| D01 | Platform: PWA mobile-first, Android sasaran awal, responsif di tablet/laptop/desktop | Installable bila browser mendukung + satu codebase |
| D02 | Database: IndexedDB lokal (per HP) | Gratis, offline, tanpa database server |
| D03 | Onboarding dan ledger lokal; akses hosting melalui Cloudflare Access email OTP | Penggunaan pribadi/undangan, data tetap per-device; tidak ada sinkronisasi |
| D04 | Data tidak sync antar device (user & pasangan terpisah) | Keputusan eksplisit user: "sendiri2 aja" |
| D05 | ~~Allocation = pengingat, tidak pernah mengunci transaksi~~ **digantikan D47** | Keputusan lama; user ingin hard cap |
| D06 | 1 transaksi = 1 bucket (wajib) | Menekan disiplin; struktur sederhana |
| D07 | Jatah bucket = % × total income bulan berjalan | Contoh user: 1jt → 400rb; +500rb → 600rb |
| D08 | Income tambahan → semua jatah naik proporsional | Konsistensi rumus |
| D09 | Refund = pengurang expense lama, bukan income | Keseimbangan angka |
| D10 | Edit/delete transaksi → recalculate otomatis | Deterministic |
| D11 | ~~Onboarding: nama → saldo awal → allocation → maskot → PIN~~ **digantikan D50** | Saldo awal dihapus |
| D12 | Field wajib: type, amount, category, date, bucket (expense) | Input cepat, progressive disclosure |
| D13 | Tanpa wallet/integrasi bank/e-wallet | Bukan aplikasi wallet — murni pencatat |
| D14 | Foto struk tidak disimpan pada ledger/backup; hanya memori sesi. Provider OCR belum dipilih; upload cloud kelak memerlukan persetujuan | Privacy + storage |
| D15 | ~~Voice input (Whisper offline)~~ **digantikan D34** (Groq Whisper-large-v3 melalui Worker); tetap dibangun setelah manual stabil | Prioritas build |
| D16 | Parser = rule-based offline, deterministic | Tanpa biaya API, testable |
| D17 | Maskot v1: Mochi, Luna, Bumi (nama final sesuai referensi) | E1/E2 user |
| D18 | Eca (chibi hijab) tidak dipakai | Dibuang dari roster |
| D19 | Selector memakai snapshot WebP frontal per maskot dari GLB + transform CSS carousel, swipe/drag, keyboard dan tombol nav | Three.js + DRACOLoader lokal; tetap snapshot dengan fallback Canvas 2.5D |
| D20 | Dashboard maskot: 2.5D Canvas procedural engine (14 state) | Cold start <1s, <50KB, hemat baterai |
| D21 | Gamifikasi v1 = wishlist completion saja | D3/D4 user: "gausah dulu" |
| D22 | Bahasa UI Indonesia; IDR default (Rp20.000), format bisa diubah | H2/H3 user |
| D23 | Zona waktu WIB | H3 user |
| D24 | Periode reset: tanggal 1 default, bisa custom | B4 user |
| D25 | Tabungan 2 kompartemen: Sisa (sweep) & Dari Allocation (goals) | B7 user |
| D26 | Wishlist: multi-goals, drag reorder, isi berurutan, "Gunakan" saat tercapai | D1 user |
| D27 | "Gunakan" → tabungan berkurang, saldo tidak berubah | Uang sudah keluar saat setor |
| D28 | Tanpa "Tarik ke Saldo" — pengeluaran tabungan via kategori/pengeluaran sendiri | Ditolak user |
| D29 | Struk v1 menyiapkan input gambar, review multi-item/simpan dan antarmuka provider; pengenalan otomatis menunggu model/provider | Revisi scope pengguna, 26 Oktober 2026 |
| D30 | PIN 6 digit, tanpa pemulihan di v1 + peringatan keras + saran export | Q&A user |
| D31 | Deploy: GitHub ke Cloudflare Worker + Static Assets, seluruh trafik produksi/preview dilindungi Access | Endpoint voice server memegang secret pemilik; ledger lokal dan Supabase tidak diperlukan; kuota hosting/Groq terpisah |
| D32 | Roster maskot + system extensible (data-driven config) | Future-proof |
| D33 | Ukuran data sangat kecil (<10MB/tahun; struk/foto tidak disimpan sama sekali) | Analisis storage dok 08 §10 |
| D34 | STT: Groq Whisper-large-v3 melalui Worker `/api/transcribe`; secret pemilik di hosting, tanpa BYOK pengguna | Pengguna login email Access lalu PIN lokal; audio dikirim dengan persetujuan, parser tetap lokal; model OCR belum dipilih |
| D35 | Navigasi: Dana-style center raised button — `Home · Riwayat · [⊕] · Tabungan · Atur`; profil di header atas | User: "kaya scan qr nya si dana" |
| D36 | UI components: ReactBits (FlipCard, CodeSlots, RubberSegment, FuseButton) dari registry resmi | Interaksi finance yang khas, gratis, TS+Tailwind |
| D37 | Ikon: Lucide React (menggantikan hugeicons bawaan FuseButton & CodeSlots) | 1 set ikon konsisten |
| D38 | FuseButton timing: Simpan = 2 detik undo window; Hapus/Refund/Gunakan goal = 4 detik | UX: ringan untuk save, hati-hati untuk destruktif |
| D39 | FlipCard saldo: depan = dashboard utama (saldo periode + bucket + transaksi); belakang = tampilan Tabungan (total + 2 kompartemen + goals + ledger ringkas + aksi) | Flip = pindah tampilan, bukan mencampur saldo |
| D40 | Maskot dashboard: ngintip dari atas FlipCard saldo (bukan berdiri di samping) | User: "ngintip ajaa" |
| D41 | Input nominal: keyboard angka bawaan HP (bukan keypad custom) | User: "bawaan aja"; mengurangi kompleksitas UI |
| D42 | Bottom nav hanya di 4 tab root (Home · Riwayat · Tabungan · Atur). Onboarding, lock, sheet, Voice, Scan Struk tanpa nav | Konsistensi: navbar = navigasi root, bukan elemen global |
| D43 | Transisi antar tab: pill meleset + squash (bukan fade), konten parallax, ikon pop, maskot 2.5D bereaksi per tab. Total ≤ 300ms, maks 3 layer stagger | User: "animasi nav-nya yang lucu"; navigasi harus terasa hidup, bukan monoton. Prinsip: "maskot yang pindah kursi" |
| D44 | Di ≥ 768px bottom nav diganti sidebar kiri (desktop 130px + label, tablet 80px icon-only) | Bottom nav 4 item terlalu sempit di layar besar; sidebar memberi ruang untuk brand + analitik |
| D45 | Pola **Empty State** & **Error State** seragam: maskot 2.5D ekspresi (`idle` / `sad`) + 1 judul + 1 body + **maksimal 1 aksi utama** + 1 aksi sekunder + 1 penutup. Error wajib punya retry + assurance + chip kode error. Navbar tetap ada (status tab root, bukan layar penuh) | Memperjelas bahasa "tidak ada" vs "gagal", dan menghindari 3 tombol yang berjejer yang bikin bingung. Contoh: G-E, G-X |
| D46 | Saldo periode mulai 0 tiap bulan, tanpa carry-over. Sweep = saldo akhir periode, bukan Σ sisa per bucket | Uang bulan lalu tidak boleh menambah daya beli bulan ini; sweep dari saldo menangani bucket overspend |
| D47 | Hard cap untuk bucket non-Tabungan + cek saldo untuk semua outflow. Tabungan `allowOverbudget` default true, toggle per bucket | User ingin disiplin jatah, tapi bebas menabung lebih awal |
| D48 | Ledger tabungan terpisah, tanpa kategori, hanya catatan. `savings_expense` wajib `savingsSource` | Tabungan punya konteks pengeluaran sendiri, tidak nyampur expense harian |
| D49 | Goal derived tanpa `savedAmount`, boleh turun dari `fulfilled` ke `active` kalau Allocation terpakai | Menghindari dobel hitung dan status yang berbohong |
| D50 | Onboarding tanpa saldo awal; bulan pertama mulai 0 dan user isi income sendiri | User: "ga perlu, aku isi sendiri aja" |
| D51 | Recurring income = template + tombol "Catat gaji" sekali klik, bukan auto-create | User ingin sekali klik, bukan transaksi otomatis yang bisa dobel |
| D52 | Lockout PIN disimpan di IndexedDB dan bertahan lintas reload/restart | Lockout in-memory bisa diakali dengan reload |
| D53 | Periode yang sudah disweep terkunci: tambah/edit/hapus/refund ditolak | Menjaga konsistensi angka historis |
| D54 | Kategori final 14: 10 expense + 4 income (termasuk Tabungan dan Hadiah), ikon Lucide + warna tile | User: "siapkan emoticon dan warna" |
| D55 | Layout fluid: mobile 100%, tablet 640–720, desktop konten 480–520 + kolom analitik 280–320 | Layar besar tidak boleh memaksa konten 370px sempit |
| D56 | Onboarding pertama: nama → tambah pemasukan biasa (opsional, bisa Lewati) → allocation → maskot → PIN. Setelah onboarding selesai/login/unlock, langkah ini tidak ditawarkan lagi, termasuk jika dilewati. Input menjadi `income` biasa; bukan saldo awal khusus, tidak ada field atau tipe transaksi baru. | Klarifikasi user 24 Oktober 2026: hanya kemudahan UX pada penggunaan pertama. Memperjelas D50 tanpa mengubah reset saldo, rumus, atau model transaksi. |

---

## 5. Success Criteria v1

1. Mencatat 1 transaksi manual ≤ 5 detik dari buka app.
2. Voice input menghasilkan draft transaksi yang benar untuk ≥80% ujaran informal Indonesia (sisa 20% dikoreksi manual di review).
3. Progress bucket selalu akurat & deterministic (unit tested, lihat dok 08 & 10).
4. Maskot merespons minimal 6 konteks (happy/worried/celebrating/thinking/listening/idle) + interaksi (tap, elus, ngintip, eye-tracking).
5. App terasa hidup: transisi halaman, micro-animation, feedback maskot — tanpa lag di HP kentang.
6. Pengguna tetap eksis di bulan ke-2 (retensi pribadi — tujuan produk).
