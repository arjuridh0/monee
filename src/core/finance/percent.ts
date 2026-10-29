/** Display a computed progress percentage at one decimal; classification keeps full precision. */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return (Math.round(value * 10) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 })
}
