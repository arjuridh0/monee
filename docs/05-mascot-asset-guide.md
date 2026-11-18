# 05 — Mascot Design Specification & Asset Production Guide

> **Panduan engine Canvas 2.5D dan aset referensi desain.** Seluruh aplikasi, termasuk pemilih maskot, memakai engine yang sama. Model 3D dan decoder tidak lagi digunakan.

## 1. Roster v1 (nama final — keputusan user)

| ID | Nama | Identitas visual | Accent theme (v2) |
|---|---|---|---|
| `mochi` | **Mochi** | Putih lembut aksen hijau, calm, "The Gentle Seraphim" | `#4F7C3A` (hijau sage olive) — Fresh Olive |
| `luna` | **Luna** | Furry biru, riang, "The Playful Cat" | `#3F6FB5` (biru) — Ocean Blue |
| `bumi` | **Bumi** | Gemuk kuning hangat, "The Cheerful Yobao" | `#9C641D` (kuning amber) — Sunny Amber |

> **Catatan:** token runtime mengikuti `src/theme/mascot-themes.ts`. Registry `mascots/index.js` mengekspor karakter; warna tema aplikasi tidak ditentukan oleh PNG referensi.

- **Eca (chibi hijab) TIDAK dipakai** — diabaikan dari roster (keputusan user).
- Personality: Mochi = tenang/hangat, Luna = aktif/antusias, Bumi = ceria/jahil. Tercerminkan di kecepatan gerak idle & amplitudo ekspresi.

## 2. Arsitektur Render - Canvas 2.5D

- Maskot digambar oleh engine Canvas 2D procedural di `mascots/`, dibungkus `src/features/mascot/MascotCanvas.tsx`.
- Engine dipakai pada onboarding, dashboard, kunci perangkat, suara, pemilih maskot dan empty/error state.
- Ketiga karakter memakai 14 state seragam; reduced motion menampilkan frame statis.
- Pemilih maskot menggunakan tiga canvas pada carousel berputar. Tidak ada GLB, Three.js, WebGL, Draco atau snapshot model saat runtime.
- `mascots/png/` menyimpan referensi desain historis, bukan gambar yang diunduh aplikasi.
- `mascots/png2_5d/{id}-{state}.png` menyimpan 15 mockup desain. Regenerasi: `node tools/render-2_5d.cjs`. Lihat [panduan implementasi aset](11-asset-implementation-guide.md).

## 3. Konsep Karakter (dari analisis referensi)

**Konsistensi keluarga produk (WAJIB):**
1. **Satu bahasa visual, tiga karakter.** Proporsi chibi seragam (head-to-body ±1:1), ukuran & posisi mata serupa, material & shading treatment konsisten.
2. Siluet jelas & distinct dari depan:
   - **Luna**: telinga kucing runcing dengan inner ear, tudung bulu biru bertekstur, face mask putih-krem, kumis halus, ekor melengkung.
   - **Bumi**: topi kelopak bunga matahari (flower petal hat) dengan tangkai hijau & daun di atasnya, tubuh pir montok, pipi merona.
   - **Mochi**: tudung putih bersih (Gentle Seraphim), tunas kembar hijau di atas kepala, aksen daun semanggi (four-leaf clover).
3. Warna sesuai accent theme masing-masing (bagian 1).

**Proporsi standar semua karakter:**
- Kepala : badan = 1 : 1 (super-deformed chibi).
- Mata besar di tengah wajah, mulut kecil.
- Tangan pendek gemoy, tanpa jari detail (mitten-style).

## 4. Daftar 14 State Standar (Harmonisasi Semua Karakter)

Semua karakter mengimplementasikan **14 ekspresi seragam** dengan visual yang unik per kepribadian:

