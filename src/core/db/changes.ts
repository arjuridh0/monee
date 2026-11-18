const CHANGE_KEY = 'monee:data-revision'

/** Only an invalidation token crosses tabs; finance and credentials stay in IndexedDB. */
export function notifyDataChanged(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(CHANGE_KEY, crypto.randomUUID()) } catch { /* Refresh on foreground still works. */ }
  window.dispatchEvent(new Event('monee:data-changed'))
}

export function subscribeDataChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent) => { if (event.key === CHANGE_KEY) listener() }
  window.addEventListener('monee:data-changed', listener)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener('monee:data-changed', listener); window.removeEventListener('storage', onStorage) }
}
