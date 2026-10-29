# 12 - Kontrak desain UI/UX

Sumber desain: `design/monee.pen`. Tabel berikut mengindeks frame desain; tanda selesai adalah status canvas, bukan bukti fungsi aplikasi atau model OCR telah diuji. Status implementasi dan pekerjaan tersisa ada pada [task](task.md).

## Frame desain

| # | Gate | Isi | Frame di pen.dev | Status |
|---|------|-----|------------------|--------|
| G-0 | Design System & Tokens | Palet Warm Clay, type scale, radius, elevation, komponen inti, kartu maskot | `G-0: Design System - Warm Clay` | ✓ |
| G-1 | Dashboard | FlipCard saldo (depan=Saldo, belakang=Tabungan) + maskot 2.5D ngintip, bucket progress 4+1, 2 kompartemen tabungan, 5 transaksi terakhir, nav Dana-style + FAB tengah | `G-1: Dashboard` | ✓ |
| G-1b | Dashboard (FlipCard belakang) | Sisi belakang FlipCard sesuai D39: tampilan Tabungan (total + 2 kompartemen + goals + ledger ringkas + aksi setor/pakai), mengganti seluruh isi dashboard | `G-1b: Dashboard (FlipCard Belakang)` | ✓ |
| G-2 | Quick-Add Sheet | RubberSegment tipe (thumb rounded-rect), input nominal + quick amount, entry point Scan struk, grid kategori 10 expense, bucket chip 5 (disabled kalau jatah habis), tanggal & catatan, FuseButton idle + hint undo 2d, inline error `ERR_JATAH_HABIS` / `ERR_SALDO_KURANG` | `G-2: Quick Add Sheet` | ✓ |
| G-2b | Quick-Add (FuseButton armed) | Fase armed (rim oranye terbakar, seluruh pill = Batal) + fuse track + fase settled "Tersimpan" | `G-2b: Quick Add (FuseButton Armed)` | ✓ |
| G-3a | Onboarding · Nama | Langkah 1 dari 5. Maskot terpusat pada stage216, label Nama panggilan, field dan CTA terpisah jelas. | `G-3a: Nama` | ✓ |
| G-3b | Onboarding · Tambah pemasukan | Langkah 2 dari 5. Form `income` biasa, 4 kategori pemasukan, tanggal/catatan, Catat & lanjut dan Lewati dulu. First-run-only. | `G-3b: Tambah Pemasukan` | ✓ |
| G-3c | Onboarding · Alokasi | Langkah 3 dari 5. Preset, total100%, editor5 bucket dan toggle `allowOverbudget`. | `G-3c: Alokasi` | ✓ |
| G-3d | Onboarding · Maskot | Langkah 4 dari 5. Kartu aktif terpusat, side cards simetris, skala karakter dinormalisasi terhadap area terlihat. | `G-3d: Pilih Maskot` | ✓ |
| G-3e | Onboarding · Set PIN | Langkah 5 dari 5. 6 CodeSlots, peringatan tanpa pemulihan PIN, checkbox, CTA masuk. | `G-3e: Set PIN` | ✓ |
| G-4 | Lock Screen PIN | Maskot 2.5D, sapaan, error state "PIN salah · sisa 2 percobaan", CodeSlots status error (border danger, digit dimask), catatan data lokal | `G-4: Lock Screen PIN` | ✓ |
| G-5 | Riwayat | Ringkasan 3 kolom, RubberSegment periode (Hari/Minggu/Bulan/Tahun), filter bar, grup per tanggal dengan subtotal | `G-5: Riwayat` | ✓ |
| G-6 | Tabungan | Hero total, kompartemen Sisa + Allocation, ledger tabungan tanpa kategori, pengeluaran darurat/investasi (catatan wajib), setoran, wishlist goal (drag reorder, badge Tercapai, tombol Gunakan), progress per goal | `G-6: Tabungan` | ✓ |
| G-7 | Voice Mode | Halo maskot listening, mic besar, transcript live + status parsing, draft transaksi 5 baris, tombol Edit/Simpan + fallback manual | `G-7: Voice Mode` | ✓ |
| G-8 | Settings / Atur | Profil, grup Profil/Uang/Keamanan/Data/Lainnya, icon tile per menu, nilai & chevron, nudge export backup, versi. Sub-halaman kategori harus memuat 14 kategori (10 expense + 4 income) | `G-8: Atur` | ✓ |
| G-9a | Scan Struk (capture) | Viewfinder gelap + bracket corner, preview struk, shutter/galeri/flash, banner privasi "foto nggak disimpan", 3 langkah, CTA Ambil Foto | `G-9a: Scan Struk` | ✓ |
| G-9b | Review Struk (multi-item) | Total struk + confidence, 4 item terpisah 1 bucket each, assign bucket per item, warning item tanpa bucket, aksi Gabung item, hapus per item, CTA "Simpan N Transaksi" | `G-9b: Review Struk` | ✓ |
| G-R | Responsive | Tablet 768px (sidebar ikon + konten max 720px), Desktop 1024px+ (sidebar 130px + konten 480–520px + kolom analitik 280–320px), chart by kategori, insight card. Tidak ada max-width 370px (D55) | `G-R: Responsive Desktop & Tablet` | ✓ |
| G-C | ReactBits Components | Spec + state lengkap 4 komponen: FuseButton (3 fase + 23 prop), CodeSlots (3 status + geometri), RubberSegment (thumb + spring), FlipCard (depan/belakang), catatan implementasi | `G-C: ReactBits Components` | ✓ |
| G-N | Navbar Motion Spec | Anatomi nav, timeline 4 frame (0/90/180/260ms), pill morph + squash, transisi konten parallax, maskot bereaksi per tab, aturan main (≤300ms, ≤3 layer, reduced-motion) | `G-N: Navbar Motion Spec` | ✓ |
| G-T | Navbar Theme Variations | Navbar 3 tema maskot (Mochi/Luna/Bumi) dengan notch + tombol bulat, tabel token nav per tema | `G-T: Navbar Theme Variations` | ✓ |
| G-E | Empty State | Pola data kosong: maskot 2.5D `idle` di blob `accent-soft`, judul, body, CTA utama, aksi sekunder, penutup, navbar tetap ada | `G-E: Empty State` | ✓ |
| G-X | Error State | Pola gagal dimuat: maskot 2.5D `sad` + badge `st-danger`, judul, body, chip kode error, tombol retry, link laporan, assurance, navbar tetap ada | `G-X: Error State` | ✓ |
| G-2c | Saldo kurang | Nominal dipertahankan, error dekat nominal, simpan nonaktif | `G-2c: Quick Add - Saldo Kurang` | ✓ |
| G-6a | Setor tabungan | Sumber saldo periode, tujuan Allocation, goal terisi menurut prioritas, tanpa pilihan goal langsung | `G-6a: Setor Tabungan` | ✓ |
| G-6b | Pakai tabungan | Sumber Sisa/Allocation, catatan wajib, preset investasi hanya Sisa, warning dampak ke goal | `G-6b: Pakai Tabungan - Sisa` | ✓ |
| G-6c | Goal kembali aktif | Allocation Rp1.200.000 menjadi Rp900.000, goal Rp1.000.000 turun menjadi 90%, Gunakan nonaktif | `G-6c: Goal Kembali Aktif` | ✓ |
| G-8a | Kategori | Tepat 10 pengeluaran dan 4 pemasukan, ikon Lucide, Tabungan berarti setoran | `G-8a: Kategori` | ✓ |
| G-R2 | Mobile sempit | Dashboard, Quick-Add dan onboarding pemasukan pada lebar nyata375px | `G-R2: Mobile 375px` | ✓ |

