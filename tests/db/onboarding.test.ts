import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { DEFAULT_BUCKETS, profileRepo, seedDefaultData } from '@/core/db/repositories'
import { getLockoutState, recordFailedAttempt } from '@/core/security/lockout'
import { verifyPin } from '@/core/security/pin'
import { completeOnboarding, type CompleteOnboardingInput } from '@/features/onboarding/persistence'

const makeInput = (): CompleteOnboardingInput => ({
  name: '  Ayu  ', buckets: DEFAULT_BUCKETS.map(bucket => ({ ...bucket })),
  mascotId: 'luna', pin: '123456',
})

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('crypto', webcrypto)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T18:00:00Z')) // 24 Oktober WIB
  resetDbSingleton()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('completeOnboarding', () => {
  it('allows onboarding without a device PIN', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    const { profile } = await completeOnboarding(db, { ...makeInput(), pin: undefined })
    expect(profile.pinHash).toBe('')
    expect(profile.pinSalt).toBe('')
  })

  it('commits profile, allocation and salted PIN without income when skipped', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    await db.put('settings', { key: 'onboarding-draft', value: { name: 'Ayu' } })
    await recordFailedAttempt(db)
    const input = makeInput()
    input.buckets[0].allocPercent = 35
    input.buckets[4].allocPercent = 10

    const { profile, created } = await completeOnboarding(db, input)

    expect(created).toBe(true)
    expect(await profileRepo.get(db)).toEqual(profile)
    expect(profile).toMatchObject({ id: 'profile', name: 'Ayu', mascotId: 'luna', periodStartDay: 1, defaultBucketId: 'bucket-needs' })
    expect(profile.pinSalt).toMatch(/^[a-f0-9]{32}$/)
    expect(profile.pinHash).toMatch(/^[a-f0-9]{64}$/)
    expect(await verifyPin('123456', profile.pinHash, profile.pinSalt)).toBe(true)
    expect(await db.get('buckets', 'bucket-needs')).toMatchObject({ allocPercent: 35 })
    expect(await db.getAll('transactions')).toEqual([])
    expect(await db.get('settings', 'onboarding-draft')).toBeUndefined()
    expect(await getLockoutState(db)).toEqual({ attempts: 0, lockedUntil: 0 })
  })

  it('stores optional income as one normal income on its selected date, using WIB today', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    await completeOnboarding(db, { ...makeInput(), income: { amount: 1_000_000, date: '2026-10-24', categoryId: 'cat-gaji', note: '  Gaji  ' } })

    expect(await db.getAll('transactions')).toEqual([expect.objectContaining({
      id: 'onboarding-income', type: 'income', amount: 1_000_000, date: '2026-10-24',
      categoryId: 'cat-gaji', note: 'Gaji', refundedAmount: 0, deleted: false,
    })])
  })

  it('serializes double submission and preserves the first profile, allocation and single income', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    const input = { ...makeInput(), income: { amount: 200_000, date: '2026-10-24', categoryId: 'cat-gaji' } }
    const [first, duplicate] = await Promise.all([completeOnboarding(db, input), completeOnboarding(db, input)])
    expect(first.profile).toEqual(duplicate.profile)
    expect([first.created, duplicate.created].sort()).toEqual([false, true])
    expect(await db.count('profile')).toBe(1)
    expect(await db.count('transactions')).toBe(1)

    await recordFailedAttempt(db)
    const later = await completeOnboarding(db, { ...makeInput(), name: 'Changed', mascotId: 'bumi' })
    expect(later).toEqual({ profile: first.profile, created: false })
    expect((await getLockoutState(db)).attempts).toBe(1)
    expect((await db.getAll('transactions'))[0].amount).toBe(200_000)
  })

  it.each([
    { name: '' }, { name: 'x'.repeat(41) }, { pin: '12345' }, { pin: '12345x' },
    { buckets: DEFAULT_BUCKETS.map(b => ({ ...b, allocPercent: 0 })) },
    { buckets: DEFAULT_BUCKETS.map(b => ({ ...b, allocPercent: b.isSavings ? NaN : b.allocPercent })) },
    { buckets: DEFAULT_BUCKETS.map(b => ({ ...b, isSavings: false })) },
    { buckets: DEFAULT_BUCKETS.map(b => ({ ...b, isSavings: true })) },
  ])('rejects invalid profile/allocation without changing seeded data: %j', async change => {
    const db = await openDatabase()
    await seedDefaultData(db)
    await db.put('settings', { key: 'onboarding-draft', value: { name: 'Kept' } })
    await expect(completeOnboarding(db, { ...makeInput(), ...change })).rejects.toThrow()
    expect(await profileRepo.get(db)).toBeUndefined()
    expect(await db.getAll('transactions')).toEqual([])
    expect(await db.get('buckets', 'bucket-needs')).toEqual(DEFAULT_BUCKETS[0])
    expect(await db.get('settings', 'onboarding-draft')).toBeDefined()
  })

  it.each([
    { amount: 0 }, { amount: -1 }, { amount: 1.5 }, { amount: Number.MAX_SAFE_INTEGER + 1 },
    { date: '2026-02-30' }, { date: '2026-10-25' }, { date: '24-10-2026' },
    { categoryId: 'cat-makan' }, { categoryId: 'missing' },
  ])('rejects invalid income without partial profile or income: %j', async change => {
    const db = await openDatabase()
    await seedDefaultData(db)
    await expect(completeOnboarding(db, {
      ...makeInput(), income: { amount: 100_000, date: '2026-10-24', categoryId: 'cat-gaji', ...change },
    })).rejects.toThrow()
    expect(await profileRepo.get(db)).toBeUndefined()
    expect(await db.count('transactions')).toBe(0)
  })

  it('rolls every onboarding write back if income insertion fails', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    await db.put('settings', { key: 'onboarding-draft', value: 'keep' })
    await recordFailedAttempt(db)
    // A persisted onboarding income with no profile indicates an incomplete legacy write.
    await db.put('transactions', { id: 'onboarding-income', type: 'income', amount: 50,
      categoryId: 'cat-gaji', date: '2026-10-24', createdAt: 1, updatedAt: 1 })
    const input = makeInput()
    input.buckets[0].allocPercent = 35
    input.buckets[4].allocPercent = 10
    await expect(completeOnboarding(db, { ...input, income: { amount: 100_000, date: '2026-10-24', categoryId: 'cat-gaji' } })).rejects.toThrow()
    expect(await profileRepo.get(db)).toBeUndefined()
    expect(await db.get('buckets', 'bucket-needs')).toEqual(DEFAULT_BUCKETS[0])
    expect((await db.get('transactions', 'onboarding-income'))?.amount).toBe(50)
    expect(await db.get('settings', 'onboarding-draft')).toEqual({ key: 'onboarding-draft', value: 'keep' })
    expect((await getLockoutState(db)).attempts).toBe(1)
  })
})
