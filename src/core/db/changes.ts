const CHANGE_KEY = 'monee:data-revision'

/** Only an invalidation token crosses tabs; finance and credentials stay in IndexedDB. */
export function notifyDataChanged(): void {
  try { window.localStorage.setItem(CHANGE_KEY, crypto.randomUUID()) } catch { /* Refresh on foreground still works. */ }
}

export function subscribeDataChanges(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === CHANGE_KEY) listener() }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
