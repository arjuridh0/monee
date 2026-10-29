# 08 — Data Model & Financial Calculation Rules

> Semua rumus harus **deterministic & testable** (perhitungan dan parsing harus dapat diuji). Dokumen ini = sumber kebenaran untuk implementasi engine + unit test.
> Revisi besar: model saldo per periode, sweep dari saldo akhir, hard cap bucket, ledger tabungan terpisah. Keputusan D46–D55 di dok 01.

## 0. Istilah (wajib konsisten)

| Istilah | Arti | Bukan |
|---|---|---|
| **Saldo periode** (saldo utama) | Uang yang boleh dipakai bulan berjalan | Bukan total kekayaan |
| **Jatah** | Cap nominal per bucket = % × income periode | Bukan saldo |
| **Sisa** | Kompartemen tabungan dari sweep akhir bulan | Bukan saldo utama |
| **Allocation** | Kompartemen tabungan dari setoran Tabungan | Bukan jatah bucket |
| **Ledger utama** | Daftar income/expense | Bukan ledger tabungan |
| **Ledger tabungan** | Daftar sweep + setoran + pengeluaran tabungan | Bukan riwayat expense biasa |

Aturan pemisahan: **uang tabungan tidak pernah kembali ke saldo utama** dan **pengeluaran tabungan tidak pernah mengurangi saldo utama**. Uang keluar dari saldo saat setoran atau saat sweep.

## 1. Entitas

```ts
Profile {
  id: "profile";               // single-user per device; key sesuai profileRepo
  name: string;
  pinHash: string;             // SHA-256 + salt, 6 digit
  pinSalt: string;
  createdAt: Timestamp;
  currency: { code: "IDR"; format: "Rp#.###" };
  mascotId: "mochi" | "luna" | "bumi";
  periodStartDay: number;      // default 1, bisa custom (mis. 25)
  periodChanges?: Array<{ effectiveFrom: DateStr; startDay: number }>;
  defaultBucketId: Id;
}
```

**Format mata uang (`Profile.currency`).** Semua nominal tetap disimpan sebagai integer rupiah; `currency` hanya mengatur tampilan. `code` selalu `"IDR"`, sedangkan `format` menerima tiga preset:

| `format` | Contoh tampilan |
|---|---|
| `Rp#.###` (default) | `Rp20.000` |
| `Rp #.###` | `Rp 20.000` |
| `#.###` | `20.000` |

Nilai kosong atau tidak dikenal fallback ke `Rp#.###`. Formatter murni ada di `src/core/finance/currency.ts` (`formatRupiah()`), dan komponen membaca preset lewat `useRupiah()` supaya perubahan langsung berlaku di Beranda, Riwayat, Tabungan, Analitik, dan sheet Atur. Input nominal tetap menerima digit mentah tanpa titik/koma; format hanya diterapkan saat menampilkan.

