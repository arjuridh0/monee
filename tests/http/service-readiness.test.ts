// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { checkServiceReadiness, serviceAuthPath } from '../../src/core/http/service-readiness'

afterEach(() => vi.useRealTimers())

it.each([['voice', '/api/transcribe?check=ready'], ['receipt', '/api/receipt?check=ready']] as const)('checks only the %s same-origin configuration endpoint', async (service, endpoint) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ready: true }))
  expect(await checkServiceReadiness(service, { fetcher })).toBe('configured')
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0]).toEqual([endpoint, expect.objectContaining({
    method: 'GET', credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
  })])
  expect(fetcher.mock.calls[0]![1]?.body).toBeUndefined()
  expect(fetcher.mock.calls[0]![1]?.headers).toBeUndefined()
})

it('uses fixed service-specific authentication paths', () => {
  expect(serviceAuthPath('voice')).toBe('/auth/refresh')
  expect(serviceAuthPath('receipt')).toBe('/auth/refresh?service=receipt')
})

it('maps only a boolean ready response or explicit setup error to configuration state', async () => {
  const fetcher = vi.fn<typeof fetch>()
  for (const [response, state] of [
    [Response.json({ ready: false }), 'not-configured'],
    [new Response(null, { status: 503, headers: { 'X-Monee-Error': 'service-not-configured' } }), 'not-configured'],
    [new Response(null, { status: 503 }), 'unavailable'],
    [new Response(null, { status: 404 }), 'unavailable'],
    [new Response(null, { status: 429 }), 'unavailable'],
    [Response.json({ ready: 'true' }), 'unavailable'],
    [Response.json({ healthy: true }), 'unavailable'],
    [Response.json(null), 'unavailable'],
    [new Response('private internals', { headers: { 'content-type': 'application/json' } }), 'unavailable'],
    [new Response('true', { headers: { 'content-type': 'text/plain' } }), 'unavailable'],
  ] as const) {
    fetcher.mockResolvedValueOnce(response)
    expect(await checkServiceReadiness('voice', { fetcher })).toBe(state)
  }
})

it.each([401, 403, 302, 307])('requires authentication for HTTP %i without reading gateway details', async status => {
  const cancel = vi.fn()
  const response = new Response(new ReadableStream({ cancel }), { status })
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
  expect(await checkServiceReadiness('receipt', { fetcher })).toBe('auth-required')
  expect(cancel).toHaveBeenCalledOnce()
})

it('recognizes opaque redirects and successful HTML login documents', async () => {
  const opaque = new Response(null)
  Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' })
  const fetcher = vi.fn<typeof fetch>()
  for (const response of [opaque, new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })]) {
    fetcher.mockResolvedValueOnce(response)
    expect(await checkServiceReadiness('voice', { fetcher })).toBe('auth-required')
  }
})

it('bounds readiness response bytes and cancels oversized streams', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ ready: true, padding: 'x'.repeat(4096) }))) }, cancel,
  })
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } }))
  expect(await checkServiceReadiness('receipt', { fetcher })).toBe('unavailable')
  expect(cancel).toHaveBeenCalledOnce()
  expect(body.locked).toBe(false)
})

it('never sends an already cancelled check', async () => {
  const fetcher = vi.fn<typeof fetch>()
  await expect(checkServiceReadiness('voice', { fetcher, signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetcher).not.toHaveBeenCalled()
})

it('cancels an active fetch without converting cancellation into an unavailable state', async () => {
  const controller = new AbortController()
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    started()
  }))
  const pending = checkServiceReadiness('receipt', { fetcher, signal: controller.signal })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await ready; controller.abort(); await rejected
  expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true)
})

it('times out stalled response bodies and removes its timer', async () => {
  vi.useFakeTimers()
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({ cancel })
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } }))
  const pending = checkServiceReadiness('voice', { fetcher })
  await vi.advanceTimersByTimeAsync(8001)
  expect(await pending).toBe('unavailable')
  expect(cancel).toHaveBeenCalledOnce()
  expect(body.locked).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds a stalled transport even if it ignores abort, and discards its late response', async () => {
  vi.useFakeTimers()
  let resolve!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(done => { resolve = done }))
  const pending = checkServiceReadiness('voice', { fetcher })
  await vi.advanceTimersByTimeAsync(8001)
  expect(await pending).toBe('unavailable')
  expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true)
  const cancel = vi.fn()
  resolve(new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } }))
  await vi.advanceTimersByTimeAsync(0)
  expect(cancel).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('does not expose arbitrary transport errors', async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('private provider token'))
  expect(await checkServiceReadiness('voice', { fetcher })).toBe('unavailable')
})
