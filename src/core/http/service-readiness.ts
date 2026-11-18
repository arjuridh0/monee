export type ManagedService = 'voice' | 'receipt'
export type ServiceReadinessResult = 'configured' | 'not-configured' | 'auth-required' | 'unavailable'
export type ServiceReadinessState = 'checking' | ServiceReadinessResult

export function serviceAuthPath(service: ManagedService): string {
  return service === 'receipt' ? '/auth/refresh?service=receipt' : '/auth/refresh'
}

interface ReadinessOptions {
  signal?: AbortSignal
  fetcher?: typeof fetch
}

/** Checks server bindings only. It never uploads data or tests the AI provider. */
export async function checkServiceReadiness(service: ManagedService, { signal, fetcher = fetch }: ReadinessOptions = {}): Promise<ServiceReadinessResult> {
  signal?.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), 8000)
  let response: Response | undefined
  let rejectAborted!: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', rejectAborted, { once: true })
  })
  try {
    const endpoint = service === 'receipt' ? 'receipt' : 'transcribe'
    const request = fetcher(`/api/${endpoint}?check=ready`, {
      method: 'GET', credentials: 'same-origin', redirect: 'manual', cache: 'no-store', signal: controller.signal,
    }).then(result => {
      if (controller.signal.aborted) {
        void result.body?.cancel().catch(() => {})
        controller.signal.throwIfAborted()
      }
      return result
    })
    // Settle even if an interrupted transport does not promptly reject its promise.
    response = await Promise.race([request, aborted])
    controller.signal.throwIfAborted()
    if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403
      || (response.status >= 300 && response.status < 400)) return 'auth-required'
    if (response.status === 503 && response.headers.get('X-Monee-Error') === 'service-not-configured') return 'not-configured'
    if (!response.ok) return 'unavailable'
    const type = response.headers.get('Content-Type') ?? ''
    if (/^text\/html(?:\s*;|$)/i.test(type)) return 'auth-required'
    if (!/^application\/json(?:\s*;|$)/i.test(type) || !response.body) return 'unavailable'
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let length = 0
    const cancel = () => { void reader.cancel().catch(() => {}) }
    controller.signal.addEventListener('abort', cancel, { once: true })
    let value: unknown
    try {
      controller.signal.throwIfAborted()
      while (true) {
        const { done, value: bytes } = await reader.read()
        controller.signal.throwIfAborted()
        if (done) break
        length += bytes.byteLength
        if (length > 4096) { cancel(); return 'unavailable' }
        chunks.push(bytes)
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      value = JSON.parse(new TextDecoder().decode(bytes))
    } finally {
      controller.signal.removeEventListener('abort', cancel)
      reader.releaseLock()
    }
    if (value === null || typeof value !== 'object' || !('ready' in value) || typeof value.ready !== 'boolean') return 'unavailable'
    return value.ready ? 'configured' : 'not-configured'
  } catch {
    signal?.throwIfAborted()
    return 'unavailable'
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', rejectAborted)
    void response?.body?.cancel().catch(() => {})
  }
}
