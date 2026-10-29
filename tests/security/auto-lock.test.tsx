import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoLock } from '@/features/security/useAutoLock'
import { useMoneeStore } from '@/store'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  useMoneeStore.setState({ isLoaded: true, isLocked: false, profile: {
    id: 'me', name: 'Nara', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'daily', pinHash: 'hash', pinSalt: 'salt', createdAt: 0,
  } })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function visibility(value: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}

describe('background auto lock', () => {
  it('locks on return at exactly five minutes but leaves shorter sessions open', () => {
    renderHook(() => useAutoLock())
    visibility('hidden')
    act(() => vi.advanceTimersByTime(299_999))
    visibility('visible')
    expect(useMoneeStore.getState().isLocked).toBe(false)
    visibility('hidden')
    act(() => vi.advanceTimersByTime(300_000))
    expect(useMoneeStore.getState().isLocked).toBe(false)
    visibility('visible')
    expect(useMoneeStore.getState().isLocked).toBe(true)
  })

  it('preserves the earliest background time and handles bfcache page restoration', () => {
    renderHook(() => useAutoLock())
    visibility('hidden')
    act(() => vi.advanceTimersByTime(240_000))
    act(() => window.dispatchEvent(new Event('pagehide')))
    act(() => vi.advanceTimersByTime(60_000))
    act(() => window.dispatchEvent(new Event('pageshow')))
    expect(useMoneeStore.getState().isLocked).toBe(true)
  })

  it('ignores onboarding until a profile is available', () => {
    useMoneeStore.setState({ profile: null })
    const view = renderHook(() => useAutoLock())
    visibility('hidden')
    act(() => vi.advanceTimersByTime(300_000))
    visibility('visible')
    expect(useMoneeStore.getState().isLocked).toBe(false)
    view.unmount()
  })

  it('removes event listeners on unmount', () => {
    const view = renderHook(() => useAutoLock())
    visibility('hidden')
    view.unmount()
    act(() => vi.advanceTimersByTime(300_000))
    visibility('visible')
    expect(useMoneeStore.getState().isLocked).toBe(false)
  })

  it('starts a fresh background window after the user unlocks', () => {
    renderHook(() => useAutoLock())
    visibility('hidden')
    act(() => vi.advanceTimersByTime(300_000))
    visibility('visible')
    act(() => useMoneeStore.getState().setLocked(false))
    visibility('hidden')
    act(() => vi.advanceTimersByTime(100))
    visibility('visible')
    expect(useMoneeStore.getState().isLocked).toBe(false)
  })
})
