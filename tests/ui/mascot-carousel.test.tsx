import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MascotCarousel } from '@/features/mascot/MascotCarousel'
import { applyMascotTheme } from '@/theme/mascot-themes'

vi.mock('@/features/mascot/MascotCanvas', () => ({
  MascotCanvas: ({ mascotId }: { mascotId: string }) => <canvas data-testid={`canvas-${mascotId}`} />,
}))

const ids = ['mochi', 'luna', 'bumi']
const names = ['Mochi', 'Luna', 'Bumi']
const stage = () => screen.getByRole('listbox', { name: 'Pilih maskot' })
function selected(index: number) {
  const option = screen.getByRole('option', { name: new RegExp(names[index]) })
  expect(option).toHaveAttribute('aria-selected', 'true')
  expect(stage()).toHaveAttribute('aria-activedescendant', option.id)
  expect(screen.getByTestId(`canvas-${ids[index]}`)).toBeInTheDocument()
}

beforeEach(() => { applyMascotTheme('mochi') })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe.each([false, true])('infinite mascot picker, reduced motion: %s', reduced => {
  beforeEach(() => {
    const original = window.matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: reduced }))
  })

  it('wraps arrow buttons for many complete cycles in both directions', () => {
    render(<MascotCarousel onApply={vi.fn()} />)
    for (let step = 1; step <= 30; step++) {
      fireEvent.click(screen.getByRole('button', { name: 'Maskot berikutnya' }))
      selected(step % 3)
    }
    for (let step = 1; step <= 30; step++) {
      fireEvent.click(screen.getByRole('button', { name: 'Maskot sebelumnya' }))
      selected((3 - step % 3) % 3)
    }
  })

  it('wraps with keyboard and supports Home, End, and Enter', async () => {
    const apply = vi.fn()
    render(<MascotCarousel onApply={apply} />)
    fireEvent.keyDown(stage(), { key: 'ArrowLeft' }); selected(2)
    fireEvent.keyDown(stage(), { key: 'ArrowRight' }); selected(0)
    fireEvent.keyDown(stage(), { key: 'End' }); selected(2)
    fireEvent.keyDown(stage(), { key: 'Home' }); selected(0)
    await act(async () => { fireEvent.keyDown(stage(), { key: 'Enter' }) })
    expect(apply).toHaveBeenCalledExactlyOnceWith('mochi')
  })

  it('wraps horizontal and vertical wheel gestures without swallowing small or modified scrolling', () => {
    vi.useFakeTimers()
    render(<MascotCarousel onApply={vi.fn()} />)
    fireEvent.wheel(stage(), { deltaY: -100 }); selected(2)
    act(() => { vi.advanceTimersByTime(200) })
    fireEvent.wheel(stage(), { deltaX: 100 }); selected(0)
    act(() => { vi.advanceTimersByTime(200) })
    fireEvent.wheel(stage(), { deltaY: 2 }); selected(0)
    fireEvent.wheel(stage(), { deltaY: 100, ctrlKey: true }); selected(0)
  })

  it('keeps advancing during sustained scrolling with no quiet gap', () => {
    vi.useFakeTimers()
    render(<MascotCarousel onApply={vi.fn()} />)
    for (let turn = 0; turn < 12; turn++) {
      fireEvent.wheel(stage(), { deltaX: 100 }); selected((turn + 1) % 3)
      act(() => { vi.advanceTimersByTime(100) })
      fireEvent.wheel(stage(), { deltaX: 100 }); selected((turn + 1) % 3)
      act(() => { vi.advanceTimersByTime(100) })
    }
  })

  it('wraps horizontal swipes, ignores vertical motion, and cancels interrupted gestures', () => {
    class Pointer extends MouseEvent { pointerId = 1; pointerType = 'touch' }
    vi.stubGlobal('PointerEvent', Pointer)
    render(<MascotCarousel onApply={vi.fn()} />)
    fireEvent.pointerDown(stage(), { clientX: 20, clientY: 50 })
    fireEvent.pointerMove(stage(), { clientX: 160, clientY: 55 })
    fireEvent.pointerUp(stage(), { clientX: 160, clientY: 55 }); selected(2)
    fireEvent.pointerDown(stage(), { clientX: 160, clientY: 50 })
    fireEvent.pointerMove(stage(), { clientX: 20, clientY: 55 })
    fireEvent.pointerUp(stage(), { clientX: 20, clientY: 55 }); selected(0)
    fireEvent.pointerDown(stage(), { clientX: 160, clientY: 50 })
    fireEvent.pointerMove(stage(), { clientX: 20, clientY: 55 })
    fireEvent.pointerCancel(stage()); selected(0)
    fireEvent.pointerDown(stage(), { clientX: 160, clientY: 50 })
    fireEvent.pointerMove(stage(), { clientX: 140, clientY: 160 })
    fireEvent.pointerUp(stage(), { clientX: 140, clientY: 160 }); selected(0)
  })
})

