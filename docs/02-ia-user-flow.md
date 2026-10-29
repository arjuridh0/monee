# 02 — Information Architecture & User Flow

> Mobile-first dengan tablet/laptop/desktop responsif (D44/D55). Status voice dan persiapan OCR v1 mengikuti [task](task.md); kontrak provider dan privasi ada di dok 07.

## 1. Struktur Halaman

```
MONEE (PWA)
│
├── Onboarding (sekali, pertama buka)
│   ├── 1. Nama
│   ├── 2. Tambah pemasukan biasa (opsional, tombol Lewati)
│   ├── 3. Allocation (default 40/20/25/10/5 / custom + toggle overbudget)
│   ├── 4. Pilih maskot (carousel)
│   └── 5. Set PIN 6 digit (terakhir)
│
├── PIN Lock (tiap app dibuka)
│
├── Dashboard (Home) — halaman utama setelah unlock
│   ├── FlipCard: depan dashboard utama; belakang tampilan Tabungan (kompartemen, goals, ledger ringkas)
│   ├── Daftar bucket progress (4+1)
│   ├── Kartu shortcut "Catat gaji" (kalau template jatuh tempo)
│   ├── Transaksi terakhir (5)
│   └── FAB "+" quick add
│
├── Tambah Transaksi (sheet/modal dari FAB)
│   ├── Tab: Pengeluaran (default) | Pemasukan
│   ├── Input manual: nominal, kategori, tanggal, bucket (expense), catatan
│   ├── Voice input (mic -> Worker -> Groq STT -> parser lokal -> draft)
│   └── Scan struk (G-9a capture → G-9b review multi-item)
│
├── Tabungan (halaman penuh, ledger sendiri)
│   ├── Card Sisa
│   │   ├── Sumber: sweep bulanan
│   │   └── Pengeluaran: darurat / investasi / bebas (catatan wajib)
│   ├── Card Dari Allocation
│   │   ├── Sumber: setoran Tabungan
│   │   ├── Wishlist goals (drag reorder)
│   │   ├── Tombol "Gunakan" pada goal tercapai
│   │   └── Pengeluaran tabungan bebas
│   └── Riwayat gabungan per kompartemen (tanpa kategori)
│
├── History / Riwayat
│   ├── Grup: harian / mingguan / bulanan / tahunan
│   └── Filter: kategori, type, bucket, nominal, tanggal, keyword
│
├── Detail Transaksi (dari history)
│   └── Edit / Hapus / Refund
│
├── Pilih Maskot (dari settings atau onboarding)
│   └── Carousel snapshot GLB (Jalur B) — WebP frontal, satu kartu per maskot; fallback Canvas 2.5D / daftar reduced-motion
│
├── Charts / Insight
│   ├── Spending by category
│   └── Income vs expense
│
└── Atur (Settings; profil/avatar ada di header atas)
    ├── Ubah nama
    ├── Ubah PIN
    ├── Ubah allocation
    ├── Kelola kategori (CRUD + icon + warna)
    ├── Ubah maskot/theme
    ├── Recurring income (CRUD)
    ├── Format currency
    ├── Layanan suara (layanan terkelola, privasi dan masuk ulang; tanpa input API key)
    ├── Export / Import backup
    └── Tentang aplikasi
```

## 2. Navigasi

- **Bottom nav 4 item (D35):** `Home · Riwayat · [⊕] · Tabungan · Atur` — gaya Dana, FAB "+" menumpuk di tengah dan selalu terlihat di semua tab root.
  - Catatan: item ke-4 bernama **Atur** (bukan "Profile"). Profil berada di header atas (avatar + nama), bukan tab terpisah — supaya nav tetap 4 item dan tak sesak.
- **FAB quick add** selalu terlihat di semua tab root.
- **Charts** masuk sebagai bagian Riwayat (tab/segment di dalamnya), bukan nav terpisah — agar nav tetap 4.
- **Pilih Maskot** diakses dari Atur (dan saat onboarding).
- **Di mana navbar muncul:** hanya di 4 tab root (Home, Riwayat, Tabungan, Atur). Layar onboarding, lock screen, sheet (Quick-Add), Voice Mode, dan Scan Struk **tanpa navbar** karena itu bukan navigasi root.
- **Responsif:** di ≥ 768px bottom nav diganti **sidebar kiri** (desktop 130px + label, tablet 80px icon-only).
- **Transisi antar tab:** pill aktif meleset dengan squash (bukan fade), konten keluar/masuk parallax, ikon aktif pop, dan maskot 2.5D bereaksi per tab. Detail & timing ada di dok 03 §6; referensinya frame `G-N` di `design/monee.pen`.

