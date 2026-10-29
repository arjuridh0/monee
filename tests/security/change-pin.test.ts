import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { profileRepo } from '@/core/db/repositories'
import { getLockoutState, recordFailedAttempt } from '@/core/security/lockout'
import { hashPin, verifyPin } from '@/core/security/pin'
import type { Profile } from '@/core/finance/types'
import { changePin } from '@/features/security/change-pin'

const CURRENT_PIN = '123456'
const NEXT_PIN = '654321'

async function seedProfile(pin = CURRENT_PIN): Promise<Profile> {
  const salt = 'a'.repeat(32)
  const profile: Profile = {
    id: 'profile', name: 'Ayu', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'bucket-needs', pinHash: await hashPin(pin, salt), pinSalt: salt,
    createdAt: 0, currency: { code: 'IDR', format: 'Rp#.###' },
  }
  await profileRepo.save(await openDatabase(), profile)
  return profile
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('crypto', webcrypto)
  resetDbSingleton()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetDbSingleton()
})

describe('changePin', () => {
  it('stores a fresh salt and hash, verifies the new PIN, and clears the lockout', async () => {
    const profile = await seedProfile()
    const db = await openDatabase()
    await recordFailedAttempt(db)

    const updated = await changePin(db, {
      currentPin: CURRENT_PIN, newPin: NEXT_PIN, expectedPinHash: profile.pinHash,
    })

    expect(updated.pinSalt).not.toBe(profile.pinSalt)
    expect(updated.pinHash).not.toBe(profile.pinHash)
    expect(await verifyPin(NEXT_PIN, updated.pinHash, updated.pinSalt)).toBe(true)
    expect(await verifyPin(CURRENT_PIN, updated.pinHash, updated.pinSalt)).toBe(false)
    expect(await profileRepo.get(db)).toEqual(updated)
    expect(await getLockoutState(db)).toEqual({ attempts: 0, lockedUntil: 0 })
  })

  it('rejects a wrong current PIN without changing the profile or lockout', async () => {
    const profile = await seedProfile()
    const db = await openDatabase()
    await recordFailedAttempt(db)

    await expect(changePin(db, {
      currentPin: '999999', newPin: NEXT_PIN, expectedPinHash: profile.pinHash,
    })).rejects.toMatchObject({ code: 'ERR_CURRENT_PIN' })

    expect(await profileRepo.get(db)).toEqual(profile)
    expect(await getLockoutState(db)).toEqual({ attempts: 1, lockedUntil: 0 })
  })

  it('rejects reusing the current PIN', async () => {
    const profile = await seedProfile()
    const db = await openDatabase()

    await expect(changePin(db, {
      currentPin: CURRENT_PIN, newPin: CURRENT_PIN, expectedPinHash: profile.pinHash,
    })).rejects.toMatchObject({ code: 'ERR_PIN_SAME' })

    expect(await profileRepo.get(db)).toEqual(profile)
  })

  it.each(['12345', '1234567', 'abcdef', '', '12 34 56'])('rejects a malformed new PIN: %s', async newPin => {
    const profile = await seedProfile()
    const db = await openDatabase()

    await expect(changePin(db, {
      currentPin: CURRENT_PIN, newPin, expectedPinHash: profile.pinHash,
    })).rejects.toMatchObject({ code: 'ERR_PIN_FORMAT' })

    expect(await profileRepo.get(db)).toEqual(profile)
  })

  it('refuses to overwrite a profile changed by another tab', async () => {
    const profile = await seedProfile()
    const db = await openDatabase()

    await expect(changePin(db, {
      currentPin: CURRENT_PIN, newPin: NEXT_PIN, expectedPinHash: 'stale-hash',
    })).rejects.toMatchObject({ code: 'ERR_PROFILE_STALE' })

    expect(await profileRepo.get(db)).toEqual(profile)
  })

  it('rejects when no profile exists', async () => {
    const db = await openDatabase()
    await expect(changePin(db, {
      currentPin: CURRENT_PIN, newPin: NEXT_PIN, expectedPinHash: 'missing',
    })).rejects.toMatchObject({ code: 'ERR_PROFILE_MISSING' })
  })
})
