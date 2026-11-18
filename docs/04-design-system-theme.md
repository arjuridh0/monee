# 04 — Design System & Theme Tokens (v2 — Warm Clay)

> Teks tombol navigasi pada `nav-accent` memakai `--nav-button-ink: #241D18`; pemasukan Riwayat memakai semantic `--income`. Target kontras dan batas pemeriksaan mengikuti dok 10 dan [task](task.md).

> **Status:** v2 · disinkronkan dengan `design/monee.pen` (G-0 Design System).
> **Perubahan dari v1:** palet direvisi dari *warm cream + emerald* menjadi **Warm Clay** (pasir hangat + aksen sage olive + nav bar cokelat gelap) agar konsisten dengan reference visual dan karakter maskot 2.5D. Struktur, tipografi, dan komponen inti tetap sama.

---

## 1. Arah Visual

**Warm Clay · Fun + Cute + 2.5D + Clean + Modern + Customizable**

Prinsip visual yang dipakai (dari analisis arah visual Warm Clay yang disepakati):

- **Kanvas pasir hangat** (`#EFE7DA`), bukan putih murni — memberi kesan hangat dan jangan "klinis".
- **Kedalaman clay berlapis**: setiap surface punya outer shadow berwarna hangat (bukan abu-abu netral) + inner highlight di tepi atas-kiri.
- **Radius besar & konsisten** (16–32px) supaya terasa lembut, bukan kaku.
- **Maskot 2.5D clay** sebagai elemen naratif utama — selalu punya peran, bukan hiasan.
- **Hierarki lewat ukuran & warna**, bukan lewat garis/stroke tebal.

Dihindari: terlalu childish, terlalu corporate, terlalu ramai, terlalu banyak warna, dashboard padat, card soup (terlalu banyak kartu tanpa hierarki).

---

## 2. Color Tokens

### Base
```css
--bg-app:        #EFE7DA;  /* kanvas pasir hangat */
--bg-deep:       #E4D8C3;  /* section sunken / stage maskot */
--surface:       #FFFFFF;  /* card */
--surface-2:     #FAF6EE;  /* input / bar track */
--surface-3:     #F3EDE1;  /* chip non-aktif / track progress */
--border-soft:   #E7DCC9;
--border-hair:   #DFD3BD;
```

### Text
```css
--text-primary:   #2E2A24;  /* warm near-black */
--text-secondary: #6E6558;
--text-muted:     #9C9182;
--text-on-accent: #FFFFFF;
```

### Brand / Accent (Mochi — "Fresh Olive")
```css
--accent:        #4F7C3A;  /* CTA, teks aksen, primary button */
--accent-vivid:  #8FB565;  /* fill dekoratif, progress bar, FAB */
--accent-soft:   #E6EFDB;  /* chip/badge background */
--accent-ink:    #33501F;  /* teks di atas accent-soft */
```

### Semantic — progress bucket
```css
--st-normal:  #5C8F42;  /* < 75% */
--st-aware:   #D6A03C;  /* 75–89% */
--st-warning: #D0762F;  /* 90–99% */
--st-danger:  #BF4B3E;  /* ≥ 100% (overspent) */
--income:     #3F7A4E;
--expense:    #BF4B3E;
```

### Navigation
```css
--nav-bg:     #3F3227;  /* bar navbar / sidebar */
--nav-bg-2:   #4E3F31;  /* pill item aktif */
--nav-text:   #BCAE9A;  /* ikon + label non-aktif */
--nav-active: #FFFFFF;  /* ikon + label aktif */
--nav-accent: #8FB565;  /* tombol bulat tengah (notch) */
```
> Keempat token navbar ini **berpindah per tema maskot** (lihat tabel di bawah). Struktur navbar
> (notch + posisi item) **tidak berubah** antar tema.

| Token | Mochi | Luna | Bumi |
|---|---|---|---|
| `--nav-bg` | `#3F3227` | `#1E2A44` | `#4A3418` |
| `--nav-bg-2` | `#4E3F31` | `#2B3A5C` | `#5E4423` |
| `--nav-text` | `#BCAE9A` | `#9FB0CE` | `#D2BE96` |
| `--nav-accent` | `#8FB565` | `#5C8FD6` | `#E0A84A` |

