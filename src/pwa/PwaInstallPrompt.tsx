import { useState } from 'react'
import { ArrowDownToLine, Share2 } from 'lucide-react'
import { Brand } from '@/components/ui/Brand'
import { Button } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { dismissInstall, installApp, usePwa } from './pwa-state'
import './pwa-controls.css'

export function PwaInstallHelp({ open, onClose }: { open: boolean; onClose(): void }) {
  return <Dialog open={open} title="Pasang Monee di iPhone atau iPad" onClose={onClose} sheet>
    <div className="pwa-install-guide">
      <p>Tambahkan Monee ke layar utama dari Safari.</p>
      <ol>
        <li>Buka menu <strong>Bagikan</strong> <Share2 size={16} aria-hidden="true" /> di Safari.</li>
        <li>Pilih <strong>Tambah ke Layar Utama</strong>.</li>
        <li>Jika tersedia, aktifkan <strong>Buka sebagai App</strong>, lalu ketuk <strong>Tambah</strong>.</li>
      </ol>
      <Button onClick={onClose}>Mengerti</Button>
    </div>
  </Dialog>
}

/** Only mounted inside the unlocked app, after first-time setup is complete. */
export function PwaInstallPrompt() {
  const pwa = usePwa()
  const [helpOpen, setHelpOpen] = useState(false)
  if (pwa.installed || pwa.installDismissed || pwa.needRefresh || (!pwa.install && !pwa.manualInstall && !pwa.installError)) return null
  return <>
    <section className="pwa-install-prompt" role="region" aria-label="Pasang aplikasi Monee">
      <Brand compact className="pwa-install-prompt__mark" />
      <div className="pwa-install-prompt__body">
        <h2>{pwa.installError ? 'Belum bisa dipasang' : 'Monee di layar utamamu'}</h2>
        <p role={pwa.installError ? 'status' : undefined}>{pwa.installError || 'Buka catatanmu lebih cepat, langsung dari ikon Monee.'}</p>
        <div className="pwa-install-prompt__actions">
          {!pwa.installError && <Button loading={pwa.busy} onClick={() => { if (pwa.install) void installApp(); else setHelpOpen(true) }}>
            <ArrowDownToLine size={16} aria-hidden="true" /> {pwa.install ? 'Pasang' : 'Cara pasang'}
          </Button>}
          <Button variant="ghost" disabled={pwa.busy} onClick={dismissInstall}>{pwa.installError ? 'Tutup' : 'Nanti'}</Button>
        </div>
      </div>
    </section>
    <PwaInstallHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
  </>
}
