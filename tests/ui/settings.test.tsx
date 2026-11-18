import { webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { STORES, type StoreName } from '@/core/db/schema'
import { bucketRepo, categoryRepo, DEFAULT_BUCKETS, DEFAULT_CATEGORIES, profileRepo, recurringRepo, transactionRepo } from '@/core/db/repositories'
import { hashPin, verifyPin } from '@/core/security/pin'
import type { Profile, Transaction } from '@/core/finance/types'
import { useMoneeStore } from '@/store'
import { resetPwaState } from '@/pwa/pwa-state'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { exportBackup } from '@/features/settings/backup'

vi.mock('@/features/mascot/MascotCarousel', () => ({
  MascotCarousel: ({ onApply }: { onApply: (id: 'luna') => void }) => (
    <button type="button" onClick={() => onApply('luna')}>Pilih Maskot ini</button>
  ),
}))

let profile: Profile

beforeEach(async () => {
  resetPwaState()
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetDbSingleton()
  const db = await openDatabase()
  const salt = 'salt'
  profile = {
    id: 'profile', name: 'Arju', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'bucket-needs', pinHash: await hashPin('123456', salt), pinSalt: salt,
    createdAt: 0, currency: { code: 'IDR', format: 'Rp#.###' },
  }
  await profileRepo.save(db, profile)
  await bucketRepo.saveAll(db, DEFAULT_BUCKETS.map(bucket => ({ ...bucket })))
  await Promise.all(DEFAULT_CATEGORIES.map(category => categoryRepo.save(db, { ...category })))
  useMoneeStore.setState({
    ...useMoneeStore.getInitialState(), isLoaded: true, isLocked: false,
    profile, buckets: DEFAULT_BUCKETS.map(bucket => ({ ...bucket })),
    categories: DEFAULT_CATEGORIES.map(category => ({ ...category })),
  }, true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'storage')
  resetDbSingleton()
  document.documentElement.removeAttribute('style')
  delete document.documentElement.dataset.mascot
})

const row = (name: RegExp) => screen.getByRole('button', { name })

describe('settings screen', () => {
  it('explains managed access and privacy without asking for credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    render(<SettingsScreen />)
    fireEvent.click(row(/^Layanan suara/))
    await screen.findByText(/server Monee.*Groq/)
    const dialog = await screen.findByRole('dialog', { name: 'Layanan suara' })
    expect(within(dialog).getByText(/server Monee.*Groq/)).toBeVisible()
    expect(within(dialog).getByText(/Layanan suara disediakan pengelola/)).toBeVisible()
    const login = await within(dialog).findByRole('link', { name: 'Masuk ulang layanan suara' })
    expect(login).toHaveAttribute('href', '/auth/refresh')
    expect(login).not.toHaveAttribute('target')
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/API key/i)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('status')).toHaveTextContent('Akses layanan suara perlu diverifikasi.')
    expect(within(dialog).getByRole('status')).toHaveAccessibleDescription(/hanya memeriksa konfigurasi server, bukan koneksi atau keberhasilan penyedia AI/)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]).toEqual(['/api/transcribe?check=ready', expect.objectContaining({
      method: 'GET', redirect: 'manual', credentials: 'same-origin', cache: 'no-store',
    })])
    expect(fetcher.mock.calls[0]![1]?.body).toBeUndefined()
  })

  it('shows the profile, groups, current values, and disabled future rows', () => {
    render(<SettingsScreen />)
    expect(screen.getByRole('heading', { level: 1, name: 'Atur' })).toBeVisible()
    expect(screen.getByText('Semua preferensi Monee kamu')).toBeVisible()
    expect(row(/^Nama/)).toHaveTextContent('Arju')
    expect(row(/^Maskot & Tema/)).toHaveTextContent('Mochi')
    expect(row(/^Format Rupiah/)).toHaveTextContent('Rp20.000')
    expect(row(/^Ganti PIN/)).toHaveTextContent('6 digit')
    expect(row(/^Alokasi Bucket/)).toBeEnabled()
    expect(row(/^Alokasi Bucket/)).toHaveTextContent('5 bucket')
    expect(screen.queryByRole('button', { name: /^Kelola Kategori/ })).not.toBeInTheDocument()
    expect(row(/^Pemasukan Rutin/)).toBeEnabled()
    for (const label of [
      /^Buka dengan sidik jari/,
    ]) expect(row(label)).toBeDisabled()
    expect(row(/^Layanan suara/)).toBeEnabled()
    expect(row(/^Export Backup/)).toBeEnabled()
    expect(row(/^Import Backup/)).toBeEnabled()
    expect(screen.getByText('Monee v0.1.0 \u00b7 Data akun tersinkron antarperangkat')).toBeVisible()
  })

  it('keeps app and storage controls inside Atur instead of above every screen', () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) },
    })
    render(<SettingsScreen />)
    const panel = screen.getByText('Aplikasi dan penyimpanan').closest('aside')
    expect(panel).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Pengaturan Monee' })).toContainElement(panel)
  })

  it('edits bucket names and sets the start day from accessible settings', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(row(/^Kelola Bucket/))
    const manager = await screen.findByRole('dialog', { name: 'Kelola Bucket' })
    const name = within(manager).getByLabelText('Nama bucket 1')
    await user.clear(name); await user.type(name, 'Rumah')
    await user.click(within(manager).getByRole('button', { name: 'Simpan bucket' }))
    await waitFor(() => expect(useMoneeStore.getState().buckets.find(item => item.id === 'bucket-needs')?.name).toBe('Rumah'))
    await user.click(row(/^Awal Periode/))
    const period = await screen.findByRole('dialog', { name: 'Awal Periode' })
    await user.selectOptions(within(period).getByLabelText('Tanggal awal periode'), '25')
    await user.click(within(period).getByRole('button', { name: 'Simpan awal periode' }))
    await waitFor(() => expect(useMoneeStore.getState().profile?.periodStartDay).toBe(25))
  })

  it('warns before export and requires explicit overwrite confirmation before import', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(row(/^Export Backup/))
    const exportDialog = await screen.findByRole('dialog', { name: 'Export Backup' })
    expect(within(exportDialog).getByText(/File berisi data sensitif/)).toBeVisible()
    expect(within(exportDialog).getByRole('switch', { name: /Enkripsi/ })).toBeChecked()
    expect(within(exportDialog).getByRole('button', { name: 'Unduh backup JSON' })).toBeDisabled()
    await user.type(within(exportDialog).getByLabelText('Passphrase (minimal 8 karakter)'), 'backup test phrase')
    expect(within(exportDialog).getByRole('button', { name: 'Unduh backup JSON' })).toBeEnabled()
    await user.click(within(exportDialog).getByRole('button', { name: 'Tutup' }))

    await user.click(row(/^Import Backup/))
    const importDialog = await screen.findByRole('dialog', { name: 'Import Backup' })
    expect(within(importDialog).getByText(/Import akan mengganti seluruh data/)).toBeVisible()
    expect(within(importDialog).getByRole('button', { name: 'Validasi & pulihkan' })).toBeDisabled()
    await user.click(within(importDialog).getByRole('checkbox', { name: /Saya paham seluruh data/ }))
    expect(within(importDialog).getByRole('button', { name: 'Validasi & pulihkan' })).toBeDisabled()
  })

  it('requires the current PIN and explicit confirmation, then clears data and session state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    const user = userEvent.setup()
    const db = await openDatabase()
    await db.put(STORES.settings, { key: 'private', value: 'keep before confirmation' })
    render(<SettingsScreen />)
    await user.click(row(/^Hapus Semua Data/))
    let dialog = await screen.findByRole('dialog', { name: 'Hapus Semua Data' })
    expect(within(dialog).getByRole('button', { name: 'Hapus semua data' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('PIN untuk konfirmasi hapus'), '000000')
    await user.click(within(dialog).getByRole('checkbox', { name: /Saya paham data/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Hapus semua data' }))
    expect(await within(dialog).findByText('PIN belum cocok. Data kamu tetap aman.')).toBeVisible()
    expect(await db.get(STORES.settings, 'private')).toBeDefined()

    await user.type(within(dialog).getByLabelText('PIN untuk konfirmasi hapus'), '123456')
    await user.click(within(dialog).getByRole('button', { name: 'Hapus semua data' }))
    await waitFor(() => expect(useMoneeStore.getState().profile).toBeNull())
    expect(useMoneeStore.getState()).toMatchObject({ isLoaded: true, isLocked: false, buckets: [], categories: [], transactions: [] })
    expect(await Promise.all(Object.values(STORES).map(name => db.getAll(name as StoreName))))
      .toEqual(Object.values(STORES).map(() => []))
  })

  it('shows file loading and restores the latest selected backup when an older file finishes late', async () => {
    const db = await openDatabase()
    const pinSalt = 'ab'.repeat(16)
    await profileRepo.save(db, { ...profile, pinSalt, pinHash: await hashPin('123456', pinSalt) })
    const contents = JSON.parse(await exportBackup(db))
    const oldContents = JSON.stringify(contents)
    contents.stores.profile[0].name = 'Backup terbaru'
    const latestContents = JSON.stringify(contents)
    let oldRead!: (value: string) => void
    let newRead!: (value: string) => void
    const oldFile = new File([''], 'lama.json', { type: 'application/json' })
    const newFile = new File([''], 'baru.json', { type: 'application/json' })
    Object.defineProperty(oldFile, 'text', { value: () => new Promise<string>(resolve => { oldRead = resolve }) })
    Object.defineProperty(newFile, 'text', { value: () => new Promise<string>(resolve => { newRead = resolve }) })
    render(<SettingsScreen />)
    fireEvent.click(row(/^Import Backup/))
    const input = screen.getByLabelText('File backup JSON')
    fireEvent.change(input, { target: { files: [oldFile] } })
    expect(screen.getByRole('status', { name: 'Membaca file backup' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Validasi & pulihkan' })).toBeDisabled()
    fireEvent.change(input, { target: { files: [newFile] } })
    await act(async () => { newRead(latestContents) })
    await act(async () => { oldRead(oldContents) })
    expect(screen.queryByRole('status', { name: 'Membaca file backup' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Saya paham seluruh data/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Validasi & pulihkan' }))
    await waitFor(() => expect(useMoneeStore.getState().profile?.name).toBe('Backup terbaru'))
  })

  it('creates, edits, deactivates, and deletes recurring income without removing recorded history', async () => {
    const user = userEvent.setup()
    const db = await openDatabase()
    render(<SettingsScreen />)
    await user.click(row(/^Pemasukan Rutin/))
    let manager = await screen.findByRole('dialog', { name: 'Pemasukan Rutin' })
    await user.click(within(manager).getByRole('button', { name: 'Tambah template' }))

    let editor = screen.getByRole('dialog', { name: 'Template pemasukan' })
    await user.type(within(editor).getByRole('textbox', { name: 'Nama pemasukan' }), 'Gaji Utama')
    await user.type(within(editor).getByRole('spinbutton', { name: 'Nominal (Rp)' }), '5000000')
    const dueDay = within(editor).getByRole('spinbutton', { name: 'Tanggal pemasukan (1–28)' })
    await user.clear(dueDay)
    await user.type(dueDay, '1')
    expect(within(editor).queryByRole('combobox', { name: 'Kategori pemasukan' })).not.toBeInTheDocument()
    await user.click(within(editor).getByRole('button', { name: 'Tambah template', exact: true }))

    manager = await screen.findByRole('dialog', { name: 'Pemasukan Rutin' })
    expect(within(manager).getByText('Gaji Utama')).toBeVisible()
    expect(await recurringRepo.getAll(db)).toHaveLength(1)
    let saved = (await recurringRepo.getAll(db))[0]!
    expect(saved).toMatchObject({ name: 'Gaji Utama', amount: 5_000_000, dayOfMonth: 1, categoryId: 'cat-gaji', isActive: true })
    expect(await transactionRepo.getAll(db)).toEqual([])
    expect(useMoneeStore.getState().snapshot?.recurringDue.map(item => item.id)).toContain(saved.id)

    await user.click(within(manager).getByRole('button', { name: 'Edit template Gaji Utama' }))
    editor = screen.getByRole('dialog', { name: 'Template pemasukan' })
    await user.clear(within(editor).getByRole('spinbutton', { name: 'Nominal (Rp)' }))
    await user.type(within(editor).getByRole('spinbutton', { name: 'Nominal (Rp)' }), '6000000')
    await user.click(within(editor).getByRole('switch', { name: 'Aktifkan template' }))
    await user.click(within(editor).getByRole('button', { name: 'Simpan template' }))
    manager = await screen.findByRole('dialog', { name: 'Pemasukan Rutin' })
    saved = (await recurringRepo.getAll(db))[0]!
    expect(saved).toMatchObject({ amount: 6_000_000, isActive: false })
    expect(useMoneeStore.getState().snapshot?.recurringDue.map(item => item.id)).not.toContain(saved.id)

    const now = Date.now()
    const history: Transaction = {
      id: 'recorded-salary', type: 'income', amount: saved.amount, date: '2026-10-25',
      categoryId: saved.categoryId, recurringId: saved.id, refundedAmount: 0, deleted: false,
      createdAt: now, updatedAt: now,
    }
    await transactionRepo.save(db, history)
    await user.click(within(manager).getByRole('button', { name: 'Hapus template Gaji Utama' }))
    await user.click(within(manager).getByRole('button', { name: 'Hapus template', exact: true }))

    expect(await recurringRepo.getAll(db)).toEqual([])
    expect(await transactionRepo.getAll(db)).toEqual([history])
  })

  it('trims and persists a new name', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(row(/^Nama/))
    const input = screen.getByLabelText('Nama')
    await user.clear(input)
    await user.type(input, '  Ayu  ')
    await user.click(screen.getByRole('button', { name: 'Simpan nama' }))

    await waitFor(() => expect(row(/^Nama/)).toHaveTextContent('Ayu'))
    expect((await profileRepo.get(await openDatabase()))?.name).toBe('Ayu')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('rejects an empty name without touching the stored profile', async () => {
    const user = userEvent.setup()
    const db = await openDatabase()
    render(<SettingsScreen />)
    await user.click(row(/^Nama/))
    await user.clear(screen.getByLabelText('Nama'))
    await user.click(screen.getByRole('button', { name: 'Simpan nama' }))

    expect(await screen.findByText('Nama wajib diisi.')).toBeVisible()
    expect((await profileRepo.get(db))?.name).toBe('Arju')
  })

  it('persists the chosen mascot, applies its theme, and closes the sheet', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(row(/^Maskot & Tema/))
    await user.click(await screen.findByRole('button', { name: 'Pilih Maskot ini' }))

    await waitFor(() => expect(row(/^Maskot & Tema/)).toHaveTextContent('Luna'))
    expect(document.documentElement.dataset.mascot).toBe('luna')
    expect((await profileRepo.get(await openDatabase()))?.mascotId).toBe('luna')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('persists the selected rupiah format and previews it on the row', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(row(/^Format Rupiah/))
    await user.click(screen.getByRole('radio', { name: 'Rp 20.000' }))
    await user.click(screen.getByRole('button', { name: 'Simpan format' }))

    await waitFor(() => expect(row(/^Format Rupiah/)).toHaveTextContent('Rp 20.000'))
    expect((await profileRepo.get(await openDatabase()))?.currency?.format).toBe('Rp #.###')
  })

  it('opens the allocation editor with the preset, reveals permissions, and validates the total live', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(row(/^Alokasi Bucket/))
    const dialog = await screen.findByRole('dialog', { name: 'Alokasi Bucket' })

    expect(within(dialog).getByText('Total alokasi')).toBeVisible()
    expect(within(dialog).getByText('100%')).toBeVisible()
    expect(within(dialog).getByText('40%')).toBeVisible()
    expect(within(dialog).queryAllByRole('switch')).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: 'Custom sendiri' }))
    expect(within(dialog).getByLabelText('Persentase Kebutuhan Pokok')).toHaveValue(40)
    expect(within(dialog).getByRole('switch', { name: 'Boleh lewat batas Tabungan' }))
      .toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).getAllByRole('switch')).toHaveLength(5)

    await user.clear(within(dialog).getByLabelText('Persentase Kebutuhan Pokok'))
    await user.type(within(dialog).getByLabelText('Persentase Kebutuhan Pokok'), '35')
    expect(within(dialog).getByText('95%')).toBeVisible()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Total alokasi harus 100%')
    expect(within(dialog).getByRole('button', { name: 'Simpan alokasi' })).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: 'Pakai preset' }))
    expect(within(dialog).getByText('100%')).toBeVisible()
    expect(within(dialog).queryByLabelText('Persentase Kebutuhan Pokok')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Simpan alokasi' })).toBeEnabled()
  })

  it('persists custom percentages and overbudget permissions with one save', async () => {
    const user = userEvent.setup()
    const db = await openDatabase()
    render(<SettingsScreen />)
    await user.click(row(/^Alokasi Bucket/))
    const dialog = await screen.findByRole('dialog', { name: 'Alokasi Bucket' })
    const name = within(dialog).getByLabelText('Nama bucket 1')
    await user.clear(name)
    await user.type(name, 'Rumah')
    await user.click(within(dialog).getByRole('button', { name: 'Custom sendiri' }))

    const needs = within(dialog).getByLabelText('Persentase Kebutuhan Pokok')
    await user.clear(needs)
    await user.type(needs, '35')
    const fun = within(dialog).getByLabelText('Persentase Fun')
    await user.clear(fun)
    await user.type(fun, '10')
    const needsPermission = within(dialog).getByRole('switch', { name: 'Boleh lewat batas Kebutuhan Pokok' })
    expect(needsPermission).toHaveAttribute('aria-checked', 'false')
    await user.click(needsPermission)
    await user.click(within(dialog).getByRole('button', { name: 'Simpan alokasi' }))

    expect(await screen.findByText('Alokasi bucket diperbarui.')).toBeVisible()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const stored = (await bucketRepo.getAll(db)).sort((a, b) => a.sortOrder - b.sortOrder)
    expect(stored.find(bucket => bucket.id === 'bucket-needs'))
      .toMatchObject({ name: 'Rumah', allocPercent: 35, allowOverbudget: true })
    expect(stored.find(bucket => bucket.id === 'bucket-fun')).toMatchObject({ allocPercent: 10 })
    expect(useMoneeStore.getState().buckets.find(bucket => bucket.id === 'bucket-needs'))
      .toMatchObject({ allocPercent: 35, allowOverbudget: true })
    expect(useMoneeStore.getState().snapshot?.buckets
      .find(progress => progress.bucket.id === 'bucket-needs')?.bucket.allowOverbudget).toBe(true)
  })

  it('keeps the allocation sheet open on a stale conflict without overwriting the newer data', async () => {
    const user = userEvent.setup()
    const db = await openDatabase()
    render(<SettingsScreen />)
    await user.click(row(/^Alokasi Bucket/))
    const dialog = await screen.findByRole('dialog', { name: 'Alokasi Bucket' })
    await user.click(within(dialog).getByRole('button', { name: 'Custom sendiri' }))
    const needs = within(dialog).getByLabelText('Persentase Kebutuhan Pokok')
    await user.clear(needs)
    await user.type(needs, '35')
    const fun = within(dialog).getByLabelText('Persentase Fun')
    await user.clear(fun)
    await user.type(fun, '10')

    const newer = DEFAULT_BUCKETS.map(bucket => bucket.id === 'bucket-needs'
      ? { ...bucket, allocPercent: 30, allowOverbudget: true }
      : bucket.id === 'bucket-fun' ? { ...bucket, allocPercent: 15 } : bucket)
    await bucketRepo.saveAll(db, newer)

    await user.click(within(dialog).getByRole('button', { name: 'Simpan alokasi' }))
    expect(await screen.findByText(/Bucket berubah di tab lain/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Simpan alokasi' })).toBeEnabled()
    const stored = (await bucketRepo.getAll(db)).sort((a, b) => a.sortOrder - b.sortOrder)
    expect(stored.map(({ id, allocPercent, allowOverbudget }) => ({ id, allocPercent, allowOverbudget })))
      .toEqual([...newer].sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ id, allocPercent, allowOverbudget }) => ({ id, allocPercent, allowOverbudget })))
  })

  it('changes the PIN, resets the lockout, and confirms with a toast', async () => {
    const user = userEvent.setup()
    const db = await openDatabase()
    render(<SettingsScreen />)
    await user.click(row(/^Ganti PIN/))
    fireEvent.change(screen.getByLabelText('PIN sekarang'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('PIN baru'), { target: { value: '654321' } })
    fireEvent.change(screen.getByLabelText('Ulangi PIN baru'), { target: { value: '654321' } })
    await user.click(screen.getByRole('button', { name: 'Simpan PIN baru' }))

    expect(await screen.findByText('PIN berhasil diganti.')).toBeVisible()
    const stored = await profileRepo.get(db)
    expect(await verifyPin('654321', stored!.pinHash, stored!.pinSalt)).toBe(true)
    expect(await verifyPin('123456', stored!.pinHash, stored!.pinSalt)).toBe(false)
  })

  it('keeps the old PIN when the current PIN is wrong', async () => {
    const user = userEvent.setup()
    const db = await openDatabase()
    render(<SettingsScreen />)
    await user.click(row(/^Ganti PIN/))
    fireEvent.change(screen.getByLabelText('PIN sekarang'), { target: { value: '999999' } })
    fireEvent.change(screen.getByLabelText('PIN baru'), { target: { value: '654321' } })
    fireEvent.change(screen.getByLabelText('Ulangi PIN baru'), { target: { value: '654321' } })
    await user.click(screen.getByRole('button', { name: 'Simpan PIN baru' }))

    expect(await screen.findByText('PIN sekarang belum cocok.')).toBeVisible()
    const stored = await profileRepo.get(db)
    expect(stored).toEqual(profile)
  })

  it('refuses mismatched confirmation and an unchanged PIN before writing', async () => {
    const user = userEvent.setup()
    const db = await openDatabase()
    render(<SettingsScreen />)
    await user.click(row(/^Ganti PIN/))
    fireEvent.change(screen.getByLabelText('PIN sekarang'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('PIN baru'), { target: { value: '654321' } })
    fireEvent.change(screen.getByLabelText('Ulangi PIN baru'), { target: { value: '111111' } })
    await user.click(screen.getByRole('button', { name: 'Simpan PIN baru' }))
    expect(await screen.findByText('PIN belum sama. Periksa ulang, ya.')).toBeVisible()

    fireEvent.change(screen.getByLabelText('PIN baru'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('Ulangi PIN baru'), { target: { value: '123456' } })
    await user.click(screen.getByRole('button', { name: 'Simpan PIN baru' }))
    expect(await screen.findByText('PIN baru harus berbeda dari PIN sekarang.')).toBeVisible()
    expect(await profileRepo.get(db)).toEqual(profile)
  })

  it('opens the About sheet with the installed version', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await user.click(row(/^Tentang Monee/))
    expect(await screen.findByRole('dialog', { name: 'Tentang Monee' })).toBeVisible()
    expect(screen.getByText('Ledger akun tersinkron antarperangkat. PIN, jika dipakai, hanya mengunci perangkat ini.')).toBeVisible()
  })
})
