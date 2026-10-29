# 11 - Implementasi aset maskot

Satu engine `mascots/core/`, tiga karakter (`mochi`, `luna`, `bumi`) dan 14 state digunakan bersama aplikasi dan tooling. Komponen aplikasi memakai wrapper yang sudah ada; tidak perlu menyalin engine JavaScript menjadi TypeScript atau membuat wrapper kedua.

## Sumber aset

| Sumber | Fungsi |
|---|---|
| `mascots/core/mascot_canvas.js`, `states.js`, `draw_util.js` | Controller, state dan helper Canvas 2D |
| `mascots/mochi.js`, `luna.js`, `bumi.js`, `index.js` | Gambar/perilaku tiap karakter dan registry |
| `public/mascots/3d/mochi.glb` | Model selector Mochi, sekitar 0,50 MiB |
| `public/mascots/3d/furry.glb` | Model selector Luna, sekitar 6,27 MiB |
| `public/mascots/3d/yobao.glb` | Model selector Bumi, sekitar 1,33 MiB |
| `mascots/png/`, `mascots/png2_5d/` | Referensi PNG yang dipakai sumber desain `design/monee.pen` |
| `tools/studio/index.html` | Satu studio untuk melihat carousel dan Canvas 2.5D |

`public/mascots/3d/` adalah sumber tunggal model teroptimasi yang masuk build. Model mentah/master dan backup sumber berada di luar repository aplikasi. GLB tidak masuk precache: Workbox memakai runtime CacheFirst sesudah model diminta (dok 09). Font dan decoder Draco lokal masuk precache; model yang belum pernah diminta dapat memerlukan jaringan atau fallback.

## Rendering aplikasi

- `src/features/mascot/MascotCanvas.tsx` membungkus engine Canvas 2.5D untuk onboarding, lock, dashboard, voice dan review struk. Panggil cleanup ketika unmount; reduced-motion memakai frame statis dan dokumen tersembunyi menghentikan pekerjaan animasi.
- `src/features/mascot/MascotCarousel.tsx` dan `model-snapshot.ts` membuat snapshot WebP frontal dari GLB maskot aktif lalu menampilkannya melalui transform CSS. Renderer tetap snapshot dengan fallback Canvas 2.5D; reduced-motion memakai daftar sederhana tanpa memuat GLB.
- `src/core/mascot/model-map.ts` memetakan ID ke `/mascots/3d/`: Mochi=`mochi.glb`, Luna=`furry.glb`, Bumi=`yobao.glb`.
- Three.js dan loader dimuat lazy; satu antrean berbagi renderer. Model/resource dilepas setelah render; renderer/decoder dilepas setelah selector terakhir tidak lagi digunakan. Tidak ada renderer WebGL baru pada setiap kartu.
- Ketiga GLB memakai Draco. Pasang DRACOLoader sebelum GLTFLoader, gunakan decoder lokal `/draco/` dan versi Three.js dari dependensi root. Jangan bergantung pada CDN atau paket tools terpisah.
- Bounding box model menentukan pusat dan skala frontal. PNG mockup tidak menjadi sumber kartu produksi.

Swipe mempratinjau token tema; Terapkan menyimpan pilihan. Batal atau Apply gagal memulihkan tema awal. Token runtime Warm Clay v2 berasal dari `src/theme/mascot-themes.ts` dan `src/theme/tokens.css`: Mochi `#4F7C3A`, Luna `#3F6FB5`, Bumi `#C0862B`. `THEMES` pada `mascots/index.js` adalah palet studio historis v1.

## Kontrak engine dan reaksi

```javascript
import { MascotCanvas } from '../../mascots/core/mascot_canvas.js';

const mascot = new MascotCanvas({
  canvas: document.querySelector('canvas'),
  mascot: 'mochi',
  width: 280,
  state: 'idle',
  interactive: true,
});
mascot.setMascot('luna');
mascot.setState('happy');
// Saat elemen tidak lagi dipakai:
mascot.destroy();
```

State bersama: `idle`, `gabut`, `greeting`, `tap`, `pet`, `happy`, `angry`, `sad`, `surprised`, `listening`, `thinking`, `annoyed`, `celebrate`, `sleepy`.

`mascot-machine.ts` mengatur prioritas/durasi dan pemulihan ke base state. `mascot-events.ts` mengirim event melalui `monee:mascot`. Transaksi tersimpan memicu happy, jatah habis annoyed, saldo kurang sad, periode terkunci thinking dan goal baru terpenuhi celebrate. Voice memakai listening/processing; jangan membuat loop render terpisah untuk setiap event. Detail interaksi dan aturan state ada di dok 03-06.

## Budget model dan pengecualian Luna

Target model selector kurang dari 3 MiB per maskot. Mochi dan Bumi memenuhi; Luna tetap sekitar 6,27 MiB sebagai pengecualian yang disadari. Mesh strand fur mempunyai banyak komponen terputus sehingga simplifier CLI berhenti sekitar 1,24 juta triangle. Pengurangan lebih lanjut memerlukan pengerjaan ulang/re-export Blender (merge by distance lalu decimate), bukan sekadar kompresi CLI.

Pipeline aset pengganti dapat menggunakan glTF Transform optimize dengan Draco dan tekstur WebP, lalu inspect serta review visual. Jangan menjalankan pipeline pada satu-satunya aset runtime tanpa salinan eksternal. Cold start, frame rate dan memori tetap target yang memerlukan pengukuran perangkat fisik.

## Tooling desain

Instal dependensi dari root (`npm ci`). Jalankan `python -m http.server 8765` dari root untuk membuka `http://localhost:8765/tools/studio/index.html`.

- `node tools/render_png.mjs`: render referensi model melalui `tools/render.html`.
- `node tools/render-2_5d.cjs`: regenerasi referensi state engine melalui `tools/render-2_5d.html`.
- `npm run test:mascots`: pemeriksaan engine/state dan aset runtime yang dibutuhkan clone; tidak bergantung pada master mentah eksternal.

PNG desain dipertahankan karena direferensikan `.pen`, sedangkan aplikasi memakai Canvas dan GLB. Pemeriksaan aktif dan status perangkat ada pada [QA](10-qa-backlog.md) serta [task](task.md).
