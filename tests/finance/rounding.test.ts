import { describe, it, expect } from 'vitest'
import { floorToHundreds, roundAllocation } from '@/core/finance/rounding'

describe('rounding', () => {
  describe('floorToHundreds', () => {
    it('angka bulat ratusan tetap', () => expect(floorToHundreds(5000)).toBe(5000))
    it('floor ke ratusan bawah', () => expect(floorToHundreds(5099)).toBe(5000))
    it('floor 4950 ? 4900', () => expect(floorToHundreds(4950)).toBe(4900))
    it('angka < 100 ? 0', () => expect(floorToHundreds(99)).toBe(0))
    it('tepat 100 ? 100', () => expect(floorToHundreds(100)).toBe(100))
  })

  describe('roundAllocation', () => {
    it('30% dari 1000000 = 300000', () => expect(roundAllocation(1_000_000, 30)).toBe(300_000))
    it('33% dari 1000000 floor ke ratus ? 330000', () => expect(roundAllocation(1_000_000, 33)).toBe(330_000))
    it('0% ? 0', () => expect(roundAllocation(1_000_000, 0)).toBe(0))
    it('100% ? full amount', () => expect(roundAllocation(500_000, 100)).toBe(500_000))
  })
})
