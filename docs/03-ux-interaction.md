# 03 — UX & Interaction Design Specification

## 1. Prinsip UX

1. **Kecepatan di atas segalanya** untuk input: mencatat ≤5 detik. Semua yang bukan wajib → progressive disclosure.
2. **Feedback selalu ada**: setiap aksi menghasilkan respons visual (maskot, toast, animasi progress).
3. **Blokir dengan jelas, jangan diam-diam**: bucket non-Tabungan yang lewat jatah dan transaksi yang melebihi saldo periode ditolak dengan alasan spesifik. Tabungan tetap fleksibel.
4. **Mobile-first**: semua target sentuh minimal 44×44px, thumb-friendly (aksi utama di bawah).
5. **Reduced motion**: hormati `prefers-reduced-motion` — animasi dimatikan/disederhanakan.

## 2. Transaksi — detail perilaku

### Quick Add Sheet (FAB "+")
- Buka: sheet slide-up dengan spring, backdrop blur ringan.
- Tab Pengeluaran **aktif default**; tab Pemasukan di sebelahnya (sesuai keputusan D12).
- Urutan field (atas ke bawah): **Nominal → Scan struk (entry point) → Kategori → Bucket (expense saja) → Tanggal (default hari ini) → Catatan (collapsed, "tambah catatan")**.
- Input nominal memakai **keyboard angka bawaan HP** (D41 — bukan keypad custom) + quick amount chips (5rb/10rb/20rb/50rb/100rb).
- **Entry point "Scan struk"** (G-2): tombol Scan struk membuka pemilih gambar dan review multi-item. Browser mobile dapat menawarkan kamera melalui pemilih berkas; viewfinder/flash khusus pada rancangan G-9a belum diimplementasikan.
- Review struk memakai konfirmasi eksplisit **Simpan semua item** dalam satu transaksi database atomik, tanpa jendela undo batch. Kegagalan satu item menolak seluruh batch; retry identik tidak membuat transaksi ganda. Item yang sudah disimpan dapat dikoreksi melalui Riwayat.
- Nominal diformat live: `25000` → `Rp25.000`.
- Bucket selector: horizontal chip list dengan warna bucket + progress mini. Chip bucket yang jatahnya habis **disabled** + label "penuh", kecuali `allowOverbudget = true`.
- Simpan → validasi berurutan: nominal > 0 → kategori & bucket terisi → `amount ≤ sisaJatah` (kecuali overbudget) → `amount ≤ saldo periode` → **FuseButton fase `armed`** (2 detik, seluruh pill = tombol Batal/Undo) → fase `settled` "Tersimpan" → haptic ringan → sheet tutup → maskot bereaksi.
- Validasi gagal: FuseButton tidak masuk `armed`. Tampilkan inline error di bawah field + chip kode (`ERR_JATAH_HABIS` / `ERR_SALDO_KURANG`), isi form dipertahankan.
- Tab Pemasukan dipakai juga untuk shortcut gaji: pilih template → nominal terisi otomatis → simpan sebagai income biasa.
- Pilih kategori **Tabungan** di tab Pengeluaran → form berubah jadi setoran: bucket Tabungan dan kategori Tabungan otomatis, catatan opsional, validasi hanya saldo periode.

### Reaksi maskot pada transaksi (peta konteks → state)
| Event | Maskot | Contoh copy (voice & tone) |
|---|---|---|
| Pengeluaran normal | Neutral → `happy` sebentar | "Oke, tercatat!" |
| Bucket masuk zona 75-89% | `annoyed` (awareness) | "Hmm, jatah mulai tipis nih" |
| Bucket masuk 90-99% | `annoyed` (worried) | "Dompet kita mulai ngos-ngosan 👀" |
| Bucket lewat jatah (>100%, hard cap) | `annoyed` | "Jatahnya udah habis. Mau geser dari bucket lain dulu?" |
| Saldo periode tidak cukup | `sad` | "Uang bulan ini nggak cukup. Jatah masih ada, tapi saldonya kurang." |
| Periode terkunci | `thinking` | "Bulan itu udah ditutup. Catat di bulan ini ya." |
| Pemasukan | `happy` (celebrating) | "Ada rezeki! 🎉" |
| Setoran tabungan | `happy` + sparkle | "Nabung lagi, hebat!" |
| Goal tercapai | `celebrate` + confetti | "Goal xxx tercapai!! 🎉" |
| Refund | `surprised` → `happy` | "Uang balik, syukur!" |

