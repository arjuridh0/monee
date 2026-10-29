import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { DEFAULT_BUCKETS, DEFAULT_CATEGORIES, seedDefaultData } from '@/core/db/repositories'
import { getLockoutState, saveLockoutState } from '@/core/security/lockout'
import { completeOnboarding, type CompleteOnboardingInput } from '@/features/onboarding/persistence'
import { useMoneeStore } from '@/store'

const makeInput = (): CompleteOnboardingInput => ({
  name: 'Nara', pin: '123456', mascotId: 'luna',
  buckets: DEFAULT_BUCKETS.map(bucket => ({ ...bucket })),
  income: { amount: 1_000_000, date: '2026-10-24', categoryId: 'cat-gaji' },
})

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('crypto', webcrypto)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T03:00:00Z'))
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
})

afterEach(async () => {
  const db = await openDatabase()
  db.close()
  resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('session store with real onboarding persistence', () => {
  it('serializes initial loads without duplicating seed data or creating a profile', async () => {
    await Promise.all([
      useMoneeStore.getState().load(),
      useMoneeStore.getState().load(),
      useMoneeStore.getState().load(),
    ])
    const db = await openDatabase()
    expect(await db.count('buckets')).toBe(DEFAULT_BUCKETS.length)
    expect(await db.count('categories')).toBe(DEFAULT_CATEGORIES.length)
    expect(await db.count('profile')).toBe(0)
    expect(await db.count('monthSweeps')).toBe(0)
    expect(useMoneeStore.getState()).toMatchObject({
      isLoaded: true, isLocked: true, profile: null, snapshot: null,
    })
  })

  it('serializes concurrent loads when historical income needs a sweep', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    await completeOnboarding(db, {
      ...makeInput(), income: { amount: 450_000, categoryId: 'cat-gaji', date: '2026-09-12' },
    })

    await Promise.all([useMoneeStore.getState().load(), useMoneeStore.getState().load()])

    expect(await db.count('monthSweeps')).toBe(1)
    expect(useMoneeStore.getState().sweeps).toHaveLength(1)
    expect(useMoneeStore.getState().snapshot?.savings.sisaBalance).toBe(450_000)
    expect(useMoneeStore.getState().isLocked).toBe(true)
  })

  it('unlocks the new profile and reloads the committed custom allocation and normal income', async () => {
    await useMoneeStore.getState().load()
    const input = makeInput()
    input.buckets[0].allocPercent = 35
    input.buckets[4].allocPercent = 10
    input.buckets[0].allowOverbudget = true

    await useMoneeStore.getState().finishOnboarding(input)

    const state = useMoneeStore.getState()
    expect(state.isLocked).toBe(false)
    expect(state.profile).toMatchObject({ id: 'profile', name: 'Nara', mascotId: 'luna' })
    expect(state.transactions).toHaveLength(1)
    expect(state.snapshot?.balance).toMatchObject({ totalIncome: 1_000_000, balance: 1_000_000 })
    expect(state.snapshot?.buckets.find(item => item.bucket.id === 'bucket-needs')).toMatchObject({
      bucket: { allocPercent: 35, allowOverbudget: true }, budgetAmount: 350_000,
    })
  })

  it.each([0, 60_000])('keeps an existing profile locked even with its correct PIN (lock deadline +%ims)', async delay => {
    const db = await openDatabase()
    await seedDefaultData(db)
    const original = await completeOnboarding(db, makeInput())
    const lockout = { attempts: 5, lockedUntil: delay ? Date.now() + delay : 0 }
    await saveLockoutState(db, lockout)
    await useMoneeStore.getState().load()

    await useMoneeStore.getState().finishOnboarding({ ...makeInput(), name: 'Stale wizard' })

    expect(useMoneeStore.getState().isLocked).toBe(true)
    expect(useMoneeStore.getState().profile).toEqual(original.profile)
    expect(await getLockoutState(db)).toEqual(lockout)
    expect(await db.count('transactions')).toBe(1)
  })

  it.each(['pagehide', 'visibilitychange'])('keeps a new session locked after %s during asynchronous completion', async event => {
    await useMoneeStore.getState().load()
    const completion = useMoneeStore.getState().finishOnboarding(makeInput())
    if (event === 'visibilitychange') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    } else window.dispatchEvent(new Event('pagehide'))
    await completion

    expect(useMoneeStore.getState().profile?.id).toBe('profile')
    expect(useMoneeStore.getState().transactions).toHaveLength(1)
    expect(useMoneeStore.getState().isLocked).toBe(true)
  })

  it('reloads into a locked session without creating the onboarding income again', async () => {
    await useMoneeStore.getState().load()
    await useMoneeStore.getState().finishOnboarding(makeInput())
    resetDbSingleton()
    useMoneeStore.setState(useMoneeStore.getInitialState(), true)

    await useMoneeStore.getState().load()
    await useMoneeStore.getState().load()

    expect(useMoneeStore.getState().isLocked).toBe(true)
    expect(useMoneeStore.getState().transactions).toHaveLength(1)
    expect(await (await openDatabase()).count('transactions')).toBe(1)
    expect(useMoneeStore.getState().snapshot?.balance.totalIncome).toBe(1_000_000)
  })

  it('sweeps a past-period first income while keeping current income and bucket budgets at zero', async () => {
    await useMoneeStore.getState().load()
    await useMoneeStore.getState().finishOnboarding({
      ...makeInput(), income: { amount: 750_000, categoryId: 'cat-gaji', date: '2026-09-30' },
    })

    const state = useMoneeStore.getState()
    expect(state.isLocked).toBe(false)
    expect(state.transactions).toHaveLength(1)
    expect(state.transactions[0]).toMatchObject({ type: 'income', date: '2026-09-30', amount: 750_000 })
    expect(state.snapshot?.balance).toMatchObject({ totalIncome: 0, balance: 0 })
    expect(state.snapshot?.periodTxs).toHaveLength(0)
    expect(state.snapshot?.buckets.every(item => item.budgetAmount === 0)).toBe(true)
    expect(state.snapshot?.savings).toMatchObject({ sisaBalance: 750_000, allocationBalance: 0, totalSavings: 750_000 })
    expect(state.sweeps).toEqual([expect.objectContaining({ periodKey: '2026-09', amount: 750_000 })])
    await state.load()
    expect(await (await openDatabase()).count('monthSweeps')).toBe(1)
  })
})
