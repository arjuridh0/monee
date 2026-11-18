# 11 - Implementasi aset maskot

Satu engine `mascots/core/`, tiga karakter (`mochi`, `luna`, `bumi`) dan 14 state digunakan bersama aplikasi dan tooling. Komponen aplikasi memakai wrapper yang sudah ada; tidak perlu menyalin engine JavaScript menjadi TypeScript atau membuat wrapper kedua.

## Sumber aset

| Sumber | Fungsi |
|---|---|
| `mascots/core/mascot_canvas.js`, `states.js`, `draw_util.js` | Controller, state dan helper Canvas 2D |
| `mascots/mochi.js`, `luna.js`, `bumi.js`, `index.js` | Gambar/perilaku tiap karakter dan registry |
| `mascots/png/`, `mascots/png2_5d/` | Referensi PNG yang dipakai sumber desain `design/monee.pen` |
| `tools/studio/index.html` | Satu studio untuk melihat carousel dan Canvas 2.5D |

Model 3D dan decoder telah dihapus pada perbaikan November 2026. Font, ikon dan engine 2.5D masuk build/PWA; tidak ada unduhan model tambahan saat memilih maskot. Referensi 3D pada dokumen desain lama adalah riwayat implementasi.

## Rendering aplikasi

- `src/features/mascot/MascotCanvas.tsx` membungkus engine Canvas 2.5D untuk onboarding, lock, dashboard, voice dan review struk. Panggil cleanup ketika unmount; reduced-motion memakai frame statis dan dokumen tersembunyi menghentikan pekerjaan animasi.
- `src/features/mascot/MascotCarousel.tsx` memakai tiga `MascotCanvas` tanpa kartu. Indeks modular membuat pilihan berputar dua arah melalui tombol, keyboard, swipe dan roda gulir.
- Preview memakai engine yang sama dengan maskot harian. Pergantian potret memiliki transisi 280 ms; reduced-motion mengganti pilihan langsung.
- Pemilihan menyimpan tema hanya setelah penyimpanan berhasil. Keluar tanpa menerapkan memulihkan tema sebelumnya. Kontrol dinonaktifkan selama menyimpan.

Swipe mempratinjau token tema; Terapkan menyimpan pilihan. Batal atau Apply gagal memulihkan tema awal. Token runtime Warm Clay v2 berasal dari `src/theme/mascot-themes.ts` dan `src/theme/tokens.css`: Mochi `#4F7C3A`, Luna `#3F6FB5`, Bumi `#9C641D`. Registry `mascots/index.js` hanya mengekspor karakter; palet studio lama yang tidak digunakan telah dihapus.

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

## Ukuran dan performa

Penghapusan enam aset model/decoder mengurangi sumber publik sebesar 9.556.452 byte. Engine dimuat secara dinamis dan animasinya berhenti saat dokumen tersembunyi. Performa perangkat fisik tetap perlu diperiksa terpisah dari emulasi browser.

## Tooling desain

Instal dependensi dari root (`npm ci`). Jalankan `python -m http.server 8765` dari root untuk membuka `http://localhost:8765/tools/studio/index.html`.

- `node tools/render-2_5d.cjs`: regenerasi referensi state engine melalui `tools/render-2_5d.html`.
- `npm run test:mascots`: pemeriksaan engine/state dan aset runtime yang dibutuhkan clone; tidak bergantung pada master mentah eksternal.

PNG desain dipertahankan karena direferensikan `.pen`, sedangkan aplikasi memakai Canvas 2.5D. Pemeriksaan aktif dan status perangkat ada pada [QA](10-qa-backlog.md) serta [task](task.md).
