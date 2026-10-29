import { describe, expect, it } from 'vitest'
import { formatPercent } from '@/core/finance/percent'

describe('formatPercent', () => {
  it('keeps whole numbers without a decimal', () => expect(formatPercent(75)).toBe('75'))
  it('shows at most one decimal', () => expect(formatPercent(74.99)).toBe('75'))
  it('rounds half up', () => expect(formatPercent(12.25)).toBe('12,3'))
  it('uses Indonesian decimal comma', () => expect(formatPercent(33.34)).toBe('33,3'))
  it('keeps values above 100 for overspend text', () => expect(formatPercent(128.44)).toBe('128,4'))
  it('falls back for non-finite values', () => expect(formatPercent(Number.NaN)).toBe('0'))
})