> **State engine final = 14** (`idle`, `gabut`, `greeting`, `tap`, `pet`, `happy`, `angry`, `sad`, `surprised`, `listening`, `thinking`, `annoyed`, `celebrate`, `sleepy`) — sumber kebenaran `mascots/core/states.js`. Tabel di atas memakai nama generik; pemetaan per-engine ada di [panduan engine maskot](11-asset-implementation-guide.md).

### Voice flow
```
Tap mic → maskot "listening" (mata blink, telinga/animasi gelombang suara)
→ berhenti bicara (VAD 1.2s) → maskot "thinking" (processing)
→ STT selesai (Worker -> Groq Whisper-large-v3, secret dikelola pemilik hosting) → parser → draft muncul di sheet (terisi otomatis)
→ user review → Simpan → maskot happy
Gagal parse → maskot "surprised" → "Aku kurang nangkep, ulangi atau isi manual ya"
```

### Refund
- Dari detail transaksi expense → tombol "Refund".
- Penuh: `refundedAmount = amount`, saldo & bucket dikembalikan penuh.
- Parsial: `refundedAmount += x`, bucket dan saldo ikut menyesuaikan.
- Tidak pernah muncul sebagai income. Label jelas di history: "Refund".
- Hanya untuk `expense`. `savings_deposit` dan `savings_expense` dikoreksi lewat edit/delete.
- **Ditolak kalau periode transaksi sudah disweep.** Tombol refund disembunyikan, diganti info "Periode sudah ditutup".

### Edit & Delete
- Edit: semua field bisa diubah → **revalidasi penuh** (jatah, saldo, kompartemen) lalu recalculate. Kalau hasil edit melanggar aturan, edit ditolak dan nilai lama dipertahankan.
- Delete: konfirmasi dialog → soft delete → recalculate.
- Untuk setoran tabungan yang diedit/dihapus → kompartemen Allocation dan goal ikut menyesuaikan (deterministik, lihat dok 08).
- Transaksi di periode yang sudah disweep **tidak bisa** diedit atau dihapus. Hanya bisa dilihat.

### Error finansial (copy & kode)
| Kode | Kapan | Copy utama |
|---|---|---|
| `ERR_JATAH_HABIS` | expense melebihi sisa jatah bucket non-overbudget | "Jatah [bucket] tinggal Rp X. Kurangi nominal atau geser bucket." |
| `ERR_SALDO_KURANG` | outflow melebihi saldo periode | "Saldo bulan ini tinggal Rp X. Jatah boleh ada, tapi uangnya belum cukup." |
| `ERR_KOMPARTEMEN_KURANG` | pengeluaran tabungan melebihi saldo kompartemen | "Saldo [Sisa/Allocation] tinggal Rp X." |
| `ERR_PERIODE_TERKUNCI` | transaksi di periode yang sudah disweep | "Periode ini sudah ditutup. Catat di periode berjalan." |
| `ERR_AMOUNT_INVALID` | nominal 0, negatif, atau bukan integer | "Nominal harus lebih dari 0." |
| `ERR_BUCKET_INVALID` | expense memakai bucket Tabungan / bucket tidak ada | "Bucket tidak valid untuk pengeluaran." |
| `ERR_SAVINGS_SOURCE` | pengeluaran tabungan tanpa sumber | "Sumber dana tabungan wajib diisi." |
| `ERR_GOAL_BELUM_CUKUP` | "Gunakan" saat Allocation < target | "Dana Allocation sudah terpakai. Goal kembali aktif." |

