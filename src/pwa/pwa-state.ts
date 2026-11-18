import { useSyncExternalStore } from 'react'
import { acceptServiceWorkerUpdate, observeServiceWorker } from './service-worker'
import { cleanupRetiredAssetCaches } from './retired-assets'

export type StorageState = 'unsupported' | 'available' | 'protected' | 'declined' | 'error'

interface InstallEvent extends Event {
  prompt(): Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaSnapshot {
  install: InstallEvent | null
  installed: boolean
  manualInstall: boolean
  installDismissed: boolean
  installError: string
  needRefresh: boolean
  offlineReady: boolean
  storage: StorageState
  busy: boolean
  message: string
}

const INITIAL: PwaSnapshot = {
  install: null,
  installed: false,
  manualInstall: false,
  installDismissed: false,
  installError: '',
  needRefresh: false,
  offlineReady: false,
  storage: 'unsupported',
  busy: false,
  message: '',
}

let snapshot = INITIAL
const listeners = new Set<() => void>()
let started = false
let stopRuntime: (() => void) | undefined
const INSTALL_DISMISSED_UNTIL = 'monee:pwa-install-dismissed-until'
const INSTALL_SNOOZE_MS = 7 * 86400_000

function snoozed(): boolean {
  try { return Number(localStorage.getItem(INSTALL_DISMISSED_UNTIL)) > Date.now() }
  catch { return false }
}

/** Snooze this browser only; manual installation in Atur stays available. */
export function dismissInstall(): void {
  try { localStorage.setItem(INSTALL_DISMISSED_UNTIL, String(Date.now() + INSTALL_SNOOZE_MS)) }
  catch { /* Keep the in-memory dismissal when storage is blocked. */ }
  publish({ installDismissed: true, installError: '' })
}

function publish(patch: Partial<PwaSnapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  void cleanupRetiredAssetCaches()
  const display = window.matchMedia('(display-mode: standalone)')
  const standalone = () => display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)
  publish({ installed: standalone(), manualInstall: ios && safari, installDismissed: snoozed() })
  const stopWorker = observeServiceWorker(({ needRefresh, offlineReady }) => publish({ needRefresh, offlineReady }))
  const onInstallOffer = (event: Event) => {
    if (snapshot.installed) return
    const offer = event as InstallEvent
    if (typeof offer.prompt !== 'function' || typeof offer.userChoice?.then !== 'function') return
    event.preventDefault()
    publish({ install: offer, installError: '' })
  }
  const onInstalled = () => publish({ install: null, installed: true, installError: '' })
  const onDisplayChange = () => { if (standalone()) onInstalled() }
  window.addEventListener('beforeinstallprompt', onInstallOffer)
  window.addEventListener('appinstalled', onInstalled)
  display.addEventListener?.('change', onDisplayChange)
  stopRuntime = () => {
    stopWorker()
    window.removeEventListener('beforeinstallprompt', onInstallOffer)
    window.removeEventListener('appinstalled', onInstalled)
    display.removeEventListener?.('change', onDisplayChange)
  }
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

/** Capture browser install eligibility before the login UI is mounted. */
export function initializePwa(): void { start() }

export function usePwa(): PwaSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}

/** Test isolation only: the runtime store owns browser listeners for the app lifetime. */
export function resetPwaState(): void {
  stopRuntime?.()
  stopRuntime = undefined
  snapshot = INITIAL
  listeners.clear()
  started = false
}

export function dismissUpdate(): void {
  publish({ needRefresh: false })
}

export async function installApp(): Promise<void> {
  const event = snapshot.install
  if (!event || snapshot.busy || snapshot.installed) return
  publish({ busy: true, message: '', installError: '' })
  try {
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'dismissed') dismissInstall()
    publish({ message: choice.outcome === 'accepted' ? 'Permintaan pemasangan diterima browser.' : 'Pemasangan dibatalkan.' })
  } catch {
    publish({ message: 'Pemasangan belum tersedia. Coba lagi dari menu browser.', installError: 'Belum bisa dipasang dari sini. Coba pilihan pasang aplikasi di menu browser.' })
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
