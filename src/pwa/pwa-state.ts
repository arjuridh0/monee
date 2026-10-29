import { useSyncExternalStore } from 'react'
import { acceptServiceWorkerUpdate, observeServiceWorker } from './service-worker'

export type StorageState = 'unsupported' | 'available' | 'protected' | 'declined' | 'error'

interface InstallEvent extends Event {
  prompt(): Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaSnapshot {
  install: InstallEvent | null
  needRefresh: boolean
  offlineReady: boolean
  storage: StorageState
  busy: boolean
  message: string
}

const INITIAL: PwaSnapshot = {
  install: null,
  needRefresh: false,
  offlineReady: false,
  storage: 'unsupported',
  busy: false,
  message: '',
}

let snapshot = INITIAL
const listeners = new Set<() => void>()
let started = false

function publish(patch: Partial<PwaSnapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  observeServiceWorker(({ needRefresh, offlineReady }) => publish({ needRefresh, offlineReady }))
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    publish({ install: event as InstallEvent })
  })
  window.addEventListener('appinstalled', () => publish({ install: null }))
  if (typeof navigator.storage?.persist === 'function') {
    publish({ storage: 'available' })
    void navigator.storage.persisted?.().then(value => {
      if (value) publish({ storage: 'protected' })
    }).catch(() => undefined)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  start()
  return () => { listeners.delete(listener) }
}

export function usePwa(): PwaSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}

/** Test isolation only: the runtime store owns browser listeners for the app lifetime. */
export function resetPwaState(): void {
  snapshot = INITIAL
  listeners.clear()
  started = false
}

export function dismissUpdate(): void {
  publish({ needRefresh: false })
}

export async function installApp(): Promise<void> {
  const event = snapshot.install
  if (!event || snapshot.busy) return
  publish({ busy: true, message: '' })
  try {
    await event.prompt()
    const choice = await event.userChoice
    publish({ message: choice.outcome === 'accepted' ? 'Permintaan pemasangan diterima browser.' : 'Pemasangan dibatalkan.' })
  } catch {
    publish({ message: 'Pemasangan belum tersedia. Coba lagi dari menu browser.' })
  } finally {
    publish({ install: null, busy: false })
  }
}

export async function protectStorage(): Promise<void> {
  if (snapshot.busy) return
  if (typeof navigator.storage?.persist !== 'function') {
    publish({ storage: 'unsupported' })
    return
  }
  publish({ busy: true })
  try {
    publish({ storage: await navigator.storage.persist() ? 'protected' : 'declined' })
  } catch {
    publish({ storage: 'error' })
  } finally {
    publish({ busy: false })
  }
}

export async function updateApp(): Promise<void> {
  if (snapshot.busy) return
  publish({ busy: true })
  try {
    await acceptServiceWorkerUpdate()
  } catch {
    publish({ message: 'Pembaruan belum berhasil. Coba lagi saat terhubung.' })
  } finally {
    publish({ busy: false })
  }
}