## 3. Dashboard — perilaku detail

### Card Saldo
- Card utama terbesar, di atas. Maskot 2.5D menempel di tepi kanan/atas card.
- **Flip (D39):** depan = dashboard utama (saldo periode + bucket + transaksi). Belakang = tampilan Tabungan: total, Sisa, Allocation, goals, ledger ringkas, dan aksi setor/pakai. Tap/geser card untuk flip.
- Flip mengganti **seluruh isi tampilan**, bukan hanya angka di dalam kartu. Sisi belakang adalah halaman Tabungan versi ringkas; halaman penuh tetap bisa dibuka dari nav Tabungan.
- Tidak ada pencampuran angka saldo dan tabungan dalam satu sisi.
- **Ngintip**: saat dashboard dibuka, maskot sesekali (random, tidak tiap kali — biar tidak annoying) muncul dari belakang card saldo, melirik angka, lalu sembunyi.
- **Eye-tracking**: pupil maskot mengikuti posisi kursor/jari (desktop: pointer move; mobile: saat touch-drag halaman).
- Tap maskot → reaction random (wave, blink, lompat kecil).
- Tap berulang cepat (≥3× dalam 2 detik) → annoyed ("Eh! Kenapa dipencet-pencet 😠") → setelah 5× → easter egg reaction (maskot pura-pura pingsan).
- Elus (pointer move di atas maskot tanpa lepas / long-press di mobile) → happy, mata jadi ^ ^.

### Bucket list
- 5 card mini (grid 2 kolom + 1 lebar) — progress ring/bar dengan warna bucket.
- Tap card → detail bucket: riwayat transaksi bucket itu bulan ini, progress, jatah, terpakai, sisa.
- Progress state warna (semantic): <50% hijau, 50-74% hijau, 75-89% kuning, 90-99% oranye, ≥100% merah.

### Tampilan Tabungan (sisi belakang FlipCard)
- Total tabungan + 2 card kompartemen ("Sisa" dan "Dari Allocation") + goals + ledger ringkas + aksi setor/pakai.
- Ini bukan sekadar ringkasan angka: seluruh area dashboard berganti ke konteks tabungan saat flip.
- Tap card kompartemen → halaman Tabungan penuh untuk ledger lengkap dan pengelolaan goal.
- Goal tercapai → badge berkedip di kompartemen Allocation dan di card goal.

### FAB
- Posisi tengah bawah (di antara item nav), bentuk bulat, accent color theme aktif.
- Long-press FAB → langsung buka voice input (shortcut).

## 4. Tabungan — perilaku detail

### Kompartemen Sisa
- Header: total Sisa + periode sweep terakhir.
- Ledger: sweep masuk ("Sisa bulan Januari: Rp340.000") + pengeluaran (darurat, investasi, bebas). Tanpa kategori.
- Pengeluaran: tombol "Catat Pengeluaran" → form ringkas (nominal + catatan wajib) → validasi `nominal ≤ Sisa` → Sisa berkurang.
- Investasi memakai form yang sama dengan catatan "Pindah ke investasi". Tidak ada field untung/rugi.
- Saldo utama dan bucket tidak tersentuh.

