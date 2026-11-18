const FALLBACK = 'Proses belum berhasil. Periksa isian lalu coba lagi.'

// Only recognized domain codes may expose their already human-written detail.
// Unknown codes use the fallback; ordinary text is never searched or replaced.
const CODE_MESSAGES: Readonly<Record<string, string>> = {
  ERR_AMOUNT_INVALID: 'Masukkan nominal rupiah utuh lebih dari 0.',
  ERR_DATE_INVALID: 'Pilih tanggal yang valid dan tidak melebihi hari ini.',
  ERR_NOTE_REQUIRED: 'Isi catatan sebelum menyimpan.',
  ERR_BUCKET_INVALID: 'Pilih bucket yang tersedia lalu coba lagi.',
  ERR_BUCKET_IN_USE: 'Bucket masih digunakan. Pindahkan transaksi terkait sebelum menghapusnya.',
  ERR_BUCKET_STALE: 'Bucket sudah berubah. Buka kembali pengaturan bucket lalu coba lagi.',
  ERR_ALLOCATION_INVALID: 'Periksa jatah bucket. Jumlah seluruh alokasi harus 100%.',
  ERR_ALLOCATION_STALE: 'Alokasi sudah berubah. Buka kembali pengaturan alokasi lalu coba lagi.',
  ERR_JATAH_HABIS: 'Jatah bucket tidak cukup. Kurangi nominal atau sesuaikan alokasi bucket.',
  ERR_SALDO_KURANG: 'Saldo periode tidak cukup. Kurangi nominal atau catat pemasukan terlebih dahulu.',
  ERR_KOMPARTEMEN_KURANG: 'Saldo tabungan tidak cukup. Kurangi nominal atau pilih sumber dana lain.',
  ERR_SAVINGS_SOURCE: 'Pilih sumber dana tabungan sebelum menyimpan.',
  ERR_GOAL_BELUM_CUKUP: 'Dana tujuan belum cukup. Tambah setoran atau sesuaikan target tujuan.',
  ERR_GOAL_ALREADY_USED: 'Tujuan sudah digunakan atau dihapus. Tutup dialog lalu periksa riwayat tujuan.',
  ERR_GOAL_LINK: 'Transaksi terhubung ke tujuan tabungan. Buka kembali detail tujuan lalu coba lagi.',
  ERR_REFUND_INVALID: 'Periksa nominal refund. Nominal tidak boleh melebihi sisa transaksi.',
  ERR_TRANSACTION_INVALID: 'Periksa nominal, tanggal, dan bucket transaksi lalu coba lagi.',
  ERR_TRANSACTION_STALE: 'Transaksi sudah berubah. Buka kembali detail transaksi lalu coba lagi.',
  ERR_PERIODE_TERKUNCI: 'Periode ini sudah ditutup. Catat transaksi di periode berjalan.',
  ERR_PERIOD_INVALID: 'Periksa tanggal awal periode lalu coba lagi.',
  ERR_PERIOD_STALE: 'Periode sudah berubah. Buka kembali pengaturan periode lalu coba lagi.',
  ERR_CATEGORY_INVALID: 'Pilih kategori yang tersedia lalu coba lagi.',
  ERR_CATEGORY_DUPLICATE: 'Nama kategori sudah digunakan. Pilih nama lain.',
  ERR_CATEGORY_IN_USE: 'Kategori masih digunakan. Pindahkan transaksi terkait sebelum menghapusnya.',
  ERR_CATEGORY_PROTECTED: 'Kategori bawaan ini tidak dapat dihapus.',
  ERR_CATEGORY_STALE: 'Kategori sudah berubah. Buka kembali pengaturan kategori lalu coba lagi.',
  ERR_RECURRING_CATEGORY: 'Pilih kategori pemasukan untuk template rutin.',
  ERR_RECURRING_INVALID: 'Periksa nama, nominal, dan tanggal pemasukan rutin lalu coba lagi.',
  ERR_RECURRING_STALE: 'Template rutin sudah berubah. Buka kembali template lalu coba lagi.',
  ERR_PROFILE_MISSING: 'Profil belum tersedia. Muat ulang Monee lalu coba lagi.',
  ERR_PROFILE_INVALID: 'Periksa informasi profil lalu coba lagi.',
  ERR_PROFILE_STALE: 'Profil atau PIN sudah berubah. Muat ulang Monee lalu coba lagi.',
  ERR_PIN_FORMAT: 'Masukkan PIN yang terdiri dari 6 angka.',
  ERR_PIN_SAME: 'Gunakan PIN baru yang berbeda dari PIN sekarang.',
  ERR_CURRENT_PIN: 'PIN sekarang belum cocok. Periksa kembali PIN yang dimasukkan.',
  ERR_DELETE_PIN: 'PIN belum cocok. Periksa kembali PIN sebelum menghapus data.',
  ERR_DELETE_PIN_FORMAT: 'Masukkan PIN yang terdiri dari 6 angka untuk mengonfirmasi penghapusan.',
  ERR_DELETE_PROFILE: 'Profil belum tersedia. Muat ulang Monee sebelum menghapus data.',
  ERR_DELETE_STALE: 'Data sudah berubah. Buka kembali konfirmasi penghapusan lalu coba lagi.',
  ERR_BACKUP_DECRYPT: 'Backup belum bisa dibuka. Periksa kata sandi dan file backup lalu coba lagi.',
  ERR_BACKUP_INVALID: 'File backup tidak valid. Pilih file backup Monee yang sesuai.',
  ERR_BACKUP_TOO_LARGE: 'File backup terlalu besar. Pilih file backup Monee yang lebih kecil.',
  ERR_DATA_READ: 'Data belum bisa dibaca. Muat ulang Monee lalu coba lagi.',
  ERR_SESSION_CANCELLED: 'Sesi dibatalkan. Buka kembali Monee lalu coba lagi.',
}

/** Presentation only: persistence and caller error values stay unchanged. */
export function toUserFacingErrorMessage(message: string): string {
  const match = /^(ERR_[A-Z_]+)(?:\s*[—–:-]\s*([\s\S]*))?$/.exec(message.trim())
  if (!match) return message
  const code = match[1]!
  const knownMessage = CODE_MESSAGES[code]
  if (!knownMessage) return FALLBACK
  return match[2]?.trim() || knownMessage
}
