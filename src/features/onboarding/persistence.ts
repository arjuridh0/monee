import type { MoneeDB } from '@/core/db/migrations'
import type { Bucket, MascotId, Profile } from '@/core/finance/types'
import { getToday } from '@/core/finance/period'
import { generateSalt, hashPin } from '@/core/security/pin'
import { LOCKOUT_KEY } from '@/core/security/lockout'

export interface CompleteOnboardingInput {
  name: string
  buckets: Bucket[]
  mascotId: MascotId
  pin: string
  income?: {
    amount: number
    categoryId: string
    date: string
    note?: string
  }
}

export interface CompleteOnboardingResult {
  profile: Profile
  /** Only the transaction that inserted the first profile can authorize the new session. */
  created: boolean
}

function validateInput(input: CompleteOnboardingInput): void {
  if (!input.name.trim() || input.name.trim().length > 40) {
    throw new Error('Nama wajib diisi, maksimal 40 karakter.')
  }
  if (!/^\d{6}$/.test(input.pin)) throw new Error('PIN harus terdiri dari 6 angka.')
  if (!['mochi', 'luna', 'bumi'].includes(input.mascotId)) {
    throw new Error('Pilih maskot yang tersedia.')
  }

  const buckets = input.buckets
  const ids = new Set(buckets.map(bucket => bucket.id))
  const validAllocation = buckets.length >= 2
    && ids.size === buckets.length
    && buckets.every(bucket => bucket.id.trim()
      && Number.isFinite(bucket.allocPercent)
      && bucket.allocPercent >= 0 && bucket.allocPercent <= 100)
    && buckets.filter(bucket => bucket.isSavings).length === 1
    && Math.abs(buckets.reduce((sum, bucket) => sum + bucket.allocPercent, 0) - 100) < 1e-9
  if (!validAllocation) throw new Error('Total alokasi harus 100% dengan tepat satu bucket Tabungan.')

  if (input.income) {
    const { amount, date } = input.income
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error('Nominal pemasukan harus berupa rupiah bulat lebih dari 0.')
    }
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== date
      || date > getToday()) {
      throw new Error('Tanggal pemasukan harus valid dan tidak boleh melebihi hari ini.')
    }
  }
}

/** Commit all first-run data together; an existing profile makes repeat submissions a no-op. */
export async function completeOnboarding(
  db: MoneeDB,
  input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  // Snapshot caller data before the asynchronous hash so edits cannot change the commit.
  const draft: CompleteOnboardingInput = {
    name: input.name.trim(),
    pin: input.pin,
    mascotId: input.mascotId,
    buckets: input.buckets.map(bucket => ({ ...bucket })),
    ...(input.income ? { income: {
      amount: input.income.amount,
      date: input.income.date,
      categoryId: input.income.categoryId,
      ...(input.income.note?.trim() ? { note: input.income.note.trim() } : {}),
    } } : {}),
  }
  validateInput(draft)

  // Web Crypto must finish before opening IDB's short-lived transaction.
  const pinSalt = generateSalt()
  const pinHash = await hashPin(draft.pin, pinSalt)
  const now = Date.now()
  const defaultBucket = [...draft.buckets].sort((a, b) => a.sortOrder - b.sortOrder)
    .find(bucket => !bucket.isSavings)!
  const profile: Profile = {
    id: 'profile', name: draft.name, mascotId: draft.mascotId,
    periodStartDay: 1, defaultBucketId: defaultBucket.id,
    pinSalt, pinHash, createdAt: now,
    currency: { code: 'IDR', format: 'Rp#.###' },
  }

  const tx = db.transaction(
    ['profile', 'buckets', 'categories', 'transactions', 'settings', 'lockout'],
    'readwrite',
  )
  try {
    // The read and write share one transaction, including across concurrent calls/tabs.
    const existing = await tx.objectStore('profile').get('profile')
    if (existing) {
      await tx.done
      return { profile: existing, created: false }
    }
    if (draft.income) {
      const category = await tx.objectStore('categories').get(draft.income.categoryId)
      if (category?.type !== 'income') throw new Error('Pilih kategori pemasukan yang valid.')
    }

    await tx.objectStore('profile').add(profile)
    await tx.objectStore('buckets').clear()
    for (const bucket of draft.buckets) await tx.objectStore('buckets').add(bucket)
    if (draft.income) {
      await tx.objectStore('transactions').add({
        id: 'onboarding-income', type: 'income', ...draft.income,
        refundedAmount: 0, deleted: false, createdAt: now, updatedAt: now,
      })
    }
    await tx.objectStore('lockout').delete(LOCKOUT_KEY)
    await tx.objectStore('settings').delete('onboarding-draft')
    await tx.done
    return { profile, created: true }
  } catch (error) {
    // A request error may have already aborted the transaction.
    try { tx.abort() } catch { /* Already aborted or completed. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
