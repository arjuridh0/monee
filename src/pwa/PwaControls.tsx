import { useState } from 'react'
import { dismissUpdate, installApp, protectStorage, updateApp, usePwa } from './pwa-state'
import { PwaInstallHelp } from './PwaInstallPrompt'
import './pwa-controls.css'

/** Global, non-blocking notice. Only rendered while a new version is waiting. */
export function PwaUpdateBanner() {
  const pwa = usePwa()
  if (!pwa.needRefresh) return null
  return <aside className="pwa-update" role="status" aria-label="Pembaruan aplikasi">
    <p>Versi baru tersedia. Selesaikan isian sebelum memperbarui.</p>
    <div className="pwa-controls__actions">
      <button type="button" onClick={() => { void updateApp() }} disabled={pwa.busy}>Perbarui sekarang</button>
      <button type="button" onClick={dismissUpdate}>Nanti</button>
    </div>
  </aside>
}

/** Install, offline and storage details live inside Atur, never above app content. */
export function PwaControls() {
  const pwa = usePwa()
  const [helpOpen, setHelpOpen] = useState(false)
  if (!pwa.install && !pwa.manualInstall && pwa.storage === 'unsupported' && !pwa.offlineReady && !pwa.message) return null
  return <aside className="pwa-controls" aria-label="Aplikasi dan penyimpanan">
    <details>
      <summary>Aplikasi dan penyimpanan</summary>
      {pwa.offlineReady && <p>Aplikasi dan maskot siap dibuka offline. Suara dan pembacaan struk otomatis memerlukan internet.</p>}
      {pwa.install && <button type="button" disabled={pwa.busy} onClick={() => { void installApp() }}>Pasang Monee</button>}
      {pwa.manualInstall && !pwa.installed && <button type="button" onClick={() => setHelpOpen(true)}>Cara pasang di iPhone atau iPad</button>}
      {pwa.storage !== 'unsupported' && <>
        <p>Salinan offline tersimpan di perangkat ini. Pastikan sinkronisasi selesai atau ekspor backup sebelum menghapus data browser.</p>
        {pwa.storage === 'protected' ? <p role="status">Perlindungan penyimpanan lokal diberikan browser.</p>
          : <button type="button" disabled={pwa.busy} onClick={() => { void protectStorage() }}>Lindungi penyimpanan lokal</button>}
        {pwa.storage === 'declined' && <p role="status">Browser belum memberikan perlindungan. Data masih bisa dibersihkan saat ruang penyimpanan menipis.</p>}
        {pwa.storage === 'error' && <p role="status">Perlindungan tidak dapat diminta pada browser ini.</p>}
      </>}
      {pwa.message && <p role="status">{pwa.message}</p>}
    </details>
    <PwaInstallHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
  </aside>
}
