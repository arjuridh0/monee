import { describe, expect, it } from 'vitest'
import { parseVoice } from '@/features/voice/parser'
import { DEFAULT_BUCKETS, DEFAULT_CATEGORIES } from '@/core/db/repositories'

const context = { today: '2026-03-01', categories: DEFAULT_CATEGORIES, buckets: DEFAULT_BUCKETS, defaultBucketId: 'bucket-needs' }
const first = (text: string) => parseVoice(text, context).drafts[0]!

describe('local Indonesian voice parser', () => {
  it.each([
    ['makan nasi dua puluh lima ribu', 25000, 'expense', 'cat-makan'],
    ['ngopi 22rb', 22000, 'expense', 'cat-minum'],
    ['parkir 3k', 3000, 'expense', 'cat-transport'],
    ['gajian 5 juta', 5000000, 'income', 'cat-gaji'],
    ['bonus 1,5jt', 1500000, 'income', 'cat-bonus'],
    ['setor tabungan setengah juta', 500000, 'savings_deposit', 'cat-tabungan'],
    ['nabung seratus lima puluh ribu', 150000, 'savings_deposit', 'cat-tabungan'],
    ['pulsa Rp25.000', 25000, 'expense', 'cat-pulsa'],
    ['sedekah dua ratus ribu', 200000, 'expense', 'cat-sedekah'],
    ['freelance 2jt', 2000000, 'income', 'cat-freelance'],
    ['beli buku 100rb', 100000, 'expense', 'cat-edukasi'],
    ['dikasih 50 ribu', 50000, 'income', 'cat-hadiah'],
    ['gajian sejuta lima ratus ribu', 1500000, 'income', 'cat-gaji'],
    ['parkir seribu lima ratus', 1500, 'expense', 'cat-transport'],
  ])('parses %s', (text, amount, type, categoryId) => {
    expect(first(text)).toMatchObject({ amount, type, categoryId })
  })
  it('splits multiple transactions and carries the utterance date', () => {
    expect(parseVoice('kemarin ngopi 22rb sama parkir 3rb', context).drafts).toMatchObject([
      { amount: 22000, date: '2026-02-28', categoryId: 'cat-minum' },
      { amount: 3000, date: '2026-02-28', categoryId: 'cat-transport' },
    ])
  })
  it('does not split decimal commas or amount-free note conjunctions', () => {
    expect(parseVoice('makan 1,5 juta dan minum 10rb', context).drafts).toHaveLength(2)
    expect(parseVoice('pakai dana darurat 200rb buat bengkel dan ban', context).drafts).toHaveLength(1)
  })
  it('prioritizes savings withdrawals over the word tabungan', () => {
    expect(first('beli reksadana 1 juta dari tabungan')).toMatchObject({ type: 'savings_expense', savingsSource: 'sisa', amount: 1000000 })
    expect(first('pakai tabungan allocation 200rb buat bengkel')).toMatchObject({ type: 'savings_expense', savingsSource: 'allocation' })
    expect(first('pakai dana darurat 200rb buat bengkel').note).toContain('bengkel')
  })
  it('does not silently infer a category from generic beli', () => {
    expect(first('beli 20rb')).toMatchObject({ categoryId: '', review: expect.arrayContaining(['category']) })
  })
  it('reports missing or ambiguous amounts without inventing a transaction', () => {
    for (const text of ['makan enak', 'makan 20rb 30rb', 'makan -25rb', 'makan minus dua puluh ribu', 'makan 0', 'makan 2.5', 'makan 9999999999999999999']) {
      expect(parseVoice(text, context).drafts).toHaveLength(0)
      expect(parseVoice(text, context).issues.length).toBeGreaterThan(0)
    }
  })
  it('treats explicit dates as dates, with future/invalid dates marked for review', () => {
    expect(first('makan 25rb tanggal 5 februari')).toMatchObject({ date: '2026-02-05', amount: 25000 })
    expect(first('makan 25rb besok').review).toContain('date')
    expect(first('makan 25rb tanggal 31 februari').review).toContain('date')
  })
  it('never assigns deleted categories or missing buckets', () => {
    const result = parseVoice('makan 25rb', { ...context, categories: [], buckets: [] }).drafts[0]!
    expect(result.categoryId).toBe('')
    expect(result.bucketId).toBe('')
    expect(result.review).toEqual(expect.arrayContaining(['category', 'bucket']))
  })
  it('keeps an unresolved clause visible alongside valid drafts', () => {
    const result = parseVoice('ngopi 20rb sama parkir', context)
    expect(result.drafts).toHaveLength(1)
    expect(result.issues).toHaveLength(1)
  })
})