it('renders only three live 2.5D previews, without cards, image snapshots, or selector RAF', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame')
  const { container } = render(<MascotCarousel onApply={vi.fn()} />)
  expect(screen.getAllByRole('option')).toHaveLength(3)
  expect(container.querySelectorAll('canvas')).toHaveLength(3)
  expect(container.querySelector('.mascot-card, .mascot-carousel__backdrop, img')).toBeNull()
  expect(raf).not.toHaveBeenCalled()
})

it('restores the original theme on dismissal and after a rejected save', async () => {
  const view = render(<MascotCarousel onApply={vi.fn().mockRejectedValue(new Error('gagal simpan'))} />)
  fireEvent.keyDown(stage(), { key: 'End' })
  expect(document.documentElement.dataset.mascot).toBe('bumi')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pilih Maskot ini' })) })
  expect(screen.getByRole('button', { name: 'Pilih Maskot ini' })).toBeEnabled()
  view.unmount()
  expect(document.documentElement.dataset.mascot).toBe('mochi')
})

it('restores a dismissed preview without saving', () => {
  const apply = vi.fn()
  const view = render(<MascotCarousel onApply={apply} />)
  fireEvent.keyDown(stage(), { key: 'End' })
  view.unmount()
  expect(document.documentElement.dataset.mascot).toBe('mochi')
  expect(apply).not.toHaveBeenCalled()
})

