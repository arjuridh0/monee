import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppShell } from '@/app/AppShell'
import { useMoneeStore } from '@/store'
const motionState = vi.hoisted(() => ({ reduce: false, present: true, direction: -1, panels: [] as Record<string, any>[], pills: [] as Record<string, any>[] }))
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const components: Record<string, any> = {}
  const component = (tag: string) => React.forwardRef<HTMLElement, Record<string, any>>((props, ref) => {
    const { initial, animate, exit, transition, layoutId, ...dom } = props
    if (props.className === 'tab-content') motionState.panels.push({ initial, animate, exit, transition })
    if (props.className === 'nav-active-pill') motionState.pills.push({ initial, animate, transition, layoutId })
    return React.createElement(tag, { ...dom, ref })
  })
  return { motion: new Proxy({}, { get: (_, tag) => components[String(tag)] ??= component(String(tag)) }),
    AnimatePresence: ({ children }: any) => children, LayoutGroup: ({ children }: any) => children,
    useReducedMotion: () => motionState.reduce, useIsPresent: () => motionState.present,
    usePresenceData: () => motionState.direction }
})
vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span /> }))
beforeEach(() => {
  motionState.reduce = false; motionState.present = true; motionState.panels = []; motionState.pills = []
  useMoneeStore.setState({ ...useMoneeStore.getInitialState(), isLoaded: true, isLocked: false,
    profile: { id: 'profile', name: 'Arju', mascotId: 'mochi', pinHash: 'hash', pinSalt: 'salt', periodStartDay: 1, defaultBucketId: 'bucket-needs', createdAt: 0 } }, true)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
const shell = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppShell /></MemoryRouter>)
it('uses the current presence direction for an outgoing panel, independent of its entry direction', () => {
  motionState.present = false
  shell()
  expect(motionState.panels.at(-1)?.exit).toEqual({ x: 24, opacity: 0 })
})
it('fades the reduced motion pill without shared layout or scale movement', () => {
  motionState.reduce = true
  shell()
  const pill = motionState.pills.at(-1)!
  expect(pill.layoutId).toBeUndefined()
  expect(pill.initial).toEqual({ opacity: 0 })
  expect(pill.animate).toEqual({ opacity: 1 })
  expect(pill.transition).toEqual({ duration: 0.12 })
})
it('reads the live reduced-motion query even while framer reports a stale value', () => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList)
  shell()
  const pill = motionState.pills.at(-1)!
  expect(pill.layoutId).toBeUndefined()
  expect(pill.initial).toEqual({ opacity: 0 })
  expect(pill.transition).toEqual({ duration: 0.12 })
})
it('starts tab feedback at 80ms and restores scroll separately at 300ms', async () => {
  vi.useFakeTimers()
  const feedback = vi.fn(); window.addEventListener('monee:tab', feedback)
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  shell(); act(() => vi.advanceTimersByTime(0)); feedback.mockClear()
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Tabungan' })) })
  act(() => vi.advanceTimersByTime(79)); expect(feedback).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1)); expect(feedback).toHaveBeenCalledOnce(); expect(scroll).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(220)); expect(scroll).toHaveBeenCalledOnce()
  window.removeEventListener('monee:tab', feedback)
})



