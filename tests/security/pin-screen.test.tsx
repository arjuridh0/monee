import { webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { getLockoutState, recordFailedAttempt } from '@/core/security/lockout'
import { hashPin } from '@/core/security/pin'
import * as pinSecurity from '@/core/security/pin'
import * as lockoutSecurity from '@/core/security/lockout'
import { useMoneeStore } from '@/store'
import { PinScreen } from '@/features/security/PinScreen'

// Canvas has no drawing context in jsdom; the security flow uses the real DB and hash.
vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <div /> }))

beforeEach(async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetDbSingleton()
  useMoneeStore.setState({ isLoaded: true, isLocked: true, profile: {
    id: 'profile', name: 'Nara', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'daily', pinHash: await hashPin('123456', 'salt'), pinSalt: 'salt', createdAt: 0,
  } })
  await (await openDatabase()).put('profile', useMoneeStore.getState().profile!)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetDbSingleton()
})

const mount = (onUnlock = vi.fn()) => {
  const view = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PinScreen onUnlock={onUnlock} /></MemoryRouter>)
  return { ...view, onUnlock }
}

describe('PIN screen', () => {
  it('uses current database credentials when the mounted screen holds an old profile', async () => {
    const db = await openDatabase()
    const old = useMoneeStore.getState().profile!
    await db.put('profile', { ...old, pinHash: await hashPin('654321', 'new-salt'), pinSalt: 'new-salt' })
    const { onUnlock } = mount()
    const input = await screen.findByLabelText('PIN 6 digit')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '123456' } })
    await screen.findByText('PIN belum cocok. Coba sekali lagi, ya.')
    expect(onUnlock).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '654321' } })
    await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce())
  })
  it.each(['visibilitychange', 'pagehide'])('cancels verification after %s even when its callback resumes on return', async event => {
    const db = await openDatabase()
    await recordFailedAttempt(db)
    let finishVerification!: (correct: boolean) => void
    const verification = vi.spyOn(pinSecurity, 'verifyPin').mockImplementationOnce(() =>
      new Promise<boolean>(resolve => { finishVerification = resolve }))
    const view = mount()
    const input = await screen.findByLabelText('PIN 6 digit')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '123456' } })
    await waitFor(() => expect(verification).toHaveBeenCalledOnce())
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      if (event === 'visibilitychange') document.dispatchEvent(new Event(event))
      else window.dispatchEvent(new Event(event))
    })
    expect(input).toHaveValue('')
    const later = Date.now() + 300_000
    vi.spyOn(Date, 'now').mockReturnValue(later)
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('pageshow'))
    })
    await act(async () => { finishVerification(true) })
    await waitFor(() => expect(input).toBeEnabled())
    expect(view.onUnlock).not.toHaveBeenCalled()
    expect(useMoneeStore.getState().isLocked).toBe(true)
    expect(await getLockoutState(db)).toEqual({ attempts: 1, lockedUntil: 0 })
  })

  it('cancels unlock when pagehide interrupts the successful lockout reset', async () => {
    let finishReset!: () => void
    const originalReset = lockoutSecurity.resetLockout
    const reset = vi.spyOn(lockoutSecurity, 'resetLockout').mockImplementationOnce(async db => {
      await new Promise<void>(resolve => { finishReset = resolve })
      await originalReset(db)
    })
    const view = mount()
    const input = await screen.findByLabelText('PIN 6 digit')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '123456' } })
    await waitFor(() => expect(reset).toHaveBeenCalledOnce())
    act(() => window.dispatchEvent(new Event('pagehide')))
    await act(async () => { finishReset() })
    await waitFor(() => expect(input).toBeEnabled())
    expect(input).toHaveValue('')
    expect(view.onUnlock).not.toHaveBeenCalled()
    expect(useMoneeStore.getState().isLocked).toBe(true)
  })

  it('still persists an incorrect PIN if verification completes after backgrounding', async () => {
    let finishVerification!: (correct: boolean) => void
    const verification = vi.spyOn(pinSecurity, 'verifyPin').mockImplementationOnce(() =>
      new Promise<boolean>(resolve => { finishVerification = resolve }))
    const view = mount()
    const input = await screen.findByLabelText('PIN 6 digit')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '999999' } })
    await waitFor(() => expect(verification).toHaveBeenCalledOnce())
    act(() => window.dispatchEvent(new Event('pagehide')))
    await act(async () => { finishVerification(false) })
    await waitFor(async () => expect((await getLockoutState(await openDatabase())).attempts).toBe(1))
    expect(view.onUnlock).not.toHaveBeenCalled()
    expect(useMoneeStore.getState().isLocked).toBe(true)
  })

  it('checks the real hash, resets persisted attempts, and unlocks only after success', async () => {
    const db = await openDatabase()
    await recordFailedAttempt(db)
    const { onUnlock } = mount()
    const input = await screen.findByLabelText('PIN 6 digit')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '123456' } })
    await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce())
    expect(useMoneeStore.getState().isLocked).toBe(false)
    expect(await getLockoutState(db)).toEqual({ attempts: 0, lockedUntil: 0 })
    expect(input).toHaveAttribute('type', 'password')
  })

  it('persists three failed PINs and restores the disabled countdown after remount', async () => {
    const view = mount()
    const input = await screen.findByLabelText('PIN 6 digit')
    await waitFor(() => expect(input).toBeEnabled())
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      fireEvent.change(input, { target: { value: '999999' } })
      await waitFor(async () => expect((await getLockoutState(await openDatabase())).attempts).toBe(attempt))
      await waitFor(() => expect(input).toHaveValue(''))
      if (attempt < 3) await waitFor(() => expect(input).toBeEnabled())
    }
    expect(input).toBeDisabled()
    expect(useMoneeStore.getState().isLocked).toBe(true)
    expect(view.onUnlock).not.toHaveBeenCalled()
    view.unmount()
    resetDbSingleton()
    mount()
    await screen.findByText(/Coba lagi dalam 5 detik/)
    expect(screen.getByLabelText('PIN 6 digit')).toBeDisabled()
  })

  it('keeps attempt history after countdown expires and escalates the next failure', async () => {
    const db = await openDatabase()
    const now = Date.now()
    await recordFailedAttempt(db, now - 5_100)
    await recordFailedAttempt(db, now - 5_100)
    await recordFailedAttempt(db, now - 5_100)
    mount()
    const input = await screen.findByLabelText('PIN 6 digit')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '999999' } })
    await screen.findByText(/Coba lagi dalam 15 detik/)
    expect((await getLockoutState(db)).attempts).toBe(4)
  })

  it('enables PIN when the stored deadline passes without resetting attempts', async () => {
    const db = await openDatabase()
    const now = Date.now()
    await recordFailedAttempt(db, now - 4_200)
    await recordFailedAttempt(db, now - 4_200)
    await recordFailedAttempt(db, now - 4_200)
    mount()
    const input = await screen.findByLabelText('PIN 6 digit')
    await screen.findByText(/Coba lagi dalam 1 detik/)
    await waitFor(() => expect(input).toBeEnabled(), { timeout: 2_000 })
    expect((await getLockoutState(db)).attempts).toBe(3)
  })
})
