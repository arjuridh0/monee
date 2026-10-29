import { useEffect } from 'react'
import { getToday } from '@/core/finance/period'
import { subscribeDataChanges } from '@/core/db/changes'
import { useMoneeStore } from '@/store'

/** Resumed sessions and midnight use the same atomic refresh as initial load. */
export function useSessionRefresh() {
  const loaded = useMoneeStore(state => state.isLoaded)
  useEffect(() => {
    if (!loaded) return
    let today = getToday()
    let active = true
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      void useMoneeStore.getState().load().then(() => {
        if (active) today = getToday()
      }).catch(() => {
        // Lock the session when fresh financial/security state cannot be read.
        if (active) useMoneeStore.getState().setLocked(true)
      })
    }
    const visibility = () => { if (document.visibilityState === 'visible') refresh() }
    const stop = subscribeDataChanges(refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', visibility)
    const timer = window.setInterval(() => { if (getToday() !== today) refresh() }, 1000)
    return () => {
      active = false; stop(); window.clearInterval(timer)
      window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [loaded])
}
