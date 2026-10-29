import { describe, it, expect } from 'vitest'
import { calcGoalProgress, buildGoalExpense, markGoalUsed } from '@/core/finance/goals'
import type { Goal } from '@/core/finance/types'

let seq = 0
const goal = (name: string, targetAmount: number, sortOrder: number, over: Partial<Goal> = {}): Goal => ({
  id: `g-${++seq}`, name, targetAmount, sortOrder, createdAt: 0, ...over,
})

describe('goals (v2)', () => {
  it('tanpa goal -> semua pool unallocated', () => {
    const r = calcGoalProgress([], 500_000)
    expect(r.goals).toEqual([])
    expect(r.unallocated).toBe(500_000)
  })

  it('satu goal terisi penuh -> fulfilled', () => {
    const g = goal('HP', 500_000, 0)
    const r = calcGoalProgress([g], 500_000)
    expect(r.goals[0]?.allocated).toBe(500_000)
    expect(r.goals[0]?.progressPct).toBe(100)
    expect(r.goals[0]?.status).toBe('fulfilled')
    expect(r.unallocated).toBe(0)
  })

  it('pool kurang -> partial dan active', () => {
    const r = calcGoalProgress([goal('HP', 500_000, 0)], 300_000)
    expect(r.goals[0]?.allocated).toBe(300_000)
    expect(r.goals[0]?.progressPct).toBe(60)
    expect(r.goals[0]?.status).toBe('active')
  })

  it('berurutan: goal 1 penuh, sisa ke goal 2', () => {
    const g1 = goal('HP', 400_000, 0)
    const g2 = goal('Laptop', 300_000, 1)
    const r = calcGoalProgress([g1, g2], 500_000)
    expect(r.goals[0]?.allocated).toBe(400_000)
    expect(r.goals[0]?.status).toBe('fulfilled')
    expect(r.goals[1]?.allocated).toBe(100_000)
    expect(r.goals[1]?.status).toBe('active')
    expect(r.unallocated).toBe(0)
  })

  it('pool menyusut -> goal bisa regress fulfilled ke active', () => {
    const g1 = goal('HP', 400_000, 0)
    const g2 = goal('Laptop', 300_000, 1)
    const before = calcGoalProgress([g1, g2], 700_000)
    expect(before.goals.every(g => g.status === 'fulfilled')).toBe(true)

    const after = calcGoalProgress([g1, g2], 500_000)
    expect(after.goals[0]?.status).toBe('fulfilled')
    expect(after.goals[1]?.status).toBe('active')
  })

  it('drag reorder -> alokasi ikut sortOrder baru', () => {
    const g1 = goal('HP', 400_000, 0)
    const g2 = goal('Laptop', 300_000, 1)
    const r = calcGoalProgress([{ ...g1, sortOrder: 1 }, { ...g2, sortOrder: 0 }], 400_000)
    expect(r.goals[0]?.goal.name).toBe('Laptop')
    expect(r.goals[0]?.allocated).toBe(300_000)
    expect(r.goals[1]?.allocated).toBe(100_000)
  })

  it('goal used tidak memakai pool dan status used', () => {
    const used = goal('Lama', 400_000, 0, { usedAt: 123 })
    const active = goal('Baru', 300_000, 1)
    const r = calcGoalProgress([used, active], 300_000)
    expect(r.goals[0]?.status).toBe('used')
    expect(r.goals[0]?.allocated).toBe(400_000)
    expect(r.goals[1]?.allocated).toBe(300_000)
    expect(r.goals[1]?.status).toBe('fulfilled')
    expect(r.unallocated).toBe(0)
  })

  it('hapus goal -> dana kembali ke unallocated', () => {
    const g1 = goal('HP', 400_000, 0)
    const g2 = goal('Laptop', 300_000, 1)
    const r = calcGoalProgress([g2], 500_000)
    expect(r.unallocated).toBe(200_000)
    expect(r.goals[0]?.goal.id).toBe(g2.id)
    expect(g1.name).toBe('HP')
  })

  it('Allocation negatif -> pool 0, progress tidak negatif', () => {
    const r = calcGoalProgress([goal('HP', 500_000, 0)], -100_000)
    expect(r.goals[0]?.allocated).toBe(0)
    expect(r.goals[0]?.progressPct).toBe(0)
    expect(r.unallocated).toBe(0)
  })

  it('target 0 -> fulfilled tanpa NaN', () => {
    const r = calcGoalProgress([goal('Gratis', 0, 0)], 100_000)
    expect(r.goals[0]?.progressPct).toBe(100)
    expect(r.goals[0]?.status).toBe('fulfilled')
    expect(r.unallocated).toBe(100_000)
  })

  it('progress satu desimal', () => {
    const r = calcGoalProgress([goal('HP', 300_000, 0)], 100_000)
    expect(r.goals[0]?.progressPct).toBe(33.3)
  })

  it('buildGoalExpense membuat satu savings_expense allocation', () => {
    const g = goal('HP', 2_000_000, 0)
    const tx = buildGoalExpense(g, { id: 'tx-1', date: '2026-10-20', now: 999 })
    expect(tx).toMatchObject({
      id: 'tx-1',
      type: 'savings_expense',
      amount: 2_000_000,
      date: '2026-10-20',
      note: 'Gunakan goal: HP',
      savingsSource: 'allocation',
      deleted: false,
      refundedAmount: 0,
    })
  })

  it('markGoalUsed hanya set usedAt, tanpa status', () => {
    const g = goal('HP', 500_000, 0)
    const used = markGoalUsed(g, 777)
    expect(used.usedAt).toBe(777)
    expect('status' in used).toBe(false)
    expect('savedAmount' in used).toBe(false)
  })
})
