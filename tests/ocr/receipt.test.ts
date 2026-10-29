import { describe, expect, it } from 'vitest'
import { normalizeReceipt, validateReceiptImage, MAX_RECEIPT_BYTES } from '@/features/ocr/receipt'

describe('receipt boundary', () => {
  it('keeps only normalized merchant, date and integer rupiah items', () => {
    expect(normalizeReceipt({ merchant: '  Warung  ', date: '2026-01-12', items: [{ label: ' Kopi ', amount: 12000 }], total: 12000, raw: 'private' }))
      .toEqual({ merchant: 'Warung', date: '2026-01-12', items: [{ label: 'Kopi', amount: 12000 }], total: 12000 })
  })
  it.each([
    null, undefined, 'receipt', { items: [] }, { items: [{ label: 'Kopi', amount: 1.5 }] },
    { items: [{ label: '', amount: 12000 }] }, { items: [{ label: 'Kopi', amount: '12.000' }] },
    { date: '2026-02-30', items: [{ label: 'Kopi', amount: 12000 }] },
    { items: [{ label: 'Kopi', amount: Number.MAX_SAFE_INTEGER }], total: Number.MAX_SAFE_INTEGER + 1 },
    { items: [{ label: 'A', amount: Number.MAX_SAFE_INTEGER }, { label: 'B', amount: 1 }] },
    { items: [{ label: 'Kopi', amount: Infinity }] },
  ])('rejects invalid provider output without guessing values', value => {
    expect(() => normalizeReceipt(value)).toThrow(/Hasil pembacaan/)
  })
  it('accepts JPEG, PNG and WebP metadata and rejects unsafe uploads', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(() => validateReceiptImage({ type, size: 100 })).not.toThrow()
    for (const file of [{ type: 'image/svg+xml', size: 100 }, { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: MAX_RECEIPT_BYTES + 1 }]) {
      expect(() => validateReceiptImage(file)).toThrow()
    }
  })
})
