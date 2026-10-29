import { getConfiguredPeriod } from '@/core/finance/period-config'
import type { MoneeDB } from '@/core/db/migrations'
import { getToday, isInPeriod } from '@/core/finance/period'
import { isPeriodLocked } from '@/core/finance/period-lock'
import { validateTransaction } from '@/core/finance/guards'
import { calcSavingsState } from '@/core/finance/savings'
import { hasSafeFinanceTotals } from '@/core/finance/safe-totals'
import type { SavingsSource, Transaction } from '@/core/finance/types'

export interface SavingsExpenseInput { amount: number; note: string; savingsSource: SavingsSource }
export interface SavingsDepositInput { amount: number; note: string }

export const recordSavingsExpense = (db: MoneeDB, input: SavingsExpenseInput) => recordEntry(db, { ...input, kind: 'expense' })
export const recordSavingsDeposit = (db: MoneeDB, input: SavingsDepositInput) => recordEntry(db, { ...input, kind: 'deposit' })

/** Read balances and write the outflow in one IndexedDB transaction, including across tabs. */
async function recordEntry(db: MoneeDB, input: (SavingsExpenseInput & { kind: 'expense' }) | (SavingsDepositInput & { kind: 'deposit' })): Promise<Transaction> {
  const write = db.transaction(['profile', 'buckets', 'transactions', 'monthSweeps'], 'readwrite')
  try {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('ERR_AMOUNT_INVALID — Nominal harus lebih dari 0 rupiah utuh.')
    if (input.kind === 'expense' && !input.note.trim()) throw new Error('ERR_NOTE_REQUIRED — Catatan wajib diisi.')
    if (input.kind === 'expense' && input.note.trim() === 'Darurat:') throw new Error('ERR_NOTE_REQUIRED — Lengkapi catatan kebutuhan darurat.')
    const [profile, buckets, transactions, sweeps] = await Promise.all([
      write.objectStore('profile').get('profile'), write.objectStore('buckets').getAll(),
      write.objectStore('transactions').getAll(), write.objectStore('monthSweeps').getAll(),
    ])
    const now = Date.now()
    const savingsBucket = buckets.find(bucket => bucket.isSavings)
    const transaction: Transaction = { id: crypto.randomUUID(), amount: input.amount,
      date: getToday(), note: input.note.trim(), deleted: false, createdAt: now, updatedAt: now,
      ...(input.kind === 'expense' ? { type: 'savings_expense', savingsSource: input.savingsSource }
        : { type: 'savings_deposit', categoryId: 'cat-tabungan', ...(savingsBucket ? { bucketId: savingsBucket.id } : {}) }),
    }
    const period = getConfiguredPeriod(transaction.date, profile?.periodStartDay ?? 1, profile?.periodChanges)
    if (!hasSafeFinanceTotals([...transactions, transaction], sweeps, profile)) throw new Error('ERR_AMOUNT_INVALID — Total nominal melewati batas hitungan aman.')
    const result = validateTransaction(transaction, { buckets,
      periodTxs: transactions.filter(item => isInPeriod(item.date, period)),
      savings: calcSavingsState(sweeps, transactions), locked: isPeriodLocked(period.key, sweeps) })
    if (!result.ok) throw new Error(`${result.code} — ${result.message}`)
    await write.objectStore('transactions').put(transaction)
    await write.done
    return transaction
  } catch (error) {
    try { write.abort() } catch { /* Transaction may already have aborted. */ }
    await write.done.catch(() => {})
    throw error
  }
}
