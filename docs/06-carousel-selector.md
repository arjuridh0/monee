# 06 — Mascot Selector / Carousel Specification v2.0

## 1. Konsep Modern

Aplikasi menggunakan **snapshot WebP frontal dari model GLB**. `model-snapshot.ts` memuat Three.js dan DRACOLoader lokal saat diperlukan, membuat satu gambar per maskot, lalu kartu menampilkan gambar itu dengan transform CSS. Pendamping harian memakai Canvas 2.5D melalui `MascotCanvas`. Renderer tetap snapshot dengan fallback 2.5D: tidak ada viewer GLB live per kartu, tetapi swipe kini mempratinjau tema dan state machine maskot bereaksi terhadap event finansial (dok 11).

Referensi interaksi berbasis ReactBits Gradient Carousel Pro: touch-first, buttery spring physics, swipe/drag, wheel scroll, tombol navigasi ← / →, dan live theme preview.

### Batas render saat ini

- GLB tetap sumber visual; tidak memerlukan langkah produksi PNG kartu terpisah.
- Snapshot 640px dibuat saat runtime dan disimpan dalam cache memori selama selector dipakai. Resolusi tetap ini memiliki batas pembesaran seperti gambar raster lain.
- Hanya model aktif diminta; model/resource dilepas setelah render dan renderer/decoder dilepas setelah selector terakhir selesai.
- Kegagalan WebGL/model memakai pendamping Canvas 2.5D. Reduced-motion memakai daftar sederhana tanpa pemuatan GLB, frame companion statis, dan kontrol keyboard tetap tersedia.
- Target frame/performa harus diukur pada perangkat sasaran; dokumen ini tidak menyatakan 60fps telah terbukti pada semua perangkat.

## 2. Layout

```
┌────────────────────────────────────┐
│  ← Pilih Temanmu                ✕  │
│                                    │
│         [LUNA]  [MOCHI]  [BUMI]    │  ← kartu tengah aktif,
│         0.85×   1.0×     0.85×     │     samping miring ±28°
│                 (3D-ish,           │
│                  depth -200px)     │
│                                    │
│         Nama: Mochi                │  ← label di bawah kartu
│         Tema: Fresh Olive          │
│                                    │
│   (background tone = tema aktif)   │
│                                    │
│        ┌──────────────────┐        │
│        │ Pilih Maskot ini │        │  ← CTA accent aktif
│        └──────────────────┘        │
└────────────────────────────────────┘
```

- Kartu mengikuti ruang viewport, berisi **snapshot GLB frontal** maskot terpusat + nama; ukuran desain 320×380px bukan lebar minimum halaman.
- 3 kartu terlihat (1 aktif + 2 tetangga samping dengan efek rotateY & depth).
- Background halaman: cross-fade ke `bgTone` maskot aktif saat swipe.
- Tombol "Pilih Maskot ini" memakai `accent` maskot aktif.
- Navigasi: tombol `← Kiri`, `Pilih Maskot ini`, dan `Kanan →` terintegrasi responsif.
- Nama tema tampil di bawah kartu: Luna → "Ocean Blue", Bumi → "Sunny Amber", Mochi → "Fresh Olive".

## 3. Interaksi

| Input | Perilaku |
|---|---|
| Drag horizontal | Kartu mengikuti jari (rotasi & scale dihitung dari jarak ke pusat, real-time) |
| Lepas drag | **Snap ke kartu terdekat** (spring, 350ms) — tidak pernah berhenti di antara kartu |
| Flick cepat | Inertia + snap (lempar 1 kartu per flick) |
| Tap kartu samping | Kartu itu slide ke tengah (jadi aktif) |
| Keyboard (web) | ← / → pindah aktif; Enter = Terapkan |
| Indikator | Dot indicator (● ○ ○) di bawah |

**Perilaku aktif:**
- Kartu aktif: scale 1.0, rotasi 0°, depth 0, brightness penuh. RAF berhenti ketika posisi sudah stabil dan dokumen tersembunyi; tidak ada kewajiban floating berulang.
- Kartu ±1: scale 0.85, rotasi ∓28°, depth -200px (translateZ), sedikit redup (opacity 0.8).
- Kartu ±2+: hanya silhouette/hint (opacity 0.3, scale 0.75) — biar tahu masih ada pilihan lain.

**Apply (keputusan E-section master):**
- Swipe **hanya preview** — tidak langsung mengubah maskot app.
- Tap **"Terapkan"** → maskot & theme aktif tersimpan, UI seluruh app cross-fade 400ms ke theme baru, kembali ke halaman asal.
- Perubahan bisa dibatalkan: sebelum Terapkan, back = batal (theme kembali ke semula).

## 4. Responsive

| Layar | Perilaku |
|---|---|
| Mobile (<480px) | Kartu 280×340, drag touch utama |
| Tablet/laptop/desktop | Selector menyesuaikan kolom konten layout D44/D55; mouse, wheel dan keyboard tersedia. Batas kartu tidak membatasi seluruh aplikasi menjadi 480px. |
| Reduced motion | Daftar pilihan sederhana, companion Canvas statis, tanpa GLB dan tanpa animasi perpindahan kartu, sesuai dok 04 §8 |

## 5. Aksesibilitas
- Setiap kartu: `role="option"`, `aria-selected` pada aktif, nama maskot sebagai label.
- Dot indicator sinkron dengan status.
- Alternatif non-carousel: daftar vertikal sederhana (fallback jika user pakai screen reader / reduced motion) — kecil, tapi ada.

## 6. Implementasi Teknis (Ringkas v2.0)

- React component `MascotCarousel` custom (±350 baris).
- **Pembuat snapshot GLB**: Three.js/GLTFLoader dan **DRACOLoader** lokal (`/draco/`) menghasilkan WebP untuk maskot aktif. Tidak ada renderer live per kartu ([panduan selector GLB](11-asset-implementation-guide.md)).
- Transform per kartu: `rotateY(θ) translateZ(z) scale(s)` dihitung dari `offsetIndex` (float, hasil drag/snap) — murni CSS 3D transform + `transform-style: preserve-3d`.
- Pointer Events (unified mouse/touch) + velocity tracking untuk flick.
- Spring animation: requestAnimationFrame custom atau `framer-motion` (default: framer-motion karena dipakai juga untuk sheet & micro-interactions).
- Background tone: CSS variable `--theme-bg-tone` di-update tiap kartu aktif berubah → transisi otomatis via CSS transition.
- **Apply (F7-1/F8-4):** `applyMascotTheme()` mengganti 10 token warna; token didaftarkan via `@property` dan `:root` memakai `transition` 400ms, sehingga accent, navbar, dan `--app-canvas` (= `--theme-bg-tone`) cross-fade. Sejak F8-4 setiap perubahan kartu aktif langsung mempratinjau tema di root; bila selector ditutup tanpa Apply, tema awal dipulihkan. Apply yang gagal (promise `onApply` reject) juga memulihkan tema, sedangkan Apply yang berhasil mempertahankannya.
- WebGL tetap membutuhkan GPU/memori ketika snapshot dibuat; fallback 2.5D menangani perangkat yang tidak mendukung atau model yang gagal dimuat.
- GLB dimuat lazy saat kartu aktif berganti; service worker memakai runtime cache setelah model berhasil diminta. Model yang belum pernah dimuat tidak dijanjikan tersedia offline.

> `tools/studio/index.html` adalah studio aset terpisah. Source aplikasi: `src/features/mascot/MascotCarousel.tsx`, `model-snapshot.ts`, dan `MascotCanvas.tsx`. Status verifikasi ada di [task](task.md).
