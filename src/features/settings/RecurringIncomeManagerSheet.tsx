import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, TextField, Toggle } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import type { Category, RecurringIncome } from '@/core/finance/types'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'

type View =
  | { kind: 'list' }
  | { kind: 'edit'; recurring: RecurringIncome; expected: RecurringIncome }
  | { kind: 'add'; recurring: RecurringIncome }
  | { kind: 'delete'; recurring: RecurringIncome }

export function RecurringIncomeManagerSheet({ onClose }: { onClose: () => void }) {
  const recurringIncomes = useMoneeStore(state => state.recurringIncomes)
  const categories = useMoneeStore(state => state.categories)
  const saveRecurringIncome = useMoneeStore(state => state.saveRecurringIncome)
  const deleteRecurringIncome = useMoneeStore(state => state.deleteRecurringIncome)
  const rupiah = useRupiah()
  const [view, setView] = useState<View>({ kind: 'list' })
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const formView = view.kind === 'edit' || view.kind === 'add' ? view : null
  const title = view.kind === 'edit' || view.kind === 'add' ? 'Template pemasukan' : 'Pemasukan Rutin'
  const incomeCategories = categories.filter(category => category.type === 'income')

  function update(patch: Partial<RecurringIncome>) {
    setView(current => current.kind === 'edit' || current.kind === 'add'
      ? { ...current, recurring: { ...current.recurring, ...patch } } : current)
  }

  function add() {
    setView({ kind: 'add', recurring: {
      id: '', name: '', amount: 0, dayOfMonth: 25,
      categoryId: incomeCategories[0]?.id ?? '', isActive: true, createdAt: Date.now(),
    } })
    setError('')
    setStatus('')
  }

  function edit(recurring: RecurringIncome) {
    const copy = { ...recurring }
    setView({ kind: 'edit', recurring: copy, expected: copy })
    setError('')
    setStatus('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (view.kind !== 'add' && view.kind !== 'edit')) return
    const editing = view.kind === 'edit'
    setBusy(true)
    setError('')
    try {
      const recurring = {
        ...view.recurring,
        id: editing ? view.recurring.id : `recurring-${crypto.randomUUID()}`,
        amount: Number(view.recurring.amount),
        dayOfMonth: Number(view.recurring.dayOfMonth),
      }
      await saveRecurringIncome(recurring, editing ? view.expected : undefined)
      setView({ kind: 'list' })
      setStatus(editing ? 'Template pemasukan diperbarui.' : 'Template pemasukan ditambahkan.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Template belum tersimpan. Coba lagi, ya.')
    } finally { setBusy(false) }
  }

  async function remove() {
    if (view.kind !== 'delete' || busy) return
    setBusy(true)
    setError('')
    try {
      await deleteRecurringIncome(view.recurring.id)
      setView({ kind: 'list' })
      setStatus('Template dihapus. Transaksi yang sudah dicatat tetap ada.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Template belum bisa dihapus.')
      setView({ kind: 'list' })
    } finally { setBusy(false) }
  }

  function closeView() {
    if (busy) return
    if (view.kind === 'list') onClose()
    else { setView({ kind: 'list' }); setError('') }
  }

  const ordered = [...recurringIncomes].sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.name.localeCompare(b.name, 'id'))

  return <Dialog open sheet title={title} onClose={closeView}>
    {view.kind === 'list' && <div className="settings-form settings-recurring-manager">
      <p className="settings-helper">Template hanya menyiapkan tombol “Catat gaji” setelah tanggalnya tiba. Monee tidak mencatat pemasukan otomatis.</p>
      {status && <p className="settings-category-status" role="status">{status}</p>}
      {error && <InlineError>{error}</InlineError>}
      {ordered.length > 0 ? <ul className="settings-recurring-list">
        {ordered.map(recurring => {
          const category = categories.find(item => item.id === recurring.categoryId)
          return <li className="settings-recurring-row" key={recurring.id}>
            <div className="settings-recurring-copy">
              <strong>{recurring.name}</strong>
              <span>{rupiah(recurring.amount)} · tgl {recurring.dayOfMonth} · {category?.name ?? 'Kategori tidak tersedia'}</span>
              <small>{recurring.isActive ? 'Aktif' : 'Nonaktif'}</small>
            </div>
            <button type="button" className="settings-category-edit" aria-label={`Edit template ${recurring.name}`}
              onClick={() => edit(recurring)}><Pencil size={16} aria-hidden="true" /><span>Edit</span></button>
            <button type="button" className="settings-category-delete" aria-label={`Hapus template ${recurring.name}`}
              onClick={() => { setView({ kind: 'delete', recurring }); setError(''); setStatus('') }}>
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </li>
        })}
      </ul> : <p className="settings-recurring-empty">Belum ada template pemasukan rutin.</p>}
      <Button variant="secondary" onClick={add}><Plus size={17} aria-hidden="true" /> Tambah template</Button>
    </div>}

    {formView && <form className="settings-form settings-recurring-editor" onSubmit={event => { void save(event) }}>
      <TextField label="Nama pemasukan" maxLength={40} autoFocus disabled={busy}
        value={formView.recurring.name} onChange={event => { update({ name: event.target.value }); setError('') }} />
      <TextField label="Nominal (Rp)" type="number" inputMode="numeric" min={1} step={1} disabled={busy}
        value={formView.recurring.amount || ''} onChange={event => { update({ amount: Number(event.target.value) }); setError('') }} />
      <TextField label="Tanggal pemasukan (1–28)" type="number" inputMode="numeric" min={1} max={28} step={1} disabled={busy}
        value={formView.recurring.dayOfMonth} onChange={event => { update({ dayOfMonth: Number(event.target.value) }); setError('') }} />
      <label className="ui-field"><span>Kategori pemasukan</span>
        <select aria-label="Kategori pemasukan" value={formView.recurring.categoryId} disabled={busy || incomeCategories.length === 0}
          onChange={event => { update({ categoryId: event.target.value }); setError('') }}>
          {incomeCategories.map((category: Category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <Toggle label="Aktifkan template" checked={formView.recurring.isActive} disabled={busy}
        onChange={isActive => update({ isActive })} />
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy}>{view.kind === 'add' ? 'Tambah template' : 'Simpan template'}</Button>
        <Button variant="ghost" disabled={busy} onClick={closeView}>Batal</Button>
      </div>
    </form>}

    {view.kind === 'delete' && <div className="settings-form settings-recurring-delete">
      <h3>Hapus template {view.recurring.name}?</h3>
      <p className="settings-helper">Transaksi pemasukan yang sudah dicatat tidak ikut dihapus.</p>
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button variant="danger" loading={busy} onClick={() => { void remove() }}>Hapus template</Button>
        <Button variant="ghost" disabled={busy} onClick={closeView}>Batal</Button>
      </div>
    </div>}
  </Dialog>
}
