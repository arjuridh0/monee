import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '@/app/AppShell'
import { useMoneeStore } from '@/store'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { DEFAULT_BUCKETS, bucketRepo, recurringRepo, seedDefaultData, settingsRepo, sweepRepo, transactionRepo } from '@/core/db/repositories'
import { getToday } from '@/core/finance/period'

vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span>Teman Monee</span> }))
vi.mock('@/features/auth/AccountGate', () => ({ AccountGate: ({ children }: { children: ReactNode }) => children }))
beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('scrollTo', vi.fn())
  resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
})
afterEach(async () => {
  cleanup()
  // Let an effect-triggered ledger read finish before replacing fake IndexedDB.
  // Otherwise the next test can close its backing database mid-read.
  await useMoneeStore.getState().load().catch(() => undefined)
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetDbSingleton()
})
const mount = (path = '/') => render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppShell /></MemoryRouter>)

async function startWizard(income: boolean) {
  await screen.findByLabelText('Nama panggilan')
  fireEvent.change(screen.getByLabelText('Nama panggilan'), { target: { value: 'Arju' } })
  await userEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
  await screen.findByLabelText('Nominal pemasukan (Rp)')
  if (income) {
    fireEvent.change(screen.getByLabelText('Nominal pemasukan (Rp)'), { target: { value: '1000000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Catat & lanjut' }))
  } else await userEvent.click(screen.getByRole('button', { name: 'Lewati dulu' }))
  await screen.findByRole('heading', { name: 'Beri setiap rupiah tujuan' })
  await userEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
  await screen.findByRole('listbox', { name: 'Pilih maskot' })
  await userEvent.click(screen.getByRole('button', { name: 'Pilih Maskot ini' }))
  await screen.findByLabelText('Buat PIN 6 digit')
  fireEvent.change(screen.getByLabelText('Buat PIN 6 digit'), { target: { value: '123456' } })
  fireEvent.change(screen.getByLabelText('Ulangi PIN 6 digit'), { target: { value: '123456' } })
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: 'Selesai & masuk' }))
}