### Kompartemen Dari Allocation
- Tombol "Setor" → `savings_deposit` (nominal + catatan opsional) → validasi `nominal ≤ saldo periode` → Allocation bertambah saat itu juga.
- Wishlist: daftar goal card, urutan = prioritas isi.
- **Drag & drop** untuk reorder (handle grip di kartu; hint vibrasi ringan saat mulai drag).
- Progress fill: goal pertama yang belum penuh menerima porsi berikutnya; setelah penuh, sisanya mengalir ke goal berikutnya. Semua derived dari saldo Allocation saat ini.
- Goal tercapai: notifikasi + tombol "Gunakan" muncul di kartu goal.
  - "Gunakan" → dialog konfirmasi (nominal, konfirmasi) → recompute Allocation → tepat satu `savings_expense` → goal pindah ke "Riwayat Goal", saldo utama tidak berubah.
  - Kalau Allocation sudah terpakai untuk hal lain sampai di bawah target, tombol ditolak dan status goal kembali `active`.
  - Tidak digunakan → goal tetap di daftar dengan status "Tercapai".
- Pengeluaran bebas dari Allocation: form nominal + catatan wajib, tanpa kategori. Allocation berkurang; progress goal bisa ikut turun.
- Tambah goal: nama + nominal target + (optional) icon/emoji. Tanpa foto (D14).
- Hapus goal: dana kembali ke pool `unallocated` (tidak hilang), goal saja yang hilang.

## 5. Onboarding — perilaku detail

- Progress indicator atas (**5 langkah**, D56), tiap langkah 1 layar. Tidak ada mekanisme saldo awal khusus.
- Nama → text field + tombol lanjut.
- Tambah pemasukan → form `income` biasa (nominal, kategori pemasukan, tanggal, catatan opsional) dengan aksi lanjut dan **Lewati**. Lewati tidak membuat transaksi Rp0. Data yang dicatat mengikuti perhitungan saldo/jatah normal, bukan field saldo awal terpisah.
- Allocation → tawaran default 40/20/25/10/5 (kartu preview) vs "Custom sendiri" (editor %, total wajib 100%, validasi live, toggle "boleh lewat batas" per bucket).
- Maskot → carousel (dok 06).
- PIN (terakhir) → 6 **CodeSlots** (44px, radius 12, gap 8, `mask=true` → digit ditampilkan sebagai titik) + **layar peringatan pemulihan** (karena PIN dan ledger hanya lokal): "PIN ini satu-satunya kunci datamu. Lupa = data tidak bisa dibuka. Export backup rutin ya!" dengan checkbox "aku ngerti" → CTA "Selesai & Masuk". **Tanpa layar konfirmasi terpisah** — konfirmasi dilakukan inline di sheet yang sama.
- Selesai → dashboard dengan maskot menyapa: "Hai [nama]! Aku [maskot]. Yuk mulai catat!"
- Dashboard menampilkan saldo/jatah jika income periode berjalan sudah dicatat; jika belum, tampil empty state pemasukan.
- Onboarding dan tawaran pemasukan ini hanya untuk pengguna baru sebelum onboarding lokal selesai. Setelah selesai/login/unlock, tidak ditampilkan lagi pada buka ulang, reload, atau instalasi PWA dengan data yang masih ada, termasuk jika langkah pemasukan dilewati. Pemasukan berikutnya memakai jalur normal di aplikasi.

## 6. Navigasi & Transisi Antar Tab

### 6.1 Anatomi Bottom Nav (D35)

```
┌────────────────────────────────────────────┐
│  Home   Riwayat   ( ⊕ )   Tabungan   Atur  │
└────────────────────────────────────────────┘
```

