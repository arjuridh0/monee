/**
 * Goals - dok 08 §5
 * Progress & status derived dari Allocation. Tidak ada savedAmount/status.
 * ponytail: 3 fungsi pure
 */
import type { Goal, GoalProgress, GoalStatus, Id, DateStr, Timestamp } from './types'

export interface GoalProjection {
  goals: GoalProgress[]
  /** Sisa Allocation setelah semua goal aktif terisi */
  unallocated: number
}

function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) =>
    a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  )
}

function progressPct(allocated: number, target: number): number {
  if (target <= 0) return 100
  return Math.round((allocated / target) * 1000) / 10
}

/** Distribusikan pool Allocation berurutan sesuai sortOrder. */
export function calcGoalProgress(goals: Goal[], allocationBalance: number): GoalProjection {
  let pool = Math.max(0, allocationBalance)

  const projected = sortGoals(goals).map((goal): GoalProgress => {
    if (goal.usedAt !== undefined) {
      return {
        goal,
        allocated: goal.targetAmount,
        progressPct: 100,
        status: 'used',
      }
    }

    const allocated = Math.min(pool, Math.max(0, goal.targetAmount))
    pool -= allocated

    const status: GoalStatus = goal.targetAmount <= 0 || allocated >= goal.targetAmount
      ? 'fulfilled'
      : 'active'

    return { goal, allocated, progressPct: progressPct(allocated, goal.targetAmount), status }
  })

  return { goals: projected, unallocated: pool }
}

/** Satu-satunya efek "Gunakan": savings_expense dari Allocation. */
export function buildGoalExpense(
  goal: Goal,
  opts: { id: Id; date: DateStr; now?: Timestamp },
): import('./types').Transaction {
  const now = opts.now ?? Date.now()
  return {
    id: opts.id,
    type: 'savings_expense',
    amount: goal.targetAmount,
    date: opts.date,
    note: `Gunakan goal: ${goal.name}`,
    savingsSource: 'allocation',
    refundedAmount: 0,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  }
}

/** Tandai usedAt. Status `used` dihitung dari field ini, bukan disimpan. */
export function markGoalUsed(goal: Goal, now: Timestamp = Date.now()): Goal {
  return { ...goal, usedAt: now }
}
