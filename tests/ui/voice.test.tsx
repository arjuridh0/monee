import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { resetDbSingleton } from '@/core/db/migrations'
import { DEFAULT_BUCKETS, DEFAULT_CATEGORIES } from '@/core/db/repositories'
import { useMoneeStore } from '@/store'
import * as recorder from '@/features/voice/recorder'
import { VoiceDialog } from '@/features/voice/VoiceDialog'

vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: ({ state }: { state: string }) => <div data-testid="mascot" data-state={state} /> }))
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('indexedDB', new IDBFactory()); resetDbSingleton()
  useMoneeStore.setState({ ...useMoneeStore.getInitialState(), isLoaded: true, isLocked: false,
    profile: { id: 'profile', name: 'Arju', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'bucket-needs', pinHash: '', pinSalt: '', createdAt: 0 },
    buckets: DEFAULT_BUCKETS, categories: DEFAULT_CATEGORIES,
    addTransaction: vi.fn().mockResolvedValue(undefined), updateTransaction: vi.fn().mockResolvedValue(undefined),
  }, true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); resetDbSingleton() })

describe('voice review', () => {
  it('parses locally and waits for review before saving each draft', async () => {
    render(<VoiceDialog onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Ucapan atau teks transaksi'), { target: { value: 'ngopi 22rb sama parkir 3rb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buat draft' }))
    expect(await screen.findByText('Draft 1 dari 2')).toBeVisible()
    expect(screen.getByLabelText('Nominal (Rp)')).toHaveValue(22000)
    expect(useMoneeStore.getState().addTransaction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }))
    await waitFor(() => expect(useMoneeStore.getState().addTransaction).toHaveBeenCalledTimes(1))
    expect(useMoneeStore.getState().addTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: 22000, categoryId: 'cat-minum', type: 'expense' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Batal', exact: true }))
    await waitFor(() => expect(useMoneeStore.getState().updateTransaction).toHaveBeenCalledTimes(1))
  })
  it('requires correction of an uncertain category and keeps the draft on domain failure', async () => {
    useMoneeStore.setState({ addTransaction: vi.fn().mockRejectedValue(new Error('ERR_SALDO_KURANG — Saldo tidak cukup.')) })
    render(<VoiceDialog onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Ucapan atau teks transaksi'), { target: { value: 'beli 20rb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buat draft' }))
    expect(await screen.findByLabelText('Kategori')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }))
    expect(await screen.findByText(/Pilih kategori yang sesuai/)).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan draft' })).toBeEnabled())
    expect(useMoneeStore.getState().addTransaction).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Kategori'), { target: { value: 'cat-belanja' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }))
    expect(await screen.findByText(/ERR_SALDO_KURANG/)).toBeVisible()
    expect(screen.getByLabelText('Nominal (Rp)')).toHaveValue(20000)
  })
  it('allows manual drafts offline with no key or microphone permission', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    render(<VoiceDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Saya setuju/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mulai rekam' }))
    expect(await screen.findByText(/internet|offline/i)).toBeVisible()
    expect(screen.getByLabelText('Ucapan atau teks transaksi')).toBeEnabled()
    Reflect.deleteProperty(navigator, 'onLine')
  })
})

describe('managed voice consent', () => {
  it('requires fresh consent for each dialog session and explains the audio destination', () => {
    const view = render(<VoiceDialog onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Mulai rekam' })).toBeDisabled()
    const consent = screen.getByRole('checkbox', { name: /Saya setuju.*server Monee.*Groq/ })
    expect(consent).not.toBeChecked()
    fireEvent.click(consent)
    expect(screen.getByRole('button', { name: 'Mulai rekam' })).toBeEnabled()
    view.unmount()
    render(<VoiceDialog onClose={() => {}} />)
    expect(screen.getByRole('checkbox', { name: /Saya setuju/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Mulai rekam' })).toBeDisabled()
    expect(screen.queryByLabelText('Groq API key')).not.toBeInTheDocument()
  })
})

describe('managed voice access recovery', () => {
  it.each([401, 503])('offers a login navigation only for expired access (HTTP %i)', async status => {
    vi.spyOn(recorder, 'startRecording').mockResolvedValue({ stop: vi.fn(), result: Promise.resolve(new Blob(['a'], { type: 'audio/webm' })) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }))
    render(<VoiceDialog onClose={() => {}} />)
    expect(screen.queryByRole('link', { name: 'Masuk ulang layanan suara' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Saya setuju/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mulai rekam' }))
    if (status === 401) {
      expect(await screen.findByRole('link', { name: 'Masuk ulang layanan suara' })).toHaveAttribute('href', '/auth/refresh')
      expect(screen.getByRole('link', { name: 'Masuk ulang layanan suara' })).not.toHaveAttribute('target')
    } else {
      expect(await screen.findByText(/belum disiapkan pengelola/)).toBeVisible()
      expect(screen.queryByRole('link', { name: 'Masuk ulang layanan suara' })).not.toBeInTheDocument()
    }
  })
})