```ts
Category {
  id: string; name: string;
  type: "expense" | "income";
  icon: string;                // nama ikon Lucide
  color: string;               // hex tile pastel
  isDefault: boolean;
}

Bucket {
  id: string; name: string;
  allocPercent: number;        // total semua bucket wajib 100
  icon: string; color: string;
  sortOrder: number;
  allowOverbudget: boolean;    // default false; hanya Tabungan true
  isSavings: boolean;          // tepat 1 bucket true; tujuan savings_deposit
}

Transaction {
  id: string;
  type: "income" | "expense" | "savings_deposit" | "savings_expense";
  amount: number;              // integer rupiah, selalu > 0
  date: DateStr;               // YYYY-MM-DD (WIB)
  note?: string;
  // kategori: wajib income/expense; savings_deposit = Tabungan (otomatis);
  // savings_expense TIDAK memakai kategori
  categoryId?: Id;
  // bucket: wajib untuk expense, otomatis Tabungan untuk savings_deposit
  bucketId?: Id;
  // wajib hanya untuk savings_expense
  savingsSource?: "sisa" | "allocation";
  // lifecycle
  refundedAmount: number;      // default 0, hanya untuk expense
  deleted: boolean;            // default false (soft delete)
  recurringId?: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

RecurringIncome {
  id: string; name: string; amount: number;
  dayOfMonth: number;          // 1..28
  categoryId: string;          // Gaji / Freelance / Hadiah
  isActive: boolean;
  createdAt: Timestamp;
}

Goal {                          // wishlist di kompartemen Allocation
  id: string; name: string; targetAmount: number;
  sortOrder: number;
  usedAt?: Timestamp;          // satu-satunya status tersimpan
  // TIDAK ada savedAmount dan TIDAK ada status tersimpan:
  // status efektif = usedAt ? "used" : (allocated == target ? "fulfilled" : "active")
}

MonthSweep {
  id: string;
  periodKey: string;           // "2026-10"
  amount: number;              // saldo akhir periode yang disapu
  perBucketDetail: Array<{     // audit saja, bukan sumber nominal
    bucketId: Id; jatah: number; terpakai: number; sisa: number;
  }>;
  sweptAt: Timestamp;
}

LockoutState {                 // disimpan di IndexedDB, bertahan lintas reload
  attempts: number;
  lockedUntil: Timestamp;
}
```

### Backup lokal (F7-5)

Envelope JSON menggunakan `format: "monee-backup"` dan `version: 1`, dengan snapshot lengkap sembilan object store (`profile`, `categories`, `buckets`, `transactions`, `recurringIncomes`, `goals`, `monthSweeps`, `settings`, `lockout`) serta `exportedAt`. Import hanya menerima skema versi yang dikenal, maksimal 20 MB, memvalidasi record, ID unik, total alokasi 100%, dan referensi kategori/bucket sebelum mengganti semua store dalam satu transaksi IndexedDB. Data turunan tidak diekspor.

Validasi fase 7A mencakup profil canonical `profile`, maksimal satu lockout berkunci `lockout`, identitas kategori expense `cat-tabungan`, satu bucket Tabungan, default bucket non-Tabungan, tanggal kalender nyata, key sweep kalender/custom, serta tipe dan angka rupiah/timestamp yang aman. `savings_deposit` wajib menunjuk kategori/bucket Tabungan; expense biasa tidak boleh memakai keduanya. `savings_expense` tanpa kategori/bucket wajib memiliki sumber dan catatan nonblank. Refund nonnol hanya expense; nilai default0 pada jenis lain tetap kompatibel. Saldo kompartemen dihitung ulang dan tidak boleh negatif; saldo periode negatif koreksi tetap sah. Metadata opsional `periodChanges` dan goal used legacy tanpa relasi canonical dipertahankan sesuai kontrak pada §3.2 dan §7.

Backup plain JSON adalah pilihan awal dan berisi hash PIN serta seluruh data finansial; UI memperingatkan pengguna untuk menyimpan file secara privat. Enkripsi opsional memakai AES-GCM 256-bit dengan kunci PBKDF2-HMAC-SHA-256 (250.000 iterasi), salt 16 byte dan IV 12 byte acak. Template pemasukan yang sudah dihapus boleh tetap direferensikan oleh transaksi historisnya.

Kategori bawaan terdiri dari 10 pengeluaran dan 4 pemasukan dengan ID stabil. Nama dapat diubah hingga 32 karakter, ikon Lucide dan warna dapat dipilih, dan nama harus unik di dalam jenis transaksi yang sama. Jenis kategori tidak dapat diubah. `cat-tabungan` tetap bernama **Tabungan** dan bertipe pengeluaran karena setoran tabungan merujuk ke ID itu. Kategori khusus dapat dihapus selama belum direferensikan transaksi atau pemasukan rutin; pengecekan referensi dan penghapusan berlangsung atomik.

