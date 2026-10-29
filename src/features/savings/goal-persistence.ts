import { getConfiguredPeriod } from '@/core/finance/period-config'
import type { MoneeDB } from '@/core/db/migrations'
import { buildGoalExpense, calcGoalProgress, markGoalUsed } from '@/core/finance/goals'
import { validateGoalUse, validateTransaction } from '@/core/finance/guards'
import { calcSavingsState } from '@/core/finance/savings'
import { hasSafeFinanceTotals } from '@/core/finance/safe-totals'
import { getToday, isInPeriod } from '@/core/finance/period'
import { isPeriodLocked } from '@/core/finance/period-lock'
import type { Goal } from '@/core/finance/types'

export async function saveActiveGoal(db: MoneeDB, goal: Goal): Promise<Goal> {
  const write = db.transaction('goals', 'readwrite')
  try {
    const existing = await write.store.get(goal.id)
    if (existing?.usedAt !== undefined || goal.usedAt !== undefined) throw new Error('Tujuan ini sudah digunakan dan tersimpan di riwayat.')
    if (!goal.name.trim() || goal.name.trim().length > 60 || !Number.isSafeInteger(goal.targetAmount) || goal.targetAmount <= 0) throw new Error('Isi nama tujuan dan target rupiah yang valid.')
    const saved = { ...goal, name: goal.name.trim() }
    await write.store.put(saved); await write.done
    return saved
  } catch (error) {
    try { write.abort() } catch { /* Already aborted. */ }
    await write.done.catch(() => {}); throw error
  }
}

export async function deleteActiveGoal(db: MoneeDB, id: string): Promise<void> {
  const write = db.transaction('goals', 'readwrite')
  try {
    const existing = await write.store.get(id)
    if (existing?.usedAt !== undefined) throw new Error('Tujuan ini sudah digunakan dan tersimpan di riwayat.')
    await write.store.delete(id); await write.done
  } catch (error) {
    try { write.abort() } catch { /* Already aborted. */ }
    await write.done.catch(() => {}); throw error
  }
}

/** Spending and usedAt either both commit or both roll back; concurrent tabs serialize here. */
export async function commitGoalUse(db: MoneeDB, id: string, expectedTarget: number) {
  const write = db.transaction(['goals', 'transactions', 'profile', 'buckets', 'monthSweeps'], 'readwrite')
  try {
    const [goals, transactions, profile, buckets, sweeps] = await Promise.all([
      write.objectStore('goals').getAll(), write.objectStore('transactions').getAll(),
      write.objectStore('profile').get('profile'), write.objectStore('buckets').getAll(), write.objectStore('monthSweeps').getAll(),
    ])
    const goal = goals.find(item => item.id === id)
    if (!goal || goal.usedAt !== undefined || transactions.some(item => item.id === `goal-use:${id}` && !item.deleted)) throw new Error('ERR_GOAL_ALREADY_USED — Tujuan ini sudah digunakan atau dihapus.')
    if (goal.targetAmount !== expectedTarget) throw new Error('Target tujuan berubah. Buka kembali konfirmasi untuk melihat nominal terbaru.')
    const savings = calcSavingsState(sweeps, transactions)
    const result = validateGoalUse(goal.targetAmount, savings.allocationBalance)
    const projection = calcGoalProgress(goals, savings.allocationBalance).goals.find(item => item.goal.id === id)
    if (!result.ok || projection?.status !== 'fulfilled') throw new Error('ERR_GOAL_BELUM_CUKUP — Dana Allocation sudah terpakai. Tujuan kembali aktif.')
    const now = Date.now()
    const transaction = buildGoalExpense(goal, { id: `goal-use:${id}`, date: getToday(), now })
    if (!hasSafeFinanceTotals([...transactions, transaction], sweeps, profile)) throw new Error('ERR_AMOUNT_INVALID — Total nominal melewati batas hitungan aman.')
    const period = getConfiguredPeriod(transaction.date, profile?.periodStartDay ?? 1, profile?.periodChanges)
    const validation = validateTransaction(transaction, { buckets,
      periodTxs: transactions.filter(item => isInPeriod(item.date, period)), savings, locked: isPeriodLocked(period.key, sweeps) })
    if (!validation.ok) throw new Error(`${validation.code} — ${validation.message}`)
    const used = markGoalUsed(goal, now)
    await write.objectStore('transactions').put(transaction)
    await write.objectStore('goals').put(used)
    await write.done
    return { transaction, goal: used }
  } catch (error) {
    try { write.abort() } catch { /* Already aborted. */ }
    await write.done.catch(() => {})
    throw error
  }
}

export async function reorderGoals(db: MoneeDB, ids: string[]) {
  const write = db.transaction('goals', 'readwrite')
  try {
    const goals = await write.store.getAll()
    const active = goals.filter(goal => goal.usedAt === undefined)
    if (ids.length !== active.length || new Set(ids).size !== ids.length || active.some(goal => !ids.includes(goal.id))) {
      throw new Error('Urutan tujuan berubah. Buka ulang halaman dan coba lagi.')
    }
    const reordered = goals.map(goal => goal.usedAt === undefined ? { ...goal, sortOrder: ids.indexOf(goal.id) } : goal)
    await Promise.all(reordered.map(goal => write.store.put(goal)))
    await write.done
    return reordered
  } catch (error) {
    try { write.abort() } catch { /* Already aborted. */ }
    await write.done.catch(() => {})
    throw error
  }
}
