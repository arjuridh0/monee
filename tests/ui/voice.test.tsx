import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'onLine'); resetDbSingleton() })

describe('voice review', () => {
  it('offers themed bucket choices without a native mobile dropdown and saves only after confirmation', async () => {
    render(<VoiceDialog onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Ucapan atau teks transaksi'), { target: { value: 'beli 20rb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buat draft' }))
    expect(await screen.findByText('Draft 1 dari 1')).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Bucket' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Bucket Kebutuhan Pokok/ }))
    expect(screen.getByRole('listbox', { name: 'Pilihan Bucket' })).toBeVisible()
    expect(screen.queryByRole('option', { name: 'Tabungan' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Fun' }))
    expect(screen.getByRole('button', { name: 'Bucket Fun' })).toHaveAttribute('aria-expanded', 'false')
    expect(useMoneeStore.getState().addTransaction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }))
    await waitFor(() => expect(useMoneeStore.getState().addTransaction).toHaveBeenCalledWith(expect.objectContaining({ bucketId: 'bucket-fun', amount: 20000 })))
  })
  it('offers an icon microphone without a checkbox or starting capture on mount', () => {
    const start = vi.spyOn(recorder, 'startRecording')
    render(<VoiceDialog onClose={() => {}} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    const mic = screen.getByRole('button', { name: 'Mulai rekam', exact: true })
    expect(mic).toBeEnabled()
    expect(mic).toHaveTextContent('')
    expect(mic.querySelector('svg')).not.toBeNull()
    expect(start).not.toHaveBeenCalled()
  })
  it.each([503, 401])('clears the old capture failure after saving every manual fallback draft (HTTP %i)', async status => {
    vi.spyOn(recorder, 'startRecording').mockResolvedValue({ stop: vi.fn(), result: Promise.resolve(new Blob(['a'], { type: 'audio/webm' })) })
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }))
    vi.stubGlobal('fetch', fetcher)
    render(<VoiceDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mulai rekam' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 503 ? /sementara tidak tersedia/ : /Sesi login berakhir/)
    expect(screen.getByRole('button', { name: 'Coba rekam ulang' })).toBeVisible()
    if (status === 401) expect(screen.getByRole('link', { name: 'Masuk ulang layanan suara' })).toBeVisible()
    vi.useFakeTimers()
    try {
      fireEvent.change(screen.getByLabelText('Ucapan atau teks transaksi'), { target: { value: 'ngopi 22rb sama parkir 3rb' } })
      fireEvent.click(screen.getByRole('button', { name: 'Buat draft' }))
      for (const [index, amount] of [22000, 3000].entries()) {
        expect(screen.getByText(`Draft ${index + 1} dari 2`)).toBeVisible()
        expect(screen.getByLabelText('Nominal (Rp)')).toHaveValue(amount)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' })) })
        expect(useMoneeStore.getState().addTransaction).toHaveBeenCalledTimes(index + 1)
        expect(useMoneeStore.getState().addTransaction).toHaveBeenLastCalledWith(expect.objectContaining({ amount, type: 'expense' }))
        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        await act(async () => { await vi.advanceTimersByTimeAsync(800) })
      }
      expect(screen.getByText('Review selesai. Draft yang kamu simpan ada di riwayat.')).toBeVisible()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Coba rekam ulang' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Masuk ulang layanan suara' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Mulai rekam' })).toBeEnabled()
      expect(screen.getByLabelText('Ucapan atau teks transaksi')).toHaveValue('')
      expect(useMoneeStore.getState().updateTransaction).not.toHaveBeenCalled()
      expect(fetcher).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })
  it('uses the shared legacy category default when changing a draft to income', async () => {
    useMoneeStore.setState({ categories: [...DEFAULT_CATEGORIES].reverse() })
    render(<VoiceDialog onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Ucapan atau teks transaksi'), { target: { value: 'ngopi 22rb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buat draft' }))
    fireEvent.change(await screen.findByLabelText('Jenis transaksi'), { target: { value: 'income' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }))
    await waitFor(() => expect(useMoneeStore.getState().addTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'income', categoryId: 'cat-gaji' })))
    expect(screen.queryByLabelText('Kategori')).not.toBeInTheDocument()
  })
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
  it('keeps category mapping internal and preserves the draft on domain failure', async () => {
    useMoneeStore.setState({ addTransaction: vi.fn().mockRejectedValue(new Error('ERR_SALDO_KURANG — Saldo periode tidak cukup. Kurangi nominal atau catat pemasukan terlebih dahulu.')) })
    render(<VoiceDialog onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Ucapan atau teks transaksi'), { target: { value: 'beli 20rb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buat draft' }))
    expect(await screen.findByRole('button', { name: 'Bucket Kebutuhan Pokok' })).toBeVisible()
    expect(screen.queryByLabelText('Kategori')).not.toBeInTheDocument()
    expect(screen.queryByText(/Perlu diperiksa:.*kategori/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Saldo periode tidak cukup. Kurangi nominal atau catat pemasukan terlebih dahulu.')
    expect(screen.queryByText(/ERR_SALDO_KURANG/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nominal (Rp)')).toHaveValue(20000)
    expect(useMoneeStore.getState().addTransaction).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'cat-lain-exp' }))
  })
  it('allows manual drafts offline with no key or microphone permission', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    render(<VoiceDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mulai rekam' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Voice membutuhkan internet/)
    expect(screen.getByLabelText('Ucapan atau teks transaksi')).toBeEnabled()
  })
})

describe('managed voice consent', () => {
  it('shows permission, listening progress and processing before automatically opening transcript drafts', async () => {
    let grant!: (value: recorder.VoiceRecording) => void, finish!: (audio: Blob) => void, transcribe!: (value: unknown) => void
    const audio = new Promise<Blob>(resolve => { finish = resolve })
    const stop = vi.fn(() => finish(new Blob(['a'], { type: 'audio/webm' })))
    const start = vi.spyOn(recorder, 'startRecording').mockReturnValue(new Promise(resolve => { grant = resolve }))
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => { transcribe = resolve })))
    render(<VoiceDialog onClose={() => {}} />)
    expect(start).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Mulai rekam' }))
    expect(screen.getByText(/Menunggu izin mikrofon/)).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: /Saya setuju/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Contoh:.*kemarin ngopi/)).not.toBeInTheDocument()
    await act(async () => { grant({ stop, result: audio }) })
    expect(screen.getByTestId('mascot')).toHaveAttribute('data-state', 'listening')
    act(() => { start.mock.calls[0]![1]?.({ elapsedMs: 4200, level: 0.7, speechDetected: true, autoStopAvailable: true }) })
    expect(screen.getByText('00:04 / 00:30')).toBeVisible()
    expect(screen.getByRole('meter', { name: 'Level suara mikrofon' })).toHaveAttribute('aria-valuenow', '70')
    await act(async () => { finish(new Blob(['a'], { type: 'audio/webm' })) })
    expect(screen.getByText(/Mengubah suara menjadi teks dan draft/)).toBeVisible()
    expect(screen.getByTestId('mascot')).toHaveAttribute('data-state', 'thinking')
    await act(async () => { transcribe(Response.json({ text: 'ngopi 22rb sama parkir 3rb' })) })
    expect(await screen.findByText('Draft 1 dari 2')).toBeVisible()
    expect(screen.getByText('ngopi 22rb sama parkir 3rb')).toBeVisible()
    expect(useMoneeStore.getState().addTransaction).not.toHaveBeenCalled()
  })
  it('keeps recording explicit and explains the destination in each dialog session', () => {
    const start = vi.spyOn(recorder, 'startRecording')
    const view = render(<VoiceDialog onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Mulai rekam' })).toBeEnabled()
    expect(screen.getByText(/Audio dikirim melalui server Monee ke Groq/)).toBeVisible()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    view.unmount()
    render(<VoiceDialog onClose={() => {}} />)
    expect(start).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Mulai rekam' })).toBeEnabled()
    expect(screen.queryByLabelText('Groq API key')).not.toBeInTheDocument()
  })
})