**Kenapa hanya 4 tipe transaksi:** `emergency_expense` dilebur ke `savings_expense` dengan `savingsSource: "sisa"`. Darurat dan investasi dibedakan lewat catatan, bukan tipe atau kategori. Satu jenis outflow tabungan = satu jalur hitung, tidak ada duplikasi semantik.

**Kategori di ledger tabungan:** `savings_expense` dan sweep **tidak** memakai `categoryId`. Hanya `note` (wajib untuk `savings_expense`). `savings_deposit` menyimpan `categoryId = Tabungan` secara otomatis supaya tetap muncul benar di laporan pengeluaran, tapi UI ledger tabungan tidak menampilkan kategori.

## 2. Saldo Periode

```
income(P)  = Σ income.amount                       (deleted = false)
expense(P) = Σ (expense.amount − refundedAmount)    (deleted = false)
deposit(P) = Σ savings_deposit.amount              (deleted = false)
saldo(P)   = income(P) − expense(P) − deposit(P)
```

Aturan:
- Saldo **mulai dari 0 di setiap periode**. Tidak ada carry-over.
- **D56:** pemasukan opsional saat onboarding adalah transaksi `income` biasa. Input ini menambah `income(P)`, saldo, dan jatah bucket sesuai tanggal transaksi. Lewati tidak membuat transaksi. Tidak ada field opening balance, tipe transaksi baru, atau perubahan rumus; penawaran form hanya muncul pada onboarding pertama.
- Saldo **tidak pernah diisi otomatis** dari bulan lalu. Sisa bulan lalu menjadi sweep (§6).
- `saldo(P)` boleh negatif **hanya** akibat edit/hapus income, atau edit nominal expense ke atas, di periode yang belum disweep. Tidak ada mekanisme lain yang boleh membuatnya negatif.
- Saldo negatif: tampil apa adanya, **blokir semua outflow baru**, dan sweep periode itu = 0 (tidak ada utang yang dibawa).
- Saldo bukan "total uang". Total uang = `saldo(P) + total tabungan` (ditampilkan terpisah, tidak dijumlahkan di kartu utama).

**Contoh:**
- Income 10.000.000, expense 3.000.000, setoran 2.500.000 → saldo = 4.500.000.
- Akhir bulan saldo 4.500.000 → sweep 4.500.000 ke Sisa. Bulan baru mulai dari 0.

## 3. Bucket & Hard Cap

Pembulatan dilakukan pada jatah rupiah lalu ke ratusan bawah. Contoh income Rp1.000.000 × 40% = Rp400.000; rumus versi lama yang meletakkan `floor` sebelum pembagian ratusan telah dikoreksi pada fase 7A tanpa mengubah perilaku engine.

```
jatah(b)    = floor((b.allocPercent × income(P) / 100) / 100) × 100   // bulat ratusan bawah
terpakai(b) = Σ (expense.amount − refundedAmount) untuk bucket b
              khusus bucket Tabungan: Σ savings_deposit.amount
sisaJatah(b)= jatah(b) − terpakai(b)                            // boleh negatif
progress(b) = jatah(b) = 0 ? 0 : terpakai(b) / jatah(b)
```

**Validasi setiap outflow (urutan wajib):**

| Tipe | Cek 1: bucket | Cek 2: saldo | Efek |
|---|---|---|---|
| `expense` (4 bucket non-Tabungan) | `amount ≤ sisaJatah(b)` kecuali `allowOverbudget` | `amount ≤ saldo(P)` | saldo turun, terpakai naik |
| `savings_deposit` (bucket Tabungan, otomatis) | `amount ≤ sisaJatah(Tabungan)` kecuali `allowOverbudget` (default true) | `amount ≤ saldo(P)` | saldo turun, Allocation naik |
| `savings_expense` | tidak dicek | tidak dicek | kompartemen sumber turun |

