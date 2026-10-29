import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { CodeSlots } from '@/components/reactbits/CodeSlots'
import { Button } from '@/components/ui/controls'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import { openDatabase } from '@/core/db/migrations'
import type { LockoutState } from '@/core/finance/types'
import { getLockoutState, isLockedAt, lockoutRemainingSecondsAt, recordFailedAttempt, resetLockout } from '@/core/security/lockout'
import { verifyPin } from '@/core/security/pin'
import { useMoneeStore } from '@/store'
import './security.css'

export function PinScreen({ onUnlock }: { onUnlock?: () => void }) {
  const profile = useMoneeStore(state => state.profile)
  const setLocked = useMoneeStore(state => state.setLocked)
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [lockout, setLockout] = useState<LockoutState>({ attempts: 0, lockedUntil: 0 })
  const [now, setNow] = useState(Date.now)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const inFlight = useRef(false)
  const alive = useRef(true)
  const visibilityGeneration = useRef(0)
  const remaining = lockoutRemainingSecondsAt(lockout, now)

  useEffect(() => {
    alive.current = true
    let cancelled = false
    setReady(false)
    setError('')
    void openDatabase().then(getLockoutState).then(state => {
      if (cancelled) return
      setLockout(state)
      setNow(Date.now())
      setReady(true)
    }).catch(() => {
      if (!cancelled) setError('Kunci belum bisa dibaca. Coba lagi, ya.')
    })
    return () => { cancelled = true; alive.current = false }
  }, [retry])

  useEffect(() => {
    const cancelPendingUnlock = () => {
      visibilityGeneration.current += 1
      setPin('')
      setStatus('idle')
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') cancelPendingUnlock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', cancelPendingUnlock)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', cancelPendingUnlock)
    }
  }, [])

  useEffect(() => {
    if (remaining === 0) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [remaining])

  async function unlock(code: string) {
    if (!profile || !ready || inFlight.current || code.length !== 6
      || document.visibilityState !== 'visible' || isLockedAt(lockout, Date.now())) return
    const generation = visibilityGeneration.current
    const canUnlock = () => alive.current && generation === visibilityGeneration.current
      && document.visibilityState === 'visible'
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const db = await openDatabase()
      // Re-read persistent state so another screen/reload cannot bypass the deadline.
      const stored = await getLockoutState(db)
      if (!alive.current) return
      setLockout(stored)
      setNow(Date.now())
      if (isLockedAt(stored, Date.now()) || !canUnlock()) return

      const freshProfile = await db.get('profile', 'profile')
      if (!freshProfile) { await useMoneeStore.getState().load(); return }
      const correct = await verifyPin(code, freshProfile.pinHash, freshProfile.pinSalt)
      if (!alive.current) return
      if (!correct) {
        const next = await recordFailedAttempt(db)
        if (!alive.current) return
        setLockout(next)
        setNow(Date.now())
        setPin('')
        setStatus('error')
        setError('PIN belum cocok. Coba sekali lagi, ya.')
        return
      }
      // A suspended verification must not grant a session after returning to the app.
      // Incorrect PINs above still count, even when their callback runs in background.
      if (!canUnlock()) return
      await resetLockout(db, freshProfile)
      if (!canUnlock()) return
      await useMoneeStore.getState().load()
      if (!canUnlock()) return
      const loadedProfile = useMoneeStore.getState().profile
      if (loadedProfile?.pinHash !== freshProfile.pinHash || loadedProfile.pinSalt !== freshProfile.pinSalt) {
        throw new Error('ERR_PROFILE_STALE')
      }
      setStatus('success')
      setLocked(false)
      if (onUnlock) onUnlock()
      else navigate('/', { replace: true })
    } catch {
      if (alive.current) {
        setPin('')
        setStatus('error')
        setError('PIN belum bisa diperiksa. Coba lagi, ya.')
      }
    } finally {
      inFlight.current = false
      if (alive.current) setBusy(false)
    }
  }

  return <section className="pin-screen" aria-labelledby="pin-title">
    <div className="pin-brand"><LockKeyhole size={17} aria-hidden="true" /> Monee terkunci</div>
    <div className="pin-mascot"><MascotCanvas mascotId={profile?.mascotId ?? 'mochi'}
      state={busy ? 'thinking' : error ? 'sad' : 'greeting'} size={190} /></div>
    <header className="pin-heading">
      <h1 id="pin-title">Halo lagi{profile?.name ? `, ${profile.name}` : ''}!</h1>
      <p>Masukkan PIN untuk membuka ruang uangmu.</p>
    </header>
    <form className="pin-form" onSubmit={event => { event.preventDefault(); void unlock(pin) }}>
      <CodeSlots value={pin} onChange={value => { setPin(value); if (value) setStatus('idle') }}
        onComplete={code => { void unlock(code) }} status={status}
        disabled={!ready || busy || remaining > 0 || !profile} />
      <div className="pin-feedback" aria-live="polite" aria-atomic="true">
        {remaining > 0 ? <p className="pin-error"><LockKeyhole size={15} aria-hidden="true" />Coba lagi dalam {remaining} detik.</p>
          : error ? <p className="pin-error"><AlertCircle size={15} aria-hidden="true" />{error}</p>
            : <p>{busy ? 'Memeriksa PIN…' : ready ? 'Enam digit, lalu kita lanjut.' : 'Menyiapkan kunci…'}</p>}
      </div>
      {!ready && error ? <Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Coba lagi</Button>
        : <Button type="submit" loading={busy} disabled={!ready || remaining > 0 || pin.length !== 6 || !profile}>Buka Monee</Button>}
    </form>
    <p className="pin-privacy"><ShieldCheck size={16} aria-hidden="true" /> Data keuanganmu tersimpan di perangkat ini.</p>
  </section>
}