- **4 tab root:** Home · Riwayat · Tabungan · Atur. ("Atur" = profil + pengaturan, bukan tab ke-5 terpisah.)
- **FAB "+" di tengah**, duduk di dalam **cekungan (notch) diameter 60px** di tepi atas tengah bar (gaya saddle/Dana). Setengah atas tombol melenting 30px ke atas bar, setengah bawah pas di cekungan. Bar dipotong cekungan, tombol tidak "nempel" di atas bar.
- 4 item dibagi **simetris 2 kiri / 2 kanan** dari cekungan: Home · Riwayat (kiri), Tabungan · Atur (kanan). Jarak tengah ke item terdalam 60px supaya tidak pernah menabrak tombol.
- **Di mana navbar muncul:**
  | Layar | Navbar | Alasan |
  |---|---|---|
  | Home / Dashboard (G-1, G-1b) | Ya — Home aktif | tab root |
  | Riwayat (G-5) | Ya — Riwayat aktif | tab root |
  | Tabungan (G-6) | Ya — Tabungan aktif | tab root |
  | Atur (G-8) | Ya — Atur aktif | tab root |
  | Onboarding (G-3a–e) | **Tidak** | belum masuk app, belum ada konteks |
  | Lock Screen (G-4) | **Tidak** | terkunci, belum authenticated |
  | Quick-Add Sheet (G-2, G-2b) | **Tidak** (sheet menumpuk di atas dashboard) | modal, bukan navigasi |
  | Voice Mode (G-7) | **Tidak** | fokus penuh ke satu task |
  | Scan Struk (G-9a, G-9b) | **Tidak** | sub-flow dari Quick-Add |
  | Empty State (G-E) | **Ya** — Riwayat aktif | status dari tab root, bukan layar penuh |
  | Error State (G-X) | **Ya** — Riwayat aktif | status dari tab root, bukan layar penuh |

- **Responsif (fluid, D55):**

| Lebar | Navigasi | Konten | Kolom analitik |
|---|---|---|---|
| < 768px | bottom nav | 100%, padding 20px | tidak ada |
| 768–1023px | sidebar 80px icon-only | max 720px, padding 24px | tidak ada |
| 1024–1279px | sidebar 130px + label | 480–520px | 280–320px, gap 24px |
| 1280–1535px | sidebar 130px + label | 600–640px | 320–360px, gap 32px |
| ≥ 1536px | sidebar 130px + label | 680–720px | 340–380px, gap 40px |

- Bottom sheet di ponsel; pada ≥768px dialog tampil sebagai kartu tengah (maks 560px, sudut penuh, tinggi maks `100dvh − 64px`) dengan fokus awal, Escape, backdrop, dan scroll body yang sama.
- Grid bucket Beranda dan kompartemen/daftar goal Tabungan memakai dua kolom hanya ketika container utama ≥600px dan viewport ≥1280px; 320–1024px tetap satu kolom.
- Onboarding dibatasi 560px dan layar kunci 420px, tetap terpusat pada area konten di tablet/laptop.

- Tidak ada max-width 370px yang dipaku di tengah. Konten mengisi ruang yang tersedia sesuai tabel.
- **Profil** ada di header atas (avatar + nama), bukan di nav — supaya nav tetap 4 item dan tak sesak.

### 6.2 Motion Perpindahan Tab

Prinsip: **navigasi terasa seperti maskot yang pindah kursi**, bukan halaman yang di-cut. Semua motion pakai spring (bukan linear), dan saling menumpuk (stagger) maksimal 3 layer.

**Timeline (Home → Riwayat):**

| Waktu | Yang terjadi |
|---|---|
| 0 ms | Pill aktif masih di Home |
| 90 ms | Pill **meleset** ke Riwayat + squash 8% (scaleX 1.08 / scaleY 0.92) |
| 180 ms | Pill mendarat, memantul halus (settle) |
| 260 ms | Ikon Riwayat pop 1.0 → 1.25 → 1.0 |

**Layer motion (penting — jangan berlapis semua):**

| Layer | Animasi | Durasi / Easing |
|---|---|---|
| Konten keluar | `translateX(-24px)` + opacity → 0 | 220ms ease-in |
| Konten baru | `translateX(24px)` → 0 + opacity → 1 | 260ms spring, delay 40ms |
| Pill nav | `translateX` + squash saat meleset | spring stiffness 420, damping 30 |
| Ikon aktif | `scale 1 → 1.25 → 1` | 280ms ease-spring |
| Maskot 2.5D | state berubah + pop 1.08 | 240ms, delay 80ms |
| Scroll | restore posisi scroll lama | setelah transisi selesai |

