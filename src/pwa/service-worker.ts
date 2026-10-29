/// <reference types="vite-plugin-pwa/client" />

export interface ServiceWorkerStatus { needRefresh: boolean; offlineReady: boolean }
let status: ServiceWorkerStatus = { needRefresh: false, offlineReady: false }
const listeners = new Set<(value: ServiceWorkerStatus) => void>()
let started = false
let update: ((reloadPage?: boolean) => Promise<void>) | undefined

function publish(next: Partial<ServiceWorkerStatus>) {
  status = { ...status, ...next }
  for (const listener of listeners) listener(status)
}

export function observeServiceWorker(listener: (value: ServiceWorkerStatus) => void): () => void {
  listeners.add(listener)
  listener(status)
  if (!started && 'serviceWorker' in navigator) {
    started = true
    void import('virtual:pwa-register').then(({ registerSW }) => {
      update = registerSW({
        immediate: true,
        onNeedRefresh: () => publish({ needRefresh: true }),
        onOfflineReady: () => publish({ offlineReady: true }),
      })
    }).catch(() => { started = false })
  }
  return () => { listeners.delete(listener) }
}

export async function acceptServiceWorkerUpdate(): Promise<void> {
  await update?.(true)
}
