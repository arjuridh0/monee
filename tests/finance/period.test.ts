import { describe, it, expect } from 'vitest'
import { getPeriodBounds, isInPeriod, getPeriodKey, getToday } from '@/core/finance/period'

describe('period', () => {
  describe('getPeriodBounds — startDay = 1 (default)', () => {
    it('tanggal di tengah bulan ? periode bulan itu', () => {
      const b = getPeriodBounds('2024-07-15', 1)
      expect(b).toEqual({ start: '2024-07-01', end: '2024-07-31', key: '2024-07' })
    })
    it('tanggal 1 Juli ? periode Juli', () => {
      const b = getPeriodBounds('2024-07-01', 1)
      expect(b.key).toBe('2024-07')
    })
  })

  describe('getPeriodBounds — startDay = 25', () => {
    it('tanggal 26 Juli ? periode 25 Jul - 24 Aug', () => {
      const b = getPeriodBounds('2024-07-26', 25)
      expect(b.start).toBe('2024-07-25')
      expect(b.end).toBe('2024-08-24')
      expect(b.key).toBe('2024-07-25')
    })
    it('tanggal 24 Agustus (masih periode Juli)', () => {
      const b = getPeriodBounds('2024-08-24', 25)
      expect(b.start).toBe('2024-07-25')
    })
    it('tanggal 25 Agustus ? periode baru (25 Aug)', () => {
      const b = getPeriodBounds('2024-08-25', 25)
      expect(b.start).toBe('2024-08-25')
    })
  })

  describe('isInPeriod', () => {
    it('tanggal dalam range ? true', () => {
      expect(isInPeriod('2024-07-15', { start: '2024-07-01', end: '2024-07-31', key: '2024-07' })).toBe(true)
    })
    it('tanggal di luar range ? false', () => {
      expect(isInPeriod('2024-08-01', { start: '2024-07-01', end: '2024-07-31', key: '2024-07' })).toBe(false)
    })
    it('tanggal sama dengan start ? true', () => {
      expect(isInPeriod('2024-07-01', { start: '2024-07-01', end: '2024-07-31', key: '2024-07' })).toBe(true)
    })
    it('tanggal sama dengan end ? true', () => {
      expect(isInPeriod('2024-07-31', { start: '2024-07-01', end: '2024-07-31', key: '2024-07' })).toBe(true)
    })
  })

  describe('getPeriodKey', () => {
    it('startDay 1 ? YYYY-MM', () => {
      expect(getPeriodKey('2024-07-15', 1)).toBe('2024-07')
    })
    it('startDay 25 ? YYYY-MM-25', () => {
      expect(getPeriodKey('2024-07-26', 25)).toBe('2024-07-25')
    })
  })
})

it('keeps early calendar years padded and computes Gregorian month lengths', () => {
  expect(getPeriodBounds('0001-02-02', 1)).toEqual({ start: '0001-02-01', end: '0001-02-28', key: '0001-02' })
  expect(getPeriodBounds('0004-02-02', 1).end).toBe('0004-02-29')
  expect(getPeriodBounds('0099-02-25', 25).key).toBe('0099-02-25')
})