**Maskot bereaksi per tab (ini yang bikin navigasi terasa hidup):**

| Tab | State maskot | Kenapa |
|---|---|---|
| Home | `idle` | diam, sesekali ngintip saldo |
| Riwayat | `thinking` | sedang membaca data pengeluaran |
| Tabungan | `happy` | senang lihat ngumpulin tabungan |
| Atur | `greeting` | menyapa, siap bantu |

### 6.3 Aturan Main Motion

| Aturan | Nilai | Alasan |
|---|---|---|
| Durasi total | ≤ 300ms | user nggak boleh nunggu navigasi |
| Easing | spring / overshoot | linear itu robot, bukan "hidup" |
| Stagger | maks 3 layer | pill → ikon → maskot. Jangan berlapis semua |
| Haptic | tick 8ms | **sesudah** transisi, bukan tiap frame |
| Reduced motion | fade 120ms | semua spring dimatikan |
| Tap target | ≥ 44×44px | Walaupun ikon 21px, area sentuhnya 44px |
| Double-tap | tidak ada | satu aksi per tab, tak ada menu sekunder |

> Referensi visual: frame `G-N: Navbar Motion Spec` di `design/monee.pen`.

## 7. Micro-interaction inventory (v1)

| Elemen | Animasi | Durasi/easing |
|---|---|---|
| **Pindah tab** | **Pill meleset + squash, konten parallax, ikon pop, maskot bereaksi** | **≤ 300ms · spring · stagger 3 layer** |
| Sheet buka/tutup | Slide-up + spring | 300ms spring |
| FAB → sheet | Scale morph halus | 250ms |
| Progress bucket | Bar/ring fill animasi saat berubah | 400ms ease-out |
| Saldo berubah | Angka count-up/count-down | 500ms |
| Toast | Slide dari bawah + auto-dismiss | 250ms in, 3s hold |
| Goal tercapai | Confetti ringan + maskot celebrate | 1.5s |
| Sweep bulanan | Notif khusus dengan ringkasan | — |
| Maskot idle | Breathing (scale ±2%), blink tiap 3-6s random | loop |
| Carousel | Rotasi 3D + snap | 350ms spring |
| Delete transaksi | Swipe-to-delete dengan undo snackbar | 250ms, undo 5s |
| Empty state masuk | Maskot 2.5D `idle` fade-up + blob scale 0.96→1, copy stagger 60ms | 300ms ease-out |
| Error state masuk | Maskot `sad` muncul + badge `st-danger` pop (scale 0.8→1), chip kode error slide | 250ms, stagger 60ms |
| Coba Lagi ditekan | Tombol rotate 360° (icon `refresh-cw` spin) + skeleton tampil | 400ms, skeleton shimmer |

## 7.1 Empty & Error State (D45)

Pola fallback untuk data kosong dan gagal dimuat. **Contoh lengkap: `G-E: Empty State` dan `G-X: Error State`** di `design/monee.pen`; spec komponen ada di dok 04 §5.1.

### Kapan dipakai

| Situasi | Pola | Contoh |
|---|---|---|
| Daftar belum pernah ada isinya | Empty | Riwayat kosong, wishlist tabungan kosong, belum ada scan struk |
| Gagal ambil data dari server / jaringan | Error | List transaksi gagal load, struk OCR gagal total |
| Belum ada filter yang cocok | Empty (ringkas) | Varian kosong dengan copy "Coba ubah filter" |
| Sukses tapi hasilnya 0 | Empty, **bukan** error | Angka 0 itu valid, bukan kegagalan |

### Perilaku Empty

1. Judul 22/800 display + body 1–2 baris. Tidak boleh lebih.
2. **Satu** CTA utama (arahkan ke aksi yang memang mungkin dilakukan), satu link sekunder opsional.
3. Ilustrasi = maskot 2.5D ekspresi `idle` (bukan dekorasi random).
4. Tidak boleh pakai warna merah/warning.
5. Copy harus memberi arah, bukan cuma menyatakan keadaan: "Belum ada transaksi" + "Yuk, catat pengeluaran pertamamu."

