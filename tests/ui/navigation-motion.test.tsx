import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppShell } from '@/app/AppShell'
import { useMoneeStore } from '@/store'
import { applyMascotTheme } from '@/theme/mascot-themes'
const motionState = vi.hoisted(() => ({ panels: [] as Record<string, any>[], pills: [] as Record<string, any>[], icons: [] as Record<string, any>[], navigation: [] as Record<string, any>[] }))
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const components: Record<string, any> = {}
  const component = (tag: string) => React.forwardRef<HTMLElement, Record<string, any>>((props, ref) => {
    const { initial, animate, exit, transition, layoutId, layoutRoot, layout, ...dom } = props
    if (props.className === 'tab-content') motionState.panels.push({ initial, animate, exit, transition })
    if (props.className === 'nav-active-pill') motionState.pills.push({ initial, animate, transition, layoutId, layout })
    if (tag === 'nav') motionState.navigation.push({ layoutRoot, className: props.className })
    if (props.className === 'nav-icon') motionState.icons.push({ animate, transition })
    return React.createElement(tag, { ...dom, ref })
  })
  return { motion: new Proxy({}, { get: (_, tag) => components[String(tag)] ??= component(String(tag)) }),
    AnimatePresence: ({ children }: any) => children, useReducedMotion: () => false }
})
vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span /> }))
beforeEach(() => {
  motionState.panels = []; motionState.pills = []; motionState.icons = []; motionState.navigation = []
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useMoneeStore.setState({ ...useMoneeStore.getInitialState(), isLoaded: true, isLocked: false,
    profile: { id: 'profile', name: 'Arju', mascotId: 'mochi', pinHash: 'hash', pinSalt: 'salt', periodStartDay: 1, defaultBucketId: 'bucket-needs', createdAt: 0 } }, true)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
const shell = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppShell /></MemoryRouter>)
it('preserves a theme preview when the saved profile is refreshed without a mascot change', () => {
  shell()
  applyMascotTheme('luna')
  act(() => useMoneeStore.setState(state => ({ profile: { ...state.profile!, name: 'Nama baru' } })))
  expect(document.documentElement.dataset.mascot).toBe('luna')
  act(() => useMoneeStore.setState(state => ({ profile: { ...state.profile!, mascotId: 'bumi' } })))
  expect(document.documentElement.dataset.mascot).toBe('bumi')
})
const reduceMotion = () => vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
  matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false,
}) as MediaQueryList)
it('keeps one mobile highlight persistent within a pair without shared document layout measurements', async () => {
  shell()
  const nav = screen.getByRole('navigation')
  const first = nav.querySelector('.nav-active-pill')
  expect(first).toHaveAttribute('data-position', '0')
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Riwayat' })) })
  expect(nav.querySelector('.nav-active-pill')).toBe(first)
  expect(first).toHaveAttribute('data-position', '1')
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Tabungan' })) })
  const right = nav.querySelector('.nav-active-pill')
  expect(right).not.toBe(first)
  expect(right).toHaveAttribute('data-position', '0')
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Atur' })) })
  expect(nav.querySelector('.nav-active-pill')).toBe(right)
  expect(right).toHaveAttribute('data-position', '1')
  expect(nav.querySelectorAll('.nav-active-pill')).toHaveLength(1)
  expect(motionState.pills).toHaveLength(0)
})
it('keeps the highlight in the two-link group that excludes the add button', () => {
  shell()
  const pair = screen.getByRole('navigation').querySelector('.nav-active-pill')!.parentElement!
  expect(pair).toHaveClass('nav-pair')
  expect(pair.querySelectorAll('a')).toHaveLength(2)
  expect(pair.querySelector('button')).toBeNull()
})
it('disables active-indicator movement when reduced motion is enabled', () => {
  reduceMotion()
  shell()
  expect(screen.getByRole('navigation').querySelector('.nav-active-pill')).toHaveAttribute('data-position', '0')
  expect(motionState.icons.slice(-4).every(icon => icon.transition.duration === 0)).toBe(true)
})
it('responds to live reduced-motion changes without remounting the navigation', () => {
  let reduce = false
  const listeners = new Set<() => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() { return query === '(prefers-reduced-motion: reduce)' && reduce },
    media: query, onchange: null,
    addEventListener: (_: string, listener: () => void) => { listeners.add(listener) },
    removeEventListener: (_: string, listener: () => void) => { listeners.delete(listener) },
  }) as unknown as MediaQueryList)
  shell()
  expect(motionState.icons.slice(-4)[0].animate.y).toBe(-1)
  act(() => { reduce = true; listeners.forEach(listener => listener()) })
  expect(motionState.icons.slice(-4).every(icon => icon.animate.y === 0)).toBe(true)
  act(() => { reduce = false; listeners.forEach(listener => listener()) })
  expect(motionState.icons.slice(-4)[0].animate.y).toBe(-1)
})
it('restores scroll before paint while keeping mascot feedback at 80ms', async () => {
  vi.useFakeTimers()
  const feedback = vi.fn(); window.addEventListener('monee:tab', feedback)
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  shell(); act(() => vi.advanceTimersByTime(0)); feedback.mockClear()
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Tabungan' })) })
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ left: 0, top: 0, behavior: 'instant' })
  act(() => vi.advanceTimersByTime(79)); expect(feedback).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1)); expect(feedback).toHaveBeenCalledOnce()
  expect(feedback.mock.calls[0][0].detail).toBe('happy')
  act(() => vi.advanceTimersByTime(220)); expect(scroll).toHaveBeenCalledOnce()
  window.removeEventListener('monee:tab', feedback)
})