### Theme accent per maskot
Hanya `accent` + `accent-soft` + `bg-tone` yang berubah. Struktur, tipografi, dan semantic color tidak berubah (keputusan E6/D24).

```css
/* Mochi — "Fresh Olive" */
--theme-accent:      #4F7C3A;
--theme-accent-vivid:#8FB565;
--theme-accent-soft: #E6EFDB;
--theme-bg-tone:     #F3F0E4;

/* Luna — "Ocean Blue" */
--theme-accent:      #3F6FB5;
--theme-accent-vivid:#5C8FD6;
--theme-accent-soft: #DEE9F8;
--theme-bg-tone:     #EDF3FA;

/* Bumi — "Sunny Amber" */
--theme-accent:      #9C641D;
--theme-accent-vivid:#E0A84A;
--theme-accent-soft: #F8E9CE;
--theme-bg-tone:     #FAF3E6;
```

### Bucket color (default, editable user)
```css
Kebutuhan Pokok   #8FB565   (hijau)
Pulsa & Transport #E2A16B   (oranye)
Tabungan          #E3C25C   (kuning)
Sedekah           #D98C7C   (merah bata)
Fun               #A98FD0   (ungu)
```

> Semua kombinasi teks di atas token wajib kontras ≥ 4.5:1 (divalidasi di QA, dok 10).

### Koreksi aksesibilitas canvas, 23 Oktober 2026

Token dasar tetap dipertahankan. Pada frame revisi D46–D55, gunakan pasangan berikut untuk teks kecil:

| Token/peran | Nilai | Pemakaian |
|---|---|---|
| `text-accessible` | `#5C5347` | Label, helper, placeholder pada kanvas pasir; `text-muted` bukan untuk informasi penting |
| `accent-ink` | `#33501F` | Link dan aksi teks di kanvas pasir, bukan `accent` yang terlalu pucat untuk teks kecil |
| `danger-ink` | `#9C382D` | Teks status bahaya pada tile pastel |
| `warning-ink` | `#755413` | Teks warning pada latar amber lembut |

Teks pada hero `accent` memakai `text-on-accent`. Panel Sisa/Allocation di hero belakang memakai `accent-ink` dengan teks putih, bukan overlay putih transparan. Area sentuh tombol, switch, dan kontrol ikon minimal 44×44px meskipun glyph lebih kecil. Batas ini mengoreksi ukuran visual kecil pada tabel komponen di bawah saat diterapkan sebagai target interaksi.

Pemeriksaan canvas memverifikasi warna solid dan tata letak, bukan fokus keyboard atau pembaca layar runtime. Kontrak implementasi: label input terlihat, `aria-label` pada tombol ikon, `role=alert` pada error form, switch berlabel, dan alternatif keyboard untuk urutan goal.

---

## 3. Typography

- **Display / Judul:** `Baloo 2` (800) — rounded, friendly, lebar; dipakai untuk screen title, nominal besar, nama maskot.
- **Body / UI:** `Nunito` (400–800) — highly legible di ukuran kecil, angka financial tetap tabular.
- Angka finansial: `tabular-nums`. Nominal besar 26–38px; nominal list 12–16px.
- Skala: 10 / 11 / 12 / 13 / 14 / 16 / 19 / 24 / 26 / 28 / 34 px; line-height 1.05–1.5.
- Label seksi & eyebrow: 11px weight 800, `letter-spacing: 0.13em`, uppercase, color `--text-muted`.

---

## 4. Radius, Elevation & Spacing

### Radius
```css
--r-card-lg: 32px;  /* flip card saldo, bottom sheet, hero card */
--r-card:    28px;  /* card umum, section card */
--r-btn:     20px;  /* button, input besar, chip besar */
--r-input:   16px;  /* input kecil, baris field */
--r-tile:    20px;  /* icon tile */
--r-chip:    999px; /* pill / chip / avatar / code slot */
```

### Elevation (clay recipe)
```css
/* L1 — resting card */
--shadow-card: 0 7px 18px rgba(138,111,74,0.24),
                inset -1px -2px 6px rgba(255,255,255,0.65);

/* L2 — floating (button utama, hero card) */
--shadow-float: 0 12px 32px rgba(138,111,74,0.27),
                 inset -1px -2px 6px rgba(255,255,255,0.65);

/* Bottom sheet */
--shadow-sheet: 0 -10px 40px rgba(58,46,34,0.33);
```
> Shadow **selalu di-tint ke warna hangat**, tidak pernah abu-abu netral. Abu-abu langsung mematikan kesan clay.

