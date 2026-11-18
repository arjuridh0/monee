import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ServiceReadiness } from '@/components/ui/ServiceReadiness'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('announces checking and configuration without claiming provider success', async () => {
  let resolve!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done })))
  render(<ServiceReadiness service="voice" />)
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('Memeriksa konfigurasi layanan suara')
  expect(screen.getByRole('button', { name: 'Periksa lagi' })).toBeDisabled()
  await act(async () => resolve(Response.json({ ready: true })))
  expect(screen.getByRole('status')).toHaveTextContent('Konfigurasi layanan suara tersedia')
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false')
  expect(screen.getByRole('status')).toHaveAccessibleDescription(/hanya memeriksa konfigurasi server.*bukan.*keberhasilan penyedia/i)
  expect(screen.queryByRole('link')).toBeNull()
})

it.each([['voice', '/auth/refresh', 'layanan suara'], ['receipt', '/auth/refresh?service=receipt', 'pembaca struk']] as const)('offers the correct %s authentication path', async (service, href, name) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
  render(<ServiceReadiness service={service} />)
  const link = await screen.findByRole('link', { name: `Masuk ulang ${name}` })
  expect(link).toHaveAttribute('href', href)
  expect(screen.getByRole('status')).toHaveTextContent('perlu diverifikasi')
})

it('distinguishes missing configuration, allows retry, and shows temporary unavailability', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ready: false }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ready: true }))
  vi.stubGlobal('fetch', fetcher)
  render(<ServiceReadiness service="receipt" />)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('belum disiapkan'))
  fireEvent.click(screen.getByRole('button', { name: 'Periksa lagi' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('belum dapat diperiksa'))
  fireEvent.click(screen.getByRole('button', { name: 'Periksa lagi' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('tersedia'))
  expect(fetcher).toHaveBeenCalledTimes(3)
})

it('cancels on unmount', () => {
  const fetcher = vi.fn().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  }))
  vi.stubGlobal('fetch', fetcher)
  const view = render(<ServiceReadiness service="voice" />)
  const signal = fetcher.mock.calls[0]![1].signal
  view.unmount()
  expect(signal.aborted).toBe(true)
})

it('discards a late result when changing service and cancels the previous check', async () => {
  let resolveVoice!: (response: Response) => void
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveVoice = resolve }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
  vi.stubGlobal('fetch', fetcher)
  const view = render(<ServiceReadiness service="voice" />)
  const voiceSignal = fetcher.mock.calls[0]![1].signal
  view.rerender(<ServiceReadiness service="receipt" />)
  expect(voiceSignal.aborted).toBe(true)
  await screen.findByRole('link', { name: 'Masuk ulang pembaca struk' })
  await act(async () => resolveVoice(Response.json({ ready: true })))
  expect(screen.getByRole('status')).toHaveTextContent('Akses pembaca struk perlu diverifikasi')
})
