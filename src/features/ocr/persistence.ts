import type { MoneeDB } from '@/core/db/migrations'
import type { Transaction } from '@/core/finance/types'
import { getConfiguredPeriod } from '@/core/finance/period-config'
import { getToday, isInPeriod, isValidDateStr } from '@/core/finance/period'
import { isPeriodLocked } from '@/core/finance/period-lock'
import { validateTransaction } from '@/core/finance/guards'
import { calcSavingsState } from '@/core/finance/savings'
import { hasSafeFinanceTotals } from '@/core/finance/safe-totals'
import { MAX_RECEIPT_ITEMS } from './receipt'

const fields: (keyof Transaction)[] = ['id', 'type', 'amount', 'date', 'note', 'categoryId', 'bucketId', 'savingsSource', 'refundedAmount', 'deleted', 'recurringId', 'createdAt', 'updatedAt']
function sameExpense(a: Transaction, b: Transaction): boolean { return fields.every(key => a[key] === b[key]) }
function assertShape(item: Transaction): void {
  if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.startsWith('goal-use:') || item.type !== 'expense'
    || !Number.isSafeInteger(item.amount) || item.amount <= 0 || !isValidDateStr(item.date) || item.date > getToday()
    || !Number.isSafeInteger(item.createdAt) || item.createdAt < 0 || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0
    || (item.note !== undefined && (typeof item.note !== 'string' || item.note.length > 250))
    || (item.refundedAmount !== undefined && item.refundedAmount !== 0) || (item.deleted !== undefined && item.deleted !== false)
    || item.savingsSource !== undefined || item.recurringId !== undefined) {
    throw new Error('ERR_TRANSACTION_INVALID — Periksa kembali item struk, nominal, dan tanggalnya.')
  }
}

/** One serialized ledger write. An exact retry is a no-op; conflicting IDs never overwrite. */
export async function persistReceiptExpenses(db: MoneeDB, batch: Transaction[]): Promise<boolean> {
  if (!batch.length || batch.length > MAX_RECEIPT_ITEMS || new Set(batch.map(item => item.id)).size !== batch.length) {
    throw new Error('ERR_TRANSACTION_INVALID — Isi 1–50 item dengan identitas berbeda.')
  }
  batch.forEach(assertShape)
  const write = db.transaction(['profile', 'buckets', 'categories', 'transactions', 'monthSweeps', 'settings'], 'readwrite')
  try {
    const [profile, buckets, categories, transactions, sweeps] = await Promise.all([
      write.objectStore('profile').get('profile'), write.objectStore('buckets').getAll(), write.objectStore('categories').getAll(),
      write.objectStore('transactions').getAll(), write.objectStore('monthSweeps').getAll(),
    ])
    if (!profile) throw new Error('ERR_PROFILE_MISSING — Profil belum tersedia. Buka ulang Monee.')
    const membership = JSON.stringify(batch.map(item => item.id).sort())
    const records = await Promise.all(batch.map(item => write.objectStore('settings').get(`receipt-batch:${item.id}`)))
    const existing = batch.map(item => transactions.find(tx => tx.id === item.id))
    if (existing.some(Boolean)) {
      if (!existing.every((item, index) => item && sameExpense(item, batch[index]!) && records[index]?.value === membership)) {
        throw new Error('ERR_TRANSACTION_STALE — Item struk sudah berubah. Buka ulang riwayat sebelum melanjutkan.')
      }
      await write.done
      return false
    }
    if (records.some(Boolean)) throw new Error('ERR_TRANSACTION_STALE — Sebagian item struk sudah berubah. Buka ulang riwayat.')
    const after = [...transactions]
    for (const item of batch) {
      if (!categories.some(category => category.id === item.categoryId && category.type === 'expense' && category.id !== 'cat-tabungan')) {
        throw new Error('ERR_CATEGORY_INVALID — Pilih kategori pengeluaran selain Tabungan.')
      }
      const period = getConfiguredPeriod(item.date, profile?.periodStartDay ?? 1, profile?.periodChanges)
      const result = validateTransaction(item, { buckets, periodTxs: after.filter(tx => isInPeriod(tx.date, period)),
        savings: calcSavingsState(sweeps, after), locked: isPeriodLocked(period.key, sweeps) })
      if (!result.ok) throw new Error(`${result.code} — ${result.message}`)
      after.push(item)
    }
    if (!hasSafeFinanceTotals(after, sweeps, profile)) throw new Error('ERR_AMOUNT_INVALID — Total nominal melewati batas hitungan aman.')
    for (const item of batch) {
      await write.objectStore('transactions').add(item)
      await write.objectStore('settings').put({ key: `receipt-batch:${item.id}`, value: membership })
    }
    await write.done
    return true
  } catch (error) {
    try { write.abort() } catch { /* Transaction already ended. */ }
    await write.done.catch(() => undefined)
    throw error
  }
}
