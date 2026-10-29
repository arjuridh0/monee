export class VoiceAccessError extends Error {
  constructor() {
    super('Sesi login berakhir. Pilih Masuk ulang layanan suara untuk masuk kembali.')
    this.name = 'VoiceAccessError'
  }
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
  try {
    const form = new FormData()
    form.append('file', audio, `audio.${extension}`)
    const response = await fetch('/api/transcribe', { method: 'POST', body: form, signal: controller.signal, redirect: 'manual', credentials: 'same-origin', referrerPolicy: 'no-referrer' })
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400) || response.status === 401) {
      throw new VoiceAccessError()
    }
    if (!response.ok) {
      if (response.status === 403) throw new Error('Akun ini belum memiliki akses layanan suara. Hubungi pengelola Monee.')
      if (response.status === 429) throw new Error('Terlalu banyak permintaan. Tunggu sebentar atau ketik manual.')
      if (response.status === 503) throw new Error('Layanan suara belum disiapkan pengelola Monee. Ketik manual, ya.')
      if (response.status === 502) throw new Error('Penyedia transkripsi sedang tidak tersedia. Coba lagi nanti atau ketik manual.')
      throw new Error('Voice tidak bisa digunakan sekarang. Ketik manual, ya.')
    }
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null || !('text' in data) || typeof data.text !== 'string'
      || !data.text.trim() || data.text.length > 4000) throw new Error('Teks rekaman belum terbaca. Ulangi atau ketik manual, ya.')
    return data.text.trim()
  } catch (cause) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Rekaman dibatalkan.' : 'Layanan suara terlalu lama merespons. Ketik manual, ya.')
    if (cause instanceof SyntaxError) throw new Error('Teks rekaman belum terbaca. Ulangi atau ketik manual, ya.')
    if (cause instanceof TypeError) throw new Error('Voice tidak tersambung. Periksa internet atau ketik manual, ya.')
    throw cause
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
