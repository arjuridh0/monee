import type { MoneeDB } from '@/core/db/migrations'
import { STORES } from '@/core/db/schema'
import type { RecurringIncome } from '@/core/finance/types'

export type RecurringIncomeErrorCode = 'ERR_RECURRING_INVALID' | 'ERR_RECURRING_STALE' | 'ERR_RECURRING_CATEGORY'

export class RecurringIncomeError extends Error {
  readonly code: RecurringIncomeErrorCode

  constructor(code: RecurringIncomeErrorCode, message: string) {
    super(message)
    this.name = 'RecurringIncomeError'
    this.code = code
  }
}

function fail(code: RecurringIncomeErrorCode, message: string): RecurringIncomeError {
  return new RecurringIncomeError(code, message)
}

function assertValid(recurring: RecurringIncome): void {
  if (!recurring || typeof recurring.id !== 'string' || !recurring.id.trim()
    || typeof recurring.name !== 'string' || !recurring.name.trim() || recurring.name.trim().length > 40
    || !Number.isSafeInteger(recurring.amount) || recurring.amount <= 0
    || !Number.isInteger(recurring.dayOfMonth) || recurring.dayOfMonth < 1 || recurring.dayOfMonth > 28
    || typeof recurring.categoryId !== 'string' || !recurring.categoryId.trim()
    || typeof recurring.isActive !== 'boolean'
    || !Number.isFinite(recurring.createdAt) || recurring.createdAt <= 0) {
    throw fail('ERR_RECURRING_INVALID', 'Periksa nama, nominal, tanggal, dan kategori pemasukan rutin.')
  }
}

function sameRecurring(left: RecurringIncome, right: RecurringIncome): boolean {
  return left.id === right.id && left.name === right.name && left.amount === right.amount
    && left.dayOfMonth === right.dayOfMonth && left.categoryId === right.categoryId
    && left.isActive === right.isActive && left.createdAt === right.createdAt
}

export async function saveRecurringIncome(
  db: MoneeDB,
  recurring: RecurringIncome,
  expected?: RecurringIncome,
): Promise<RecurringIncome> {
  const tx = db.transaction([STORES.recurringIncomes, STORES.categories], 'readwrite')
  try {
    const current = await tx.objectStore(STORES.recurringIncomes).get(recurring.id)
    assertValid(recurring)
    if (expected ? !current || !sameRecurring(current, expected) : Boolean(current)) {
      throw fail('ERR_RECURRING_STALE', 'Template pemasukan rutin berubah di tab lain. Muat ulang Monee.')
    }

    const category = await tx.objectStore(STORES.categories).get(recurring.categoryId)
    if (category?.type !== 'income') {
      throw fail('ERR_RECURRING_CATEGORY', 'Pilih kategori pemasukan yang tersedia.')
    }

    const saved = {
      ...recurring,
      name: recurring.name.trim(),
      createdAt: current?.createdAt ?? recurring.createdAt,
    }
    await tx.objectStore(STORES.recurringIncomes).put(saved)
    await tx.done
    return saved
  } catch (error) {
    try { tx.abort() } catch { /* The transaction has already completed or aborted. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}

export async function deleteRecurringIncome(db: MoneeDB, id: string): Promise<void> {
  const tx = db.transaction(STORES.recurringIncomes, 'readwrite')
  try {
    if (!await tx.store.get(id)) throw fail('ERR_RECURRING_STALE', 'Template sudah dihapus. Muat ulang Monee.')
    await tx.store.delete(id)
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* The transaction has already completed or aborted. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
