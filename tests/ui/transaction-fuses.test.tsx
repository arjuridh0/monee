import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuickAddDialog } from '@/features/transactions/QuickAddDialog'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { seedDefaultData, transactionRepo, profileRepo } from '@/core/db/repositories'
import { useMoneeStore } from '@/store'
import { getToday } from '@/core/finance/period'
import { HistoryScreen } from '@/features/history/HistoryScreen'
import { WelcomeDashboard } from '@/features/onboarding/WelcomeDashboard'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span>Teman Monee</span> }))

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
  const db = await openDatabase(); await seedDefaultData(db)
  await transactionRepo.save(db, { id: 'income', type: 'income', amount: 1000000, date: getToday(), createdAt: 1, updatedAt: 1 })
  await useMoneeStore.getState().load()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('applies a custom date range across periods and resets back to the active period', async () => {
  const user = userEvent.setup()
  useMoneeStore.setState(state => ({ transactions: [...state.transactions, { id: 'old', type: 'income', amount: 25000, note: 'Pemasukan lama', date: '2024-01-15', createdAt: 0, updatedAt: 0 }] }))
  render(<HistoryScreen />)
  fireEvent.click(screen.getByText('Filter transaksi'))
  expect(screen.queryByRole('button', { name: /Pemasukan lama/ })).not.toBeInTheDocument()
  await user.click(screen.getByLabelText('Dari tanggal'))
  await user.click(screen.getByRole('button', { name: /Pilih bulan dan tahun/ }))
  const year = screen.getByRole('spinbutton', { name: 'Tahun kalender' })
  await user.clear(year); await user.type(year, '2024')
  await user.click(screen.getByRole('button', { name: 'Januari', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Senin, 1 Januari 2024' }))
  await user.click(screen.getByLabelText('Sampai tanggal'))
  await user.click(screen.getByRole('button', { name: /Pilih bulan dan tahun/ }))
  await user.clear(screen.getByRole('spinbutton', { name: 'Tahun kalender' }))
  await user.type(screen.getByRole('spinbutton', { name: 'Tahun kalender' }), '2024')
  await user.click(screen.getByRole('button', { name: 'Januari', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Rabu, 31 Januari 2024' }))
  expect(screen.getByRole('button', { name: /Pemasukan lama/ })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Ringkasan periode' })).toHaveTextContent('Rp25.000')
  expect(screen.getByRole('button', { name: 'Periode selanjutnya' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Reset filter', exact: true }))
  expect(screen.queryByRole('button', { name: /Pemasukan lama/ })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Dari tanggal')).toHaveTextContent('Pilih tanggal')
})
it('removes the reset explanation from the balance without removing the period or greeting', async () => {
  await profileRepo.save(await openDatabase(), { id: 'profile', name: 'Nara', mascotId: 'luna', periodStartDay: 1, defaultBucketId: 'bucket-needs', createdAt: 1 })
  await useMoneeStore.getState().load()
  render(<MemoryRouter><WelcomeDashboard /></MemoryRouter>)
  expect(screen.getByLabelText('Saldo periode')).toHaveTextContent('Rp1.000.000')
  expect(screen.queryByText('Reset Rp0 setiap periode; sisanya masuk Sisa.')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Beranda' })).toBeInTheDocument()
  expect(screen.getByText(/Hai,/)).toBeInTheDocument()
})
it('uses buckets without category selection and selects a usable bucket when the preferred bucket is full', async () => {
  await useMoneeStore.getState().addTransaction({ id: 'fill-needs', type: 'expense', amount: 400000, categoryId: 'cat-makan', bucketId: 'bucket-needs', date: getToday(), createdAt: 2, updatedAt: 2 })
  render(<QuickAddDialog open onClose={() => {}} />)
  expect(screen.queryByRole('group', { name: 'Kategori' })).not.toBeInTheDocument()
  expect(within(screen.getByRole('group', { name: 'Bucket' })).getAllByRole('button')).toHaveLength(5)
  expect(screen.getByRole('button', { name: /Kebutuhan Pokok/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /Pulsa\/Transport/ })).toHaveAttribute('aria-pressed', 'true')
})
it('keeps the sheet open and reverses a saved expense through the real persistence guard', async () => {
  const close = vi.fn(); render(<QuickAddDialog open onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: '10rb' }))
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  await screen.findByRole('button', { name: 'Batal' }, { timeout: 5000 })
  expect(close).not.toHaveBeenCalled()
  expect(useMoneeStore.getState().transactions.filter(item => item.type === 'expense' && !item.deleted)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan' })).toBeEnabled())
  expect(useMoneeStore.getState().transactions.filter(item => item.type === 'expense' && !item.deleted)).toHaveLength(0)
  expect(close).not.toHaveBeenCalled()
})
it('does not silently turn an expense into a savings deposit when all spending buckets are full', async () => {
  const state = useMoneeStore.getState()
  for (const bucket of state.buckets.filter(item => !item.isSavings)) {
    await state.addTransaction({ id: `fill-${bucket.id}`, type: 'expense', amount: bucket.allocPercent * 10000,
      categoryId: 'cat-lain-exp', bucketId: bucket.id, date: getToday(), createdAt: 2, updatedAt: 2 })
  }
  render(<QuickAddDialog open onClose={() => {}} />)
  expect(screen.getByRole('button', { name: 'Tabungan', exact: true })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: '5rb' }))
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Pilih bucket pengeluaran.')
  expect(useMoneeStore.getState().transactions.filter(item => item.type === 'savings_deposit')).toHaveLength(0)
})
it('validates before arming, disables the known invalid draft, and allows a corrected retry', async () => {
  render(<QuickAddDialog open onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nominal harus lebih dari 0 rupiah utuh.')
  expect(screen.queryByRole('button', { name: 'Batal' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '5rb' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simpan' })) })
  expect(await screen.findByRole('button', { name: 'Batal' }, { timeout: 5000 })).toBeEnabled()
})
it('cancels a destructive history fuse without writing the database', async () => {
  await useMoneeStore.getState().addTransaction({ id: 'expense', type: 'expense', amount: 10000, bucketId: 'bucket-needs', categoryId: 'cat-makan', note: 'Test lunch', date: getToday(), createdAt: 2, updatedAt: 2 })
  render(<HistoryScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Test lunch/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Hapus transaksi' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await waitFor(() => expect(document.querySelector('.rb-fuse')).toHaveAttribute('data-phase', 'armed'), { timeout: 5000 })
  expect((await transactionRepo.getById(await openDatabase(), 'expense'))?.deleted).not.toBe(true)
  fireEvent.click(document.querySelector<HTMLButtonElement>('.rb-fuse')!)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ya, hapus' })).toBeEnabled())
  expect((await transactionRepo.getById(await openDatabase(), 'expense'))?.deleted).not.toBe(true)
})
it('shows settled feedback before closing Quick-Add after its two-second undo window', async () => {
  const close = vi.fn(); render(<QuickAddDialog open onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: '10rb' }))
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  await screen.findByRole('button', { name: 'Batal' }, { timeout: 5000 })
  expect(close).not.toHaveBeenCalled()
  await screen.findByRole('button', { name: 'Tersimpan' }, { timeout: 4000 })
  expect(close).not.toHaveBeenCalled()
  await waitFor(() => expect(close).toHaveBeenCalledOnce(), { timeout: 2000 })
}, 10000)
it('never shows deletion success when Allocation is spent during the countdown', async () => {
  await useMoneeStore.getState().addTransaction({ id: 'deposit', type: 'savings_deposit', amount: 10000, bucketId: 'bucket-savings', categoryId: 'cat-tabungan', date: getToday(), createdAt: 2, updatedAt: 2 })
  render(<HistoryScreen />)
  fireEvent.click(screen.getByRole('button', { name: /Setoran tabungan/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Hapus transaksi' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ya, hapus' }))
  await waitFor(() => expect(document.querySelector('.rb-fuse')).toHaveAttribute('data-phase', 'armed'), { timeout: 5000 })
  await act(async () => { await useMoneeStore.getState().addTransaction({ id: 'spend-deposit', type: 'savings_expense', note: 'Pakai dana', savingsSource: 'allocation', amount: 10000, date: getToday(), createdAt: 3, updatedAt: 3 }) })
  await waitFor(() => expect(document.querySelector('.rb-fuse')).toHaveAttribute('data-phase', 'idle'), { timeout: 6000 })
  expect(screen.queryByRole('button', { name: 'Transaksi dihapus' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Dana tabungan sudah terpakai.')
  expect((await transactionRepo.getById(await openDatabase(), 'deposit'))?.deleted).not.toBe(true)
}, 12000)

