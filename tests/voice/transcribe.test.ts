import { afterEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudio } from '@/core/stt/transcribe'

afterEach(() => vi.unstubAllGlobals())
describe('managed transcription boundary', () => {
  it('sends only audio to the same-origin server with session credentials and no vendor authorization', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: ' makan 25rb ' }) })
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
    [503, /pengelola/i], [502, /penyedia/i], [500, /Voice/i],
  ])('maps HTTP %i to a safe actionable error', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: () => ({ error: 'secret key and vendor internals' }) }))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(message)
  })
  it.each([
    { type: 'opaqueredirect', status: 0 }, { type: 'basic', status: 302 }, { type: 'basic', status: 307 },
  ])('offers a login navigation without reading or following a redirect ($type, $status)', async response => {
    const json = vi.fn()
    const fetcher = vi.fn().mockResolvedValue({ ...response, ok: false, json })
    vi.stubGlobal('fetch', fetcher)
    const pending = transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))
    await expect(pending).rejects.toThrow(/sesi.*berakhir.*masuk ulang/i)
    await expect(pending).rejects.toMatchObject({ name: 'VoiceAccessError' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![1].redirect).toBe('manual')
    expect(json).not.toHaveBeenCalled()
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'makan 25rb' }) }))
    expect(await transcribeAudio(new Blob(['a'], { type }))).toBe('makan 25rb')
  })
  it.each([{ text: 123 }, { text: '' }, { text: 'x'.repeat(4001) }, null])('rejects malformed text responses', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/teks/i)
  })
  it('shows a safe local message if the server returns invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('server internals') } }))
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/teks/i)
  })
  it('propagates cancellation without uploading after it', async () => {
    const controller = new AbortController(); controller.abort()
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(transcribeAudio(new Blob(['a'], { type: 'audio/webm' }), controller.signal)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
