import { isReceiptConfigured, recognizeReceipt, ReceiptHttpError } from './ocr'
import { ApiError as AccountApiError, createAccountApi, type AccountDatabase } from './accounts'

/** Only server bindings belong here. Never import this module into the frontend. */
export interface Env {
  AUTH_PIN_PEPPER?: string
  ASSETS: { fetch(request: Request): Promise<Response> }
  DB?: AccountDatabase
  GROQ_API_KEY?: string
  GEMINI_API_KEY?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  AI_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> }
  AUTH_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> }
}

const MAX_AUDIO = 10 * 1024 * 1024
const MAX_MULTIPART = MAX_AUDIO + 64 * 1024
const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions'

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: 'service-not-configured') { super(message) }
}

function json(body: object, status = 200, code?: string, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders)
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Frame-Options', 'DENY')
  if (status === 429) headers.set('Retry-After', '60')
  if (status === 405 && !headers.has('Allow')) headers.set('Allow', 'POST')
  if (status === 503) headers.set('X-Monee-Error', code ?? 'service-unavailable')
  return Response.json(body, { status, headers: {
    ...Object.fromEntries(headers.entries()),
  } })
}

function isVoiceConfigured(env: Env): boolean {
  return /^gsk_[A-Za-z0-9_-]{6,250}$/.test(env.GROQ_API_KEY?.trim() ?? '')
}

/** Read before parsing multipart/JSON so an untrusted stream cannot grow without a bound. */
async function readBounded(body: ReadableStream<Uint8Array> | null, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!body) throw new HttpError(400, 'Berkas rekaman belum diterima.')
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (signal.aborted) throw new Error('aborted')
    while (true) {
      const { done, value } = await reader.read()
      if (signal.aborted) throw new Error('aborted')
      if (done) break
      length += value.byteLength
      if (length > maximum) {
        void reader.cancel().catch(() => {})
        throw new HttpError(413, 'Ukuran rekaman terlalu besar. Maksimal 10 MB.')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock() }
}