### Spacing
- Grid 4px. Urutan: 4 / 8 / 9 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32.
- Screen padding horizontal: 20px (mobile), 16px (tablet/desktop).
- Gap antar section besar: 16–20px; antar item terkait: 9–12px.

---

## 5. Komponen Inti

| Komponen | Spesifikasi |
|---|---|
| Bottom nav | Lebar penuh, tinggi 100px, `nav-bg`, radius atas 32px, **pinggiran atas tengah berbentuk cekungan setengah lingkaran (notch) diameter 60px** — tombol bulat (60px, `nav-accent`) duduk pas di dalam cekungan itu, melenting 30px ke atas bar. 4 item (Home · Riwayat · Tabungan · Atur) dibagi simetris 2 kiri / 2 kanan, jarak tengah 60px. Item aktif: `nav-bg-2` pill radius 20px + ikon putih. **Hanya di 4 tab root** (D42); onboarding, lock, quick-add, voice, scan struk: tanpa nav. Pill aktif **meleset dengan squash + spring** saat pindah tab (D43). |
| Sidebar (tablet/desktop) | Lebar 130px (desktop, ada logo + wordmark + label) / 80px (tablet, icon-only), `bg-nav`, tombol "Catat" accent-vivid di bawah. Menggantikan bottom nav di ≥ 768px (D44). Konten: 768–1023px max 720px; ≥1024px konten 480–520px + kolom analitik 280–320px, gap 24px (D55). |
| Button primary | Radius 20, tinggi 56, fill `accent`, teks putih 16/800, L2 shadow, press scale 0.97. |
| Button secondary | Radius 20, tinggi 56, fill `surface`, border `border-hair` 1.5px, teks `text-secondary` 16/700. |
| Icon button | Target interaksi minimal 44×44px di semua viewport; ikon visual boleh lebih kecil. Radius 999, fill `surface` atau `surface-3`. |
| Card | `surface`, radius 28, L1 shadow, padding 14–18px. |
| Card highlight | Border `accent` 1.8px + fill `accent-soft` (state terpilih). |
| Input | Radius 16, tinggi 52–70, fill `surface-2`, border `border-hair` 1.5px, focus border `accent` 2px. Label selalu di atas (bukan placeholder). |
| Field besar (nominal) | Radius 20, tinggi 70–76, prefix "Rp" 16/800 `text-muted`, nilai 30–34/800 display. |
| Chip / filter | Radius 999, tinggi 34–40, aktif = `accent-soft` + border `accent`, non-aktif = `surface` + `border-hair`. |
| Toggle (boleh lewat batas) | Track 44×26 radius 999, thumb 20px, aktif `accent`, non-aktif `surface-3`; label + helper 12/600 `text-secondary`. Dipakai di editor allocation per bucket. |
| Inline error | Teks 12/700 `expense` + ikon `circle-alert` 14px + chip kode 11/700; tidak menggeser layout (reserve 20px). |
| RubberSegment | Track `surface-3` radius 999, padding 5, thumb `surface` L1 shadow, tinggi 40–46, ikon + label. |
| Icon tile | 36–48px, radius 13–20, fill pastel kategori, ikon 44% ukuran tile, stroke 0 (warna sudah membawa makna). |
| CodeSlots (PIN) | 6 slot 44x44, radius 12, gap 8, isi = fill `accent` + titik putih (`mask=true`), kosong = `surface` + border `border-hair`, error = border `expense` + digit dikosongkan. |
| Progress bar | Tinggi 6–9, radius 999, track `surface-3`, fill warna bucket/semantik. Animasi fill 400ms ease-out. |
| Progress chip | Radius 999, tinggi 26–34, bg `accent-soft`, teks `accent-ink`, ikon 12–14px. |
| Bottom sheet | Radius atas 32, drag handle 44×5, header title 20/800 + close button 36, body padding 20, footer sticky dengan CTA + undo hint. |
| Floating mascot | **2.5D engine** (Jalur A), bukan gambar. Mockup memakai PNG contain. Pada hero dashboard: slot114×140, reserve112px sebelum tepi card; hanya28px badan masuk di belakang card. Wajah harus terlihat utuh. |
| Toast | Bawah, `bg-nav`, teks putih, auto-dismiss 3s. |
| Dialog konfirmasi | Card radius 28, `surface`, L2 shadow, tombol primary + secondary berjejer. |
| Empty state | **Lihat §5.1** — maskot 2.5D + copy + CTA + aksi sekunder. |
| Error state | **Lihat §5.1** — maskot 2.5D ekspresi + kode error + retry + assurance. |
| Skeleton | Shimmer `accent-soft`. |