### Perilaku Error

1. **Wajib ada jalan keluar**: tombol utama (Coba Lagi / Coba lagi) + link sekunder (Laporkan masalah).
2. **Wajib ada assurance** bahwa data aman ("Data kamu aman, tidak ada yang hilang.").
3. Kode error (`ERR_NET_TIMEOUT`) ditampilkan sebagai chip kecil, bukan pesan utama.
4. Retry memakai tombol yang sama persis dengan CTA utama, supaya muscle memory jalan.
5. Kalau error terjadi di tengah halaman (bukan penuh), error state **tidak**dhapus konten yang sudah tampil - cukup ganti area yang gagal + tampilkan banner inline.

### Copywriting (id)

- Empty: "Belum ada transaksi" / "Yuk, catat pengeluaran pertamamu. Mulai dari kopi, ojek, atau makan siang." / "Tambah Transaksi" / "Impor dari struk"
- Error: "Gagal memuat transaksi" / "Tidak bisa mengambil data dari server. Periksa koneksi internet kamu, lalu coba lagi." / "Coba Lagi" / "Laporkan masalah" / "Data kamu aman, tidak ada yang hilang."

## 8. Copywriting & Voice Guide (Bahasa Indonesia)

**Tone:** santai, hangat, sedikit jahil, dukungan tanpa menghakimi. Pakai "aku-kamu". Emoji secukupnya (maksimal 1 per kalimat penting).

- ❌ "Perhatian. Penggunaan anggaran Anda telah mencapai 90%."
- ✅ "Dompet kita mulai ngos-ngosan nih 👀"

**Aturan:**
- Informasi penting (angka, error, konfirmasi) → clarity dulu, boleh tanpa joke.
- Jangan pernah bikin user merasa bersalah berlebihan atas overspending.
- Error message selalu kasih jalan keluar: "Voice belum bisa digunakan. Isi manual dulu ya, lalu coba lagi."
- Easter egg copy boleh muncul random (maskot ngeluh dipencet, pura-pura tidur saat jarang dibuka, dll).

## 9. Atur — profil & preferensi (G-8)

