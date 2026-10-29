import { describe, expect, it } from 'vitest'
import {
  CURRENCY_FORMATS,
  DEFAULT_CURRENCY_FORMAT,
  formatRupiah,
  isCurrencyFormat,
  normalizeCurrencyFormat,
} from '@/core/finance/currency'

describe('formatRupiah', () => {
  it.each([
    [20_000, 'Rp#.###', 'Rp20.000'],
    [20_000, 'Rp #.###', 'Rp 20.000'],
    [20_000, '#.###', '20.000'],
    [0, 'Rp#.###', 'Rp0'],
    [1_234_567, 'Rp #.###', 'Rp 1.234.567'],
    [1_234_567, '#.###', '1.234.567'],
    [-20_000, 'Rp#.###', '-Rp20.000'],
    [-20_000, '#.###', '-20.000'],
  ] as const)('formats %d with %s as %s', (amount, format, expected) => {
    expect(formatRupiah(amount, format)).toBe(expected)
  })

  it('falls back to the default preset for unknown or missing settings', () => {
    expect(formatRupiah(20_000)).toBe('Rp20.000')
    expect(formatRupiah(20_000, 'usd')).toBe('Rp20.000')
    expect(normalizeCurrencyFormat(undefined)).toBe(DEFAULT_CURRENCY_FORMAT)
    expect(normalizeCurrencyFormat('Rp #.###')).toBe('Rp #.###')
    expect(normalizeCurrencyFormat('legacy')).toBe(DEFAULT_CURRENCY_FORMAT)
  })

  it('accepts exactly the three approved presets', () => {
    expect(CURRENCY_FORMATS.map(preset => preset.value)).toEqual(['Rp#.###', 'Rp #.###', '#.###'])
    expect(CURRENCY_FORMATS.map(preset => preset.example)).toEqual(['Rp20.000', 'Rp 20.000', '20.000'])
    expect(isCurrencyFormat('#.###')).toBe(true)
    expect(isCurrencyFormat('IDR')).toBe(false)
  })
})