## Keputusan yang berlaku

- Identitas Warm Clay: pasir hangat, aksen olive/biru/amber sesuai maskot, navbar cokelat gelap; Baloo 2/Nunito dan ikon Lucide. Token aktif berasal dari `src/theme/tokens.css` dan `src/theme/mascot-themes.ts` (dok 04).
- Onboarding lima langkah: nama -> pemasukan biasa opsional -> alokasi -> maskot -> PIN. Pemasukan hanya ditawarkan pada onboarding pertama. Lewati tidak membuat transaksi Rp0 dan tidak memicu prompt berulang; saldo berasal dari income normal, tanpa field saldo awal khusus (D56).
- Dashboard depan dan belakang FlipCard mengganti seluruh konteks: saldo periode/bucket/riwayat versus total tabungan/Sisa/Allocation/goal/ledger/aksi. Dua saldo tidak dicampur.
- Maskot harian memakai Canvas 2.5D; GLB hanya pada selector melalui snapshot WebP frontal. PNG adalah referensi desain. Normalisasi model memakai bounding box dan kartu aktif terpusat; wajah tidak menimpa nominal, field atau CTA.
- State machine mengatur reaksi sementara dan pemulihan base state. Tema selector hanya tersimpan saat Terapkan; batal/gagal memulihkan tema awal.
- Navbar ada di Home/Riwayat/Tabungan/Atur, termasuk empty/error state. Onboarding, lock dan subalur Quick-Add/voice/struk tidak menampilkan navbar aktif. Di >=768px sidebar menggantikan bottom nav (80px ikon pada tablet, 130px dengan label pada desktop).
- Bottom nav memakai cekungan di tengah dan tombol bulat 60px, empat item simetris 2 kiri/2 kanan. Path notch harus benar-benar cekung dan tidak terpotong viewBox; aksen navbar berubah per tema tanpa mengubah strukturnya.
- Motion tab memakai pill/squash, parallax, ikon pop dan reaksi maskot: total <=300ms, maksimal tiga layer stagger. Reduced-motion mengganti spring dengan transisi ringan <=120ms; Canvas statis, selector daftar sederhana dan animasi berhenti saat dokumen tersembunyi.
- FuseButton mempunyai idle -> armed -> settled. Simpan memberi jendela batal 2 detik; Hapus/Refund/Gunakan goal 4 detik. Seluruh pill pada armed adalah aksi Batal; tampilkan countdown yang dapat dibaca. CodeSlots enam slot 44 x 44 radius12 memask digit, RubberSegment memakai thumb rounded-rect radius14, FlipCard memiliki kedua sisi penuh.
- Empty/error memakai satu judul, body, paling banyak satu CTA utama dan satu aksi sekunder. Error mempunyai retry, chip kode dan assurance; draft validasi tidak hilang.
- UI mempertahankan hard cap non-Tabungan, pemeriksaan saldo, periode terkunci, ledger tabungan tanpa kategori, sumber wajib dan goal derived yang dapat regress (dok 08). Desain tidak mengubah aturan engine.