async function validAudio(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const type = file.type.split(';')[0]?.trim().toLowerCase()
  if (type === 'audio/webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  if (type === 'audio/ogg') return bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53
  if (type === 'audio/mp4') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp'
  return false
}

/** A fetch dependency permits transport tests with real JWT verification, without an auth bypass. */
export function createWorker(fetcher: typeof fetch = fetch) {
  const accountApi = createAccountApi(fetcher)
  async function authorize(request: Request, env: Env, scope: 'voice' | 'receipt'): Promise<string> {
    if (request.headers.get('Origin') !== new URL(request.url).origin
      || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      throw new HttpError(403, scope === 'receipt' ? 'Permintaan struk harus berasal dari aplikasi Monee.' : 'Permintaan suara harus berasal dari aplikasi Monee.')
    }
    let active: Awaited<ReturnType<typeof accountApi.authenticate>>
    try { active = await accountApi.authenticate(request, env) }
    catch (cause) {
      if (cause instanceof AccountApiError) throw new HttpError(cause.status, cause.message)
      throw cause
    }
    const { accountId, setCookie } = active
    const limiter = env.AI_RATE_LIMIT
    if (!limiter) throw new HttpError(503, scope === 'receipt' ? 'Pembaca struk belum disiapkan oleh pengelola. Isi manual sementara.' : 'Layanan suara belum disiapkan oleh pengelola. Gunakan input teks sementara.', 'service-not-configured')
    try {
      if (!(await limiter.limit({ key: `${scope}:${accountId}` })).success) {
        throw new HttpError(429, scope === 'receipt' ? 'Terlalu banyak permintaan struk. Tunggu satu menit atau isi manual.' : 'Terlalu banyak permintaan suara. Tunggu satu menit, lalu coba lagi.')
      }
    } catch (cause) {
      if (cause instanceof HttpError) throw cause
      throw new HttpError(503, scope === 'receipt' ? 'Pembaca struk sedang tidak tersedia. Isi manual sementara.' : 'Layanan suara sedang tidak tersedia. Coba lagi nanti.')
    }
    return setCookie
  }

  async function transcribe(request: Request, env: Env): Promise<Response> {
    const team = env.ACCESS_TEAM_DOMAIN?.trim()
    const audience = env.ACCESS_AUD?.trim()
    const secret = env.GROQ_API_KEY?.trim()
    if ((!env.AUTH_PIN_PEPPER && (!team || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\/?$/i.test(team)
      || !audience || !/^[a-f0-9]{64}$/i.test(audience)))
      || !secret || !/^gsk_[A-Za-z0-9_-]{6,250}$/.test(secret) || !env.AI_RATE_LIMIT) {
      throw new HttpError(503, 'Layanan suara belum disiapkan oleh pengelola. Gunakan input teks sementara.', 'service-not-configured')
    }
    const setCookie = await authorize(request, env, 'voice')
    const contentType = request.headers.get('Content-Type') ?? ''
    if (!/^multipart\/form-data\s*;/i.test(contentType) || contentType.length > 256) {
      throw new HttpError(400, 'Kirim berkas rekaman sebagai multipart/form-data.')
    }
    const declaredLength = request.headers.get('Content-Length')
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_MULTIPART)) {
      throw new HttpError(413, 'Ukuran rekaman terlalu besar. Maksimal 10 MB.')
    }
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, 30_000)
    const abort = () => controller.abort()
    request.signal.addEventListener('abort', abort, { once: true })
    if (request.signal.aborted) controller.abort()
    try {
      const bytes = await readBounded(request.body, MAX_MULTIPART, controller.signal)
      let form: FormData
      try {
        form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData()
      } catch { throw new HttpError(400, 'Berkas rekaman tidak dapat dibaca.') }
      const entries = [...form.entries()]
      const file = form.get('file')
      if (entries.length !== 1 || entries[0]?.[0] !== 'file' || !file || typeof file === 'string') {
        throw new HttpError(400, 'Kirim satu berkas rekaman saja.')
      }
      if (file.size > MAX_AUDIO) throw new HttpError(413, 'Ukuran rekaman terlalu besar. Maksimal 10 MB.')
      if (!file.size || !await validAudio(file)) throw new HttpError(400, 'Format rekaman harus WebM, MP4, atau Ogg yang valid.')
      if (controller.signal.aborted) throw new Error('aborted')
      const type = file.type.split(';')[0]
      const extension = type === 'audio/mp4' ? 'mp4' : type === 'audio/ogg' ? 'ogg' : 'webm'
      const upstream = new FormData()
      upstream.set('file', file, `voice.${extension}`)
      upstream.set('model', 'whisper-large-v3')
      upstream.set('language', 'id')
      upstream.set('response_format', 'json')
      const response = await fetcher(ENDPOINT, {
        method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: upstream,
        // Workers supports manual/follow only; reject 3xx below without forwarding credentials.
        redirect: 'manual', signal: controller.signal,
      })
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        throw new HttpError(response.status === 429 ? 429 : 502,
          response.status === 429 ? 'Kuota layanan suara sedang penuh. Coba lagi nanti.' : 'Layanan suara sedang tidak tersedia. Gunakan input teks sementara.')
      }
      let result: unknown
      try {
        const output = await readBounded(response.body, 64 * 1024, controller.signal)
        result = JSON.parse(new TextDecoder().decode(output))
      } catch { throw new HttpError(502, 'Hasil layanan suara tidak dapat dibaca. Coba lagi.') }
      if (!result || typeof result !== 'object' || !('text' in result) || typeof result.text !== 'string'
        || !result.text.trim() || result.text.length > 4000) {
        throw new HttpError(502, 'Hasil layanan suara tidak valid. Coba lagi atau ketik manual.')
      }
      return json({ text: result.text.trim() }, 200, undefined, { 'Set-Cookie': setCookie })
    } catch (cause) {
      if (controller.signal.aborted) throw new HttpError(timedOut ? 504 : 408, timedOut
        ? 'Layanan suara terlalu lama merespons. Coba lagi atau ketik manual.' : 'Permintaan rekaman dibatalkan.')
      if (cause instanceof HttpError) throw cause
      throw new HttpError(502, 'Layanan suara tidak dapat dihubungi. Gunakan input teks sementara.')
    } finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort) }
  }

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url), path = url.pathname
      const accountResponse = await accountApi.handle(request, env)
      if (accountResponse) return accountResponse
      // Use a top-level navigation so Access can verify a new device or expired idle session.
      if (path === '/auth/refresh') {
        if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } })
        return new Response(null, { status: 302, headers: { Location: env.AUTH_PIN_PEPPER ? '/' : '/auth/bootstrap', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
      }
      if (path !== '/api' && !path.startsWith('/api/')) return env.ASSETS.fetch(request)
      if (request.method === 'GET' && (path === '/api/transcribe' || path === '/api/receipt')
        && (url.searchParams.get('auth') === 'refresh' || url.searchParams.get('check') === 'ready')) {
        try {
          const scope = path === '/api/receipt' ? 'receipt' : 'voice'
          if (url.searchParams.get('auth') === 'refresh') {
            return new Response(null, { status: 302, headers: { Location: env.AUTH_PIN_PEPPER ? '/' : '/auth/bootstrap', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
          }
          const origin = request.headers.get('Origin')
          if ((origin !== null && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
            throw new HttpError(403, 'Periksa layanan melalui aplikasi Monee.')
          }
          const active = await accountApi.authenticate(request, env)
          return json({ ready: scope === 'receipt' ? isReceiptConfigured(env) : isVoiceConfigured(env) }, 200, undefined, { 'Set-Cookie': active.setCookie })
        } catch (cause) {
          if (cause instanceof AccountApiError) return json({ error: cause.message }, cause.status)
          return cause instanceof HttpError ? json({ error: cause.message }, cause.status, cause.code)
            : json({ error: 'Status layanan belum dapat diperiksa.' }, 503)
        }
      }
      if (path === '/api/receipt') {
        if (request.method !== 'POST') return json({ error: 'Gunakan POST untuk mengirim foto struk.' }, 405)
        try {
          let setCookie = ''
          const result = await recognizeReceipt(request, env, fetcher, async () => { setCookie = await authorize(request, env, 'receipt') })
          return json(result, 200, undefined, { 'Set-Cookie': setCookie })
        }
        catch (cause) {
          return cause instanceof HttpError || cause instanceof ReceiptHttpError ? json({ error: cause.message }, cause.status, cause.code)
            : json({ error: 'Pembaca struk sedang tidak tersedia. Isi manual sementara.' }, 503)
        }
      }
      if (path !== '/api/transcribe') return json({ error: 'Endpoint tidak ditemukan.' }, 404)
      if (request.method !== 'POST') return json({ error: 'Gunakan POST untuk mengirim rekaman.' }, 405)
      try { return await transcribe(request, env) } catch (cause) {
        return cause instanceof HttpError ? json({ error: cause.message }, cause.status, cause.code)
          : json({ error: 'Layanan suara sedang tidak tersedia.' }, 503)
      }
    },
  }
}

export default createWorker()
