import { useRef, useState } from 'react'
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, ProgressBar } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { FuseButton } from '@/components/reactbits/FuseButton'
import type { Goal, GoalProgress } from '@/core/finance/types'
import { formatPercent } from '@/core/finance/percent'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import { GoalDialog } from './GoalDialog'
import { UseGoalDialog } from './UseGoalDialog'
import { savingsErrorMessage } from './errors'

const EMPTY_GOALS: GoalProgress[] = []

function GoalItem({ item, busy, locked, onMove, onFinish, onEdit, onDelete, onUse }: {
  item: GoalProgress; busy: boolean; locked: boolean; onMove: (delta: number) => void; onFinish: () => void
  onEdit: () => void; onDelete: () => void; onUse: () => void
}) {
  const rupiah = useRupiah()
  const drag = useDragControls()
  const reduce = useReducedMotion()
  return <Reorder.Item value={item.goal.id} dragListener={false} dragControls={drag} onDragEnd={onFinish}
    onDragStart={() => { navigator.vibrate?.(10) }} {...(reduce ? { transition: { duration: 0 } } : {})}>
    <Card className="savings-goal">
      <header><button type="button" className="savings-grip" aria-label={`Ubah prioritas ${item.goal.name}`} disabled={busy}
        onPointerDown={event => { if (!busy) drag.start(event) }} onKeyDown={event => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onMove(event.key === 'ArrowUp' ? -1 : 1) }
        }}><GripVertical size={20} aria-hidden="true" /></button>
        <h3><CategoryIcon name={item.goal.icon || 'target'} /> {item.goal.name}</h3>
        {item.status === 'fulfilled' && <span className="savings-goal-badge">Tercapai</span>}
      </header>
      <ProgressBar label={`Progress ${item.goal.name}`} value={item.progressPct} />
      <p className="savings-goal-progress font-tabular">{rupiah(item.allocated)} <span>dari {rupiah(item.goal.targetAmount)} · {formatPercent(item.progressPct)}%</span></p>
      <div className="savings-goal-tools"><Button variant="ghost" aria-label={`Edit tujuan ${item.goal.name}`} disabled={busy} onClick={onEdit}><Pencil size={16} aria-hidden="true" /> Edit</Button>
        <Button variant="ghost" aria-label={`Hapus tujuan ${item.goal.name}`} disabled={busy} onClick={onDelete}><Trash2 size={16} aria-hidden="true" /> Hapus</Button></div>
      {item.status === 'fulfilled' && <Button aria-label={`Gunakan tujuan ${item.goal.name}`} disabled={busy || locked} onClick={onUse}>Gunakan</Button>}
    </Card>
  </Reorder.Item>
}

export function GoalsPanel() {
  const rupiah = useRupiah()
  const projection = useMoneeStore(state => state.snapshot?.savings.goals ?? EMPTY_GOALS)
  const unallocated = useMoneeStore(state => state.snapshot?.unallocated ?? 0)
  const locked = useMoneeStore(state => state.snapshot?.locked ?? false)
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Goal | null>(null)
  const [using, setUsing] = useState<Goal | null>(null)
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const pendingOrder = useRef<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletePhase, setDeletePhase] = useState<'idle' | 'armed' | 'settled'>('idle')
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const active = projection.filter(item => item.status !== 'used')
  const ids = dragOrder ?? active.map(item => item.goal.id)
  async function persist(ids: string[]) {
    setBusy(true); setError('')
    try { await useMoneeStore.getState().reorderGoals(ids); setAnnouncement('Prioritas tujuan diperbarui.') }
    catch (cause) { setError(savingsErrorMessage(cause, 'Urutan belum tersimpan. Coba lagi.')) }
    finally { setBusy(false); setDragOrder(null); pendingOrder.current = null }
  }
  function move(id: string, delta: number) {
    const from = ids.indexOf(id); const to = from + delta
    if (busy || from < 0 || to < 0 || to >= ids.length) return
    const next = [...ids]; next.splice(from, 1); next.splice(to, 0, id)
    void persist(next)
  }
  async function remove() {
    if (!deleting || busy) return
    setBusy(true); setError('')
    try { await useMoneeStore.getState().deleteGoal(deleting.id) }
    finally { setBusy(false) }
  }
  return <section className="savings-goals" aria-label="Wishlist tujuan">
    <header className="savings-section-header"><h2>Tujuan tabungan</h2><Button variant="secondary" onClick={() => setEditing('new')}>Tambah tujuan</Button></header>
    <p className="savings-hint">Dana mengisi tujuan dari atas. Geser pegangan atau gunakan tombol panah atas/bawah pada pegangan untuk mengubah prioritas.</p>
    <p className="savings-pool">Belum dialokasikan <strong className="font-tabular">{rupiah(unallocated)}</strong></p>
    {error && !deleting && <InlineError>{error}</InlineError>}
    <span className="sr-only" role="status">{announcement}</span>
    {active.length > 0 ? <Reorder.Group axis="y" values={ids} onReorder={next => { pendingOrder.current = next; setDragOrder(next) }} className="savings-goal-list">
      {ids.map(id => {
        const item = active.find(value => value.goal.id === id)
        return item ? <GoalItem key={id} item={item} busy={busy} locked={locked} onMove={delta => move(id, delta)}
          onFinish={() => { if (pendingOrder.current) void persist(pendingOrder.current) }}
          onEdit={() => setEditing(item.goal)} onDelete={() => setDeleting(item.goal)} onUse={() => setUsing(item.goal)} /> : null
      })}
    </Reorder.Group> : <Card><p>Belum ada tujuan. Buat satu rencana kecil untuk mulai.</p></Card>}
    {projection.some(item => item.status === 'used') && <section className="savings-goals-history" aria-label="Riwayat tujuan"><h3>Riwayat tujuan</h3>
      <ul>{projection.filter(item => item.status === 'used').map(item => <li key={item.goal.id}><span>{item.goal.name}</span><strong className="font-tabular">{rupiah(item.goal.targetAmount)} · Digunakan</strong></li>)}</ul>
    </section>}
    {using && <UseGoalDialog goal={using} onClose={() => setUsing(null)} />}
    {editing && <GoalDialog {...(editing !== 'new' ? { goal: editing } : {})} onClose={() => setEditing(null)} />}
    {deleting && <Dialog open title="Hapus tujuan?" onClose={() => { if (!busy && deletePhase === 'idle') setDeleting(null) }}>
      <p>Hapus {deleting.name}? Saldo tabungan tetap utuh dan dananya kembali tersedia untuk tujuan lain.</p>
      {error && <InlineError>{error}</InlineError>}
      <div className="savings-actions"><FuseButton label="Ya, hapus tujuan" doneLabel="Tujuan dihapus" commitOn="fuseEnd" undoWindow={4000}
        onCommit={remove} onUndo={() => {}} onPhaseChange={setDeletePhase} onSettled={() => setDeleting(null)}
        getErrorMessage={cause => savingsErrorMessage(cause, 'Tujuan belum terhapus. Coba lagi.')} />
        {deletePhase === 'idle' && <Button variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>Batal</Button>}</div>
    </Dialog>}
  </section>
}
