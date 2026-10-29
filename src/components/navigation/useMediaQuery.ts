import { useCallback, useSyncExternalStore } from 'react'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// Nav kontrak: docs/03-ux-interaction.md. Bottom nav <768 (D35), sidebar ≥768 (D44).
export function useMediaQuery(query: string): boolean {
  const matches = useCallback(() => window.matchMedia(query).matches, [query])
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(query)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, matches, () => false)
}
