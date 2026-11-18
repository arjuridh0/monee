import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Brand } from '@/components/ui/Brand'
import { Button, TextField } from '@/components/ui/controls'
import { InlineError } from '@/components/ui/feedback'
import { CodeSlots } from '@/components/reactbits/CodeSlots'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import { accountRequest, verifyAccountEmail } from './account-client'

export function AccountEntry({ activation = false, verifiedEmail, onSuccess }: { activation?: boolean; verifiedEmail?: string; onSuccess(): void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>(activation ? 'register' : 'login')
  const [email, setEmail] = useState(''), [pin, setPin] = useState(''), [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const title = verifiedEmail ? 'Buat PIN akunmu' : activation ? 'Aktifkan PIN akun' : mode === 'login' ? 'Masuk ke Monee' : mode === 'register' ? 'Buat akun Monee' : 'Pulihkan PIN akun'
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      if (verifiedEmail) {
        if (pin !== confirmPin) throw new Error('Konfirmasi PIN belum sama.')
        await accountRequest('/api/auth/complete', { pin, confirmPin })
        window.history.replaceState(null, '', window.location.pathname)
        onSuccess()
      } else if (mode === 'login' && !activation) {
        await accountRequest('/api/auth/login', { email, pin }); onSuccess()
      } else await verifyAccountEmail(activation ? 'activate' : mode === 'recover' ? 'recover' : 'register')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Belum berhasil. Coba lagi.'); setPin(''); setConfirmPin('') }
    finally { submitting.current = false; setBusy(false) }
  }
  const choose = (next: typeof mode) => { setMode(next); setError(''); setPin(''); setConfirmPin('') }
  return <main className="account-entry" aria-labelledby="account-title">
    <div className="account-entry__brand"><Brand /></div>
    <section className="account-entry__panel">
      <MascotCanvas mascotId="mochi" state={busy ? 'thinking' : 'greeting'} size={80} />
      <h1 id="account-title">{title}</h1>
      <p>{verifiedEmail ? `Email terverifikasi: ${verifiedEmail}. PIN ini berlaku di semua perangkatmu.`
        : activation ? 'Satu kali saja: verifikasi email dan buat PIN untuk akunmu. Data yang sudah ada tetap terhubung.'
        : mode === 'login' ? 'Catatanmu ikut ke mana pun kamu pergi.'
        : mode === 'register' ? 'Verifikasi email sekali, buat PIN, lalu atur Monee sesuai kebutuhanmu.'
        : 'Verifikasi email akunmu, lalu buat PIN baru. Perangkat lain akan keluar dari akun.'}</p>
      <form className="account-form" onSubmit={event => { void submit(event) }}>
        {mode === 'login' && !verifiedEmail && !activation && <TextField label="Email" type="email" autoComplete="username" required maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />}
        {(verifiedEmail || (mode === 'login' && !activation)) && <CodeSlots ariaLabel="PIN akun 6 digit" value={pin} disabled={busy} onChange={setPin} />}
        {verifiedEmail && <CodeSlots ariaLabel="Konfirmasi PIN akun" value={confirmPin} disabled={busy} onChange={setConfirmPin} />}
        <div aria-live="polite">{error && <InlineError>{error}</InlineError>}</div>
        <Button type="submit" loading={busy} disabled={Boolean(verifiedEmail ? pin.length !== 6 || confirmPin.length !== 6 : mode === 'login' && !activation && (!email || pin.length !== 6))}>
          {verifiedEmail ? 'Simpan PIN dan lanjutkan' : mode === 'login' && !activation ? 'Masuk' : 'Verifikasi email'}
        </Button>
      </form>
      {!verifiedEmail && !activation && (mode === 'login' ? <div className="account-entry__actions">
        <Button variant="ghost" disabled={busy} onClick={() => choose('recover')}>Lupa PIN</Button>
        <Button variant="ghost" disabled={busy} onClick={() => choose('register')}>Buat akun</Button>
      </div> : <Button variant="ghost" disabled={busy} onClick={() => choose('login')}><ArrowLeft size={16} aria-hidden="true" /> Kembali ke masuk</Button>)}
      {!verifiedEmail && !activation && mode === 'login' && <Button variant="ghost" className="account-entry__legacy" disabled={busy} onClick={() => choose('register')}>Aktifkan PIN akun versi lama</Button>}
      <p className="account-entry__session">Tetap masuk selama digunakan. Login ulang setelah 30 hari tidak aktif.</p>
    </section>
  </main>
}
