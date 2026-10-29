import { useState } from 'react'
import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { CodeSlots } from '@/components/reactbits/CodeSlots'
import { Button } from '@/components/ui/controls'
import { InlineError } from '@/components/ui/feedback'

export function PinStep({ onFinish, busy }: { onFinish: (pin: string) => void; busy: boolean }) {
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [understood, setUnderstood] = useState(false)
  const mismatch = confirmation.length === 6 && confirmation !== pin
  return <form className="onboarding-step" onSubmit={event => {
    event.preventDefault()
    if (pin.length === 6 && pin === confirmation && understood && !busy) onFinish(pin)
  }}>
    <div className="onboarding-lock-icon"><LockKeyhole size={36} aria-hidden="true" /></div>
    <header className="onboarding-heading"><h1>Kunci kecil untuk datamu</h1>
      <p>Buat PIN 6 digit yang mudah kamu ingat.</p></header>
    <CodeSlots ariaLabel="Buat PIN 6 digit" value={pin} onChange={setPin} disabled={busy} mask />
    <CodeSlots ariaLabel="Ulangi PIN 6 digit" value={confirmation} onChange={setConfirmation} disabled={busy} mask />
    {mismatch && <InlineError>PIN belum sama. Periksa ulang, ya.</InlineError>}
    <div className="onboarding-warning"><ShieldCheck size={24} aria-hidden="true" /><div>
      <strong>PIN tidak bisa dipulihkan</strong>
      <p>PIN ini satu-satunya kunci datamu. Lupa = data tidak bisa dibuka. Export backup rutin ya!</p>
    </div></div>
    <label className="onboarding-acknowledge"><input type="checkbox" checked={understood} disabled={busy}
      onChange={event => setUnderstood(event.target.checked)} /><span>Aku ngerti, dan akan mengingat PIN-ku.</span></label>
    <Button type="submit" disabled={pin.length !== 6 || pin !== confirmation || !understood || busy} loading={busy}>Selesai &amp; masuk</Button>
    <p className="onboarding-private">Tersimpan di perangkat ini. Hanya kamu yang memegang kuncinya.</p>
  </form>
}
