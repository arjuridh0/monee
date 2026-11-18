export class VoiceAccessError extends Error {
  constructor() {
    super('Sesi login berakhir. Pilih Masuk ulang layanan suara untuk masuk kembali.')
    this.name = 'VoiceAccessError'
  }
}

const MAX_RESPONSE_BYTES = 64 * 1024
const INVALID_TRANSCRIPT = 'Teks rekaman belum terbaca. Ulangi atau ketik manual, ya.'

async function readBoundedJson(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<unknown> {
  const reader = body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    signal.throwIfAborted()
    while (true) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      length += value.byteLength
      if (length > MAX_RESPONSE_BYTES) throw new Error(INVALID_TRANSCRIPT)
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock() }
}

/** Managed same-origin upload; the server owns provider credentials and options. */
export async function transcribeAudio(audio: Blob, signal?: AbortSignal): Promise<string> {
  if (!audio.size || audio.size > 10 * 1024 * 1024) throw new Error('Audio kosong atau terlalu besar. Rekam ulang maksimal 30 detik.')
  const mime = audio.type.split(';')[0]
  const extension = ({ 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg' } as Record<string, string>)[mime ?? '']
  if (!extension) throw new Error('Format rekaman belum didukung. Ketik manual, ya.')
  signal?.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(abort, 30000)
  let response: Response | undefined
  try {
    const form = new FormData()
    form.append('file', audio, `audio.${extension}`)
    response = await fetch('/api/transcribe', { method: 'POST', body: form, signal: controller.signal, redirect: 'manual', credentials: 'same-origin', referrerPolicy: 'no-referrer', cache: 'no-store' })
    controller.signal.throwIfAborted()
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400) || response.status === 401) {
      throw new VoiceAccessError()
    }
    if (!response.ok) {
      if (response.status === 403) throw new Error('Akun ini belum memiliki akses layanan suara. Hubungi pengelola Monee.')
      if (response.status === 429) throw new Error('Terlalu banyak permintaan. Tunggu sebentar atau ketik manual.')
      if (response.status === 503) throw new Error(response.headers?.get('X-Monee-Error') === 'service-not-configured'
        ? 'Layanan suara belum disiapkan pengelola Monee. Ketik manual, ya.'
        : 'Layanan suara sementara tidak tersedia. Coba lagi nanti atau ketik manual.')
      if (response.status === 504) throw new Error('Layanan suara terlalu lama merespons. Coba lagi atau ketik manual.')
      if (response.status === 502) throw new Error('Penyedia transkripsi sedang tidak tersedia. Coba lagi nanti atau ketik manual.')
      if (response.status === 413) throw new Error('Rekaman terlalu besar. Coba rekam ulang lebih singkat, ya.')
      throw new Error('Voice tidak bisa digunakan sekarang. Coba lagi atau ketik manual, ya.')
    }
    // Some access gateways return a login document with HTTP 200.
    const contentType = response.headers.get('content-type') ?? ''
    if (/^text\/html(?:\s*;|$)/i.test(contentType)) throw new VoiceAccessError()
    if (!/^application\/json(?:\s*;|$)/i.test(contentType) || !response.body) throw new Error(INVALID_TRANSCRIPT)
    const data = await readBoundedJson(response.body, controller.signal)
    controller.signal.throwIfAborted()
    if (typeof data !== 'object' || data === null || !('text' in data) || typeof data.text !== 'string'
      || !data.text.trim() || data.text.length > 4000) throw new Error(INVALID_TRANSCRIPT)
    return data.text.trim()
  } catch (cause) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Rekaman dibatalkan.' : 'Layanan suara terlalu lama merespons. Coba lagi atau ketik manual, ya.')
    if (cause instanceof SyntaxError) throw new Error(INVALID_TRANSCRIPT)
    if (cause instanceof TypeError) throw new Error('Voice tidak tersambung. Periksa internet atau ketik manual, ya.')
    throw cause
  } finally {
    // Release unread error/oversized bodies without waiting for the transport to close.
    void response?.body?.cancel().catch(() => {})
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
