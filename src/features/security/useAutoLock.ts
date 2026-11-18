import { useEffect } from 'react'
import { useMoneeStore } from '@/store'

const BACKGROUND_LOCK_MS = 5 * 60 * 1_000

/** Lock on return, using wall time because browsers suspend background timers. */
export function useAutoLock() {
  const isLoaded = useMoneeStore(state => state.isLoaded)
  const hasProfile = useMoneeStore(state => Boolean(state.profile))
  const hasPin = useMoneeStore(state => Boolean(state.profile?.pinHash && state.profile.pinSalt))
  const isLocked = useMoneeStore(state => state.isLocked)
  const setLocked = useMoneeStore(state => state.setLocked)

  useEffect(() => {
    if (!isLoaded || !hasProfile || !hasPin || isLocked) return
    let backgroundAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null

    const rememberBackground = () => { backgroundAt ??= Date.now() }
    const checkReturn = () => {
      if (backgroundAt === null) return
      const elapsed = Date.now() - backgroundAt
      backgroundAt = null
      if (elapsed >= BACKGROUND_LOCK_MS) setLocked(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') rememberBackground()
      else checkReturn()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', rememberBackground)
    window.addEventListener('pageshow', checkReturn)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', rememberBackground)
      window.removeEventListener('pageshow', checkReturn)
    }
  }, [isLoaded, hasProfile, hasPin, isLocked, setLocked])
}
