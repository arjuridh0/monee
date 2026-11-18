import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { LiveAnalytics } from '@/components/layout/LiveAnalytics'
import { AppLayout } from '@/components/layout/AppLayout'
import { RootNav } from '@/components/navigation/RootNav'
import { REDUCED_MOTION_QUERY, useMediaQuery } from '@/components/navigation/useMediaQuery'
import { Button } from '@/components/ui/controls'
import { InlineError, Skeleton } from '@/components/ui/feedback'
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen'
import { PinScreen } from '@/features/security/PinScreen'
import { useAutoLock } from '@/features/security/useAutoLock'
import { useSessionRefresh } from '@/features/security/useSessionRefresh'
import { WelcomeDashboard } from '@/features/onboarding/WelcomeDashboard'
import { QuickAddDialog } from '@/features/transactions/QuickAddDialog'
import { HistoryScreen } from '@/features/history/HistoryScreen'
import { SavingsScreen } from '@/features/savings/SavingsScreen'
import { applyMascotTheme } from '@/theme/mascot-themes'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { useMoneeStore } from '@/store'
import { ROUTES } from './routes'
import { PwaUpdateBanner } from '@/pwa/PwaControls'
import { PwaInstallPrompt } from '@/pwa/PwaInstallPrompt'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import { AccountGate } from '@/features/auth/AccountGate'
import './shell.css'

const DevPlayground = import.meta.env.DEV ? lazy(() => import('./DevPlayground')) : null

const ROOT_TABS: readonly string[] = [ROUTES.home, ROUTES.history, ROUTES.savings, ROUTES.settings]

function RootLayout() {
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [voiceFirst, setVoiceFirst] = useState(false)
  const location = useLocation()
  const outlet = useOutlet()
  const previous = useRef(location.pathname)
  const positions = useRef(new Map<string, number>())
  const mounted = useRef(false)
  useLayoutEffect(() => {
    if (!('scrollRestoration' in window.history)) return
    const restoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => { window.history.scrollRestoration = restoration }
  }, [])
  useEffect(() => {
    const open = () => { setVoiceFirst(false); setQuickAddOpen(true) }
    const voice = () => { setVoiceFirst(true); setQuickAddOpen(true) }
    window.addEventListener('monee:quick-add', open)
    window.addEventListener('monee:voice', voice)
    return () => { window.removeEventListener('monee:quick-add', open); window.removeEventListener('monee:voice', voice) }
  }, [])
  useLayoutEffect(() => {
    const path = location.pathname
    mounted.current = true
    const previousPath = previous.current
    previous.current = path
    const moved = path !== previousPath
    if (moved) {
      window.scrollTo({ left: 0, top: positions.current.get(path) ?? 0, behavior: 'instant' })
      navigator.vibrate?.(8)
    }
    // Record while the route is active, before a shorter destination can clamp scrollY.
    const savePosition = () => positions.current.set(path, window.scrollY)
    savePosition()
    window.addEventListener('scroll', savePosition, { passive: true })
    const feedbackTimer = window.setTimeout(() => {
      const state = path === '/' ? 'idle' : path === '/riwayat' ? 'thinking' : path === '/tabungan' ? 'happy' : 'greeting'
      window.dispatchEvent(new CustomEvent('monee:tab', { detail: state }))
    }, moved ? 80 : 0)
    return () => { window.removeEventListener('scroll', savePosition); window.clearTimeout(feedbackTimer) }
  }, [location.pathname])
  return <AppLayout navigation={<RootNav onAddTransaction={() => { setVoiceFirst(true); setQuickAddOpen(true) }} />} analytics={<LiveAnalytics />}>
    <div className="tab-content-stage">
      <TabPanel key={location.pathname} initial={mounted.current}>{outlet}</TabPanel>
    </div>
    {quickAddOpen && <QuickAddDialog open initialVoice={voiceFirst} onClose={() => setQuickAddOpen(false)} />}
    <PwaInstallPrompt />
  </AppLayout>
}

function TabPanel({ children, initial }: { children: ReactNode; initial: boolean }) {
  const reduce = useMediaQuery(REDUCED_MOTION_QUERY)
  // Mount only the current outlet; rapid taps must never retain interactive old screens.
  return <motion.div className="tab-content"
    initial={initial && !reduce ? { y: 4, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }}
    transition={reduce ? { duration: 0 } : { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}>
    {children}
  </motion.div>
}

function SessionApp() {
  const loaded = useMoneeStore(state => state.isLoaded)
  const locked = useMoneeStore(state => state.isLocked)
  const profile = useMoneeStore(state => state.profile)
  const load = useMoneeStore(state => state.load)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const destination = useRef(ROOT_TABS.includes(location.pathname) ? location.pathname : ROUTES.home)
  useEffect(() => {
    if (loaded) return
    let alive = true
    setError(false)
    void load().catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [loaded, load, retry])
  const savedMascotId = profile?.mascotId
  useEffect(() => { if (savedMascotId) applyMascotTheme(savedMascotId) }, [savedMascotId])
  useEffect(() => {
    if (ROOT_TABS.includes(location.pathname)) destination.current = location.pathname
  }, [location.pathname])

  if (!loaded) return <AppLayout>{error ? <div className="session-loading">
    <MascotCanvas mascotId={profile?.mascotId ?? 'mochi'} state="sad" size={140} />
    <h1>Pengaturan belum bisa dibuka</h1><InlineError>Coba buka lagi. Data yang sudah tersimpan tetap ada di perangkatmu.</InlineError>
    <Button onClick={() => setRetry(value => value + 1)}>Coba lagi</Button>
  </div> : <Skeleton label="Membuka Monee" />}</AppLayout>
  if (!profile) return location.pathname === ROUTES.onboarding
    ? <AppLayout><OnboardingScreen /></AppLayout> : <Navigate to={ROUTES.onboarding} replace />
  if (locked) return location.pathname === ROUTES.pin
    ? <AppLayout><PinScreen onUnlock={() => navigate(destination.current, { replace: true })} /></AppLayout> : <Navigate to={ROUTES.pin} replace />

  return <Routes>
    <Route element={<RootLayout />}>
      <Route index element={<WelcomeDashboard />} />
      <Route path={ROUTES.history} element={<HistoryScreen />} />
      <Route path={ROUTES.savings} element={<SavingsScreen />} />
      <Route path={ROUTES.settings} element={<SettingsScreen />} />
    </Route>
    <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
  </Routes>
}

function AuthenticatedApp() {
  useAutoLock()
  useSessionRefresh()
  return <><PwaUpdateBanner /><Routes>
    {import.meta.env.DEV && DevPlayground && <Route path="/dev/ui" element={<Suspense fallback={<AppLayout><Skeleton label="Membuka ruang coba" /></AppLayout>}><DevPlayground /></Suspense>} />}
    <Route path="*" element={<SessionApp />} />
  </Routes></>
}

export function AppShell() {
  const app = <AuthenticatedApp />
  return import.meta.env.DEV ? app : <AccountGate>{app}</AccountGate>
}
