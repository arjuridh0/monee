import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PwaInstallPrompt } from '@/pwa/PwaInstallPrompt'
import { PwaControls } from '@/pwa/PwaControls'
import { initializePwa, resetPwaState } from '@/pwa/pwa-state'

const runtime = vi.hoisted(() => ({ listener: null as null | ((value: { needRefresh: boolean; offlineReady: boolean }) => void) }))
vi.mock('@/pwa/service-worker', () => ({
  observeServiceWorker: (listener: typeof runtime.listener) => { runtime.listener = listener; return () => { runtime.listener = null } },
  acceptServiceWorkerUpdate: vi.fn(),
}))
function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt, userChoice: Promise.resolve({ outcome }),
  })
  act(() => { window.dispatchEvent(event) })
  return { event, prompt }
}
beforeEach(() => {
  localStorage.clear()
  resetPwaState()
})
afterEach(() => { cleanup(); resetPwaState(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('waits for browser eligibility and installs only after a button press', async () => {
  render(<PwaInstallPrompt />)
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
  const { event, prompt } = offer()
  expect(event.defaultPrevented).toBe(true)
  expect(screen.getByRole('region', { name: 'Pasang aplikasi Monee' })).toBeVisible()
  expect(prompt).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Pasang' }))
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument())
})

it('captures an install event before authenticated UI mounts', () => {
  initializePwa()
  offer()
  render(<PwaInstallPrompt />)
  expect(screen.getByRole('button', { name: 'Pasang' })).toBeVisible()
})

it('postpones the banner for seven days while keeping installation available in settings', () => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const view = render(<><PwaInstallPrompt /><PwaControls /></>)
  offer()
  fireEvent.click(screen.getByRole('button', { name: 'Nanti' }))
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Aplikasi dan penyimpanan'))
  expect(screen.getByRole('button', { name: 'Pasang Monee' })).toBeVisible()
  view.unmount(); resetPwaState()
  render(<PwaInstallPrompt />); offer()
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
  cleanup(); resetPwaState()
  vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 86400_000)
  render(<PwaInstallPrompt />); offer()
  expect(screen.getByRole('button', { name: 'Pasang' })).toBeVisible()
})

it('remembers dismissal of the native prompt without reporting installation success', async () => {
  const view = render(<><PwaInstallPrompt /><PwaControls /></>)
  offer('dismissed')
  fireEvent.click(screen.getByRole('button', { name: 'Pasang' }))
  await screen.findByText('Pemasangan dibatalkan.')
  view.unmount(); resetPwaState()
  render(<PwaInstallPrompt />); offer()
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
})

it('hides installed apps and yields priority to the update banner', () => {
  render(<PwaInstallPrompt />); offer()
  act(() => runtime.listener?.({ needRefresh: true, offlineReady: false }))
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
  act(() => runtime.listener?.({ needRefresh: false, offlineReady: false }))
  expect(screen.getByRole('button', { name: 'Pasang' })).toBeVisible()
  act(() => { window.dispatchEvent(new Event('appinstalled')) })
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
  offer()
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
})

it('never offers installation when opened as a standalone app', () => {
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query === '(display-mode: standalone)', addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  render(<PwaInstallPrompt />); offer()
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
})

it('shows an honest Safari installation guide instead of a fake native prompt', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Version/26.0 Mobile/15E148 Safari/604.1')
  render(<PwaInstallPrompt />)
  fireEvent.click(screen.getByRole('button', { name: 'Cara pasang' }))
  const guide = await screen.findByRole('dialog', { name: 'Pasang Monee di iPhone atau iPad' })
  expect(guide).toHaveTextContent('Bagikan')
  expect(guide).toHaveTextContent('Tambah ke Layar Utama')
  fireEvent.click(screen.getByRole('button', { name: 'Mengerti' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('dismisses safely even when local browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  render(<PwaInstallPrompt />); offer()
  fireEvent.click(screen.getByRole('button', { name: 'Nanti' }))
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
})

it('shows a recoverable message when the browser refuses the install prompt', async () => {
  render(<PwaInstallPrompt />)
  const prompt = vi.fn().mockRejectedValue(new Error('Browser refused'))
  act(() => { window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt, userChoice: Promise.resolve({ outcome: 'accepted' }),
  })) })
  fireEvent.click(screen.getByRole('button', { name: 'Pasang' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Coba pilihan pasang aplikasi di menu browser.')
  expect(screen.queryByRole('button', { name: 'Pasang' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tutup' }))
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
})

it('ignores malformed install events and cleans up its runtime listeners between mounts', () => {
  initializePwa()
  const event = new Event('beforeinstallprompt', { cancelable: true })
  act(() => { window.dispatchEvent(event) })
  render(<PwaInstallPrompt />)
  expect(event.defaultPrevented).toBe(false)
  expect(screen.queryByRole('region', { name: 'Pasang aplikasi Monee' })).not.toBeInTheDocument()
  cleanup(); resetPwaState()
  const oldOffer = offer()
  expect(oldOffer.event.defaultPrevented).toBe(false)
})
