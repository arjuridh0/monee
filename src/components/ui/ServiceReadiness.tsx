import { useEffect, useId, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { checkServiceReadiness, serviceAuthPath, type ManagedService, type ServiceReadinessState } from '@/core/http/service-readiness'
import { Button } from './controls'

/** Optional diagnostic feedback; it does not authorize uploads or test a provider. */
export function ServiceReadiness({ service }: { service: ManagedService }) {
  const hintId = useId()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ service: ManagedService; state: ServiceReadinessState }>({ service, state: 'checking' })
  const state = result.service === service ? result.state : 'checking'
  const name = service === 'receipt' ? 'pembaca struk' : 'layanan suara'
  const checking = state === 'checking'
  useEffect(() => {
    const controller = new AbortController()
    setResult({ service, state: 'checking' })
    void checkServiceReadiness(service, { signal: controller.signal }).then(state => {
      if (!controller.signal.aborted) setResult({ service, state })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ service, state: 'unavailable' })
    })
    return () => controller.abort()
  }, [service, attempt])

  const message: Record<ServiceReadinessState, string> = {
    checking: `Memeriksa konfigurasi ${name}…`,
    configured: `Konfigurasi ${name} tersedia.`,
    'not-configured': `Konfigurasi ${name} belum disiapkan pengelola. Kamu tetap bisa mengisi manual.`,
    'auth-required': `Akses ${name} perlu diverifikasi. Masuk ulang untuk memeriksa konfigurasi.`,
    unavailable: `Konfigurasi ${name} belum dapat diperiksa. Coba lagi atau isi manual.`,
  }
  return <div>
    <p className="ui-helper" role="status" aria-live="polite" aria-atomic="true" aria-busy={checking} aria-describedby={hintId}>
      {checking && <LoaderCircle className="ui-spin" size={16} aria-hidden="true" />}
      {message[state]}
    </p>
    <p id={hintId} className="ui-helper">Pemeriksaan ini hanya memeriksa konfigurasi server, bukan koneksi atau keberhasilan penyedia AI.</p>
    <Button variant="ghost" disabled={checking} onClick={() => setAttempt(value => value + 1)}>Periksa lagi</Button>
    {state === 'auth-required' && <p className="ui-helper"><a href={serviceAuthPath(service)}>Masuk ulang {name}</a></p>}
  </div>
}