---

## 5.1 Empty State & Error State (D45)

Satu pola, dua variasi. **Contoh lengkap ada di frame `G-E: Empty State` dan `G-X: Error State`** di `design/monee.pen` (bagian spec mini ada di section 07 Design System).

### Struktur wajib (dua-duanya sama)

| Slot | Isi | Empty (G-E) | Error (G-X) |
|---|---|---|---|
| Header | Judul layar + subjudul | "Riwayat" / "Semua transaksi kamu akan muncul di sini" | "Riwayat" / "Data transaksi" |
| Ilustrasi | Maskot 2.5D (Jalur A) tinggi170px, terpusat di dalam blob220×220, radius999, safe area25px | `mochi-idle` di blob `accent-soft` | `mochi-sad` di blob `st-danger-soft` + badge44px di tepi luar, bukan menutupi ekspresi |
| Judul | 22/800 display, `text-primary`, 1 baris | "Belum ada transaksi" | "Gagal memuat transaksi" |
| Body | 13/600 `text-secondary`, max 2 baris, lebar 300–310 | "Yuk, catat pengeluaran pertamamu. Mulai dari kopi, ojek, atau makan siang." | "Data lokal belum bisa dibuka. Coba muat ulang aplikasi." |
| Aksi utama | 1 tombol, tinggi 52, radius 20, fill `accent` | "Tambah Transaksi" (ikon `plus`) | "Coba Lagi" (ikon `refresh-cw`) |
| Aksi sekunder | 1 link, 13/700, tanpa border | "Impor dari struk" (ikon `scan-line`, warna `accent`) | "Laporkan masalah" (warna `text-secondary`) |
| Penutup | 12/600 `text-muted`, 1 baris penenang | "Mochi akan menjaga sisanya dulu" | "Data kamu aman, tidak ada yang hilang." |
| Kode error | Chip radius 999, 11/700 `st-danger` di `st-danger-soft` (hanya di error) | — | `ERR_NET_TIMEOUT` |

### Aturan main

1. **Tidak boleh lebih dari 1 aksi utama.** Kalau butuh 2 aksi, yang kedua jadi link (bukan tombol).
2. **Maskot selalu ekspresi, bukan dekorasi.** Empty = `idle`, Error = `sad`. Ini Aset 2.5D yang sudah ada (`mascots/png2_5d/`), tidak perlu render baru.
3. **Error tidak pernah pakai kata "gagal" tanpa jalan keluar.** Wajib ada aksi utama (retry) + assurance ("data kamu aman").
4. **Jangan tampilkan kode error ke user sebagai pesan utama** — kode error (`ERR_NET_TIMEOUT`) adalah chip kecil di bawah body, berguna untuk support.
5. **Navbar tetap ada** di kedua state (keduanya status dari tab root, bukan layar penuh).
6. **Warna**: hanya `st-danger` + `st-danger-soft` yang dipakai di error state. Tidak boleh merah dipakai untuk empty state.
7. **Copy Bahasa Indonesia, kalimat pendek, tanpa bahasa teknis** (kecuali kode error).

### Token baru

| Token | Nilai | Pakai di |
|---|---|---|
| `st-danger-soft` | `#F8E7E3` | blob error + chip kode error |

---

## 6. Komponen React Bits (D36)

Empat komponen diambil dari registry resmi React Bits. **Spec & state lengkap ada di frame `G-C: ReactBits Components`** di `design/monee.pen`. Perilaku di bawah mengikuti dokumentasi upstream, bukan interpretasi.

