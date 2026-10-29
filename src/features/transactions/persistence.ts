import { getConfiguredPeriod } from '@/core/finance/period-config'
import type { MoneeDB } from '@/core/db/migrations'
import type { Transaction } from '@/core/finance/types'
import { getToday, isInPeriod, isValidDateStr } from '@/core/finance/period'
import { isPeriodLocked } from '@/core/finance/period-lock'
import { validateTransaction } from '@/core/finance/guards'
import { calcSavingsState } from '@/core/finance/savings'
import { hasSafeFinanceTotals } from '@/core/finance/safe-totals'

/** Serialize validation and writing across tabs; expected is the exact version being edited. */
export async function persistTransaction(db: MoneeDB, next: Transaction, expected?: Transaction, validateOnly = false): Promise<void> {
  const write = db.transaction(['profile', 'buckets', 'categories', 'transactions', 'monthSweeps', 'goals'], 'readwrite')
  try {
    const [profile, buckets, categories, transactions, sweeps] = await Promise.all([
      write.objectStore('profile').get('profile'), write.objectStore('buckets').getAll(),
      write.objectStore('categories').getAll(), write.objectStore('transactions').getAll(), write.objectStore('monthSweeps').getAll(),
    ])
    const previous = transactions.find(item => item.id === next.id)
    if (!next.id.trim() || !['income', 'expense', 'savings_deposit', 'savings_expense'].includes(next.type)
      || !Number.isSafeInteger(next.createdAt) || next.createdAt < 0 || !Number.isSafeInteger(next.updatedAt) || next.updatedAt < 0
      || (next.note !== undefined && typeof next.note !== 'string')
      || (next.deleted !== undefined && typeof next.deleted !== 'boolean')
      || (next.savingsSource !== undefined && next.type !== 'savings_expense')
      || (next.recurringId !== undefined && (next.type !== 'income' || typeof next.recurringId !== 'string' || !next.recurringId.trim()))) {
      throw new Error('ERR_TRANSACTION_INVALID — Format transaksi tidak valid.')
    }
    if (expected ? !previous || JSON.stringify(previous) !== JSON.stringify(expected) : !!previous) {
      throw new Error('ERR_TRANSACTION_STALE — Transaksi berubah di tab lain. Buka ulang riwayat.')
    }
    const period = getConfiguredPeriod(next.date, profile?.periodStartDay ?? 1, profile?.periodChanges)
    if (isPeriodLocked(period.key, sweeps) || (previous && isPeriodLocked(getConfiguredPeriod(previous.date, profile?.periodStartDay ?? 1, profile?.periodChanges).key, sweeps))) {
      throw new Error('ERR_PERIODE_TERKUNCI — Periode ini sudah ditutup.')
    }
    if (!isValidDateStr(next.date) || next.date > getToday()) throw new Error('ERR_DATE_INVALID — Tanggal tidak valid.')
    if (!Number.isSafeInteger(next.amount) || next.amount <= 0) throw new Error('ERR_AMOUNT_INVALID — Nominal harus rupiah utuh lebih dari 0.')
    if (!Number.isSafeInteger(next.refundedAmount ?? 0) || (next.refundedAmount ?? 0) < 0 || (next.refundedAmount ?? 0) > next.amount || (next.type !== 'expense' && (next.refundedAmount ?? 0) !== 0)) throw new Error('ERR_REFUND_INVALID — Nominal refund tidak valid.')
    const others = transactions.filter(item => item.id !== next.id)
    if (!next.deleted) {
      if (next.type === 'savings_expense') {
        if (!next.note?.trim() || next.note.trim() === 'Darurat:') throw new Error('ERR_NOTE_REQUIRED — Catatan pengeluaran tabungan wajib diisi.')
        if (next.categoryId !== undefined || next.bucketId !== undefined) throw new Error('ERR_TRANSACTION_INVALID — Pengeluaran tabungan memakai sumber kompartemen.')
      } else if (!next.categoryId || !categories.some(category => category.id === next.categoryId && category.type === (next.type === 'income' ? 'income' : 'expense'))) {
        throw new Error('ERR_CATEGORY_INVALID — Pilih kategori yang tersedia.')
      }
      if (next.type === 'income' && next.bucketId !== undefined) throw new Error('ERR_BUCKET_INVALID — Pemasukan tidak memakai bucket.')
      if (next.type === 'expense' && next.categoryId === 'cat-tabungan') throw new Error('ERR_CATEGORY_INVALID — Gunakan setoran untuk kategori Tabungan.')
      if (next.type === 'savings_deposit' && (next.categoryId !== 'cat-tabungan' || !buckets.some(bucket => bucket.id === next.bucketId && bucket.isSavings))) {
        throw new Error('ERR_BUCKET_INVALID — Setoran harus menuju bucket Tabungan.')
      }
      const netAmount = next.type === 'expense' ? next.amount - (next.refundedAmount ?? 0) : next.amount
      if (next.type === 'expense' && !buckets.some(bucket => bucket.id === next.bucketId && !bucket.isSavings)) throw new Error('ERR_BUCKET_INVALID — Pilih bucket pengeluaran.')
      const result = validateTransaction({ ...next, amount: netAmount || 1 }, {
        buckets, periodTxs: others.filter(item => isInPeriod(item.date, period)),
        savings: calcSavingsState(sweeps, others), locked: false,
      })
      // A refund/reduction can restore funds while an earlier income correction
      // still leaves this period below zero or beyond its bucket allowance.
      const sameExpense = previous && !previous.deleted && previous.type === 'expense' && next.type === 'expense'
        && previous.date === next.date && previous.bucketId === next.bucketId
      const restorative = sameExpense && netAmount <= previous.amount - (previous.refundedAmount ?? 0)
      const expenseAmountCorrection = sameExpense && next.amount > previous.amount
      if (netAmount > 0 && !result.ok && !restorative
        && !(expenseAmountCorrection && result.code === 'ERR_SALDO_KURANG')) throw new Error(`${result.code} — ${result.message}`)
    }
    const after = [...others, next]
    if (!hasSafeFinanceTotals(after, sweeps, profile)) throw new Error('ERR_AMOUNT_INVALID — Total nominal melewati batas hitungan aman.')
    // Income edits/deletes may leave negative period balance and bucket allowance (docs 08 sections 2 and 3).
    const savings = calcSavingsState(sweeps, after)
    if (savings.sisaBalance < 0 || savings.allocationBalance < 0) throw new Error('ERR_KOMPARTEMEN_KURANG — Dana tabungan sudah terpakai.')
    if (next.id.startsWith('goal-use:')) {
      const goal = await write.objectStore('goals').get(next.id.slice('goal-use:'.length))
      if (!goal || !previous || next.type !== 'savings_expense' || next.savingsSource !== 'allocation') {
        throw new Error('ERR_GOAL_LINK — Gunakan aksi tujuan untuk mencatat penggunaan tujuan baru.')
      }
      if (!validateOnly) {
        const updated = { ...goal, targetAmount: next.amount }
        if (next.deleted) delete updated.usedAt
        else updated.usedAt = goal.usedAt ?? next.createdAt
        await write.objectStore('goals').put(updated)
      }
    }
    if (!validateOnly) await write.objectStore('transactions').put(next)
    await write.done
  } catch (error) {
    try { write.abort() } catch { /* already aborted */ }
    await write.done.catch(() => {})
    throw error
  }
}

