import { afterEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudio } from '@/core/stt/transcribe'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('managed transcription boundary', () => {
  it('discards a late successful response after cancellation', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      controller.abort()
      return new Response(body, { headers: { 'content-type': 'application/json' } })
    }))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }), controller.signal)).rejects.toThrow(/dibatalkan/)
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('keeps the timeout active until the response body has finished', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(stream) { stream.enqueue(new TextEncoder().encode('{"text":"unfinished')) }, cancel,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } })))
    const pending = transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))
    const rejected = expect(pending).rejects.toThrow(/terlalu lama/)
    await vi.advanceTimersByTimeAsync(30001)
    await rejected
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('recognizes a successful HTML login page as expired access', async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'text/html' } })
    const json = vi.spyOn(response, 'json')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toMatchObject({ name: 'VoiceAccessError' })
    expect(json).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('aborts a stalled upload with an actionable timeout and clears its timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const rejected = expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/terlalu lama.*coba lagi/i)
    await vi.advanceTimersByTimeAsync(30000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
  it('sends only audio to the same-origin server with session credentials and no vendor authorization', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ text: ' makan 25rb ' }))
    vi.stubGlobal('fetch', fetcher)
    expect(await transcribeAudio(new Blob(['audio'], { type: 'audio/mp4' }))).toBe('makan 25rb')
    const [url, options] = fetcher.mock.calls[0]!
    expect(url).toBe('/api/transcribe')
    expect(options.redirect).toBe('manual')
    expect(options.credentials).toBe('same-origin')
    expect(new Headers(options.headers).has('Authorization')).toBe(false)
    expect(new Headers(options.headers).has('Content-Type')).toBe(false)
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('file').name).toBe('audio.mp4')
    expect([...options.body.keys()]).toEqual(['file'])
  })
  it.each([
    [401, /sesi.*berakhir.*masuk ulang/i], [403, /akses/i], [429, /tunggu/i],
    [503, /sementara.*coba lagi/i], [504, /terlalu lama.*coba lagi/i], [502, /penyedia/i], [413, /besar/i], [500, /Voice/i],
  ])('maps HTTP %i and cancels its unread error body', async (status, message) => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), { status })
    const json = vi.spyOn(response, 'json')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(message)
    expect(cancel).toHaveBeenCalledOnce()
    expect(json).not.toHaveBeenCalled()
  })
  it.each([
    { type: 'opaqueredirect', status: 0 }, { type: 'basic', status: 302 }, { type: 'basic', status: 307 },
  ])('offers a login navigation without reading or following a redirect ($type, $status)', async response => {
    const cancel = vi.fn()
    const json = vi.fn()
    const fetcher = vi.fn().mockResolvedValue({ ...response, ok: false, json, body: new ReadableStream({ cancel }) })
    vi.stubGlobal('fetch', fetcher)
    const pending = transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))
    await expect(pending).rejects.toThrow(/sesi.*berakhir.*masuk ulang/i)
    await expect(pending).rejects.toMatchObject({ name: 'VoiceAccessError' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![1].redirect).toBe('manual')
    expect(json).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('marks an expired session response as an access error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toMatchObject({ name: 'VoiceAccessError' })
  })
  it('rejects empty, over 10 MiB and unsupported audio before uploading', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    for (const audio of [new Blob(), new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'audio/webm' }), new Blob(['a'], { type: 'text/html' })]) {
      await expect(transcribeAudio(audio)).rejects.toThrow()
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'])('accepts %s', async type => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ text: 'makan 25rb' })))
    expect(await transcribeAudio(new Blob(['a'], { type }))).toBe('makan 25rb')
  })
  it.each([{ text: 123 }, { text: '' }, { text: 'x'.repeat(4001) }, null])('rejects malformed text responses', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/teks/i)
  })
  it('shows a safe local message if the server returns invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server internals', { headers: { 'content-type': 'application/json' } })))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/teks/i)
  })
  it('propagates cancellation without uploading after it', async () => {
    const controller = new AbortController(); controller.abort()
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }), controller.signal)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('only labels a 503 as unconfigured when the server confirms missing setup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 503, headers: { 'X-Monee-Error': 'service-not-configured' },
    })))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/belum disiapkan pengelola/)
  })

  it('accepts JSON at the exact 64 KiB response limit', async () => {
    const empty = JSON.stringify({ text: 'makan 25rb', padding: '' })
    const payload = JSON.stringify({ text: 'makan 25rb', padding: 'x'.repeat(64 * 1024 - new TextEncoder().encode(empty).byteLength) })
    expect(new TextEncoder().encode(payload).byteLength).toBe(64 * 1024)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(payload, { headers: { 'content-type': 'application/json; charset=utf-8' } })))
    expect(await transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).toBe('makan 25rb')
  })

  it('rejects JSON one byte over 64 KiB even with a valid short transcript', async () => {
    const empty = JSON.stringify({ text: 'makan 25rb', padding: '' })
    const payload = JSON.stringify({ text: 'makan 25rb', padding: 'x'.repeat(64 * 1024 + 1 - new TextEncoder().encode(empty).byteLength) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(payload, { headers: { 'content-type': 'application/json' } })))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/teks/i)
  })

  it('caps cumulative UTF-8 bytes and cancels before consuming an oversized stream', async () => {
    const payload = JSON.stringify({ text: 'makan 25rb', padding: '😀'.repeat(24000) })
    expect(payload.length).toBeLessThan(64 * 1024)
    const bytes = new TextEncoder().encode(payload)
    let offset = 0
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        if (offset === bytes.length) { stream.close(); return }
        const end = Math.min(offset + 4096, bytes.length)
        stream.enqueue(bytes.subarray(offset, end)); offset = end
      }, cancel,
    }, { highWaterMark: 0 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json', 'content-length': '1' } })))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/teks/i)
    expect(offset).toBeLessThan(bytes.length)
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  it.each(['text/plain', 'application/octet-stream', ''])('rejects and cancels successful non-JSON content (%s)', async contentType => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), { headers: { 'content-type': contentType } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/teks/i)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('rejects a JSON response without a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { headers: { 'content-type': 'application/json' } })))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/teks/i)
  })

  it('cancels a pending response read immediately when the caller aborts', async () => {
    vi.useFakeTimers()
    let reading!: () => void
    const ready = new Promise<void>(resolve => { reading = resolve })
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ pull() { reading() }, cancel }, { highWaterMark: 0 })
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } })))
    const pending = transcribeAudio(new Blob(['a'], { type: 'audio/webm' }), controller.signal)
    const rejected = expect(pending).rejects.toThrow(/dibatalkan/)
    await ready; controller.abort(); await rejected
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the authentication error when cancelling its body rejects', async () => {
    const cancel = vi.fn(async () => { throw new Error('private cancel details') })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 401 })))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toMatchObject({ name: 'VoiceAccessError' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('returns HTTP errors without waiting for a stalled body cancellation', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 429 })))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/tunggu/i)
    expect(cancel).toHaveBeenCalledOnce()
  })
})