| Komponen | Install | Dipakai di | Catatan konfigurasi Monee |
|---|---|---|---|
| **FlipCard** | `@react-bits/FlipCard-TS-TW` | G-1 Dashboard (depan), G-1b (belakang) | Depan = dashboard utama (saldo periode + bucket + transaksi). Belakang = tampilan Tabungan (total + 2 kompartemen + goals + ledger ringkas + aksi). D39. **Satu instance**, flip via state, jangan render 2 kartu. |
| **CodeSlots** | `@react-bits/CodeSlots-TS-TW` | G-3e Set PIN, G-4 Lock Screen | `length={6}` · `slotSize={44}` · `radius={12}` · `gap={8}` · **`mask={true}`** (PIN tak boleh terbaca) · `status` idle/success/error. |
| **RubberSegment** | `@react-bits/RubberSegment-TS-TW` | G-2 tipe transaksi, G-5 periode | Thumb **rounded-rect** (bukan pill penuh), pindah dengan spring. Warna thumb/label mengikuti token Monee. |
| **FuseButton** | `@react-bits/FuseButton-TS-TW` | G-2 Simpan, G-2b armed/settled, G-9b Simpan N Transaksi | `undoWindow`: **2000 ms** untuk Simpan, **4000 ms** untuk destruktif (Hapus/Refund/Gunakan goal) — D38. `fuseColor` `#F5A524`. `settle="reset"`. |

### FuseButton — 3 fase (wajib digambar di semua pemakaian)
| Fase | Tampilan | Arti |
|---|---|---|
| `idle` | Pill accent + ikon aksi + label | Belum ada aksi. `commitOn="press"` → commit saat ditekan. |
| `armed` | Pill gelap + rim oranye terbakar + ikon undo + label "Batal" | **Seluruh pill = tombol Batal.** Muncul selama `undoWindow`. |
| `settled` | Pill hijau + centang + label "Tersimpan" | Aksi selesai & fuse habis. `settle="reset"` → kembali ke idle. |

### CodeSlots — 3 status
| Status | Tampilan |
|---|---|
| `idle` | 6 slot kosong, border netral, caret di slot aktif |
| sukses | Slot terisi + centang hijau |
| `error` | Slot kosong + border danger, digit dimask (titik) |

### Aturan wajib
1. **Ikon tetap Lucide** (D37) — Hugeicons bawaan komponen diganti `lucide-react`.
2. **Semua warna di-override** token Monee (accent per maskot), bukan default React Bits.
3. `prefers-reduced-motion` dihormati (Monee global).
4. Komponen butuh `motion/react` — sudah terpasang lewat `framer-motion` v12.

---

## 7. Iconography

- **Lucide** (stroke 2, rounded), satu family untuk semua ikon. Tidak ada emoji sebagai ikon struktural.
- Kategori final **14** (10 expense + 4 income, D54). Ikon Lucide + warna tile:
  - Expense: Makan `utensils` #E6EFDB · Minum `coffee` #F3E3D3 · Transport `car` #FBE3CE · Pulsa/Data `smartphone` #E4DFF5
  - Expense: Belanja `shopping-bag` #F7DCD6 · Hiburan `party-popper` #E4DFF5 · Sedekah `hand-heart` #F8E9CE · Tabungan `piggy-bank` #DCEEE0
  - Expense: Edukasi `graduation-cap` #DDE9F7 · Lainnya `shapes` #ECE6DC
  - Income: Gaji `briefcase` #DCEEE0 · Bonus `sparkles` #F8E9CE · Freelance `laptop` #DDE9F7 · Hadiah `gift` #F3E3D3
  - **Ledger tabungan tidak memakai kategori.** Hanya catatan teks. Jangan paksakan kategori Makan/Minum di sana.

---

## 8. Motion Tokens

```css
--dur-fast:   150ms;
--dur-base:   250ms;
--dur-slow:   400ms;
--ease-out:   cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring:cubic-bezier(0.34, 1.56, 0.64, 1);
```
`prefers-reduced-motion: reduce` → durasi 0, hanya opacity.

### 8.1 Motion Tab Navigasi (D43)

