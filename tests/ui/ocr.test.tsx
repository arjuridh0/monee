import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { DEFAULT_BUCKETS, DEFAULT_CATEGORIES } from '@/core/db/repositories'
import { useMoneeStore } from '@/store'
import { ReceiptDialog } from '@/features/ocr/ReceiptDialog'
import type { ReceiptRecognizer, ReceiptResult } from '@/features/ocr/receipt'
import { QuickAddDialog } from '@/features/transactions/QuickAddDialog'

const save = vi.fn()
const file = () => new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' })
function upload(value = file()) { fireEvent.change(screen.getByLabelText('Foto struk'), { target: { files: [value] } }) }
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:receipt') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  save.mockReset().mockResolvedValue(undefined)
  useMoneeStore.setState({ ...useMoneeStore.getInitialState(), isLoaded: true, isLocked: false,
    buckets: DEFAULT_BUCKETS, categories: DEFAULT_CATEGORIES, saveReceiptExpenses: save,
  }, true)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(document, 'visibilityState') })

it('opens lazy receipt entry from quick add', async () => {
  render(<QuickAddDialog open onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Scan struk' }))
  await waitFor(() => expect(screen.getByLabelText('Foto struk')).toBeVisible())
})
it('formats reviewed totals using the saved currency preference', () => {
  useMoneeStore.setState({ profile: { id: 'profile', name: 'Nara', mascotId: 'mochi', pinHash: 'hash', pinSalt: 'salt',
    periodStartDay: 1, defaultBucketId: 'bucket-needs', createdAt: 0, currency: { code: 'IDR', format: '#.###' } } })
  render(<ReceiptDialog onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('Nominal item 1 (Rp)'), { target: { value: '12000' } })
  expect(screen.getByText('Total item: 12.000')).toBeVisible()
})
it('honestly reports the unconfigured model and supports reviewed manual batch save', async () => {
  const close = vi.fn()
  render(<ReceiptDialog onClose={close} />)
  expect(screen.getByText(/Model pembaca otomatis belum dikonfigurasi/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Baca otomatis' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Nama toko (opsional)'), { target: { value: 'Warung' } })
  fireEvent.change(screen.getByLabelText('Nama item 1'), { target: { value: 'Nasi' } })
  fireEvent.change(screen.getByLabelText('Nominal item 1 (Rp)'), { target: { value: '12000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tambah item' }))
  fireEvent.change(screen.getByLabelText('Nama item 2'), { target: { value: 'Kopi' } })
  fireEvent.change(screen.getByLabelText('Nominal item 2 (Rp)'), { target: { value: '5000' } })
  expect(screen.getByText('Total item: Rp17.000')).toBeVisible()
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Kategori item 1').querySelector('[value="cat-tabungan"]')).toBeNull()
  expect(screen.getByLabelText('Bucket item 1').querySelector('[value="bucket-savings"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Simpan semua item' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledOnce()
  expect(save.mock.calls[0]![0]).toEqual([expect.objectContaining({ amount: 12000, type: 'expense', note: 'Warung · Nasi' }), expect.objectContaining({ amount: 5000, note: 'Warung · Kopi' })])
})
it('validates files, revokes previews on replacement and unmount, and never reads automatically on upload', () => {
  const recognize = vi.fn()
  const view = render(<ReceiptDialog onClose={() => {}} recognizer={recognize} />)
  upload(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))
  expect(screen.getByText(/Pilih foto JPEG/)).toBeVisible()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  upload(); upload()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  expect(recognize).not.toHaveBeenCalled()
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
})
it('requires complete positive integer items and a valid nonfuture date', async () => {
  render(<ReceiptDialog onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Simpan semua item' }))
  expect(await screen.findByText('Periksa total nominal item.')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Nominal item 1 (Rp)'), { target: { value: '1000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan semua item' }))
  expect(await screen.findByText(/Isi nama dan nominal rupiah utuh/)).toBeVisible()
  fireEvent.change(screen.getByLabelText('Nama item 1'), { target: { value: 'Kopi' } })
  fireEvent.change(screen.getByLabelText('Tanggal struk'), { target: { value: '2099-01-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan semua item' }))
  expect(await screen.findByText(/tanggal tidak boleh di masa depan/)).toBeVisible()
  expect(save).not.toHaveBeenCalled()
})
it('normalizes provider results for review and keeps rows editable before explicit save', async () => {
  const recognize: ReceiptRecognizer = vi.fn().mockResolvedValue({ merchant: ' Toko ', date: '2026-01-12', items: [{ label: ' Roti ', amount: 8000 }, { label: 'Air', amount: 2000 }], total: 11000 })
  render(<ReceiptDialog onClose={() => {}} recognizer={recognize} />)
  upload(); fireEvent.click(screen.getByRole('button', { name: 'Baca otomatis' }))
  expect(await screen.findByDisplayValue('Roti')).toBeVisible()
  expect(screen.getByLabelText('Tanggal struk')).toHaveValue('2026-01-12')
  expect(screen.getByText(/Total struk berbeda/)).toBeVisible()
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Hapus item 2' }))
  expect(screen.queryByLabelText('Nama item 2')).toBeNull()
})
it('keeps manual review when provider returns an invalid result', async () => {
  render(<ReceiptDialog onClose={() => {}} recognizer={vi.fn().mockResolvedValue({ items: [{ label: 'bad', amount: '8.000' }] })} />)
  fireEvent.change(screen.getByLabelText('Nama item 1'), { target: { value: 'Draft saya' } })
  upload(); fireEvent.click(screen.getByRole('button', { name: 'Baca otomatis' }))
  expect(await screen.findByText(/Hasil pembacaan belum valid/)).toBeVisible()
  expect(screen.getByLabelText('Nama item 1')).toHaveValue('Draft saya')
})
it.each(['close', 'unmount', 'background'] as const)('aborts recognition on %s and ignores late results', async action => {
  let signal: AbortSignal | undefined
  let resolve!: (value: ReceiptResult) => void
  const recognize: ReceiptRecognizer = vi.fn((_file, nextSignal) => { signal = nextSignal; return new Promise(done => { resolve = done }) })
  const close = vi.fn()
  const view = render(<ReceiptDialog onClose={close} recognizer={recognize} />)
  upload(); fireEvent.click(screen.getByRole('button', { name: 'Baca otomatis' }))
  if (action === 'unmount') view.unmount()
  else if (action === 'close') fireEvent.click(screen.getByRole('button', { name: 'Tutup Scan struk' }))
  else { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); fireEvent(document, new Event('visibilitychange')) }
  expect(signal?.aborted).toBe(true)
  resolve({ items: [{ label: 'Late result', amount: 1000 }] })
  await waitFor(() => expect(screen.queryByDisplayValue('Late result')).toBeNull())
  expect(save).not.toHaveBeenCalled()
})
it('retains IDs on failed save retry and prevents duplicate submission or close while saving', async () => {
  save.mockRejectedValueOnce(new Error('ERR_JATAH_HABIS'))
  const close = vi.fn()
  render(<ReceiptDialog onClose={close} />)
  fireEvent.change(screen.getByLabelText('Nama item 1'), { target: { value: 'Kopi' } })
  fireEvent.change(screen.getByLabelText('Nominal item 1 (Rp)'), { target: { value: '5000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan semua item' }))
  expect(await screen.findByText('ERR_JATAH_HABIS')).toBeVisible()
  let done!: () => void
  save.mockImplementationOnce(() => new Promise<void>(resolve => { done = resolve }))
  fireEvent.click(screen.getByRole('button', { name: 'Simpan semua item' }))
  fireEvent.click(screen.getByRole('button', { name: 'Simpan semua item' }))
  fireEvent.click(screen.getByRole('button', { name: 'Tutup Scan struk' }))
  expect(close).not.toHaveBeenCalled()
  expect(save).toHaveBeenCalledTimes(2)
  expect(save.mock.calls[0]![0]).toEqual(save.mock.calls[1]![0])
  done(); await waitFor(() => expect(close).toHaveBeenCalledOnce())
})
