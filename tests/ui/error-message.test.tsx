import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { InlineError } from '@/components/ui/feedback'
import { FuseButton } from '@/components/reactbits/FuseButton'
import { toUserFacingErrorMessage } from '@/components/ui/error-message'

afterEach(cleanup)

it.each([
  ['ERR_UNKNOWN_INTERNAL — database objectStore stack details', 'Proses belum berhasil. Periksa isian lalu coba lagi.'],
  ['ERR_AMOUNT_INVALID — Catatan memuat ERR_REFERENCE.', 'Catatan memuat ERR_REFERENCE.'],
  ['ERR_AMOUNT_INVALID:\nPeriksa nominal.\nGunakan rupiah utuh.', 'Periksa nominal.\nGunakan rupiah utuh.'],
  ['ERR_AMOUNT_INVALID -', 'Masukkan nominal rupiah utuh lebih dari 0.'],
  ['ERR_DATE_INVALID', 'Pilih tanggal yang valid dan tidak melebihi hari ini.'],
  ['ERR_CURRENT_PIN', 'PIN sekarang belum cocok. Periksa kembali PIN yang dimasukkan.'],
  ['ERR_BACKUP_DECRYPT', 'Backup belum bisa dibuka. Periksa kata sandi dan file backup lalu coba lagi.'],
  ['ERR_TRANSACTION_STALE', 'Transaksi sudah berubah. Buka kembali detail transaksi lalu coba lagi.'],
  ['ERR_DATA_READ', 'Data belum bisa dibaca. Muat ulang Monee lalu coba lagi.'],
  ['', ''],
  ['  ', '  '],
])('formats only the recognized complete error syntax: %s', (input, expected) => {
  expect(toUserFacingErrorMessage(input)).toBe(expected)
})

it.each([
  ['ERR_AMOUNT_INVALID — Nominal harus lebih dari 0 rupiah utuh.', 'Nominal harus lebih dari 0 rupiah utuh.'],
  ['ERR_REFUND_INVALID - Periksa nominal refund.', 'Periksa nominal refund.'],
  ['ERR_DATE_INVALID: Tanggal transaksi tidak boleh di masa depan.', 'Tanggal transaksi tidak boleh di masa depan.'],
  ['ERR_BUCKET_INVALID – Pilih bucket pengeluaran.', 'Pilih bucket pengeluaran.'],
  [' ERR_SALDO_KURANG — Saldo periode tinggal Rp 10.000. ', 'Saldo periode tinggal Rp 10.000.'],
  ['ERR_AMOUNT_INVALID', 'Masukkan nominal rupiah utuh lebih dari 0.'],
  ['ERR_PROFILE_MISSING', 'Profil belum tersedia. Muat ulang Monee lalu coba lagi.'],
  ['ERR_NOTE_REQUIRED — ', 'Isi catatan sebelum menyimpan.'],
  ['ERR_UNKNOWN_INTERNAL', 'Proses belum berhasil. Periksa isian lalu coba lagi.'],
])('renders %s as an accessible human error', (message, expected) => {
  render(<InlineError id="test-error" className="custom-error" aria-atomic="true">{message}</InlineError>)
  const error = screen.getByRole('alert')
  expect(error).toHaveTextContent(expected)
  expect(error).not.toHaveTextContent(/ERR_[A-Z_]+/)
  expect(error).toHaveAttribute('id', 'test-error')
  expect(error).toHaveClass('ui-error', 'custom-error')
  expect(error).toHaveAttribute('aria-atomic', 'true')
})

it.each([
  'Periksa catatan ERR_AMOUNT_INVALID sebelum melanjutkan.',
  'Kode referensi: ERR_PROFILE_MISSING',
  'ERR_AMOUNT_INVALID adalah isi catatan pengguna.',
  'ERR_amount_invalid — isi pengguna',
  'ERR_AMOUNT_INVALID_suffix — isi pengguna',
  '  Nominal belum diisi.  ',
])('preserves ordinary content without removing embedded codes: %s', message => {
  render(<InlineError>{message}</InlineError>)
  expect(screen.getByRole('alert').querySelector('span')?.textContent).toBe(message)
})

it('preserves nonstring React children, including their structure and callbacks', () => {
  const retry = document.createElement('span')
  render(<InlineError><strong>ERR_AMOUNT_INVALID</strong> <a href="/help">Baca petunjuk</a><button type="button" onClick={() => { retry.textContent = 'retried' }}>Coba lagi</button></InlineError>)
  expect(screen.getByRole('alert').querySelector('strong')).toHaveTextContent('ERR_AMOUNT_INVALID')
  expect(screen.getByRole('link', { name: 'Baca petunjuk' })).toHaveAttribute('href', '/help')
  fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))
  expect(retry.textContent).toBe('retried')
})

it('retains numeric children', () => {
  render(<InlineError>{0}</InlineError>)
  expect(screen.getByRole('alert')).toHaveTextContent('0')
})

it('does not flatten or rewrite an array of React children', () => {
  render(<InlineError>{['ERR_AMOUNT_INVALID', ' — ', 'Catatan pengguna']}</InlineError>)
  expect(screen.getByRole('alert')).toHaveTextContent('ERR_AMOUNT_INVALID — Catatan pengguna')
})

it('covers FuseButton failures through its existing InlineError renderer', async () => {
  render(<FuseButton label="Simpan" onCommit={async () => { throw new Error('ERR_AMOUNT_INVALID — Periksa nominal setoran.') }}
    onUndo={() => {}} getErrorMessage={cause => cause instanceof Error ? cause.message : 'Coba lagi.'} />)
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Periksa nominal setoran.')
  expect(screen.getByRole('alert')).not.toHaveTextContent('ERR_AMOUNT_INVALID')
  expect(screen.getByRole('button', { name: 'Simpan' })).toBeEnabled()
})
