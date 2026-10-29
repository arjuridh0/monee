import type { Bucket, Category, SavingsSource, TxType } from '@/core/finance/types'
import { isValidDateStr } from '@/core/finance/period'
import { findAmounts } from './numbers'

export type ReviewField = 'category' | 'bucket' | 'date' | 'source'
export interface VoiceDraft {
  type: TxType
  amount: number
  date: string
  categoryId: string
  bucketId: string
  savingsSource?: SavingsSource
  note: string
  review: ReviewField[]
  confidence: number
}
export interface ParseContext {
  today: string
  categories: Category[]
  buckets: Bucket[]
  defaultBucketId: string
}
export interface VoiceParseResult { drafts: VoiceDraft[]; issues: string[] }

const categories: [string, RegExp][] = [
  ['cat-gaji', /\b(gaji|gajian|salary)\b/], ['cat-bonus', /\b(bonus|thr|rejeki|rezeki)\b/],
  ['cat-freelance', /\b(freelance|project|proyek|kerjaan)\b/], ['cat-hadiah', /\b(hadiah|dikasih|dapat)\b/],
  ['cat-minum', /\b(ngopi|kopi|minum|teh|boba)\b/], ['cat-makan', /\b(makan|nasi|ayam|bakso|mie|mi|warung|dine)\b/],
  ['cat-transport', /\b(parkir|bensin|angkot|gojek|ojek|kereta|transport|bengkel)\b/],
  ['cat-pulsa', /\b(pulsa|kuota|data)\b/], ['cat-edukasi', /\b(edukasi|kursus|buku|sekolah)\b/],
  ['cat-hiburan', /\b(nonton|game|hiburan|bioskop)\b/], ['cat-sedekah', /\b(sedekah|donasi|infak)\b/],
  ['cat-belanja', /\b(baju|checkout|shopping|belanja|sepatu)\b/],
]
const months = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember']
const datePattern = new RegExp(`\\b(?:tanggal\\s+)?(\\d{1,2})\\s+(${months.join('|')})(?:\\s+(\\d{4}))?\\b|\\b(kemarin|besok|hari ini|tadi)\\b`, 'g')

function dateFrom(text: string, today: string) {
  let date = today, invalid = false
  const clean = text.replace(datePattern, (_all, day: string | undefined, month: string | undefined, year: string | undefined, relative: string | undefined) => {
    if (day && month) {
      date = `${year ?? today.slice(0, 4)}-${String(months.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`
      invalid ||= !isValidDateStr(date)
    } else if (relative) {
      const offset = relative === 'kemarin' ? -1 : relative === 'besok' ? 1 : 0
      date = new Date(Date.parse(today + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10)
    }
    return ' '
  })
  return { date, invalid: invalid || date > today, clean }
}

/** Pure, offline draft inference; IDs/dates/clocks and persistence are supplied externally. */
export function parseVoice(text: string, context: ParseContext): VoiceParseResult {
  const result: VoiceParseResult = { drafts: [], issues: [] }
  if (text.length > 4000 || !isValidDateStr(context.today)) return { drafts: [], issues: ['Teks terlalu panjang atau tanggal tidak valid.'] }
  const normalized = text.toLowerCase().trim().replace(/[!?;]/g, ' ')
  const globalDate = dateFrom(normalized, context.today)
  const parts = normalized.split(/\s+(?:sama|dan|trus|terus|lalu)\s+|,(?!\d)/).filter(part => part.trim())
  const clauses: string[] = []
  for (const part of parts) {
    if (clauses.length && !findAmounts(dateFrom(part, context.today).clean).length && !categories.some(([, pattern]) => pattern.test(part))) {
      clauses[clauses.length - 1] += ` dan ${part}`
    } else clauses.push(part)
  }
  for (const clause of clauses) {
    const localDate = dateFrom(clause, context.today)
    const amounts = findAmounts(localDate.clean)
    if (/\bminus\b/.test(localDate.clean) || amounts.length !== 1 || !Number.isSafeInteger(amounts[0]) || amounts[0]! <= 0) {
      result.issues.push(`Nominal belum jelas: “${clause.trim()}”. Isi satu nominal rupiah yang positif.`)
      continue
    }
    const withdrawal = /\b(darurat|investasi|reksadana|reksa|saham|emas)\b/.test(clause)
      && /\b(tabungan|dana|darurat)\b/.test(clause)
      || /\b(pakai|ambil|tarik|gunakan|keluar)\b.*\b(tabungan|allocation|alokasi|sisa)\b/.test(clause)
    const deposit = !withdrawal && /\b(setor|nabung|tabungan|menabung)\b/.test(clause)
    const guessed = categories.find(([, pattern]) => pattern.test(clause))?.[0] ?? ''
    const type: TxType = withdrawal ? 'savings_expense' : deposit ? 'savings_deposit'
      : ['cat-gaji', 'cat-bonus', 'cat-freelance', 'cat-hadiah'].includes(guessed) ? 'income' : 'expense'
    const categoryId = type === 'savings_expense' ? '' : type === 'savings_deposit' ? 'cat-tabungan' : guessed
    const validCategory = context.categories.find(item => item.id === categoryId && item.type === (type === 'income' ? 'income' : 'expense'))
    const savingsBucket = context.buckets.find(item => item.isSavings)
    // Only an explicit bucket name is confident; otherwise keep the user's default visible for review.
    const explicitBucket = context.buckets.find(item => !item.isSavings && item.name.length > 2 && clause.includes(item.name.toLowerCase()))
    const defaultBucket = context.buckets.find(item => item.id === context.defaultBucketId && !item.isSavings)
    const bucketId = type === 'savings_deposit' ? savingsBucket?.id ?? '' : type === 'expense' ? (explicitBucket ?? defaultBucket)?.id ?? '' : ''
    const review: ReviewField[] = []
    if (type !== 'savings_expense' && !validCategory) review.push('category')
    if (type === 'expense' && !explicitBucket || type === 'savings_deposit' && !bucketId) review.push('bucket')
    const hasDate = localDate.clean !== clause
    const date = hasDate ? localDate : globalDate
    if (date.invalid) review.push('date')
    let savingsSource: SavingsSource | undefined
    if (type === 'savings_expense') {
      savingsSource = /\b(allocation|alokasi)\b/.test(clause) ? 'allocation' : 'sisa'
      if (!/\b(sisa|darurat|investasi|reksadana|reksa|saham|emas|allocation|alokasi)\b/.test(clause)) review.push('source')
    }
    result.drafts.push({ type, amount: amounts[0]!, date: isValidDateStr(date.date) ? date.date : context.today,
      categoryId: validCategory?.id ?? '', bucketId, ...(savingsSource ? { savingsSource } : {}), note: clause.trim().slice(0, 200), review,
      confidence: review.length ? 0.55 : 0.9 })
  }
  if (!clauses.length) result.issues.push('Tulis atau ucapkan transaksi beserta nominalnya.')
  return result
}
