import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useIsPresent, usePresenceData, useReducedMotion } from 'framer-motion'
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
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
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
  const direction = ROOT_TABS.indexOf(location.pathname) >= ROOT_TABS.indexOf(previous.current) ? 1 : -1
  useEffect(() => {
    const open = () => { setVoiceFirst(false); setQuickAddOpen(true) }
    const voice = () => { setVoiceFirst(true); setQuickAddOpen(true) }
    window.addEventListener('monee:quick-add', open)
    window.addEventListener('monee:voice', voice)
    return () => { window.removeEventListener('monee:quick-add', open); window.removeEventListener('monee:voice', voice) }
  }, [])
  useEffect(() => {
    const path = location.pathname
    const previousPath = previous.current
    previous.current = path
    const moved = path !== previousPath
    if (moved) positions.current.set(previousPath, window.scrollY)
    const settleTimer = window.setTimeout(() => {
      if (moved) { window.scrollTo(0, positions.current.get(path) ?? 0); navigator.vibrate?.(8) }
    }, moved ? 300 : 0)
    const feedbackTimer = window.setTimeout(() => {
      const state = path === '/' ? 'idle' : path === '/riwayat' ? 'thinking' : path === '/tabungan' ? 'happy' : 'greeting'
      window.dispatchEvent(new CustomEvent('monee:tab', { detail: state }))
    }, moved ? 80 : 0)
    return () => { window.clearTimeout(settleTimer); window.clearTimeout(feedbackTimer) }
  }, [location.pathname])
  return <AppLayout navigation={<RootNav onAddTransaction={() => { setVoiceFirst(false); setQuickAddOpen(true) }} />} analytics={<LiveAnalytics />}>
    <div className="tab-content-stage"><AnimatePresence initial={false} custom={direction}>
      <TabPanel key={location.pathname} direction={direction}>{outlet}</TabPanel>
    </AnimatePresence></div>
    {quickAddOpen && <QuickAddDialog open initialVoice={voiceFirst} onClose={() => setQuickAddOpen(false)} />}
  </AppLayout>
}

function TabPanel({ children, direction }: { children: ReactNode; direction: number }) {
  const present = useIsPresent()
  const exitDirection = usePresenceData() as number | undefined
  // framer's hook captures the preference only at mount; read the live query too.
  const motionHookReduce = useReducedMotion()
  const mediaReduce = useMediaQuery(REDUCED_MOTION_QUERY)
  const reduce = motionHookReduce || mediaReduce
  // Keep inert on a native wrapper: the motion element can be cloned/updated during exit.
  return <div className="tab-panel-guard" aria-hidden={!present || undefined} {...(!present ? { inert: '' } : {})}>
    <motion.div className="tab-content" aria-hidden={!present || undefined}
    {...(present ? {} : { style: { position: 'absolute' as const, inset: 0, pointerEvents: 'none' as const } })}
    initial={{ x: reduce ? 0 : 24 * direction, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
    exit={{ x: reduce ? 0 : -24 * (exitDirection ?? direction), opacity: 0 }}
    transition={reduce ? { duration: 0.12 } : { duration: present ? 0.26 : 0.22, delay: present ? 0.04 : 0, ease: [0.16, 1, 0.3, 1] }}>
    {children}
  </motion.div></div>
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
  useEffect(() => { if (profile) applyMascotTheme(profile.mascotId) }, [profile])
  useEffect(() => {
    if (ROOT_TABS.includes(location.pathname)) destination.current = location.pathname
  }, [location.pathname])

  if (!loaded) return <AppLayout>{error ? <div className="session-loading">
    <MascotCanvas mascotId={profile?.mascotId ?? 'mochi'} state="sad" size={140} />
    <span className="session-error-badge">Perlu dicoba lagi</span><code className="session-error-code">ERR_DATA_READ</code>
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

export function AppShell() {
  useAutoLock()
  useSessionRefresh()
  return <><PwaUpdateBanner /><Routes>
    {import.meta.env.DEV && DevPlayground && <Route path="/dev/ui" element={<Suspense fallback={<AppLayout><Skeleton label="Membuka ruang coba" /></AppLayout>}><DevPlayground /></Suspense>} />}
    <Route path="*" element={<SessionApp />} />
  </Routes></>
}
