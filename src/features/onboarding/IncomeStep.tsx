import { useState } from 'react'
import { Button, TextField } from '@/components/ui/controls'
import type { Category } from '@/core/finance/types'
import { getToday } from '@/core/finance/period'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'

export interface FirstIncome { amount: number; categoryId: string; date: string; note?: string }

export function IncomeStep({ income, categories, onNext, busy, standalone = false }: {
  income: FirstIncome | null; categories: Category[]; onNext: (income: FirstIncome | null) => void; busy: boolean; standalone?: boolean
}) {
  const incomeCategories = categories.filter(category => category.type === 'income')
  const [amount, setAmount] = useState(income ? String(income.amount) : '')
  const [categoryId, setCategoryId] = useState(income?.categoryId ?? incomeCategories[0]?.id ?? '')
  const [date, setDate] = useState(income?.date ?? getToday())
  const [note, setNote] = useState(income?.note ?? '')
  const valid = /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount)) && Number(amount) > 0
    && Boolean(date) && date <= getToday() && incomeCategories.some(category => category.id === categoryId)
  return <form className="onboarding-step" onSubmit={event => {
    event.preventDefault()
    if (valid) onNext({ amount: Number(amount), categoryId, date, note: note.trim() })
  }}>
    {!standalone && <header className="onboarding-heading onboarding-heading--companion">
      <div><span className="onboarding-eyebrow">Boleh nanti juga</span><h1>Ada pemasukan bulan ini?</h1>
        <p>Catat satu dulu, supaya jatahmu langsung terbagi.</p></div>
      <MascotCanvas state="idle" size={96} />
    </header>}
    <TextField className="onboarding-amount" label="Nominal pemasukan (Rp)" inputMode="numeric"
      placeholder="0" value={amount} maxLength={15} autoFocus
      onChange={event => setAmount(event.target.value)}
      {...(amount && !/^\d+$/.test(amount) ? { error: 'Isi rupiah utuh, tanpa titik atau koma.' } : {})} />
    <label className="onboarding-field" htmlFor="first-income-category">Kategori pemasukan
      <select id="first-income-category" value={categoryId} onChange={event => setCategoryId(event.target.value)}>
        {incomeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </label>
    <TextField label="Tanggal pemasukan" type="date" value={date} max={getToday()} required
      onChange={event => setDate(event.target.value)} />
    <TextField label="Catatan (opsional)" value={note} maxLength={200}
      placeholder="Misalnya, gaji bulan ini" onChange={event => setNote(event.target.value)} />
    {!standalone && <p className="ui-helper">Pemasukan dicatat setelah pengaturan selesai. Lewati kalau kamu ingin mencatatnya nanti.</p>}
    <Button type="submit" disabled={!valid || busy} loading={busy}>{standalone ? 'Simpan pemasukan' : 'Catat & lanjut'}</Button>
    <Button variant="ghost" disabled={busy} onClick={() => onNext(null)}>{standalone ? 'Batal' : 'Lewati dulu'}</Button>
  </form>
}
