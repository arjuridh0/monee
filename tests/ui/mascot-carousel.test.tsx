import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { MascotCarousel } from '@/features/mascot/MascotCarousel'
import { applyMascotTheme } from '@/theme/mascot-themes'

vi.mock('@/features/mascot/model-snapshot', () => ({
  canRenderMascotSnapshot: () => false,
  getMascotSnapshot: vi.fn(),
  retainMascotSnapshots: () => () => undefined,
}))
vi.mock('@/features/mascot/MascotCanvas', () => ({
  MascotCanvas: ({ mascotId }: { mascotId: string }) => <canvas data-testid={`fallback-${mascotId}`} />,
}))
const frames = new Map<number, FrameRequestCallback>()
let next = 0
beforeEach(() => {
  frames.clear()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++next, callback); return next })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
})
afterEach(() => vi.restoreAllMocks())

it('settles the selector with no frame loop and uses the live 2.5D artwork fallback', () => {
  render(<MascotCarousel onApply={vi.fn()} />)
  act(() => {
    const pending = [...frames.values()]; frames.clear()
    pending.forEach(callback => callback(16))
  })
  expect(frames.size).toBe(0)
  expect(screen.getByTestId('fallback-mochi')).toBeInTheDocument()
})

it('offers a simple keyboard selectable list in reduced motion without RAF', () => {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: true }))
  const apply = vi.fn()
  render(<MascotCarousel onApply={apply} />)
  const list = screen.getByRole('listbox', { name: 'Pilih maskot' })
  expect(list).toHaveClass('mascot-stage--simple')
  fireEvent.keyDown(list, { key: 'End' })
  expect(screen.getByRole('option', { name: /Bumi/ })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(list, { key: 'Enter' })
  expect(apply).toHaveBeenCalledWith('bumi')
  expect(frames.size).toBe(0)
})

it('previews the active theme and restores the previous one when dismissed', () => {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: true }))
  applyMascotTheme('mochi')
  const { unmount } = render(<MascotCarousel initialIndex={0} onApply={vi.fn()} />)
  const list = screen.getByRole('listbox', { name: 'Pilih maskot' })
  expect(document.documentElement.dataset.mascot).toBe('mochi')
  fireEvent.keyDown(list, { key: 'End' })
  expect(document.documentElement.dataset.mascot).toBe('bumi')
  expect(document.documentElement.style.getPropertyValue('--theme-accent')).toBe('#C0862B')
  unmount()
  expect(document.documentElement.dataset.mascot).toBe('mochi')
})

it('keeps a committed theme and rolls back a failed apply', async () => {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: true }))
  applyMascotTheme('mochi')
  const committed = render(<MascotCarousel initialIndex={0} onApply={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.keyDown(screen.getByRole('listbox', { name: 'Pilih maskot' }), { key: 'End' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pilih Maskot ini' })) })
  committed.unmount()
  expect(document.documentElement.dataset.mascot).toBe('bumi')

  applyMascotTheme('mochi')
  const rejected = render(<MascotCarousel initialIndex={0} onApply={vi.fn().mockRejectedValue(new Error('gagal simpan'))} />)
  fireEvent.keyDown(screen.getByRole('listbox', { name: 'Pilih maskot' }), { key: 'End' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pilih Maskot ini' })) })
  rejected.unmount()
  expect(document.documentElement.dataset.mascot).toBe('mochi')
})
