import { expect, it } from 'vitest'
import { savingsErrorMessage } from '@/features/savings/errors'

it.each([
  ['ERR_AMOUNT_INVALID — Nominal harus lebih dari 0 rupiah utuh.', 'Masukkan nominal rupiah utuh lebih dari 0, misalnya 10000.'],
  ['ERR_AMOUNT_INVALID — Total nominal melewati batas hitungan aman.', 'Total nominal terlalu besar. Kurangi nominal lalu coba lagi.'],
  ['ERR_NOTE_REQUIRED — Catatan wajib diisi.', 'Isi catatan pemakaian dana sebelum menyimpan.'],
  ['ERR_NOTE_REQUIRED — Lengkapi catatan kebutuhan darurat.', 'Lengkapi catatan kebutuhan darurat sebelum menyimpan.'],
  ['ERR_KOMPARTEMEN_KURANG — Saldo Allocation tinggal Rp 20.000.', 'Saldo Allocation tinggal Rp 20.000. Kurangi nominal atau pilih sumber dana lain.'],
  ['ERR_KOMPARTEMEN_KURANG', 'Saldo tabungan tidak cukup. Kurangi nominal atau pilih sumber dana lain.'],
  ['ERR_SALDO_KURANG — Saldo periode tinggal Rp 10.000.', 'Saldo periode tinggal Rp 10.000. Kurangi nominal setoran atau catat pemasukan terlebih dahulu.'],
  ['ERR_SALDO_KURANG', 'Saldo periode tidak cukup. Kurangi nominal setoran atau catat pemasukan terlebih dahulu.'],
  ['ERR_JATAH_HABIS — Jatah Tabungan tinggal Rp 5.000.', 'Jatah Tabungan tinggal Rp 5.000. Kurangi nominal setoran atau sesuaikan alokasi bucket.'],
  ['ERR_JATAH_HABIS', 'Jatah bucket tabungan tidak cukup. Kurangi nominal setoran atau sesuaikan alokasi bucket.'],
  ['ERR_GOAL_BELUM_CUKUP — Dana Allocation sudah terpakai.', 'Dana tujuan belum cukup. Tambah setoran ke Allocation atau sesuaikan target tujuan.'],
  ['ERR_GOAL_ALREADY_USED', 'Tujuan ini sudah digunakan atau dihapus. Tutup dialog lalu periksa riwayat tujuan.'],
  ['ERR_SAVINGS_SOURCE', 'Pilih sumber dana Sisa atau Dari Allocation sebelum menyimpan.'],
  ['ERR_BUCKET_INVALID', 'Bucket tabungan belum tersedia. Periksa pengaturan bucket lalu coba lagi.'],
  ['ERR_PERIODE_TERKUNCI', 'Periode ini sudah ditutup. Catat transaksi di periode berjalan.'],
  ['ERR_TRANSACTION_STALE', 'Transaksi sudah berubah. Tutup detail lalu buka kembali sebelum mengedit.'],
  ['ERR_DATE_INVALID', 'Pilih tanggal yang valid dan tidak melebihi hari ini.'],
  ['ERR_PROFILE_MISSING', 'Profil belum tersedia. Muat ulang Monee lalu coba lagi.'],
  ['Target tujuan berubah. Buka kembali konfirmasi untuk melihat nominal terbaru.', 'Target tujuan berubah. Buka kembali konfirmasi untuk melihat nominal terbaru.'],
  ['Urutan tujuan berubah. Buka ulang halaman dan coba lagi.', 'Urutan tujuan berubah. Buka ulang halaman dan coba lagi.'],
  ['Tujuan ini sudah digunakan dan tersimpan di riwayat.', 'Tujuan ini sudah digunakan dan tersimpan di riwayat.'],
  ['Isi nama tujuan dan target rupiah yang valid.', 'Isi nama tujuan dan target rupiah yang valid.'],
])('turns %s into an actionable savings message', (message, expected) => {
  expect(savingsErrorMessage(new Error(message), 'Coba lagi.')).toBe(expected)
})

it.each([undefined, 'ERR_AMOUNT_INVALID', new Error('ERR_UNKNOWN — internal detail'), new Error('IDBDatabase transaction failed'), new DOMException('The quota has been exceeded.', 'QuotaExceededError')])('uses the operation fallback for an unknown failure: %s', cause => {
  expect(savingsErrorMessage(cause, 'Setoran belum tersimpan. Coba lagi.')).toBe('Setoran belum tersimpan. Coba lagi.')
})
