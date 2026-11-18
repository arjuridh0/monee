// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { receiptRecognizer } from '../../src/features/ocr/provider'
import { PNG_BASE64, imageBytes } from './fixtures'
const file = () => new File([imageBytes(PNG_BASE64)], 'private.png', { type: 'image/png' })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('uploads only the file to same-origin with credentials, no key and no redirects', async () => {
  const fetcher = vi.fn(async () => Response.json({ items: [{ label: ' Roti ', amount: 8000 }], private: 'discard' }))
  vi.stubGlobal('fetch', fetcher)
  expect(await receiptRecognizer!(file(), new AbortController().signal)).toEqual({ items: [{ label: 'Roti', amount: 8000 }] })
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/receipt'); expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'manual', cache: 'no-store' })
  expect([...new Headers(init.headers).keys()]).toEqual([])
  expect([...(init.body as FormData).keys()]).toEqual(['file'])
})
it.each([401, 302, 307, 403])('offers relogin for access HTTP %i', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private', { status })))
  await expect(receiptRecognizer!(file(), new AbortController().signal)).rejects.toMatchObject({ name: 'ReceiptAccessError' })
})
it('recognizes opaque login redirects', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ type: 'opaqueredirect', status: 0 })))
  await expect(receiptRecognizer!(file(), new AbortController().signal)).rejects.toMatchObject({ name: 'ReceiptAccessError' })
})
it('offers relogin for a successful HTML login page without parsing it', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>private login</html>', { headers: { 'Content-Type': 'text/html' } })))
  await expect(receiptRecognizer!(file(), new AbortController().signal)).rejects.toMatchObject({ name: 'ReceiptAccessError' })
})
it('sanitizes arbitrary network exceptions', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Layanan pembaca struk gagal: private token') }))
  await expect(receiptRecognizer!(file(), new AbortController().signal)).rejects.toThrow('Pembaca struk tidak dapat dihubungi. Periksa koneksi atau isi manual.')
})
it.each([429, 503, 502])('maps HTTP %i without exposing response text', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private key details', { status })))
  await expect(receiptRecognizer!(file(), new AbortController().signal)).rejects.toThrow(/struk|manual|Tunggu/)
})
it('does not call a temporary 503 a missing configuration', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
  await expect(receiptRecognizer!(file(), new AbortController().signal)).rejects.toThrow(/sementara.*Coba lagi/)
})
it('identifies missing OCR setup only from the server error code', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
    status: 503, headers: { 'X-Monee-Error': 'service-not-configured' },
  })))
  await expect(receiptRecognizer!(file(), new AbortController().signal)).rejects.toThrow(/belum disiapkan/)
})
it('validates file metadata and pre-cancellation before upload', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  await expect(receiptRecognizer!(file(), AbortSignal.abort())).rejects.toThrow()
  await expect(receiptRecognizer!(new File(['x'], 'x.svg', { type: 'image/svg+xml' }), new AbortController().signal)).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})
it('rejects HTML login pages, oversized JSON and malformed receipt values', async () => {
  for (const response of [new Response('<html>login</html>'), new Response('x'.repeat(64 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } }), Response.json({ items: [{ label: 'x', amount: '8000' }] })]) {
    vi.stubGlobal('fetch', vi.fn(async () => response))
    await expect(receiptRecognizer!(file(), new AbortController().signal)).rejects.toThrow()
  }
})
it('bounds stalled response reads and cancels the upstream fetch on timeout', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | null | undefined
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => { signal = init.signal; return new Response(new ReadableStream(), { headers: { 'Content-Type': 'application/json' } }) }))
  const pending = receiptRecognizer!(file(), new AbortController().signal)
  const failure = expect(pending).rejects.toThrow(/lama/)
  await vi.advanceTimersByTimeAsync(35_001)
  await failure; expect(signal?.aborted).toBe(true)
})
it('cancels an active upload and returns no late receipt', async () => {
  const controller = new AbortController()
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('private network error'))); started()
  })))
  const pending = receiptRecognizer!(file(), controller.signal)
  await ready; controller.abort()
  await expect(pending).rejects.toThrow(/dibatalkan/)
})