## Struk v1

Frame G-9a/G-9b adalah acuan input gambar dan review beberapa item. Model/provider OCR belum dipilih; implementasi v1 menyiapkan capture/galeri, item manual dan batas provider. Jangan menganggap teks confidence atau isi contoh pada canvas sebagai hasil pembacaan foto nyata.

Satu item expense mempunyai kategori dan satu bucket; implementasi saat ini mendukung koreksi, tambah dan hapus sebelum konfirmasi simpan atomik seluruh batch. Tombol gabung, viewfinder/flash kamera khusus dan confidence pada canvas tetap rancangan. Foto sementara hanya di memori sesi, tidak disimpan pada ledger/backup dan belum diunggah. Pemilihan OCR lokal/cloud dilakukan kemudian; provider cloud membutuhkan penjelasan dan persetujuan pengguna sebelum mengirim gambar. Kontrak lengkap: [AI](07-ai-features.md).

## Gate review perubahan desain

- Pastikan layout dan konten tidak terpotong, field/CTA terbaca, alignment/spacing konsisten dan tidak ada placeholder yang disajikan sebagai data pengguna.
- Target interaksi minimal 44px, kontras AA, label/focus/keyboard serta error dekat field. Jangan menyimpulkan aksesibilitas runtime hanya dari canvas.
- Periksa 320/375/768/1024/1280/1366/1440/1920px dan landscape ponsel/tablet. Pada >=768px dialog terpusat; onboarding maksimal 560px. Dua kolom bucket/Tabungan berlaku pada viewport >=1280px dengan container main >=600px.
- Review gambar hasil render pada ukuran nyata. Side cards carousel boleh terpotong sebagai petunjuk swipe; konten utama tidak boleh terpotong.
- Cek reduced-motion, hidden document, dialog/footer/safe area dan input panjang pada aplikasi berjalan. Bukti emulasi tidak menggantikan perangkat fisik.

## Menyimpan sumber desain

`design/monee.pen` tidak auto-save. Setelah mengubah di aplikasi Pen, tekan Ctrl+S (Cmd+S di macOS) dan periksa melalui pen.dev bahwa perubahan tersimpan. Metadata filesystem boleh digunakan untuk memastikan file berubah.

Akses isi `.pen` melalui MCP pen.dev; jangan membaca, mengurai atau menulis isi desain langsung melalui skrip/filesystem. `mascots/png/` dan `mascots/png2_5d/` tetap dipertahankan karena menjadi referensi desain. Regenerasi mockup 2.5D: `node tools/render-2_5d.cjs` dengan dependensi root.

Lisensi/adaptasi ReactBits berada di `src/components/reactbits/LICENSE.md`; provenance upstream berada di `src/components/reactbits/upstream.json`. Komponen aktif menggunakan framer-motion dan Lucide. Panduan aset dan renderer ada pada [dok 11](11-asset-implementation-guide.md).