it('preserves independent tab positions through rapid navigation without delayed scrolling', async () => {
  vi.useFakeTimers()
  let scrollY = 640
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation((options) => {
    scrollY = (options as ScrollToOptions).top ?? 0
  })
  shell()
  fireEvent.scroll(window)
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Tabungan' })) })
  expect(scrollY).toBe(0)
  scrollY = 180; fireEvent.scroll(window)
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Riwayat' })) })
  expect(scrollY).toBe(0)
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Home' })) })
  expect(scrollY).toBe(640)
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Tabungan' })) })
  expect(scrollY).toBe(180)
  scroll.mockClear()
  act(() => vi.advanceTimersByTime(500))
  expect(scroll).not.toHaveBeenCalled()
})

it('only emits mascot feedback for the final tab during rapid navigation', async () => {
  vi.useFakeTimers()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const feedback = vi.fn(); window.addEventListener('monee:tab', feedback)
  shell(); act(() => vi.advanceTimersByTime(0)); feedback.mockClear()
  for (const name of ['Tabungan', 'Riwayat', 'Atur']) {
    await act(async () => { fireEvent.click(screen.getByRole('link', { name })) })
    act(() => vi.advanceTimersByTime(20))
  }
  act(() => vi.advanceTimersByTime(80))
  expect(feedback).toHaveBeenCalledOnce()
  expect(feedback.mock.calls[0][0].detail).toBe('greeting')
  window.removeEventListener('monee:tab', feedback)
})

it('uses no route translation when the live reduced-motion preference is enabled', async () => {
  reduceMotion()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  shell()
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Tabungan' })) })
  expect(motionState.panels.at(-1)?.initial).toBe(false)
  expect(motionState.panels.at(-1)?.animate).toEqual({ y: 0, opacity: 1 })
  expect(motionState.panels.at(-1)?.transition).toEqual({ duration: 0 })
})

it('uses a small vertical route transition and skips the first entrance', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  shell()
  expect(motionState.panels.at(-1)?.initial).toBe(false)
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Tabungan' })) })
  expect(motionState.panels.at(-1)?.initial).toEqual({ y: 4, opacity: 0 })
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Home' })) })
  expect(motionState.panels.at(-1)?.initial).toEqual({ y: 4, opacity: 0 })
})

it('owns browser scroll restoration only while root navigation is mounted', () => {
  const descriptor = Object.getOwnPropertyDescriptor(window.history, 'scrollRestoration')
  Object.defineProperty(window.history, 'scrollRestoration', { value: 'auto', writable: true, configurable: true })
  try {
    const view = shell()
    expect(window.history.scrollRestoration).toBe('manual')
    view.unmount()
    expect(window.history.scrollRestoration).toBe('auto')
  } finally {
    if (descriptor) Object.defineProperty(window.history, 'scrollRestoration', descriptor)
    else Reflect.deleteProperty(window.history, 'scrollRestoration')
  }
})