describe('managed voice access recovery', () => {
  it.each([
    { label: 'expired access', status: 401, setupMissing: false, login: true, message: 'Sesi login berakhir. Pilih Masuk ulang layanan suara untuk masuk kembali.' },
    { label: 'gateway redirect', status: 302, setupMissing: false, login: true, message: 'Sesi login berakhir. Pilih Masuk ulang layanan suara untuk masuk kembali.' },
    { label: 'temporary outage', status: 503, setupMissing: false, login: false, message: 'Layanan suara sementara tidak tersedia. Coba lagi nanti atau ketik manual.' },
    { label: 'missing configuration', status: 503, setupMissing: true, login: false, message: 'Layanan suara belum disiapkan pengelola Monee. Ketik manual, ya.' },
    { label: 'account not authorized', status: 403, setupMissing: false, login: false, message: 'Akun ini belum memiliki akses layanan suara. Hubungi pengelola Monee.' },
    { label: 'provider timeout', status: 504, setupMissing: false, login: false, message: 'Layanan suara terlalu lama merespons. Coba lagi atau ketik manual.' },
  ])('offers a login navigation only for expired access ($label)', async ({ status, setupMissing, login, message }) => {
    vi.spyOn(recorder, 'startRecording').mockResolvedValue({ stop: vi.fn(), result: Promise.resolve(new Blob(['a'], { type: 'audio/webm' })) })
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status, headers: setupMissing ? { 'X-Monee-Error': 'service-not-configured' } : {},
    }))
    vi.stubGlobal('fetch', fetcher)
    render(<VoiceDialog onClose={() => {}} />)
    expect(screen.queryByRole('link', { name: 'Masuk ulang layanan suara' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mulai rekam' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    if (login) {
      expect(await screen.findByRole('link', { name: 'Masuk ulang layanan suara' })).toHaveAttribute('href', '/auth/refresh')
      expect(screen.getByRole('link', { name: 'Masuk ulang layanan suara' })).not.toHaveAttribute('target')
    } else {
      expect(screen.queryByRole('link', { name: 'Masuk ulang layanan suara' })).not.toBeInTheDocument()
    }
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]![0]).toBe('/api/transcribe')
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'POST', redirect: 'manual', credentials: 'same-origin', cache: 'no-store' })
  })
})