- `expense` **tidak boleh** memakai bucket Tabungan. Kategori Tabungan selalu dipetakan ke `savings_deposit`.
- Kalau salah satu cek gagal: **tolak transaksi**, tampilkan error spesifik (`ERR_JATAH_HABIS` / `ERR_SALDO_KURANG`). Tidak ada penyimpanan parsial.
- `allowOverbudget` bisa diubah per bucket di editor allocation (mode custom). Default hanya Tabungan `true`.
- Progress state hanya visual: <75% normal, 75–89% aware, 90–99% warning, ≥100% danger. Tapi ≥100% pada bucket non-overbudget berarti transaksi berikutnya **ditolak**, bukan sekadar badge.
- Income naik → semua jatah naik proporsional (D07/D08 tetap).
- Income turun (edit/hapus) → jatah turun, `terpakai` tetap. Bisa muncul `sisaJatah` negatif. Tampilkan badge "lewat jatah", blokir expense baru sampai jatah pulih. Tidak ada penghapusan transaksi otomatis.

### 3.1 Menyimpan ulang alokasi (editor Atur)

`saveAllocation({ expected, changes })` berjalan dalam **satu transaksi `readwrite`** pada store `buckets`:

1. Baca seluruh bucket di dalam transaksi.
2. Validasi: satu perubahan untuk setiap bucket, ID unik dan cocok dengan data, tepat satu `isSavings`, `allocPercent` finite 0–100, `allowOverbudget` boolean, dan total persentase 100% (toleransi `1e-9`). Gagal → `ERR_ALLOCATION_INVALID`; transaksi abort tanpa menulis.
3. Bandingkan `allocPercent` + `allowOverbudget` saat ini dengan `expected` (snapshot saat sheet dibuka). Bila berbeda → `ERR_ALLOCATION_STALE`; data baru di tab lain tidak ditimpa dan transaksi abort.
4. Tulis persentase + izin baru untuk semua bucket tanpa mengubah `name`, `icon`, `color`, `sortOrder`, atau `isSavings`; tunggu `tx.done`, lalu kembalikan bucket urut `sortOrder`.

Store memperbarui `buckets` **dan** `snapshot` turunan setelah commit, sehingga perubahan `allowOverbudget` langsung berlaku pada guard outflow berikutnya. Dua tab yang menyimpan bersamaan hanya menghasilkan satu commit; tab lain menerima stale. Tidak ada penulisan parsial.

### 3.2 Struktur bucket dan awal periode (fase 7A)

Editor struktur bucket mendukung tambah, rename, ikon, warna, persen, urutan, dan izin overbudget dengan total 100%. Tepat satu bucket Tabungan dipertahankan; status `isSavings` bucket yang sudah ada tidak berubah. Penghapusan ditolak bila bucket direferensikan transaksi (termasuk soft delete) atau rincian sweep. Default bucket profil harus tetap bucket non-Tabungan; perubahan memakai snapshot `expected` dan pemeriksaan stale dalam transaksi yang sama.

`periodStartDay` menyimpan aturan awal 1–28. Bila belum ada transaksi/sweep, aturan awal dapat diganti langsung. Bila sudah ada histori, pengaturan baru dicatat pada `periodChanges`, berlaku setelah akhir periode berjalan. Daftar perubahan berurutan dan tanggal efektif unik. `getConfiguredPeriod()` memakai aturan yang berlaku pada tanggal transaksi, membatasi periode pada batas transisi, dan tidak mengubah key sweep lama. Periode transisi yang dipendekkan dapat memakai tanggal mulai sebagai key, termasuk `YYYY-MM-01`. Jadwal perubahan berikutnya boleh diganti sebelum berlaku tanpa menafsir ulang histori.

Key kalender `YYYY-MM` dan custom/transisi `YYYY-MM-DD` memakai bulan nyata serta hari awal 1–28. Key historis tidak harus cocok dengan pengaturan profil terbaru.

## 4. Tabungan — 2 Kompartemen

```
Sisa       = Σ sweep.amount − Σ savings_expense(source="sisa").amount
Allocation = Σ savings_deposit.amount − Σ savings_expense(source="allocation").amount
TotalTabungan = Sisa + Allocation
```

