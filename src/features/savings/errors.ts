/** Translate domain failures at the UI boundary; persistence keeps its error codes. */
export function savingsErrorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback
  const message = cause.message.trim()
  const code = /^ERR_[A-Z_]+\b/.exec(message)?.[0]
  const detail = message.replace(/^ERR_[A-Z_]+\s*[—–:-]?\s*/, '')
  switch (code) {
    case 'ERR_AMOUNT_INVALID':
      return detail.startsWith('Total nominal')
        ? 'Total nominal terlalu besar. Kurangi nominal lalu coba lagi.'
        : 'Masukkan nominal rupiah utuh lebih dari 0, misalnya 10000.'
    case 'ERR_NOTE_REQUIRED':
      return detail.includes('darurat') ? 'Lengkapi catatan kebutuhan darurat sebelum menyimpan.' : 'Isi catatan pemakaian dana sebelum menyimpan.'
    case 'ERR_KOMPARTEMEN_KURANG':
      return `${detail.startsWith('Saldo ') ? detail : 'Saldo tabungan tidak cukup.'} Kurangi nominal atau pilih sumber dana lain.`
    case 'ERR_SALDO_KURANG':
      return `${detail.startsWith('Saldo periode ') ? detail : 'Saldo periode tidak cukup.'} Kurangi nominal setoran atau catat pemasukan terlebih dahulu.`
    case 'ERR_JATAH_HABIS':
      return `${detail.startsWith('Jatah ') ? detail : 'Jatah bucket tabungan tidak cukup.'} Kurangi nominal setoran atau sesuaikan alokasi bucket.`
    case 'ERR_GOAL_BELUM_CUKUP':
      return 'Dana tujuan belum cukup. Tambah setoran ke Allocation atau sesuaikan target tujuan.'
    case 'ERR_GOAL_ALREADY_USED':
      return 'Tujuan ini sudah digunakan atau dihapus. Tutup dialog lalu periksa riwayat tujuan.'
    case 'ERR_SAVINGS_SOURCE':
      return 'Pilih sumber dana Sisa atau Dari Allocation sebelum menyimpan.'
    case 'ERR_BUCKET_INVALID':
      return 'Bucket tabungan belum tersedia. Periksa pengaturan bucket lalu coba lagi.'
    case 'ERR_PERIODE_TERKUNCI':
      return 'Periode ini sudah ditutup. Catat transaksi di periode berjalan.'
    case 'ERR_TRANSACTION_STALE':
      return 'Transaksi sudah berubah. Tutup detail lalu buka kembali sebelum mengedit.'
    case 'ERR_DATE_INVALID':
      return 'Pilih tanggal yang valid dan tidak melebihi hari ini.'
    case 'ERR_PROFILE_MISSING':
      return 'Profil belum tersedia. Muat ulang Monee lalu coba lagi.'
  }
  // These domain messages are already written for people. Unknown storage or
  // platform exceptions use the operation's fallback rather than leaking details.
  if (!code && /^(Tujuan ini sudah digunakan|Target tujuan berubah|Urutan tujuan berubah|Isi nama tujuan dan target rupiah yang valid\.)/.test(message)) return message
  return fallback
}
