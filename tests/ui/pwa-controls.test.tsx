import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PwaControls, PwaUpdateBanner } from '@/pwa/PwaControls'
import { resetPwaState } from '@/pwa/pwa-state'

const runtime = vi.hoisted(() => ({ update: vi.fn(), listener: null as null | ((value: { needRefresh: boolean; offlineReady: boolean }) => void) }))
vi.mock('@/pwa/service-worker', () => ({
  observeServiceWorker: (listener: typeof runtime.listener) => { runtime.listener = listener; return () => { runtime.listener = null } },
  acceptServiceWorkerUpdate: runtime.update,
}))
const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage')
beforeEach(() => {
  vi.clearAllMocks()
  resetPwaState()
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (storageDescriptor) Object.defineProperty(navigator, 'storage', storageDescriptor)
  else Reflect.deleteProperty(navigator, 'storage')
})

it('only offers installation after the browser provides an install event', async () => {
  render(<PwaControls />)
  expect(screen.queryByRole('button', { name: 'Pasang Monee' })).not.toBeInTheDocument()
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
  act(() => window.dispatchEvent(event))
  expect(event.defaultPrevented).toBe(true)
  fireEvent.click(screen.getByText('Aplikasi dan penyimpanan'))
  fireEvent.click(screen.getByRole('button', { name: 'Pasang Monee' }))
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Pasang Monee' })).not.toBeInTheDocument())
})

it('shows updates as a banner that never reloads before the user accepts', async () => {
  const { container } = render(<PwaUpdateBanner />)
  expect(container).toBeEmptyDOMElement()
  act(() => runtime.listener?.({ needRefresh: true, offlineReady: false }))
  expect(container.querySelector('.pwa-update')).not.toBeNull()
  expect(runtime.update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Nanti' }))
  expect(screen.queryByRole('button', { name: 'Perbarui sekarang' })).not.toBeInTheDocument()
  act(() => runtime.listener?.({ needRefresh: true, offlineReady: true }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Perbarui sekarang' })) })
  expect(runtime.update).toHaveBeenCalledOnce()
})

it('requests persistent storage only from the explicit user gesture and reports refusal honestly', async () => {
  const persist = vi.fn().mockResolvedValue(false)
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: vi.fn().mockResolvedValue(false), persist } })
  render(<PwaControls />)
  fireEvent.click(await screen.findByText('Aplikasi dan penyimpanan'))
  const protect = await screen.findByRole('button', { name: 'Lindungi penyimpanan lokal' })
  expect(persist).not.toHaveBeenCalled()
  fireEvent.click(protect)
  expect(await screen.findByText(/Browser belum memberikan perlindungan/)).toBeInTheDocument()
  expect(persist).toHaveBeenCalledOnce()
})
