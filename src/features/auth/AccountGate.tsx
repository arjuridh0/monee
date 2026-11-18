import { useEffect, useRef, useState, type ReactNode } from 'react'
import { WifiOff } from 'lucide-react'
import { Brand } from '@/components/ui/Brand'
import { Button } from '@/components/ui/controls'
import { Skeleton } from '@/components/ui/feedback'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import { accountRequest, getAccountSession } from './account-client'
import { openDatabase, setActiveAccountId } from '@/core/db/migrations'
import { AccountEntry } from './AccountEntry'
import { AccountContext } from './AccountContext'
import { useMoneeStore } from '@/store'
import { syncAccountData } from './sync'
import { subscribeDataChanges } from '@/core/db/changes'
import { SyncNotice } from './SyncNotice'
import './account.css'

type GateState = 'checking' | 'signed-out' | 'ready' | 'offline' | 'error' | 'activation' | 'verified'
const ACTIVE_ACCOUNT_KEY = 'monee:active-account'
const ACCOUNT_ID = /^acct_[a-f0-9]{64}$/

export function AccountGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking')
  const [message, setMessage] = useState('')
  const [verifiedEmail, setVerifiedEmail] = useState('')
  const [pinAuth, setPinAuth] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    const current = ++generation.current
    setState('checking')
    setMessage('')
    void (async () => {
      let localProfile = false
      try {
        if (new URLSearchParams(window.location.search).get('account') === 'verified') {
          const proof = await accountRequest<{ verified: boolean; email?: string }>('/api/auth/verification')
          if (current !== generation.current) return
          if (proof.verified && proof.email) { setVerifiedEmail(proof.email); setState('verified'); return }
        }
        const session = await getAccountSession()
        if (current !== generation.current) return
        if (!session) {
          useMoneeStore.getState().setLocked(true)
          setActiveAccountId(undefined)
          setState('signed-out')
          return
        }
        setPinAuth(session.pinAuth === true)
        if (session.pinSetupRequired) { setState('activation'); return }
        useMoneeStore.setState({ profile: null, buckets: [], categories: [], transactions: [], recurringIncomes: [], goals: [], sweeps: [], snapshot: null, isLoaded: false, isLocked: true })
        setActiveAccountId(session.accountId)
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, session.accountId)
        const db = await openDatabase()
        const existing = await db.get('profile', 'profile')
        localProfile = Boolean(existing)
        await syncAccountData()
        if (current !== generation.current) return
        localStorage.setItem('monee:last-verified', String(Date.now()))
        setState('ready')
      } catch {
        if (current !== generation.current) return
        if (localProfile && navigator.onLine === false) { setMessage('Perubahan tetap tersedia di perangkat ini dan akan disinkronkan saat tersambung.'); setState('offline'); return }
        const lastAccount = localStorage.getItem(ACTIVE_ACCOUNT_KEY)
        const verifiedAt = Number(localStorage.getItem('monee:last-verified') ?? 0)
        if (navigator.onLine === false && lastAccount && ACCOUNT_ID.test(lastAccount) && verifiedAt > 0 && Date.now() - verifiedAt < 30 * 86400_000) {
          setActiveAccountId(lastAccount)
          const cachedProfile = await openDatabase().then(db => db.get('profile', 'profile')).catch(() => undefined)
          if (current !== generation.current) return
          if (cachedProfile) setState('offline')
          else {
            setMessage('Perangkat ini belum punya salinan ledger. Sambungkan internet untuk memeriksa akun sebelum memulai.')
            setState('error')
          }
        } else {
          setMessage('Akun belum bisa dimuat di browser ini. Periksa penyimpanan browser dan koneksi, lalu coba lagi.')
          setState('error')
        }
      }
    })()
    return () => { generation.current += 1 }
  }, [attempt])

  useEffect(() => {
    const expired = () => {
      useMoneeStore.getState().setLocked(true)
      localStorage.removeItem('monee:active-account')
      localStorage.removeItem('monee:last-verified')
      setActiveAccountId(undefined)
      setState('signed-out')
    }
    window.addEventListener('monee:session-expired', expired)
    return () => window.removeEventListener('monee:session-expired', expired)
  }, [])

  useEffect(() => {
    if (state !== 'ready' || !pinAuth) return
    let lastSent = 0, pending = false
    const activity = () => {
      if (document.visibilityState === 'hidden' || pending || Date.now() - lastSent < 60_000) return
      pending = true
      void fetch('/api/session/activity', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(response => {
          if (response.status === 401) window.dispatchEvent(new Event('monee:session-expired'))
          if (response.ok) { lastSent = Date.now(); localStorage.setItem('monee:last-verified', String(lastSent)) }
        }).catch(() => undefined).finally(() => { pending = false })
    }
    // A visible app opened by the user counts as activity; background sync never does.
    activity()
    window.addEventListener('pointerdown', activity, { passive: true })
    window.addEventListener('keydown', activity)
    return () => { window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity) }
  }, [state, pinAuth])

  useEffect(() => {
    if (state !== 'ready') return
    let timer = 0
    const synchronize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { void syncAccountData().catch(() => undefined) }, 500)
    }
    const unsubscribe = subscribeDataChanges(synchronize)
    const onOnline = () => { void syncAccountData().catch(() => undefined) }
    window.addEventListener('online', onOnline)
    return () => { window.clearTimeout(timer); unsubscribe(); window.removeEventListener('online', onOnline) }
  }, [state])

  if (state === 'ready') return <AccountContext.Provider value={{ pinAuth }}><SyncNotice />{children}</AccountContext.Provider>
  if (state === 'offline') return <><div className="account-offline" role="status"><WifiOff size={16} aria-hidden="true" /> {message || 'Offline · perubahan akan disinkronkan saat tersambung'}</div>{children}</>
  if (state === 'checking') return <div className="account-checking"><Skeleton label="Memeriksa akun" /></div>

  if (state === 'activation' || state === 'verified') return <AccountEntry activation={state === 'activation'} {...(state === 'verified' ? { verifiedEmail } : {})} onSuccess={() => setAttempt(value => value + 1)} />

  if (state === 'error') return <main className="account-entry" aria-labelledby="account-title">
    <div className="account-entry__brand"><Brand /></div>
    <section className="account-entry__panel">
      <MascotCanvas mascotId="mochi" state="sad" size={112} />
      <h1 id="account-title">Akun belum bisa diperiksa</h1>
      <p>{message}</p>
      <Button onClick={() => setAttempt(value => value + 1)}>Coba lagi</Button>
      <Button variant="ghost" onClick={() => { window.history.replaceState(null, '', '/'); setState('signed-out') }}>Masuk ke akun</Button>
    </section>
  </main>

  return <AccountEntry onSuccess={() => setAttempt(value => value + 1)} />
}