| State | Trigger | Deskripsi |
|---|---|---|
| `idle` | Default | Breathing halus, float lembut, blink random tiap 2-5s |
| `gabut` | Idle >8s | Bosan — animasi khas per maskot (Mochi: melayang, Luna: sundul bola biru, Bumi: putar kincir) |
| `greeting` | Buka app / ganti maskot | Melambaikan tangan ceria, lompat masuk |
| `pet` | Elus / long-press | Mata bulan sabit, blush memerah, tubuh melumer bahagia |
| `tap` | Tap 1x | Reaksi bounce saat disentuh |
| `happy` | Gaji masuk, goal tercapai | Mata bulan sabit, lompat membal, efek bintang/kelopak |
| `angry` | Tap beruntun (≥5x) | Gemetar, alis V, aura marah |
| `sad` | Overspent >100% | Mata berkaca, air mata, tubuh turun |
| `surprised` | Pengeluaran mendadak besar | Mata membelalak, mulut O, lompat kencang |
| `listening` | Mode AI input | Antena bergetar, gelombang audio (akan diimplementasi nanti) |
| `thinking` | AI sedang memproses | Sparkle berputar, alis satu naik, pose tangan ke dagu |
| `annoyed` | Notifikasi diabaikan berulang | Alis V ringan, goyang, tanda seru kecil |
| `celebrate` | Milestone keuangan | Loncat tinggi, konfeti berhamburan, emoji pesta |
| `sleepy` | Malam hari / lama tidak dibuka | Mata setengah tutup, zZz melayang, gerak lambat |

> *14 state diimplementasikan seragam di ketiga maskot. File sumber kebenaran: `mascots/core/states.js`.*

## 5. Blueprint Wajah & Badan (untuk implementasi canvas)

Untuk tiap karakter, agent 3D harus menghasilkan **character sheet** berisi:

1. **Front view orthographic** (untuk jadi acuan bentuk).
2. **Color palette hex**: base, shadow, highlight, blush, outline (max 5 warna + hitam/putih mata).
3. **Feature breakdown**:
   - Bentuk kepala (circle/ellipse ratio).
   - Bentuk mata: iris besar dengan highlight titik putih; posisi mata dari pusat (dx, dy).
   - Bentuk mulut default + variasi ekspresi (smile, frown, open happy "D", kecil "o").
   - Alis (garis/warna) — untuk worried & annoyed.
   - Elemen khas (telinga & kumis Luna, topi kelopak Bumi, tunas Mochi) — digambar sebagai shape terpisah dengan koordinat relatif.
4. **Ekspresi sheet**: grid 14 state di atas, front view, canvas transparan.
5. **Turnaround minimal**: front view utama + orientasi frontal tegak.

Semua ini yang diterjemahkan jadi modul kanvas: `luna.js`, `bumi.js`, `mochi.js` dengan kontrak 14 state seragam.

## 6. Deliverable aset

| Deliverable | Fungsi |
|---|---|
| Engine karakter di `mascots/` | Sumber gambar dan perilaku maskot aplikasi |
| Character sheet per karakter | Acuan identitas, proporsi dan ekspresi |
| PNG di `mascots/png2_5d/` | Mockup untuk editor desain; tidak masuk runtime |

PNG referensi memakai latar transparan dan pencahayaan konsisten. Bayangan pada aplikasi berasal dari engine/tampilan, bukan alasan untuk mengunduh model tambahan. Sumber desain dan PNG tetap dipertahankan di Git; ekspor sementara masuk direktori yang di-ignore.

## 7. Acceptance Checklist (QA aset)

- [ ] Siluet ketiga karakter terbaca jelas dalam hitungan detik, satu sama lain distinct.
- [ ] Ketiganya terlihat "satu keluarga produk" (proporsi, mata, shading konsisten).
- [ ] Warna cocok dengan accent theme di dok 04 (±toleransi kecil).
- [ ] Pemilih memakai engine Canvas yang sama; tidak ada unduhan model atau decoder 3D.
- [ ] Ekspresi sheet lengkap 14 state, terbaca jelas dalam ukuran kecil (96px).
- [ ] Front view tidak terpotong, proporsional (kepala 1:1).
- [ ] Palette hex tercantum lengkap di character sheet.
- [ ] Mockup bernama `[mascot]-[state].png`; kode karakter mengikuti ID registry.

## 8. Menambah maskot

Perubahan meliputi engine karakter dan registry `mascots/index.js`, tipe ID, token `src/theme/mascot-themes.ts`, serta opsi `src/features/mascot/mascot-options.ts`. Lengkapi state, mockup desain dan tes kontrak maskot. Tidak diperlukan model GLB atau peta nama model. Ini perubahan kode yang harus ditinjau dan diuji, bukan sekadar menambah file gambar.
