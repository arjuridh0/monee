import { useRef, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/controls'
import { InlineError } from '@/components/ui/feedback'
import { CodeSlots } from '@/components/reactbits/CodeSlots'
import { accountRequest } from './account-client'

export function AccountPinSheet({ onClose }: { onClose(): void }) {
  const [currentPin, setCurrentPin] = useState(''), [pin, setPin] = useState(''), [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  return <Dialog open sheet title="Ganti PIN akun" onClose={() => { if (!busy) onClose() }}>
    <form className="settings-form" onSubmit={event => {
      event.preventDefault()
      if (submitting.current) return
      if (pin !== confirmPin) { setError('Konfirmasi PIN belum sama.'); return }
      submitting.current = true; setBusy(true); setError('')
      void accountRequest('/api/auth/change-pin', { currentPin, pin, confirmPin }).then(onClose).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'PIN belum berubah. Coba lagi.'); setCurrentPin('')
      }).finally(() => { submitting.current = false; setBusy(false) })
    }}>
      <p>PIN baru berlaku di semua perangkat. Perangkat lain akan keluar setelah PIN berubah.</p>
      <CodeSlots ariaLabel="PIN akun saat ini" value={currentPin} disabled={busy} onChange={setCurrentPin} />
      <CodeSlots ariaLabel="PIN akun baru" value={pin} disabled={busy} onChange={setPin} />
      <CodeSlots ariaLabel="Konfirmasi PIN baru" value={confirmPin} disabled={busy} onChange={setConfirmPin} />
      {error && <InlineError>{error}</InlineError>}
      <Button type="submit" loading={busy} disabled={[currentPin, pin, confirmPin].some(value => value.length !== 6)}>Simpan PIN akun</Button>
    </form>
  </Dialog>
}