Aturan:
- Kedua kompartemen **tidak boleh negatif**. Validasi saat membuat `savings_expense`: `amount ≤ saldo kompartemen sumber`.
- `savings_expense` wajib punya `savingsSource` dan `note`. Catatan contoh: "Darurat: bengkel", "Pindah ke investasi", "Gunakan goal: Beli mobil".
- Investasi = `savings_expense` dengan `source = "sisa"` dan catatan "Pindah ke investasi". Uang benar-benar turun. Tidak ada pelacakan untung/rugi di v1.
- Ledger tabungan terpisah dari ledger utama. Isinya: sweep masuk, `savings_deposit` masuk, `savings_expense` keluar. Tanpa kategori tampil, tanpa bucket (kecuali bucket Tabungan otomatis pada setoran).
- `savings_deposit` tampil di **dua view** dari **satu record yang sama**: riwayat utama (karena mengurangi saldo) dan ledger tabungan (sebagai uang masuk). Jangan membuat dua transaksi.
- Sweep hanya muncul di ledger tabungan. Sweep bukan transaksi dan tidak pernah masuk riwayat utama.
- Setoran tabungan menaikkan Allocation **saat itu juga**, walau jatah Tabungan belum terpakai penuh. Jatah Tabungan hanya pengingat.
- Setoran melebihi jatah Tabungan diperbolehkan (default). Efeknya: uang yang seharusnya menjadi sweep bulan depan berpindah lebih awal ke Allocation. Tidak menciptakan uang baru.
- Sweep dan setoran tidak pernah dihitung dua kali: sweep memakai saldo akhir, bukan jatah Tabungan yang tidak terpakai.

## 5. Goals (Wishlist)

Progress **derived**, tidak disimpan:

```
pool = Allocation
untuk setiap goal (status active|fulfilled, urut sortOrder):
  allocated = min(pool, targetAmount)
  pool -= allocated
  progress = allocated / targetAmount
  status = usedAt ? "used" : (allocated == targetAmount ? "fulfilled" : "active")
unallocated = pool
```

- Goal `used` dikeluarkan dari perhitungan (uangnya sudah keluar lewat `savings_expense`).
- Drag reorder → recompute semua progress.
- Pool menyusut (pengeluaran bebas dari Allocation) → goal terakhir bisa turun dari `fulfilled` ke `active`. Ini disengaja: status mengikuti uang nyata.
- Hapus goal → dananya otomatis kembali ke `unallocated` (tidak ada uang hilang).
- Tombol "Gunakan" hanya aktif kalau status efektif `fulfilled` **dan** `Allocation ≥ targetAmount`.
- "Gunakan" membuat **tepat satu** `savings_expense` (`source="allocation"`, `amount=targetAmount`, note "Gunakan goal: [nama]"), lalu set `usedAt = now`. Tidak ada field `status` yang ditulis.
- Anti dobel hitung: status goal tidak pernah mengurangi Allocation. Hanya transaksi yang mengurangi.

## 6. Sweep Bulanan

Trigger: **lazy**, saat app dibuka dan ada periode tertutup yang belum disweep.

```
untuk setiap periode tertutup P, urut kronologis:
  sweepAmount = max(0, saldo(P))
  MonthSweep {
    periodKey: P,
    amount: sweepAmount,
    perBucketDetail: [{ bucketId, jatah, terpakai, sisa }],
    sweptAt: now
  }
  kunci periode P
```

