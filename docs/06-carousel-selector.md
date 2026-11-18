# 06 ? Pemilih maskot dan tema

## Implementasi saat ini

`src/features/mascot/MascotCarousel.tsx` menampilkan tiga karakter melalui `MascotCanvas`: Mochi, Luna dan Bumi. Seluruh aplikasi menggunakan engine Canvas 2.5D yang sama. GLB, Three.js, decoder Draco dan generator snapshot telah dihapus. PNG mockup tetap menjadi referensi desain dan tidak dimuat aplikasi.

Referensi gerak: ReactBits Gradient Carousel. Aplikasi memakai implementasi sendiri; rincian animasi ditetapkan oleh komponen dan CSS aktif, bukan spesifikasi renderer lama.

## Interaksi

| Kontrol | Perilaku |
|---|---|
| Tombol kiri/kanan | Pindah pilihan satu langkah dan berputar tanpa ujung |
| Pilihan samping | Menjadikan pilihan tersebut aktif |
| Swipe/drag horizontal | Pindah sesuai arah setelah melewati ambang; scroll vertikal tetap tersedia |
| Wheel | Mengakumulasi gerak lalu pindah pilihan, tanpa berhenti di pilihan terakhir |
| Keyboard | Panah/Home/End memilih; Enter menerapkan |
| Pilih Maskot ini | Menyimpan pilihan, menampilkan loading dan menonaktifkan interaksi selama proses |

Pilihan aktif mempratinjau tema. Menutup pemilih tanpa menerapkan mengembalikan tema sebelumnya. Kegagalan penyimpanan juga memulihkan tema; penyimpanan berhasil mempertahankan pilihan. Permintaan ganda ditahan selama penyimpanan berjalan.

## Tampilan dan aksesibilitas

- Judul berada pada layout halaman/dialog induk; carousel tidak menambahkan card header.
- Pilihan tengah lebih besar daripada dua tetangga. Nama, tema dan karakter muncul pada satu area keterangan.
- Tiga pratinjau tanpa kartu memakai ukuran responsif dan tetap terpasang ketika pilihan berpindah. Maskot yang berputar ke ujung lain memudar di belakang pilihan tengah, dengan lintasan kiri/kanan yang simetris.
- Stage memakai `role=listbox`, `aria-activedescendant`, fokus keyboard dan opsi berlabel dengan `aria-selected`. Keterangan aktif diumumkan melalui live region.
- Tombol sebelumnya/berikutnya memiliki label aksesibel dan focus ring.
- Perpindahan memakai transisi/keyframe CSS selama 350 ms. Nama animasi dibedakan menurut arah agar pembalikan arah langsung memulai lintasan yang benar. Reduced-motion meniadakan gerak tersebut dan membuat Canvas statis; dokumen tersembunyi menghentikan animasi Canvas.
- Gesture sentuh mempertahankan drag ketika implicit pointer capture berpindah dari opsi ke stage. Scroll vertikal dan gesture yang dibatalkan tidak mengganti pilihan.

## Sumber dan pemeriksaan

- Komponen: `MascotCarousel.tsx`, `MascotCanvas.tsx`, `carousel-math.ts`, `mascot-carousel.css`.
- Token: `src/theme/mascot-themes.ts` dan `src/theme/tokens.css`.
- Studio aset terpisah: `tools/studio/index.html`.
- Regresi: tes matematika/komponen carousel, pemeriksaan aset maskot serta E2E desktop/mobile. E2E mengirim input sentuh CDP asli untuk putaran penuh dua arah, pembatalan/scroll vertikal, serta memeriksa keyframe saat arah tombol dibalik.
- Status produk: [task](task.md). Bukti terbaru hanya di `LOCAL_REPORT.md` pada root proyek, diabaikan Git.