it('keeps a successful theme if the host unmounts during onApply', async () => {
  let close!: () => void
  const apply = vi.fn(async () => { close() })
  const view = render(<MascotCarousel onApply={apply} />)
  close = view.unmount
  fireEvent.keyDown(stage(), { key: 'End' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pilih Maskot ini' })) })
  expect(document.documentElement.dataset.mascot).toBe('bumi')
})

it('does not capture side-option taps until a horizontal drag is intentional', () => {
  class Pointer extends MouseEvent { pointerId = 1; pointerType = 'touch' }
  vi.stubGlobal('PointerEvent', Pointer)
  render(<MascotCarousel onApply={vi.fn()} />)
  const capture = vi.fn()
  Object.defineProperty(stage(), 'setPointerCapture', { value: capture })
  const option = screen.getByRole('option', { name: /Luna/ })
  fireEvent.pointerDown(option, { clientX: 200, clientY: 50 })
  expect(capture).not.toHaveBeenCalled()
  fireEvent.pointerUp(option, { clientX: 200, clientY: 50 })
  fireEvent.click(option); selected(1)
  fireEvent.pointerDown(stage(), { clientX: 200, clientY: 50 })
  fireEvent.pointerMove(stage(), { clientX: 180, clientY: 52 })
  expect(capture).toHaveBeenCalledExactlyOnceWith(1)
})

it('keeps a touch swipe when implicit capture transfers from an option to the stage', () => {
  class Pointer extends MouseEvent { pointerId = 1; pointerType = 'touch' }
  vi.stubGlobal('PointerEvent', Pointer)
  render(<MascotCarousel onApply={vi.fn()} />)
  const option = screen.getByRole('option', { name: /Mochi/ })
  fireEvent.pointerDown(option, { clientX: 200, clientY: 100 })
  fireEvent.pointerMove(option, { clientX: 180, clientY: 102 })
  // Real touch input implicitly captures the option before the stage takes over.
  fireEvent.lostPointerCapture(option, { clientX: 160, clientY: 102 })
  fireEvent.pointerMove(stage(), { clientX: 100, clientY: 102 })
  fireEvent.pointerUp(stage(), { clientX: 100, clientY: 102 })
  selected(1)
})

it('routes only the wrapping preview behind the center, symmetrically in either direction', () => {
  render(<MascotCarousel onApply={vi.fn()} />)
  const initialOrder = screen.getAllByRole('option').map(node => node.id)
  for (const direction of [1, -1, -1, 1, 1, -1]) {
    const wrapping = stage().querySelector(`[data-position="${-direction}"]`)
    fireEvent.click(screen.getByRole('button', { name: direction === 1 ? 'Maskot berikutnya' : 'Maskot sebelumnya' }))
    expect(wrapping).toHaveAttribute('data-wrap', String(direction))
    expect(wrapping).toHaveAttribute('data-position', String(direction))
    expect(stage().querySelectorAll('[data-wrap]')).toHaveLength(1)
    expect(screen.getAllByRole('option').map(node => node.id)).toEqual(initialOrder)
  }
})

it('keeps the last committed theme when a later preview is dismissed', async () => {
  const view = render(<MascotCarousel onApply={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.keyDown(stage(), { key: 'End' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pilih Maskot ini' })) })
  fireEvent.keyDown(stage(), { key: 'Home' })
  view.unmount()
  expect(document.documentElement.dataset.mascot).toBe('bumi')
})

it('locks every input and blocks duplicate saves until the apply promise settles', async () => {
  let resolve!: () => void
  const apply = vi.fn(() => new Promise<void>(done => { resolve = done }))
  render(<MascotCarousel onApply={apply} />)
  const button = screen.getByRole('button', { name: 'Pilih Maskot ini' })
  fireEvent.click(button)
  fireEvent.click(button)
  fireEvent.keyDown(stage(), { key: 'Enter' })
  fireEvent.keyDown(stage(), { key: 'End' })
  fireEvent.wheel(stage(), { deltaX: 100 })
  selected(0)
  for (const control of screen.getAllByRole('button')) expect(control).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(stage()).toHaveAttribute('aria-disabled', 'true')
  expect(apply).toHaveBeenCalledOnce()
  await act(async () => { resolve() })
  expect(button).toBeEnabled()
})

it('honors a host-controlled busy state and does not apply on Enter from another control', () => {
  const apply = vi.fn()
  const view = render(<MascotCarousel applying onApply={apply} />)
  fireEvent.keyDown(stage(), { key: 'End' }); selected(0)
  fireEvent.keyDown(stage(), { key: 'Enter' })
  expect(apply).not.toHaveBeenCalled()
  view.rerender(<MascotCarousel onApply={apply} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Maskot berikutnya' }), { key: 'Enter' })
  expect(apply).not.toHaveBeenCalled()
})

it('can select a neighboring preview and handles invalid initial indices safely', () => {
  render(<MascotCarousel initialIndex={Number.NaN} onApply={vi.fn()} />)
  selected(0)
  fireEvent.click(screen.getByRole('option', { name: /Bumi/ })); selected(2)
})

it('keeps each mascot canvas mounted as it moves from a neighboring preview to the center and loops', () => {
  render(<MascotCarousel onApply={vi.fn()} />)
  const canvases = ids.map(id => screen.getByTestId(`canvas-${id}`))
  for (let turn = 1; turn <= 6; turn++) {
    fireEvent.click(screen.getByRole('button', { name: 'Maskot berikutnya' }))
    selected(turn % 3)
    const centered = stage().querySelector('[data-position="0"] canvas')
    expect(centered).toBe(canvases[turn % 3])
    ids.forEach((id, index) => expect(screen.getByTestId(`canvas-${id}`)).toBe(canvases[index]))
  }
})
