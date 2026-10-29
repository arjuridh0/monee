/**
 * Schema v2 -- dok 08 §2
 * Catatan: `periodKey` transaksi bersifat derived dan `deleted` bertipe boolean,
 * keduanya tidak valid sebagai IndexedDB index. Query periode memakai `by-date`.
 */
import { describe, it, expect } from 'vitest'
import { DB_VERSION, STORES, STORE_DEFS } from '@/core/db/schema'

const defByName = (name: string) => {
  const def = STORE_DEFS.find(d => d.name === name)
  if (!def) throw new Error(`store ${name} tidak ada`)
  return def
}

const indexNames = (name: string) => defByName(name).indexes.map(i => i.name)

describe('schema v2', () => {
  it('memakai versi 2', () => {
    expect(DB_VERSION).toBe(2)
  })

  it('mendaftarkan store lockout', () => {
    expect(STORES.lockout).toBe('lockout')
    expect(defByName(STORES.lockout).keyPath).toBe('key')
  })

  it('transaksi punya index savingsSource tanpa index derived/invalid', () => {
    const names = indexNames(STORES.transactions)
    expect(names).toContain('by-date')
    expect(names).toContain('by-savings-source')
    expect(names).not.toContain('by-period')
    expect(names).not.toContain('by-deleted')
  })

  it('goals tidak lagi punya index by-status', () => {
    expect(indexNames(STORES.goals)).toEqual(['by-order'])
  })

  it('monthSweeps periodKey unik', () => {
    const idx = defByName(STORES.monthSweeps).indexes.find(i => i.name === 'by-period')
    expect(idx?.unique).toBe(true)
  })
})