```css
--dur-nav:            300ms;   /* total satu transisi tab */
--dur-nav-reduced:    120ms;   /* prefs-reduced-motion: fade saja */
--spring-nav:         cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoot */
--spring-nav-stiff:   420;      /* stiffness pill */
--spring-nav-damp:    30;       /* damping pill */
```

| Layer | Animasi | Durasi |
|---|---|---|
| Konten keluar | `translateX(-24px)` + opacity → 0 | 220ms ease-in |
| Konten baru | `translateX(24px)` → 0 + opacity → 1 | 260ms spring, delay 40ms |
| Pill nav | `translateX` + squash (scaleX 1.08 / scaleY 0.92) saat meleset | spring stiffness 420, damping 30 |
| Ikon aktif | `scale 1 → 1.25 → 1` | 280ms ease-spring |
| Maskot 2.5D | state berubah + pop 1.08 | 240ms, delay 80ms |

Aturan: durasi total ≤ 300ms · stagger maksimal **3 layer** (pill → ikon → maskot) · haptic tick 8ms **sesudah** transisi · `prefers-reduced-motion` → fade 120ms, semua spring dimatikan.

Maskot bereaksi per tab: Home `idle` · Riwayat `thinking` · Tabungan `happy` · Atur `greeting`.

> Referensi visual: frame `G-N: Navbar Motion Spec` di `design/monee.pen`. Detail lengkap di dok 03 §6.

---

## 9. Maskot — Dua Jalur Render

> **Keputusan arsitektur (dok 05 §2 & dok 11):** ada **dua jalur render** untuk tiga maskot yang sama.
> Ganti jalur **tidak** mengubah karakter maskot — hanya cara menampilkannya.

### Jalur A — 2.5D Canvas Engine (dipakai di SELURUH app)

| Aspek | Nilai |
|---|---|
| Teknologi | Canvas 2D prosedural (`mascots/core/mascot_canvas.js` + `mochi/luna/bumi.js`) |
| Dipakai di | Dashboard, onboarding, lock screen, voice mode, empty state, review struk |
| State | 14 seragam (`idle`, `gabut`, `greeting`, `tap`, `pet`, `happy`, `angry`, `sad`, `surprised`, `listening`, `thinking`, `annoyed`, `celebrate`, `sleepy`) |
| Interaksi | Eye-tracking (pupil ikut pointer), blink acak, breathing, squash-stretch, spring bounce, elus (long-press) |
| Performa | Target: cold start < 1 detik, bundle < 50 KB, 60–120 FPS, tanpa WebGL, hemat baterai. FPS adalah target, belum diukur di perangkat fisik; verifikasi saat ini berupa ukuran bundle + kelancaran di browser desktop. |
| Ukuran gambar mockup | dashboard114×140 · onboarding nama136×190 pada stage216 · onboarding pemasukan72×100 pada stage96×108 · lock132×162 pada stage190 · listening108×166 pada stage304 · empty/error tinggi170 pada stage220 |
| Aset desain | `mascots/png2_5d/{id}-{state}.png` (render PNG untuk mocking di pen.dev, hasil renderer `tools/render-2_5d.cjs`) |

> Saat implementasi: **jangan pakai PNG**. App harus instantiate `MascotCanvas` dan menggambar
> secara live. PNG hanya untuk mockup desain.

### Carousel saat ini ? Canvas 2.5D

Pemilih maskot menggunakan `MascotCanvas`, engine yang sama dengan layar aplikasi lain. GLB, Three.js dan decoder Draco tidak digunakan. PNG di `mascots/png/` hanya referensi desain historis; tidak dikirim ke browser aplikasi.

### Reaksi kontekstual

`src/features/mascot/mascot-machine.ts` memetakan 19 event ke 14 state dengan prioritas dan durasi finite. Reaksi sementara ditumpuk di atas base state layar melalui `MascotCanvas`, lalu kembali otomatis tanpa frame loop tambahan. `mascot-events.ts` menyiarkan event lewat `monee:mascot`; store mengumumkan transaksi tersimpan, ambang bucket, error jatah/saldo/periode, dan tujuan yang baru terpenuhi. Voice menggunakan state listening/processing; batas pengujian layanan asli ada di [task](task.md).

