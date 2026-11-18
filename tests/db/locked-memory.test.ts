import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { DEFAULT_BUCKETS } from '@/core/db/repositories'
import { useMoneeStore } from '@/store'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('crypto', webcrypto)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
})
afterEach(async () => {
  (await openDatabase()).close()
  resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
  vi.unstubAllGlobals()
})

async function setup() {
  await useMoneeStore.getState().load()
  await useMoneeStore.getState().finishOnboarding({ name: 'Security fixture', pin: '123456', mascotId: 'mochi',
    buckets: DEFAULT_BUCKETS.map(bucket => ({ ...bucket })),
    income: { amount: 1_000_000, categoryId: 'cat-gaji', date: '2026-10-24' } })
}

function expectLedgerPurged() {
  const state = useMoneeStore.getState()
  for (const field of ['transactions', 'buckets', 'categories', 'recurringIncomes', 'goals', 'sweeps'] as const) {
    expect(state[field], field).toEqual([])
  }
  expect(state.snapshot).toBeNull()
  expect(state.isLocked).toBe(true)
}

describe('locked session memory', () => {
  it('purges ledger state immediately on lock without modifying any database records', async () => {
    await setup()
    const db = await openDatabase()
    const original = await db.getAll('transactions')
    expect(useMoneeStore.getState().transactions).toHaveLength(1)
    useMoneeStore.getState().setLocked(true)
    expectLedgerPurged()
    expect(await db.getAll('transactions')).toEqual(original)
    expect(useMoneeStore.getState().profile?.id).toBe('profile')
  })

  it('does not repopulate the locked ledger during focus, cross-tab or reload refreshes', async () => {
    await setup()
    useMoneeStore.getState().setLocked(true)
    await Promise.all([useMoneeStore.getState().load(), useMoneeStore.getState().load()])
    expectLedgerPurged()
    useMoneeStore.setState(useMoneeStore.getInitialState(), true)
    await useMoneeStore.getState().load()
    expectLedgerPurged()
  })

  it('restores the full committed ledger only after the verified PIN session is accepted', async () => {
    await setup()
    const expected = useMoneeStore.getState().profile!
    useMoneeStore.getState().setLocked(true)
    await useMoneeStore.getState().unlockProfile(expected)
    expect(useMoneeStore.getState().isLocked).toBe(false)
    expect(useMoneeStore.getState().transactions).toHaveLength(1)
    expect(useMoneeStore.getState().snapshot).not.toBeNull()
  })

  it('does not publish a refresh that started before the user locked the app', async () => {
    await setup()
    const refreshing = useMoneeStore.getState().load()
    useMoneeStore.getState().setLocked(true)
    await refreshing
    expectLedgerPurged()
  })

  it('rejects stale credentials without publishing data after another tab changes PIN', async () => {
    await setup()
    const expected = useMoneeStore.getState().profile!
    useMoneeStore.getState().setLocked(true)
    await (await openDatabase()).put('profile', { ...expected, pinHash: 'ff'.repeat(32) })
    await expect(useMoneeStore.getState().unlockProfile(expected)).rejects.toThrow('ERR_PROFILE_STALE')
    expectLedgerPurged()
  })

  it('cannot restore a session if lock or pagehide interrupts asynchronous hydration', async () => {
    await setup()
    const expected = useMoneeStore.getState().profile!
    useMoneeStore.getState().setLocked(true)
    const restoring = useMoneeStore.getState().unlockProfile(expected)
    useMoneeStore.getState().setLocked(true)
    await expect(restoring).rejects.toThrow('ERR_SESSION_CANCELLED')
    expectLedgerPurged()
  })

  it('cancels hydration when the PIN screen validity callback changes', async () => {
    await setup()
    const expected = useMoneeStore.getState().profile!
    useMoneeStore.getState().setLocked(true)
    let active = true
    const restoring = useMoneeStore.getState().unlockProfile(expected, () => active)
    active = false
    await expect(restoring).rejects.toThrow('ERR_SESSION_CANCELLED')
    expectLedgerPurged()
  })
})
