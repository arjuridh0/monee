import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import { dispatchMascotEvent } from '@/features/mascot/mascot-events'

const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 0

beforeEach(() => {
  frames.clear()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
  const gradient = { addColorStop: vi.fn() }
  const context = new Proxy({}, {
    get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => gradient : () => undefined,
  }) as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
})

afterEach(() => vi.restoreAllMocks())

describe('MascotCanvas live engine', () => {
  it('renders a live canvas and resizes without creating extra animation loops', async () => {
    const { rerender, unmount } = render(<MascotCanvas />)
    const stage = screen.getByRole('img', { name: 'Maskot Mochi' })
    const canvas = stage.querySelector('canvas')!
    await waitFor(() => expect(frames.size).toBe(1))
    expect(canvas.style.width).toBe('216px')
    rerender(<MascotCanvas mascotId="luna" state="happy" size={160} />)
    expect(screen.getByRole('img', { name: 'Maskot Luna' })).toBe(stage)
    expect(canvas.style.width).toBe('160px')
    expect(frames.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
  })

  it('removes the engine pointer listener when unmounted', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<MascotCanvas mascotId="bumi" />)
    await waitFor(() => expect(frames.size).toBe(1))
    unmount()
    expect(remove).toHaveBeenCalledWith('pointerup', expect.any(Function))
  })

  it('keeps an accessible fallback when Canvas 2D is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<MascotCanvas mascotId="luna" />)
    expect(await screen.findByText('Luna menemanimu')).toBeVisible()
    expect(frames.size).toBe(0)
  })

  it('does not start an animation after unmounting during lazy import', async () => {
    const { unmount } = render(<MascotCanvas />)
    unmount()
    await act(async () => { await Promise.resolve() })
    expect(frames.size).toBe(0)
  })
})

it('finishes tab pop in 220ms and preserves the latest screen state', async () => {
  const { MascotCanvas: Engine } = await import('@mascots/core/mascot_canvas.js')
  const state = vi.spyOn(Engine.prototype, 'setState')
  const { rerender } = render(<MascotCanvas state="greeting" />)
  await waitFor(() => expect(frames.size).toBe(1))
  rerender(<MascotCanvas state="idle" />)
  const canvas = screen.getByRole('img').querySelector('canvas')!
  const animate = vi.fn()
  canvas.animate = animate
  act(() => window.dispatchEvent(new CustomEvent('monee:tab', { detail: 'thinking' })))
  expect(state).toHaveBeenLastCalledWith('idle')
  expect(animate).toHaveBeenCalledWith(expect.any(Array), { duration: 220, easing: 'ease-out' })
})

it('suppresses the tab pop when reduced motion is requested', async () => {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: query === '(prefers-reduced-motion: reduce)' }))
  render(<MascotCanvas state="idle" />)
  await waitFor(() => expect(screen.getByRole('img').querySelector('canvas')?.style.width).toBe('216px'))
  expect(frames.size).toBe(0)
  const canvas = screen.getByRole('img').querySelector('canvas')!
  const animate = vi.fn()
  canvas.animate = animate
  act(() => window.dispatchEvent(new CustomEvent('monee:tab', { detail: 'thinking' })))
  expect(animate).not.toHaveBeenCalled()
})

it('redraws reduced motion once for new props without running animation frames', async () => {
  const original = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: true }))
  const { MascotCanvas: Engine } = await import('@mascots/core/mascot_canvas.js')
  const draw = vi.spyOn(Engine.prototype as unknown as { _render(): void }, '_render')
  const { rerender } = render(<MascotCanvas state="happy" />)
  await waitFor(() => expect(draw).toHaveBeenCalled())
  expect(frames.size).toBe(0)
  const before = draw.mock.calls.length
  rerender(<MascotCanvas mascotId="luna" state="sad" size={160} />)
  expect(draw.mock.calls.length).toBeGreaterThan(before)
  expect(frames.size).toBe(0)
})

it('overlays a finance reaction on the screen base state', async () => {
  const { MascotCanvas: Engine } = await import('@mascots/core/mascot_canvas.js')
  const state = vi.spyOn(Engine.prototype, 'setState')
  render(<MascotCanvas state="idle" />)
  await waitFor(() => expect(frames.size).toBe(1))
  act(() => dispatchMascotEvent('budgetWarning'))
  expect(state).toHaveBeenLastCalledWith('annoyed')
  expect(screen.getByRole('img')).toHaveAttribute('data-state', 'annoyed')
})

it('pauses hidden companions and resumes without duplicate loops', async () => {
  const { unmount } = render(<MascotCanvas state="happy" />)
  await waitFor(() => expect(frames.size).toBe(1))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(frames.size).toBe(0)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(frames.size).toBe(1)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(frames.size).toBe(1)
  unmount()
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(frames.size).toBe(0)
})