## 3. User Flow Utama

### 3.1 First Open
```
Buka URL -> login kode email Cloudflare Access (email pemilik/undangan)
-> Buka app (belum menyelesaikan onboarding lokal)
→ Nama → Tambah pemasukan (opsional) → allocation → maskot → PIN
  · Isi pemasukan: transaksi income biasa, saldo dan jatah mengikuti transaksi
  · Lewati: tidak membuat transaksi
→ Selesaikan onboarding
→ Dashboard berisi saldo/jatah, atau empty state jika belum ada income periode berjalan

Buka ulang / login / unlock PIN setelah onboarding selesai
→ PIN Lock sesuai aturan sesi → Dashboard
→ Tidak mengulang onboarding atau menawarkan pemasukan pertama lagi
```

**D56:** langkah ini hanya entry point awal ke form pemasukan normal. Bukan saldo awal khusus, bukan pemasukan otomatis, dan bukan prompt yang muncul kembali jika sebelumnya dilewati. Pemasukan selanjutnya tetap melalui FAB atau shortcut gaji.

### 3.2 Catat Pengeluaran (manual)
```
Dashboard → FAB "+"
→ Sheet terbuka (tab Pengeluaran aktif)
→ Nominal 10000 → kategori Makan → tanggal hari ini → bucket "Kebutuhan Pokok"
→ (optional) catatan
→ Simpan
→ Validasi: 10.000 ≤ sisa jatah DAN ≤ saldo periode
→ Lolos: saldo berkurang, bucket progress naik, maskot bereaksi, sheet tertutup
→ Gagal: transaksi ditolak, error spesifik (ERR_JATAH_HABIS / ERR_SALDO_KURANG), form tetap terbuka
```

### 3.3 Catat Pemasukan
```
FAB "+" → tab Pemasukan
→ Nominal → kategori Salary/Gift/... → tanggal
→ Simpan → saldo naik, jatah bucket bulan itu naik proporsional
```

### 3.3b Swap Card (Dashboard ↔ Tabungan)
```
Dashboard (depan) → tap/geser FlipCard
→ Seluruh tampilan berganti ke konteks Tabungan: total, Sisa, Allocation, goals, ledger ringkas
→ Aksi setor / catat pengeluaran tabungan tersedia di sini
→ Tap/geser lagi → kembali ke dashboard utama
→ Untuk ledger lengkap: nav Tabungan
```

### 3.4 Voice Input
```
FAB "+" → tap ikon mic
→ Maskot listening state
→ User bicara: "tadi makan nasi goreng dua puluh lima ribu"
-> POST /api/transcribe (sesi Access) -> Worker -> Groq Whisper -> parser lokal buat draft (Expense, Makan, 25000)
→ Sheet review terisi otomatis → user cek/koreksi → Simpan
```

### 3.5 Sweep Akhir Bulan (otomatis, lazy)
```
User buka app pertama kali setelah periode berakhir
→ Sistem ambil saldo akhir periode lama (bukan jumlah sisa bucket)
→ Buat MonthSweep { period, amount, perBucketDetail } → kompartemen "Sisa"
→ Kunci periode lama (tambah/edit/hapus/refund ditolak)
→ Periode baru mulai dari 0, jatah dihitung ulang dari income periode baru
→ Maskot celebrating (jika sweep > 0)
```

### 3.6 Menabung (setoran ke Tabungan)
```
Tabungan → "Setor" (atau kategori Tabungan di Quick-Add)
→ Nominal 500rb, catatan opsional
→ Validasi: 500rb ≤ saldo periode (jatah Tabungan boleh dilewati)
→ Tersimpan sebagai savings_deposit
→ Saldo berkurang 500rb, Allocation bertambah 500rb saat itu juga
→ Goal pertama yang belum penuh terisi progress
→ Goal #1 penuh → notif "Goal tercapai!" + tombol "Gunakan"
→ Kalau saldo tidak cukup: ditolak, tidak ada setoran parsial
```

