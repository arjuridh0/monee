# 05 — Mascot Design Specification & Asset Production Guide

> **Dokumen ini = panduan produksi aset untuk agent 3D (Jalur B) dan engineer canvas 2.5D (Jalur A)**. Berisi: identitas karakter, spesifikasi visual, daftar state, dan acceptance checklist.

## 1. Roster v1 (nama final — keputusan user)

| ID | Nama | Identitas visual | Accent theme (v2) |
|---|---|---|---|
| `mochi` | **Mochi** | Putih lembut aksen hijau, calm, "The Gentle Seraphim" | `#4F7C3A` (hijau sage olive) — Fresh Olive |
| `luna` | **Luna** | Furry biru, riang, "The Playful Cat" | `#3F6FB5` (biru) — Ocean Blue |
| `bumi` | **Bumi** | Gemuk kuning hangat, "The Cheerful Yobao" | `#C0862B` (kuning amber) — Sunny Amber |

> **Catatan:** kolom accent di atas mengikuti **design system v2 (Warm Clay, dok 04 §2)**. Source runtime `src/theme/mascot-themes.ts` sudah memakai v2. Palet lama (`#34C759` / `#007AFF` / `#FF9500`) tersisa di `mascots/index.js` untuk studio historis; palet itu bukan acuan warna aplikasi.

- **Eca (chibi hijab) TIDAK dipakai** — diabaikan dari roster (keputusan user).
- Personality: Mochi = tenang/hangat, Luna = aktif/antusias, Bumi = ceria/jahil. Tercerminkan di kecepatan gerak idle & amplitudo ekspresi.

## 2. Arsitektur Render — DUA JALUR (v2.0)

> **Penting:** penamaan jalur A/B di dokumen ini sudah diselaraskan dengan dok 04 §9 dan dok 12.

### Jalur A — 2.5D Canvas Engine (dipakai di SELURUH APP)
- Maskot pendamping harian **digambar penuh oleh kode** (canvas 2D procedural di folder `mascots/`).
- Dipakai di: Dashboard, onboarding, lock screen, voice mode, review struk, empty state, dan **reaksi per tab navigasi** (D43).
- Kenapa: cold start <1 detik, <50KB (tanpa aset bitmap berat), hemat baterai, **arah mata & squash-stretch bergerak real-time**.
- Mengimplementasikan 14 state seragam untuk ketiga maskot (`mochi`, `luna`, `bumi`).
- **Mockup PNG untuk desain:** `mascots/png2_5d/{id}-{state}.png` (15 file hasil render engine).
  Regenerasi: `node tools/render-2_5d.cjs`. **Bukan aset produksi** — app wajib instantiate `MascotCanvas` ([panduan implementasi aset](11-asset-implementation-guide.md)).

### Jalur B — 3D GLB (KHUSUS halaman pilih maskot & tema)
- Aplikasi menampilkan **snapshot WebP GLB** yang dibuat melalui Three.js WebGL + DRACOLoader lokal. Satu maskot aktif dimuat saat dibutuhkan; kartu memakai gambar snapshot dan transform CSS. Keputusan renderer tetap snapshot dengan fallback Canvas 2.5D.
- Model 3D diposisikan **frontal dan statis (tanpa rotasi pasif)** agar identitas dan siluet wajah karakter terbaca tegas, jelas, dan rapi.
- Centering presisi melalui perhitungan `bbox.getCenter()` lokal sehingga seluruh badan dari kepala hingga kaki tampak proporsional di tengah kartu tanpa tenggelam.
- 1 file `.glb` per maskot (terkompresi Draco).
- **Di luar halaman ini, TIDAK BOLEH ada render 3D.** Desktop 3D/WebGL berat dan boros baterai.
- Mockup PNG: `mascots/png/{mochi,luna,bumi}.png`. Produksi: `public/mascots/3d/*.glb`.

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

## 6. Deliverable Produksi 3D (Jalur B — Model GLB selector)

> **Klarifikasi 25 Oktober 2026:** GLB tetap sumber visual Jalur B. Aplikasi membuat snapshot WebP saat runtime; PNG desain bukan sumber kartu produksi. Fallback memakai engine Canvas 2.5D. Lihat dok 06 dan panduan implementasi dok 11.

| Deliverable | Spek | Untuk |
|---|---|---|
| `furry.glb` / `yobao.glb` / `mochi.glb` | Model 3D, dikompres Draco, target < 3 MB | Kartu carousel 3D (utama) |
| `[mascot]-hero.png` (opsional) | 560×680 px, transparan, pose frontal hero | Fallback statis / OG image |
| Character sheet per karakter | Bagian 5 | Implementasi canvas 2.5D |

**Aturan render (bila membuat PNG fallback):**
- Background transparan penuh; **tanpa drop-shadow baked** (shadow dibuat CSS).
- Lighting soft konsisten antar ketiga karakter.
- Resolusi 2× dari slot tampil terbesar (280×340 → render 560×680).
- Format PNG (dikompres WebP saat build, fallback PNG).

## 7. Acceptance Checklist (QA aset)

- [ ] Siluet ketiga karakter terbaca jelas dalam hitungan detik, satu sama lain distinct.
- [ ] Ketiganya terlihat "satu keluarga produk" (proporsi, mata, shading konsisten).
- [ ] Warna cocok dengan accent theme di dok 04 (±toleransi kecil).
- [ ] `.glb` ter-optimasi (< 3 MB, atau terdokumentasi bila terpaksa lebih) & tampil benar dengan `DRACOLoader`.
- [ ] Ekspresi sheet lengkap 14 state, terbaca jelas dalam ukuran kecil (96px).
- [ ] Front view tidak terpotong, proporsional (kepala 1:1).
- [ ] Palette hex tercantum lengkap di character sheet.
- [ ] Semua file bernama sesuai konvensi: `[mascot]-[state].png` / `[mascot].glb`.

## 8. Ekstensi Masa Depan (data-driven)

Kontrak config berikut adalah usulan ekstensi, bukan struktur tunggal source saat ini. Runtime memisahkan registry engine `mascots/index.js`, tema `src/theme/mascot-themes.ts`, opsi selector `src/features/mascot/mascot-options.ts`, dan peta GLB `src/core/mascot/model-map.ts`:
```ts
interface MascotConfig {
  id: "mochi" | "luna" | "bumi";
  name: string;
  accent: string;          // hex
  accentSoft: string;
  bgTone: string;
  glbPath: string;         // path model 3D carousel, mis. "public/mascots/3d/mochi.glb"
  drawFn: string;          // fungsi draw procedural di mascots/
  personality: { idleSpeed: number; bounce: number; }
}
```
Menambah maskot baru = tambah 1 config + 1 file GLB + 1 file engine di `mascots/`. **Tidak mengubah arsitektur core.**
