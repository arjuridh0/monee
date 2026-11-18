import { normalizeReceipt, validateReceiptImage, type ReceiptRecognizer } from './receipt'

export class ReceiptAccessError extends Error {
  constructor() { super('Sesi pembaca struk berakhir. Masuk ulang atau isi manual.'); this.name = 'ReceiptAccessError' }
}
class ReceiptTransportError extends Error {}
const invalid = 'Hasil pembacaan struk tidak dapat dibaca. Coba lagi atau isi manual.'

/** Same-origin only. Provider credentials never enter the browser. */
export const receiptRecognizer: ReceiptRecognizer = async (image, signal) => {
  validateReceiptImage(image)
  if (signal.aborted) throw new Error('Pembacaan struk dibatalkan.')
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 35_000)
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  try {
    const form = new FormData(); form.set('file', image, 'receipt')
    const response = await fetch('/api/receipt', { method: 'POST', credentials: 'same-origin', redirect: 'manual', cache: 'no-store', body: form, signal: controller.signal })
    if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
      void response.body?.cancel().catch(() => {})
      throw new ReceiptAccessError()
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      throw new ReceiptTransportError(response.status === 429 ? 'Tunggu satu menit sebelum membaca struk lagi, atau isi manual.'
        : response.status === 503 ? (response.headers.get('X-Monee-Error') === 'service-not-configured'
          ? 'Pembaca struk belum disiapkan oleh pengelola. Isi manual sementara.'
          : 'Pembaca struk sementara tidak tersedia. Coba lagi nanti atau isi manual.')
          : response.status === 504 ? 'Pembacaan struk terlalu lama. Coba lagi atau isi manual.' : 'Layanan pembaca struk gagal. Coba lagi atau isi manual.')
    }
    const contentType = response.headers.get('Content-Type') ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType) || !response.body) {
      void response.body?.cancel().catch(() => {})
      if (/^text\/html(?:\s*;|$)/i.test(contentType)) throw new ReceiptAccessError()
      throw new ReceiptTransportError(invalid)
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let length = 0
    const cancel = () => { void reader.cancel().catch(() => {}) }
    controller.signal.addEventListener('abort', cancel, { once: true })
    try {
      if (controller.signal.aborted) throw new Error('aborted')
      while (true) {
        const { done, value } = await reader.read()
        if (controller.signal.aborted) throw new Error('aborted')
        if (done) break
        length += value.byteLength
        if (length > 64 * 1024) { cancel(); throw new ReceiptTransportError(invalid) }
        chunks.push(value)
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      try { return normalizeReceipt(JSON.parse(new TextDecoder().decode(bytes))) } catch { throw new ReceiptTransportError(invalid) }
    } finally { controller.signal.removeEventListener('abort', cancel); reader.releaseLock() }
  } catch (cause) {
    if (controller.signal.aborted) throw new Error(timedOut ? 'Pembacaan struk terlalu lama. Coba lagi atau isi manual.' : 'Pembacaan struk dibatalkan.')
    if (cause instanceof ReceiptAccessError || cause instanceof ReceiptTransportError) throw cause
    throw new Error('Pembaca struk tidak dapat dihubungi. Periksa koneksi atau isi manual.')
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}
