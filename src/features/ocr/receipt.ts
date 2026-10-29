import { isValidDateStr } from '@/core/finance/period'

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
export const MAX_RECEIPT_ITEMS = 50
export const RECEIPT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

export interface ReceiptResult {
  merchant?: string
  date?: string
  items: { label: string; amount: number }[]
  total?: number
}

/** The adapter returns IDR integers; this boundary validates even injected providers. */
export type ReceiptRecognizer = (image: File, signal: AbortSignal) => Promise<ReceiptResult>

export function validateReceiptImage(file: Pick<File, 'type' | 'size'>): void {
  if (!RECEIPT_IMAGE_ACCEPT.split(',').includes(file.type)) throw new Error('Pilih foto JPEG, PNG, atau WebP.')
  if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) throw new Error('Ukuran foto harus lebih dari 0 dan maksimal 10 MB.')
}

function invalid(): never { throw new Error('Hasil pembacaan belum valid. Coba lagi atau isi item secara manual.') }
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) return invalid()
  return value.trim()
}
function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return invalid()
  return value
}

export function normalizeReceipt(value: unknown): ReceiptResult {
  if (!value || typeof value !== 'object') return invalid()
  const data = value as Record<string, unknown>
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > MAX_RECEIPT_ITEMS) return invalid()
  const items = data.items.map(item => {
    if (!item || typeof item !== 'object') return invalid()
    const row = item as Record<string, unknown>
    return { label: text(row.label, 120), amount: amount(row.amount) }
  })
  if (!Number.isSafeInteger(items.reduce((sum, item) => sum + item.amount, 0))) return invalid()
  const receipt: ReceiptResult = { items }
  if (data.merchant !== undefined) receipt.merchant = text(data.merchant, 120)
  if (data.date !== undefined) {
    if (typeof data.date !== 'string' || !isValidDateStr(data.date)) return invalid()
    receipt.date = data.date
  }
  if (data.total !== undefined) receipt.total = amount(data.total)
  return receipt
}