### Aturan
1. **Seluruh aplikasi menggunakan Canvas 2.5D**, tanpa model 3D atau WebGL.
2. state engine 2.5D punya karakter berbeda per maskot (Mochi tenang, Luna aktif, Bumi jahil) — jangan diseragamkan.
3. 14 state wajib tersedia di semua maskot; fallback aman bila state tak dikenal.
4. Maskot tidak menutupi teks, nominal, field, atau kontrol. Reserve ruang di layout; jangan mengandalkan overflow untuk menampilkan kepala. Dashboard memakai inset kanan12px dan hanya overlap badan28px.
5. Pusatkan karakter secara optik berdasarkan area artwork yang terlihat, bukan hanya dimensi berkas. Pada carousel, margin transparan PNG mockup dipangkas melalui transform image fill. Implementasi Canvas memusatkan artwork; karakter aktif lebih besar daripada pilihan samping secara sengaja.
6. Nama, lock, dan empty/error memakai stage terpusat dengan safe area. Voice memisahkan gambar, tombol mic dan label sebagai area berbeda. Posisi mockup dan screenshot revisi24 Oktober dicatat di dok12, D-12.

---

## 10. Theme Switching Behavior

- Ganti maskot → cross-fade 400ms pada `accent` + `bg-tone`; layout tidak bergeser.
- Preview di carousel: accent aktif ikut berubah saat swipe (dok 06).
- Persist: maskot + theme tersimpan di IndexedDB.
- Implementasi: token warna tema didaftarkan lewat `@property` (`syntax: '<color>'`, `inherits: true`) dan blok `:root` memakai `transition: --theme-accent … var(--dur-slow)`. `--app-canvas` = `--theme-bg-tone`, sehingga kanvas ikut cross-fade tanpa layout shift. `prefers-reduced-motion` menetapkan `--dur-slow: 0ms`.

---

## 11. Accessibility Checklist

- Kontras teks ≥ 4.5:1 terhadap surface-nya.
- Target sentuh ≥ 44×44px.
- Semua input punya label visible; error state selalu ikon + teks (bukan warna saja).
- Reduced motion dihormati.
- Focus ring `accent` 2px (web).
- Nav item punya ikon **dan** label (mobile) — icon-only hanya untuk tombol utility yang selalu ada label aria.

---

## 12. Referensi Implementasi

- File desain: `design/monee.pen` (23 frame)
  - `G-0: Design System - Warm Clay` — token, tipografi, radius, elevasi, komponen, anatomi bottom nav (notch), sistem 2 jalur maskot, spec empty & error state
  - `G-1` … `G-8` — seluruh layar aplikasi
  - `G-1b` FlipCard belakang · `G-2b` FuseButton armed — state tambahan
  - `G-9a` Scan Struk · `G-9b` Review Struk — alur OCR struk
  - `G-C: ReactBits Components` — spec & state 4 komponen ReactBits
  - `G-N: Navbar Motion Spec` — motion perpindahan tab (D43)
  - `G-T: Navbar Theme Variations` — navbar 3 tema maskot
  - `G-E: Empty State` · `G-X: Error State` — pola fallback data (D45)
  - `G-R: Responsive Desktop & Tablet` — referensi layout ≥ 768px
- Aset 2.5D (mockup): `mascots/png2_5d/*.png` — hasil render engine, **bukan** aset produksi.
  Regenerasi: `node tools/render-2_5d.cjs` (butuh `playwright`, `PLAYWRIGHT_BROWSERS_PATH`).
- PNG historis carousel: `mascots/png/{mochi,luna,bumi}.png`, hanya referensi desain.
- Token runtime CSS: `src/theme/tokens.css` sudah Warm Clay v2; tema maskot runtime berasal dari `src/theme/mascot-themes.ts` (`MASCOT_THEMES`). Palet studio historis yang tidak digunakan telah dihapus.
- Adaptasi ReactBits sudah tersedia di `src/components/reactbits/` memakai `framer-motion` dan Lucide. Lisensi dan batas adaptasi tercatat pada `src/components/reactbits/LICENSE.md`; tidak perlu memasang paket `@react-bits/*` yang disebut dalam rencana lama.
- Target interaksi 44px, pasangan warna AA, frame Canvas statis ketika reduced-motion, dan pause saat dokumen tersembunyi. Matriks runtime: 320/375/768/1024/1440px; status pemeriksaan pada task.
