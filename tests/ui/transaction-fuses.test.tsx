import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuickAddDialog } from '@/features/transactions/QuickAddDialog'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { seedDefaultData, transactionRepo } from '@/core/db/repositories'
import { useMoneeStore } from '@/store'
import { getToday } from '@/core/finance/period'
import { HistoryScreen } from '@/features/history/HistoryScreen'
vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span>Teman Monee</span> }))

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
  const db = await openDatabase(); await seedDefaultData(db)
  await transactionRepo.save(db, { id: 'income', type: 'income', amount: 1000000, date: getToday(), createdAt: 1, updatedAt: 1 })
  await useMoneeStore.getState().load()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('orders default categories and selects a usable bucket when the preferred bucket is full', async () => {
  await useMoneeStore.getState().addTransaction({ id: 'fill-needs', type: 'expense', amount: 400000, categoryId: 'cat-makan', bucketId: 'bucket-needs', date: getToday(), createdAt: 2, updatedAt: 2 })
  render(<QuickAddDialog open onClose={() => {}} />)
  const categoryButtons = within(screen.getByRole('group', { name: 'Kategori' })).getAllByRole('button')
  expect(categoryButtons.map(button => button.textContent)).toEqual(['Makan', 'Minum', 'Transport', 'Pulsa/Data', 'Belanja', 'Hiburan', 'Sedekah', 'Tabungan', 'Edukasi', 'Lainnya'])
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
it('validates before arming, disables the known invalid draft, and allows a corrected retry', async () => {
  render(<QuickAddDialog open onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('ERR_AMOUNT_INVALID')
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
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent('ERR_KOMPARTEMEN_KURANG')
  expect((await transactionRepo.getById(await openDatabase(), 'deposit'))?.deleted).not.toBe(true)
}, 12000)

