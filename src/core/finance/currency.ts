export const CURRENCY_FORMATS = [
  { value: 'Rp#.###', example: 'Rp20.000', label: 'Rapat' },
  { value: 'Rp #.###', example: 'Rp 20.000', label: 'Dengan spasi' },
  { value: '#.###', example: '20.000', label: 'Tanpa Rp' },
] as const

export type CurrencyFormat = typeof CURRENCY_FORMATS[number]['value']
export const DEFAULT_CURRENCY_FORMAT: CurrencyFormat = 'Rp#.###'

export function isCurrencyFormat(value: unknown): value is CurrencyFormat {
  return CURRENCY_FORMATS.some(preset => preset.value === value)
}

export function normalizeCurrencyFormat(value: string | undefined): CurrencyFormat {
  return isCurrencyFormat(value) ? value : DEFAULT_CURRENCY_FORMAT
}

export function formatRupiah(amount: number, format: string = DEFAULT_CURRENCY_FORMAT): string {
  const preset = normalizeCurrencyFormat(format)
  const sign = amount < 0 ? '-' : ''
  const digits = Math.abs(amount).toLocaleString('id-ID', { maximumFractionDigits: 0 })
  return preset === '#.###' ? `${sign}${digits}` : `${sign}${preset.replace('#.###', digits)}`
}