- **Sumber nominal = saldo akhir periode**, bukan Σ sisa per bucket. Alasan: kalau satu bucket overspend, rumus per bucket memotong di 0 dan kehilangan defisit. Saldo akhir sudah memperhitungkan semua.
- `perBucketDetail` hanya untuk audit dan tampilan rincian. Jangan pernah menjumlahkannya sebagai nominal sweep.
- Record sweep **selalu dibuat**, termasuk `amount = 0`, supaya status kunci periode seragam dan idempotent.
- Idempotent: satu `periodKey` hanya boleh punya satu `MonthSweep`.
- Kalau beberapa bulan terlewat, buat satu record per periode, urut kronologis.
- Setoran manual mengurangi saldo saat dicatat, jadi sweep otomatis lebih kecil. Tidak ada dobel hitung dan tidak ada penyesuaian tambahan.
- Periode terkunci: `income`, `expense`, `savings_deposit`, `savings_expense` bertanggal di periode itu ditolak (`ERR_PERIODE_TERKUNCI`). Edit, delete, dan refund juga ditolak.

## 7. Refund, Edit, Delete

- Refund hanya untuk `expense`. `refundedAmount` bertambah, maksimal `amount`.
- Refund hanya boleh selama periode transaksi **belum disweep**.
- Refund mengurangi `expense(P)` dan `terpakai(bucket)`, sehingga saldo dan sisa jatah naik kembali.
- Refund tidak pernah menjadi income dan tidak muncul di ledger tabungan.
- `savings_deposit` dan `savings_expense` tidak punya refund. Koreksi dilakukan lewat edit atau delete (kalau periode belum terkunci).
- Edit: semua field boleh berubah, lalu **revalidate penuh** (bucket, saldo, kompartemen). Kalau gagal validasi, edit ditolak.
- Delete: soft delete (`deleted = true`), semua agregat recompute. Hard delete hanya lewat "hapus permanen" di settings.
- Edit/delete **ditolak** kalau hasilnya membuat kompartemen tabungan negatif. User harus menghapus pengeluaran tabungan terkait lebih dulu.
- Semua perubahan pada periode terkunci ditolak.

Koreksi `savings_expense` tersedia lewat detail ledger tabungan. Catatan tetap wajib, sumber hanya Sisa/Allocation, tanpa kategori/bucket. Perubahan atau soft delete transaksi canonical `goal-use:<goalId>` memperbarui target/`usedAt` goal secara atomik sesuai transaksi; delete menghapus `usedAt` sehingga goal aktif kembali. Saldo kompartemen diperiksa ulang sebelum commit. Goal used hasil migrasi lama yang tidak memiliki ID transaksi canonical tetap dapat dipulihkan dari backup; relasinya tidak direkayasa dari catatan bebas.

## 8. Recurring Income (shortcut, bukan otomatis)

- `RecurringIncome` adalah **template**, bukan penjadwal latar belakang.
- Template dapat dibuat, diubah, dinonaktifkan, dan dihapus dari Atur. Nama wajib 1–40 karakter, nominal integer rupiah positif, tanggal jatuh tempo 1–28, dan kategori harus bertipe pemasukan. Perubahan nama dinormalisasi dengan trim.
- Dashboard menampilkan kartu "Gaji bulan ini belum dicatat" + tombol **"Catat gaji"** kalau `dayOfMonth` sudah lewat dan belum ada transaksi `recurringId` itu di periode berjalan.
- Klik tombol = buat satu `income` normal dengan `recurringId`. Bisa diedit seperti transaksi biasa.
- Idempotent per periode: satu template maksimal satu transaksi per periode.
- Tidak ada pembuatan transaksi otomatis saat app dibuka. User tetap yang menekan tombol.
- Menghapus template hanya menghapus pengaturan ke depan; transaksi income yang telah dicatat dan `recurringId`-nya tetap menjadi riwayat.

## 9. Rounding

- Jatah bucket: `floor(jatah / 100) × 100`.
- Saldo, kompartemen, goal, sweep: integer rupiah penuh.
- Progress %: tampilan 1 desimal (round half up), perhitungan internal full precision.
- Sisa pembulatan tidak dihitung terpisah. Karena jatah dibulatkan ke bawah, sisa riil otomatis termuat di saldo akhir dan ikut sweep.

## 10. Derived State