### 3.7 Gunakan Goal
```
Tabungan → Card Dari Allocation → goal "Beli Emas 100jt" berstatus fulfilled
→ Tap "Gunakan"
→ Sistem recompute: Allocation harus ≥ 100jt
→ Konfirmasi dialog
→ Buat TEPAT SATU savings_expense (source=allocation, note "Gunakan goal: ...")
→ Allocation berkurang 100jt, goal jadi "used" dan masuk riwayat goal
→ Saldo utama tidak berubah
→ Kalau Allocation sudah terpakai: tombol ditolak + status goal kembali active
```

### 3.8 Pakai Dana Darurat
```
Tabungan → Card Sisa → "Catat Pengeluaran"
→ Nominal + catatan wajib (mis. "Darurat: bengkel")
→ Tanpa kategori
→ Sisa berkurang, tercatat di ledger tabungan
→ Saldo utama & bucket tidak tersentuh
→ Ditolak kalau nominal > Sisa
```

### 3.8b Catat Investasi
```
Tabungan → Card Sisa → "Catat Pengeluaran"
→ Nominal + catatan "Pindah ke investasi"
→ Sisa berkurang (uang benar-benar keluar)
→ Saldo utama tidak berubah
→ Tidak ada pelacakan untung/rugi di v1
```

### 3.9 Refund
```
History → pilih transaksi expense → Refund
→ Nominal pengeluaran dikurangi (atau transaksi dibatalkan)
→ Saldo kembali, sisa bucket dikembalikan
→ Tidak ada income baru
→ Ditolak kalau periode transaksi sudah disweep (tombol refund disembunyikan)
```

### 3.10 Ganti Maskot
```
Atur → Maskot & Theme
→ Carousel: swipe/navigasi kartu (Mochi/Luna/Bumi)
→ Preview semi-live: accent & background tone berubah
→ Tap "Pilih Maskot ini" / "Terapkan"
→ UI berubah, maskot dashboard berganti
```

## 4. Error & Empty State

Pola dan strukturnya di Breakdown di dok 03 §7.1 dan dok 04 §5.1. Contoh visual: **G-E (empty)** dan **G-X (error)** di `design/monee.pen`.

| State | Penanganan | Maskot |
|---|---|---|
| Riwayat kosong | Empty state penuh (G-E): judul + body + CTA "Tambah Transaksi" + link "Impor dari struk" | `idle` - tenang, mengarahkan |
| Bucket lewat jatah (`allowOverbudget=false`) | Badge merah + transaksi ditolak (`ERR_JATAH_HABIS`), form tetap terbuka | Maskot `annoyed` |
| Saldo periode tidak cukup | Transaksi ditolak (`ERR_SALDO_KURANG`) walau jatah cukup | Maskot `sad` |
| Periode sudah disweep | Tambah/edit/hapus/refund ditolak (`ERR_PERIODE_TERKUNCI`) | Maskot `thinking` |
| Belum ada income bulan ini | Empty state "Belum ada pemasukan bulan ini" + CTA isi income | Maskot `idle` |
| Gagal ambil data (server / offline) | Error state penuh (G-X): judul + body + chip kode error + tombol "Coba Lagi" + link "Laporkan masalah" | `sad` + badge merah |
| Gagal load sebagian (inline) | Ganti area yang gagal saja + banner inline, konten lain tetap | `sad` kecil di banner |
| Filter tidak ada hasil | Empty ringkas: "Coba ubah filter" | `idle` |
| Layanan voice tidak tersedia | Fallback input manual, toast info | Maskot confused |
| Parse gagal | Form kosong + minta ulang/koreksi manual | Maskot bingung |
| PIN salah 3× | Delay progresif (5s, 15s, 60s) | — |
| Export gagal | Toast error + retry | — |

## 5. Backlog Fase 2
- OCR struk (**desain G-9a/G-9b sudah ada**; implementasi tetap Fase 2 — foto dibuang, multi-item dipecah jadi multi-transaksi dengan assignment bucket per item)
- Recurring expense & subscription
- Bill reminder / notifikasi
- Spending insight & forecast
- Pemulihan PIN (pertanyaan rahasia — ditunda "tanpa dulu" oleh user)