describe('first-run and session gates', () => {
  it('does not offer the device lock when the profile has no device PIN', async () => {
    await useMoneeStore.getState().finishOnboarding({
      name: 'Account PIN only', mascotId: 'mochi', buckets: DEFAULT_BUCKETS.map(bucket => ({ ...bucket })),
    })
    mount()
    await screen.findByRole('heading', { name: 'Belum ada pemasukan bulan ini' })
    expect(screen.queryByRole('button', { name: 'Kunci Monee' })).not.toBeInTheDocument()
    expect(useMoneeStore.getState().isLocked).toBe(false)
  })

  it('restores default categories when onboarding starts after a data reset', async () => {
    useMoneeStore.setState({ ...useMoneeStore.getInitialState(), isLoaded: true, isLocked: false }, true)
    mount('/onboarding')
    await screen.findByLabelText('Nama panggilan')
    fireEvent.change(screen.getByLabelText('Nama panggilan'), { target: { value: 'Mulai lagi' } })
    await userEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    await screen.findByLabelText('Nominal pemasukan (Rp)')
    await waitFor(() => expect(useMoneeStore.getState().categories.filter(item => item.type === 'income')).toHaveLength(4))
    fireEvent.change(screen.getByLabelText('Nominal pemasukan (Rp)'), { target: { value: '1000000' } })
    expect(screen.getByRole('button', { name: 'Catat & lanjut' })).toBeEnabled()
  })

  it('finishes skipped income once, reloads into PIN, and never reopens onboarding', async () => {
    const view = mount('/riwayat')
    await startWizard(false)
    await screen.findByRole('heading', { name: 'Belum ada pemasukan bulan ini' })
    expect(screen.getByRole('region', { name: 'Transaksi terakhir' })).toHaveTextContent('Belum ada transaksi bulan ini')
    expect(screen.getAllByRole('button', { name: 'Tambah pemasukan', exact: true })).toHaveLength(1)
    expect(await transactionRepo.getAll(await openDatabase())).toHaveLength(0)
    expect(useMoneeStore.getState().isLocked).toBe(false)
    view.unmount()
    useMoneeStore.setState(useMoneeStore.getInitialState(), true)
    mount('/onboarding')
    const pin = await screen.findByLabelText('PIN 6 digit')
    await waitFor(() => expect(pin).toBeEnabled())
    expect(screen.queryByLabelText('Nama panggilan')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navigasi utama' })).not.toBeInTheDocument()
    fireEvent.change(pin, { target: { value: '123456' } })
    await screen.findByRole('heading', { name: 'Belum ada pemasukan bulan ini' })
    expect(await transactionRepo.getAll(await openDatabase())).toHaveLength(0)
  }, 25000)

  it('commits a normal income and shows derived balance and allocation on completion', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    expect(screen.getByRole('button', { name: 'Kunci Monee' })).toBeVisible()
    const recentTransactions = screen.getByRole('list', { name: 'Daftar transaksi terakhir' })
    expect(within(recentTransactions).getByText('Pemasukan')).toBeInTheDocument()
    expect(within(recentTransactions).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByLabelText('Saldo periode')).toHaveTextContent('Rp1.000.000')
    expect(screen.getByRole('region', { name: 'Ringkasan keuangan' })).toBeInTheDocument()
    expect(screen.getByText('Teman Monee').closest('.dashboard-hero-mascot')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(5)
    expect(screen.getAllByRole('group').map(group => group.getAttribute('aria-label'))).toEqual([
      'Jatah Kebutuhan Pokok', 'Jatah Pulsa/Transport', 'Jatah Sedekah', 'Jatah Fun', 'Jatah Tabungan',
    ])
    expect(screen.getByRole('progressbar', { name: 'Pemakaian Tabungan' })).toBeInTheDocument()
    expect(screen.getByLabelText('Jatah Kebutuhan Pokok')).toHaveTextContent('Rp400.000')
    const db = await openDatabase()
    const transactions = await transactionRepo.getAll(db)
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ type: 'income', amount: 1000000, date: getToday() })
    const buckets = await bucketRepo.getAll(db)
    await act(async () => {
      await useMoneeStore.getState().saveBuckets(buckets.map(bucket => bucket.id === 'bucket-needs'
        ? { ...bucket, allowOverbudget: true } : bucket))
      await useMoneeStore.getState().addTransaction({ id: 'overbudget-expense', type: 'expense', amount: 450000,
        date: getToday(), categoryId: 'cat-makan', bucketId: 'bucket-needs', refundedAmount: 0,
        deleted: false, createdAt: Date.now(), updatedAt: Date.now() })
    })
    expect(screen.getByText('Lewat jatah')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Pemakaian Kebutuhan Pokok' }))
      .toHaveAttribute('aria-valuetext', '112,5% · lewat jatah')
    await act(() => useMoneeStore.getState().load())
    expect(await transactionRepo.getAll(db)).toHaveLength(2)
    expect(await settingsRepo.get(db, 'onboarding-draft')).toBeUndefined()
  }, 25000)

  it('resumes non-PIN draft after reload without committing income or a partial profile', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    await settingsRepo.set(db, 'onboarding-draft', { step: 4, name: 'Nara', income: null, buckets: DEFAULT_BUCKETS, mascotId: 'luna' })
    mount()
    await screen.findByLabelText('Buat PIN 6 digit')
    expect(screen.getByLabelText('Buat PIN 6 digit')).toHaveValue('')
    expect(document.documentElement.dataset.mascot).toBe('luna')
    expect(useMoneeStore.getState().profile).toBeNull()
  })

  it('records a due salary template once when its shortcut is clicked repeatedly', async () => {
    mount()
    await startWizard(true)
    const db = await openDatabase()
    await recurringRepo.save(db, { id: 'salary-main', name: 'Gaji Utama', amount: 5000000,
      dayOfMonth: 1, categoryId: 'cat-gaji', isActive: true, createdAt: Date.now() })
    await act(async () => useMoneeStore.getState().load())
    const button = await screen.findByRole('button', { name: 'Catat gaji' })
    await userEvent.dblClick(button)
    expect(await screen.findByRole('button', { name: 'Gaji tercatat' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Catat gaji' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gaji tercatat' })).toHaveAttribute('aria-disabled', 'true')
    const transactions = await transactionRepo.getAll(db)
    expect(transactions.filter(transaction => transaction.recurringId === 'salary-main')).toHaveLength(1)
    expect(transactions.find(transaction => transaction.recurringId === 'salary-main')).toMatchObject({
      type: 'income', amount: 5000000, categoryId: 'cat-gaji', note: 'Gaji Utama',
    })
  }, 25000)

  it('shows only the five newest transactions in the dashboard preview', async () => {
    mount()
    await startWizard(true)
    await act(async () => {
      for (let index = 0; index < 6; index += 1) {
        const now = Date.now() + index
        await useMoneeStore.getState().addTransaction({ id: `extra-income-${index}`, type: 'income', amount: 1000,
          date: getToday(), note: `Tambahan ${index}`, categoryId: 'cat-gaji', deleted: false,
          refundedAmount: 0, createdAt: now, updatedAt: now })
      }
    })
    const recentTransactions = screen.getByRole('list', { name: 'Daftar transaksi terakhir' })
    expect(within(recentTransactions).getAllByRole('listitem')).toHaveLength(5)
    expect(within(recentTransactions).getByText('Tambahan 5')).toBeInTheDocument()
    expect(within(recentTransactions).queryByText('Tambahan 0')).not.toBeInTheDocument()
  }, 25000)

  it('opens Quick-Add from the centered root navigation button', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    await userEvent.click(screen.getByRole('button', { name: 'Tambah transaksi' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ketik manual' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tambah transaksi' })
    expect(dialog).toBeVisible()
    expect(dialog.contains(document.activeElement)).toBe(true)
  }, 25000)

  it('validates both bucket allowance and period balance without discarding form values', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    await userEvent.click(screen.getByRole('button', { name: 'Tambah transaksi' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ketik manual' }))
    await screen.findByRole('dialog', { name: 'Tambah transaksi' })
    const amount = screen.getByLabelText('Nominal (Rp)')
    fireEvent.change(amount, { target: { value: '450000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Jatah Kebutuhan Pokok tinggal Rp 400.000.')
    expect(amount).toHaveValue(450000)
    expect(screen.getByRole('dialog', { name: 'Tambah transaksi' })).toBeVisible()

    await act(async () => {
      const current = useMoneeStore.getState().buckets
      await useMoneeStore.getState().saveBuckets(current.map(bucket => bucket.id === 'bucket-needs'
        ? { ...bucket, allowOverbudget: true } : bucket))
    })
    fireEvent.change(amount, { target: { value: '1100000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Saldo periode tinggal Rp 1.000.000.')
    expect(amount).toHaveValue(1100000)
    expect(await transactionRepo.getAll(await openDatabase())).toHaveLength(1)
  }, 25000)

  it('records an income from Quick-Add as an ordinary transaction', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    await userEvent.click(screen.getByRole('button', { name: 'Tambah transaksi' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ketik manual' }))
    await screen.findByRole('dialog', { name: 'Tambah transaksi' })
    await userEvent.click(screen.getByRole('radio', { name: 'Pemasukan' }))
    expect(screen.queryByRole('group', { name: 'Kategori' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nominal (Rp)'), { target: { value: '250000' } })
    fireEvent.change(screen.getByLabelText('Catatan (opsional)'), { target: { value: 'Pekerjaan sampingan' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tambah transaksi' })).not.toBeInTheDocument(), { timeout: 6000 })
    const transactions = await transactionRepo.getAll(await openDatabase())
    expect(transactions).toHaveLength(2)
    expect(transactions.find(transaction => transaction.note === 'Pekerjaan sampingan')).toMatchObject({
      type: 'income', amount: 250000, categoryId: 'cat-gaji', note: 'Pekerjaan sampingan',
    })
  }, 25000)

  it('turns the Tabungan bucket into a savings deposit', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    await userEvent.click(screen.getByRole('button', { name: 'Tambah transaksi' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ketik manual' }))
    await screen.findByRole('dialog', { name: 'Tambah transaksi' })
    await userEvent.click(within(screen.getByRole('group', { name: 'Bucket' })).getByRole('button', { name: 'Tabungan' }))
    expect(within(screen.getByRole('group', { name: 'Bucket' })).getByRole('button', { name: 'Tabungan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/masuk ke Tabungan/i)).toBeInTheDocument()
    const amount = screen.getByLabelText('Nominal (Rp)')
    fireEvent.change(amount, { target: { value: '1100000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Saldo periode tinggal Rp 1.000.000.')
    expect(amount).toHaveValue(1100000)
    fireEvent.change(amount, { target: { value: '700000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tambah transaksi' })).not.toBeInTheDocument(), { timeout: 6000 })
    const transactions = await transactionRepo.getAll(await openDatabase())
    expect(transactions.find(transaction => transaction.type === 'savings_deposit')).toMatchObject({
      type: 'savings_deposit', amount: 700000, categoryId: 'cat-tabungan', bucketId: 'bucket-savings',
    })
  }, 25000)

  it('groups history by period, filters transactions, and opens transaction details', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    const now = Date.now()
    await act(async () => useMoneeStore.getState().addTransaction({ id: 'history-lunch', type: 'expense', amount: 100000,
      date: getToday(), categoryId: 'cat-makan', bucketId: 'bucket-needs', note: 'Makan siang', deleted: false,
      refundedAmount: 0, createdAt: now, updatedAt: now }))
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    await act(async () => useMoneeStore.getState().addTransaction({ id: 'history-coffee', type: 'expense', amount: 25000,
      date: yesterday, categoryId: 'cat-makan', bucketId: 'bucket-needs', note: 'Kopi', deleted: false,
      refundedAmount: 0, createdAt: now - 1, updatedAt: now - 1 }))
    await userEvent.click(screen.getByRole('link', { name: 'Riwayat' }))
    await screen.findByRole('heading', { level: 1, name: 'Riwayat' })
    expect(screen.getByRole('radiogroup', { name: 'Periode riwayat' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ringkasan periode' })).toBeInTheDocument()
    expect(document.querySelectorAll('.history-day')).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Daftar riwayat' })).getByText('Makan siang')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Filter tipe'), 'income')
    expect(within(screen.getByRole('region', { name: 'Daftar riwayat' })).queryByText('Makan siang')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Daftar riwayat' })).getByText('Pemasukan')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Filter tipe'), 'all')
    await userEvent.selectOptions(screen.getByLabelText('Filter bucket'), 'bucket-needs')
    expect(within(screen.getByRole('region', { name: 'Daftar riwayat' })).getByText('Makan siang')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nominal minimum'), '200000')
    expect(within(screen.getByRole('region', { name: 'Daftar riwayat' })).queryByText('Makan siang')).not.toBeInTheDocument()
    await userEvent.click(within(screen.getByText('Filter transaksi').closest('details')!).getByRole('button', { name: 'Reset filter' }))
    await userEvent.type(screen.getByLabelText('Kata kunci'), 'kopi')
    expect(screen.getByText('Kopi')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Daftar riwayat' })).queryByText('Makan siang')).not.toBeInTheDocument()
    await userEvent.click(within(screen.getByText('Filter transaksi').closest('details')!).getByRole('button', { name: 'Reset filter' }))
    await userEvent.click(screen.getByRole('button', { name: /Makan siang/ }))
    expect(await screen.findByRole('dialog', { name: 'Detail transaksi' })).toHaveTextContent('Rp100.000')
  }, 25000)

  it('edits, partially refunds, and soft-deletes an open-period expense', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    const now = Date.now()
    await act(async () => useMoneeStore.getState().addTransaction({ id: 'editable-expense', type: 'expense', amount: 100000,
      date: getToday(), categoryId: 'cat-makan', bucketId: 'bucket-needs', note: 'Makan siang', deleted: false,
      refundedAmount: 0, createdAt: now, updatedAt: now }))
    await userEvent.click(screen.getByRole('link', { name: 'Riwayat' }))
    await userEvent.click(screen.getByRole('button', { name: /Makan siang/ }))
    const detail = await screen.findByRole('dialog', { name: 'Detail transaksi' })
    await userEvent.click(within(detail).getByRole('button', { name: 'Edit transaksi' }))
    const editAmount = screen.getByLabelText('Nominal transaksi')
    fireEvent.change(editAmount, { target: { value: '450000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Jatah Kebutuhan Pokok tinggal Rp 400.000.')
    expect(await transactionRepo.getById(await openDatabase(), 'editable-expense')).toMatchObject({ amount: 100000 })
    fireEvent.change(editAmount, { target: { value: '150000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
    await waitFor(() => expect(screen.queryByLabelText('Nominal transaksi')).not.toBeInTheDocument())
    expect(await screen.findByRole('dialog', { name: 'Detail transaksi' })).toHaveTextContent('Rp150.000')
    expect(await transactionRepo.getById(await openDatabase(), 'editable-expense')).toMatchObject({ amount: 150000 })
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }))
    fireEvent.change(screen.getByLabelText('Nominal refund'), { target: { value: '50000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan refund' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Detail transaksi' })).not.toBeInTheDocument(), { timeout: 6000 })
    await userEvent.click(screen.getByRole('button', { name: /Makan siang/ }))
    expect(await screen.findByRole('dialog', { name: 'Detail transaksi' })).toHaveTextContent('Rp50.000')
    expect(await transactionRepo.getById(await openDatabase(), 'editable-expense')).toMatchObject({
      amount: 150000, refundedAmount: 50000, deleted: false,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Hapus transaksi' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Detail transaksi' })).getByRole('button', { name: 'Ya, hapus' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Detail transaksi' })).not.toBeInTheDocument(), { timeout: 6000 })
    expect(await transactionRepo.getById(await openDatabase(), 'editable-expense')).toMatchObject({ deleted: true })
    expect(screen.queryByRole('button', { name: /Makan siang/ })).not.toBeInTheDocument()
  }, 25000)

  it('shows locked-period transaction details without edit, delete, or refund actions', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    const now = Date.now()
    const tx = { id: 'locked-expense', type: 'expense' as const, amount: 100000, date: getToday(), categoryId: 'cat-makan',
      bucketId: 'bucket-needs', note: 'Makan siang', deleted: false, refundedAmount: 0, createdAt: now, updatedAt: now }
    await act(async () => useMoneeStore.getState().addTransaction(tx))
    const sweep = { id: 'sweep-current', periodKey: getToday().slice(0, 7), amount: 0, perBucketDetail: [], sweptAt: now }
    await sweepRepo.save(await openDatabase(), sweep)
    act(() => useMoneeStore.setState({ sweeps: [sweep] }))
    await userEvent.click(screen.getByRole('link', { name: 'Riwayat' }))
    await userEvent.click(screen.getByRole('button', { name: /Makan siang/ }))
    const detail = await screen.findByRole('dialog', { name: 'Detail transaksi' })
    expect(detail).toHaveTextContent('Periode ini sudah ditutup')
    expect(within(detail).queryByRole('button', { name: 'Edit transaksi' })).not.toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: 'Hapus transaksi' })).not.toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument()
  }, 25000)

  it('rejects savings-deposit edits or deletes that would make Allocation negative', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    const now = Date.now()
    await act(async () => useMoneeStore.getState().addTransaction({ id: 'allocation-deposit', type: 'savings_deposit', amount: 100000,
      date: getToday(), categoryId: 'cat-tabungan', bucketId: 'bucket-savings', deleted: false,
      refundedAmount: 0, createdAt: now, updatedAt: now }))
    await act(async () => useMoneeStore.getState().addTransaction({ id: 'allocation-use', type: 'savings_expense', amount: 80000,
      date: getToday(), savingsSource: 'allocation', note: 'Pakai dana', deleted: false,
      refundedAmount: 0, createdAt: now + 1, updatedAt: now + 1 }))
    await userEvent.click(screen.getByRole('link', { name: 'Riwayat' }))
    await userEvent.click(screen.getByRole('button', { name: /Setoran tabungan/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit transaksi' }))
    fireEvent.change(screen.getByLabelText('Nominal transaksi'), { target: { value: '50000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Koreksi ini membuat saldo kompartemen tabungan negatif.')
    expect(await transactionRepo.getById(await openDatabase(), 'allocation-deposit')).toMatchObject({ amount: 100000 })
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }))
    await userEvent.click(screen.getByRole('button', { name: 'Hapus transaksi' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ya, hapus' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dana tabungan sudah terpakai.')
    expect(await transactionRepo.getById(await openDatabase(), 'allocation-deposit')).toMatchObject({ deleted: false })
  }, 25000)

  it('flips the full dashboard into a savings summary and back', async () => {
    mount()
    await startWizard(true)
    await screen.findByRole('heading', { name: 'Beranda' })
    const now = Date.now()
    await act(async () => useMoneeStore.getState().addTransaction({ id: 'flip-savings', type: 'savings_deposit', amount: 200000,
      date: getToday(), categoryId: 'cat-tabungan', bucketId: 'bucket-savings', deleted: false,
      refundedAmount: 0, createdAt: now, updatedAt: now }))
    await act(async () => useMoneeStore.getState().saveGoal({ id: 'flip-goal', name: 'Dana darurat', targetAmount: 100000,
      sortOrder: 1, createdAt: now }))
    expect(screen.getByRole('heading', { name: 'Jatah bulan ini' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Lihat tabungan' }))
    expect(screen.getByRole('region', { name: 'Ringkasan tabungan' })).toHaveTextContent('Rp200.000')
    expect(screen.getByText('Dana darurat')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jatah bulan ini' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Transaksi terakhir' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kembali ke saldo periode' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Kembali ke saldo periode' }))
    expect(screen.getByRole('heading', { name: 'Jatah bulan ini' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Lihat tabungan' }))
    await userEvent.click(screen.getByRole('button', { name: 'Setor', exact: true }))
    expect(await screen.findByRole('dialog', { name: 'Setor tabungan' })).toBeInTheDocument()
  }, 25000)

  it('keeps /dev/ui independent of profile and database initialization', async () => {
    mount('/dev/ui')
    await screen.findByRole('heading', { name: 'Ruang coba UI' }, { timeout: 5000 })
    expect(useMoneeStore.getState().isLoaded).toBe(false)
  })
})