Tidak ada angka keuangan yang disimpan sebagai sumber kebenaran. Semua dihitung dari transaksi + konfigurasi:
- saldo periode, jatah/terpakai/sisa per bucket, progress
- Sisa, Allocation, total tabungan
- progress dan status goal
- daftar sweep historis

Yang disimpan hanya: profile, categories, buckets, transactions, recurring, goals (tanpa `savedAmount`/`status`, hanya `usedAt`), monthSweeps, settings, lockout.

Strategi: recompute on write + cache di memori. Cache tidak boleh menjadi sumber kebenaran.

## 11. Contoh Alur Lengkap

```
Periode Oktober, periodStartDay = 1
1. Catat gaji 10.000.000 (income)      → saldo 10.000.000
2. Jatah: 4.000.000 / 2.000.000 / 2.500.000 / 1.000.000 / 500.000
3. Setor tabungan 2.500.000            → saldo 7.500.000, Allocation 2.500.000
4. Expense Kebutuhan Pokok 1.200.000   → saldo 6.300.000, terpakai 1.200.000
5. Beli goal "HP" 2.000.000 via Gunakan→ Allocation 500.000, saldo tetap 6.300.000
6. Sisa Kebutuhan Pokok (2.800.000) TIDAK disweep sekarang. Sweep pakai saldo.
7. Akhir bulan saldo 6.300.000         → sweep 6.300.000 ke Sisa
8. November mulai dari 0. Sisa = 6.300.000, Allocation = 500.000
9. Catat darurat 300.000 dari Sisa     → Sisa 6.000.000, saldo November tidak berubah
```

## 12. Unit Test Wajib

1. Income 1jt → jatah 400/200/250/100/50 (rb).
2. Income tambahan mid-month → jatah naik proporsional, progress turun.
3. Expense 10rb dari jatah 100rb → progress 10%.
4. Expense 120rb dari jatah 100rb (allowOverbudget false) → ditolak.
5. Expense 120rb dari jatah 100rb (allowOverbudget true) → tersimpan, progress 120%.
6. Expense melebihi saldo walau jatah cukup → ditolak (`ERR_SALDO_KURANG`).
7. Setoran melebihi jatah Tabungan → boleh, saldo turun, Allocation naik.
8. Setoran melebihi saldo → ditolak.
9. Sweep = saldo akhir, bukan jumlah sisa bucket. Kasus satu bucket overspend.
10. Sweep dengan saldo 0 tetap membuat record dan mengunci periode.
11. Dua bulan terlewat → dua sweep record, urut kronologis, idempotent.
12. Setoran manual mengurangi sweep 1:1, tanpa dobel hitung.
13. Setoran 500rb → Allocation 500rb, goal pertama terisi.
14. Setoran 500rb, target goal 400rb → goal 1 fulfilled, 100rb ke goal 2.
15. "Gunakan" goal → Allocation turun tepat sekali, saldo utama tidak berubah.
16. "Gunakan" goal saat Allocation < target (habis dipakai expense lain) → ditolak setelah recompute.
17. Pengeluaran bebas dari Allocation → goal terakhir bisa turun ke active.
18. Drag reorder → recompute progress.
19. Hapus goal terisi → dana kembali ke unallocated.
20. Emergency expense (source=sisa) → hanya Sisa turun.
21. Investasi (source=sisa, note) → hanya Sisa turun, saldo utama tetap.
22. Refund parsial 25rb dari expense 100rb → terpakai 75rb, saldo +25rb.
23. Refund di periode tersweep → ditolak.
24. Edit income turun → sisa jatah negatif, expense baru ditolak.
25. Edit income turun sampai saldo negatif → saldo negatif tampil, outflow baru ditolak, sweep 0.
26. Periode custom start-25 → boundary transaksi benar.
27. Recurring: klik "Catat gaji" dua kali di periode sama → tetap satu transaksi.
28. Progress saat jatah 0 → 0 (tidak NaN/Infinity).
29. Hapus transaksi → semua derived recompute.
30. Import backup → derived identik dengan export.
