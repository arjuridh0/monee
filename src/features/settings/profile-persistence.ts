import type { MoneeDB } from '@/core/db/migrations'
import type { Profile } from '@/core/finance/types'
import { isCurrencyFormat } from '@/core/finance/currency'

export type ProfilePreferences = Pick<Profile, 'name' | 'mascotId' | 'currency'>

/** Preferences never carry credential or period fields across the write boundary. */
export async function savePreferences(db: MoneeDB, changes: Partial<ProfilePreferences>, expected: Profile): Promise<Profile> {
  const tx = db.transaction('profile', 'readwrite')
  try {
    const current = await tx.store.get('profile')
    if (!current) throw new Error('ERR_PROFILE_MISSING — Profil sudah tidak tersedia. Muat ulang Monee.')
    for (const field of Object.keys(changes) as (keyof ProfilePreferences)[]) {
      if (JSON.stringify(current[field]) !== JSON.stringify(expected[field])) {
        throw new Error('ERR_PROFILE_STALE — Preferensi berubah di tab lain. Muat ulang Monee.')
      }
    }
    const updated = { ...current, ...changes }
    if (!updated.name.trim() || updated.name.trim().length > 40
      || !['mochi', 'luna', 'bumi'].includes(updated.mascotId)
      || (updated.currency && (updated.currency.code !== 'IDR' || !isCurrencyFormat(updated.currency.format)))) {
      throw new Error('ERR_PROFILE_INVALID — Periksa nama, maskot dan format rupiah.')
    }
    updated.name = updated.name.trim()
    await tx.store.put(updated); await tx.done
    return updated
  } catch (error) {
    try { tx.abort() } catch { /* Already ended. */ }
    await tx.done.catch(() => undefined); throw error
  }
}
