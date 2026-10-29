import { useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Button, TextField } from '@/components/ui/controls'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/core/finance/category-options'
import type { Category } from '@/core/finance/types'
import { useMoneeStore } from '@/store'

type View =
  | { kind: 'list' }
  | { kind: 'edit'; category: Category; expected: Category }
  | { kind: 'add'; category: Category }
  | { kind: 'delete'; category: Category }

const iconLabel = (icon: string) => icon.split('-').join(' ')

export function CategoryManagerSheet({ onClose }: { onClose: () => void }) {
  const categories = useMoneeStore(state => state.categories)
  const saveCategory = useMoneeStore(state => state.saveCategory)
  const deleteCategory = useMoneeStore(state => state.deleteCategory)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const isEditing = view.kind === 'edit'
  const isAdding = view.kind === 'add'
  const formView = view.kind === 'edit' || view.kind === 'add' ? view : null
  const selected = view.kind === 'edit' || view.kind === 'add' ? view.category : null
  const title = isEditing ? 'Ubah kategori' : isAdding ? 'Tambah kategori' : 'Kelola Kategori'

  function openEditor(category: Category) {
    const copy = { ...category }
    setView({ kind: 'edit', category: copy, expected: copy })
    setError('')
    setStatus('')
  }

  function openCreator(type: Category['type']) {
    setView({ kind: 'add', category: {
      id: '', name: '', type, icon: 'shapes', color: CATEGORY_COLORS[8], isDefault: false,
    } })
    setError('')
    setStatus('')
  }

  function updateSelected(patch: Partial<Pick<Category, 'name' | 'icon' | 'color'>>) {
    setView(current => current.kind === 'edit' || current.kind === 'add'
      ? { ...current, category: { ...current.category, ...patch } } : current)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !formView || busy) return
    setBusy(true)
    setError('')
    try {
      const category = { ...selected, id: isAdding ? `cat-${crypto.randomUUID()}` : selected.id }
      await saveCategory(category, view.kind === 'edit' ? view.expected : undefined)
      setView({ kind: 'list' })
      setStatus(isAdding ? 'Kategori ditambahkan.' : 'Kategori diperbarui.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kategori belum tersimpan. Coba lagi, ya.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (view.kind !== 'delete' || busy) return
    setBusy(true)
    setError('')
    try {
      await deleteCategory(view.category.id)
      setView({ kind: 'list' })
      setStatus('Kategori dihapus.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kategori belum bisa dihapus.')
      setView({ kind: 'list' })
    } finally {
      setBusy(false)
    }
  }

  function closeView() {
    if (busy) return
    if (view.kind === 'list') onClose()
    else { setView({ kind: 'list' }); setError('') }
  }

  const ordered = (type: Category['type']) => categories
    .filter(category => category.type === type)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'id'))

  return <Dialog open sheet title={title} onClose={closeView}>
    {view.kind === 'list' && <div className="settings-form settings-category-manager">
      <p className="settings-helper">Ikon dan warna membantu kamu mengenali kategori di transaksi.</p>
      {status && <p className="settings-category-status" role="status">{status}</p>}
      {error && <InlineError>{error}</InlineError>}
      {(['expense', 'income'] as const).map(type => <section className="settings-category-group" key={type}>
        <div className="settings-category-group-header">
          <h3>{type === 'expense' ? 'Pengeluaran' : 'Pemasukan'}</h3>
          <Button variant="secondary" onClick={() => openCreator(type)}>
            Tambah kategori {type === 'expense' ? 'pengeluaran' : 'pemasukan'}
          </Button>
        </div>
        <ul className="settings-category-list">
          {ordered(type).map(category => <li className="settings-category-row" key={category.id}>
            <span className="settings-category-icon" style={{ background: category.color }}>
              <CategoryIcon name={category.icon} />
            </span>
            <span className="settings-category-copy">
              <strong>{category.name}</strong>
              {category.id === 'cat-tabungan' && <small>Dipakai otomatis untuk setoran tabungan</small>}
              {!category.isDefault && <small>Kategori khusus</small>}
            </span>
            <button type="button" className="settings-category-edit" aria-label={`Edit kategori ${category.name}`}
              onClick={() => openEditor(category)}>Edit</button>
            {!category.isDefault && <button type="button" className="settings-category-delete"
              aria-label={`Hapus kategori ${category.name}`} onClick={() => {
                setView({ kind: 'delete', category }); setError(''); setStatus('')
              }}><Trash2 size={18} aria-hidden="true" /></button>}
          </li>)}
        </ul>
      </section>)}
      <p className="settings-helper">Kategori bawaan tidak dapat dihapus. Kategori yang dipakai transaksi atau pemasukan rutin juga dipertahankan.</p>
    </div>}

    {formView && selected && <form className="settings-form settings-category-editor" onSubmit={event => { void save(event) }}>
      <button type="button" className="settings-category-back" disabled={busy}
        onClick={() => { setView({ kind: 'list' }); setError('') }}><ArrowLeft size={17} /> Kembali ke kategori</button>
      {selected.id === 'cat-tabungan' && <p className="settings-helper">Nama Tabungan dipakai otomatis saat mencatat setoran. Ikon dan warna tetap bisa diubah.</p>}
      <TextField label="Nama kategori" value={selected.name} maxLength={32} autoFocus disabled={busy}
        onChange={event => {
          updateSelected({ name: event.target.value })
          setError('')
        }} />
      <fieldset className="settings-category-fieldset">
        <legend>Ikon</legend>
        <div className="settings-category-options settings-category-icons" role="radiogroup" aria-label="Pilih ikon kategori">
          {CATEGORY_ICONS.map(icon => <button key={icon} type="button" role="radio" aria-checked={selected.icon === icon}
            aria-label={iconLabel(icon)} className={`settings-category-option${selected.icon === icon ? ' is-selected' : ''}`}
            disabled={busy} onClick={() => updateSelected({ icon })}>
            <CategoryIcon name={icon} />
          </button>)}
        </div>
      </fieldset>
      <fieldset className="settings-category-fieldset">
        <legend>Warna</legend>
        <div className="settings-category-options settings-category-colors" role="radiogroup" aria-label="Pilih warna kategori">
          {CATEGORY_COLORS.map(color => <button key={color} type="button" role="radio" aria-checked={selected.color === color}
            aria-label={color} className={`settings-category-color${selected.color === color ? ' is-selected' : ''}`}
            style={{ '--category-color': color } as CSSProperties} disabled={busy}
            onClick={() => updateSelected({ color })} />)}
        </div>
      </fieldset>
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy}>{isAdding ? 'Tambah kategori' : 'Simpan kategori'}</Button>
        <Button variant="ghost" disabled={busy} onClick={closeView}>Batal</Button>
      </div>
    </form>}

    {view.kind === 'delete' && <div className="settings-form settings-category-delete-confirm">
      <h3>Hapus kategori {view.category.name}?</h3>
      <p className="settings-helper">Kategori yang sudah dipakai transaksi atau pemasukan rutin tidak bisa dihapus.</p>
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button variant="danger" loading={busy} onClick={() => { void remove() }}>Hapus kategori</Button>
        <Button variant="ghost" disabled={busy} onClick={closeView}>Batal</Button>
      </div>
    </div>}
  </Dialog>
}