- Header **"Atur"** + subjudul "Semua preferensi Monee kamu"; kartu profil menampilkan nama dan "Pengguna tunggal · data lokal", membuka sheet nama.
- Grup: **Profil** (Nama, Maskot & Tema) · **Uang & Bucket** (Alokasi Bucket, Kelola Kategori, Pemasukan Rutin, Format Rupiah) · **Keamanan** (Ganti PIN, Buka dengan sidik jari) · **Data & Backup** (Export/Import Backup, Layanan suara) · **Lainnya** (Tentang Monee, Hapus Semua Data).
- Baris yang belum diimplementasikan tetap `disabled` dengan "Segera"/"Belum aktif". Kelola Kategori membuka daftar terpisah sesuai tipe, berisi 14 kategori bawaan: 10 pengeluaran dan 4 pemasukan; jumlah di baris Atur mengikuti data yang tersimpan. Pemasukan Rutin membuka daftar template lokal.
- **Nama** — sheet dengan input maksimal 40 karakter. Nilai di-trim; kosong ditolak "Nama wajib diisi."; sukses menutup sheet + toast "Nama diperbarui."
- **Maskot & Tema** — sheet berisi carousel (dok 06). "Pilih Maskot ini" menyimpan `mascotId`, menerapkan tema, cross-fade 400ms pada accent + bg-tone, lalu menutup sheet + toast. Preview di carousel tidak mengubah tema aplikasi sampai diterapkan.
- **Format Rupiah** — sheet radio tiga preset dengan preview hidup. "Simpan format" menyimpan `{ code: "IDR", format }`; nominal di Beranda, Riwayat, Tabungan, Analitik, dan sheet Atur langsung mengikuti (dok 08).
- **Alokasi Bucket** — sheet bucket urut `sortOrder`. **Pakai preset** menampilkan 40/20/25/10/5 tanpa switch, sama dengan preset onboarding; **Custom sendiri** membuka input persentase dan switch "Boleh lewat batas [bucket]" (Tabungan default aktif). Total dihitung live; simpan nonaktif dan pesan tampil kecuali semua jatah 0–100 dan total 100%. Simpan menulis seluruh bucket secara atomik, menutup sheet, dan menampilkan toast "Alokasi bucket diperbarui."; konflik data basi menampilkan "Alokasi berubah di tab lain. Muat ulang Monee." tanpa menutup sheet. Perubahan overbudget langsung dipakai guard jatah berikutnya. Di 320px input dipadatkan dan nama bucket tetap terbaca tanpa terpotong.
- **Kelola Kategori** — daftar Pengeluaran/Pemasukan memakai ikon Lucide dan warna tersimpan. Edit nama (maksimal 32 karakter), ikon, dan satu dari 10 warna. Nama harus unik di jenis transaksi yang sama. Jenis kategori tidak berubah saat diedit. Nama dan jenis Tabungan dikunci karena `cat-tabungan` dipakai otomatis untuk setoran; ikon/warna dapat diubah. Kategori bawaan tidak dapat dihapus. Pengguna dapat menambah kategori khusus ke salah satu jenis dan menghapusnya setelah konfirmasi hanya bila belum direferensikan transaksi (termasuk transaksi soft-deleted) atau pemasukan rutin; transaksi dan template lama tetap tersedia. Simpan perubahan kategori membandingkan snapshot kategori dalam transaksi IndexedDB; duplikasi diperiksa di transaksi tulis yang sama.
- **Pemasukan Rutin** — daftar template dengan nama, nominal, tanggal 1–28, kategori pemasukan, dan status aktif. Tambah/edit memakai validasi penuh; template dapat dinonaktifkan atau dihapus. Menghapus template tidak menghapus transaksi income yang sudah dicatat. Template jatuh tempo menampilkan tombol manual **Catat gaji** di Beranda; Monee tidak pernah mencatatnya otomatis dan satu template hanya dapat dicatat sekali per periode.
- **Ganti PIN** — tiga CodeSlots: PIN sekarang, PIN baru, ulangi PIN baru. Wajib 6 digit; konfirmasi harus sama; PIN baru harus berbeda. PIN sekarang diverifikasi ulang, profil + lockout diubah dalam satu transaksi atomik, lockout direset, dan tidak ada pemulihan. PIN sekarang yang salah tidak mengubah apa pun.
- **Tentang Monee** — versi dari `package.json` melalui `src/app/version.ts`, serta pernyataan bahwa semua data tersimpan di perangkat.
- **Export Backup** membuka sheet dengan peringatan bahwa file JSON memuat data sensitif; enkripsi passphrase opsional (minimal 8 karakter). **Import Backup** meminta file JSON, passphrase bila terenkripsi, dan centang konfirmasi bahwa seluruh data akan diganti. Import memvalidasi file sebelum commit atomik dan hanya memberi toast setelah berhasil.
- **Hapus Semua Data** membuka konfirmasi destruktif dengan PIN 6 digit saat ini dan checkbox pengakuan permanen. PIN diverifikasi ulang; jika salah, data tetap tersimpan dan PIN dikosongkan agar bisa dicoba lagi. Sukses menghapus semua store atomik dan kembali ke onboarding.
- Footer: "Monee v{APP_VERSION} · Semua data tersimpan di perangkat ini". Versi produk mengikuti paket, tidak ditulis manual di layar.
- Reduced motion: cross-fade durasi 0 dan tidak ada perubahan layout.
