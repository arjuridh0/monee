import { useRef, useState, type FormEvent } from 'react'
import { Button, TextField } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { GOAL_ICONS } from '@/components/ui/goal-icons'
import type { Goal } from '@/core/finance/types'
import { useMoneeStore } from '@/store'

export function GoalDialog({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? '')
  const [amount, setAmount] = useState(goal ? String(goal.targetAmount) : '')
  const [icon, setIcon] = useState(goal?.icon ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    const targetAmount = Number(amount)
    if (!name.trim() || !Number.isSafeInteger(targetAmount) || targetAmount <= 0) {
      setError('Isi nama tujuan dan target lebih dari 0 rupiah utuh.'); return
    }
    inFlight.current = true; setBusy(true); setError('')
    const state = useMoneeStore.getState()
    try {
      const next: Goal = { id: goal?.id ?? crypto.randomUUID(), name: name.trim(), targetAmount,
        createdAt: goal?.createdAt ?? Date.now(), sortOrder: goal?.sortOrder ?? Math.max(-1, ...state.goals.map(item => item.sortOrder)) + 1,
        ...(icon.trim() ? { icon: icon.trim() } : {}) }
      await state.saveGoal(next); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tujuan belum tersimpan. Coba lagi.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <Dialog open title={goal ? 'Edit tujuan' : 'Tambah tujuan'} onClose={() => { if (!busy) onClose() }} sheet>
    <form className="savings-form" noValidate onSubmit={event => { void save(event) }}>
      <TextField label="Nama tujuan" value={name} maxLength={60} autoFocus disabled={busy} onChange={event => setName(event.target.value)} />
      <TextField label="Target (Rp)" type="number" min="1" step="1" inputMode="numeric" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} />
      <label className="goal-icon-field" htmlFor="goal-icon">Ikon (opsional)
        <span><CategoryIcon name={icon || 'target'} /><select id="goal-icon" value={GOAL_ICONS.some(item => item.value === icon) ? icon : ''}
          disabled={busy} onChange={event => setIcon(event.target.value)}>
          <option value="">Tanpa ikon khusus</option>{GOAL_ICONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></span>
      </label>
      {error && <InlineError>{error}</InlineError>}
      <Button type="submit" loading={busy}>Simpan tujuan</Button>
    </form>
  </Dialog>
}
