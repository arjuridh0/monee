import { useState } from 'react'
import { validateGoalUse } from '@/core/finance/guards'
import { Dialog } from '@/components/ui/Dialog'
import { FuseButton } from '@/components/reactbits/FuseButton'
import type { Goal } from '@/core/finance/types'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import { savingsErrorMessage } from './errors'

export function UseGoalDialog({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const rupiah = useRupiah()
  const [busy, setBusy] = useState(false)
  return <Dialog open title="Gunakan tujuan?" onClose={() => { if (!busy) onClose() }} sheet>
    <div className="savings-form">
      <p>Gunakan <strong>{rupiah(goal.targetAmount)}</strong> dari Allocation untuk <strong>{goal.name}</strong>?</p>
      <p>Ada 4 detik untuk membatalkan. Setelah tersimpan, tujuan pindah ke riwayat. Saldo periode tetap utuh.</p>
      <FuseButton label="Konfirmasi gunakan" doneLabel="Tujuan digunakan" undoWindow={4000} commitOn="fuseEnd" settle="reset" onSettled={onClose}
        getErrorMessage={cause => savingsErrorMessage(cause, 'Tujuan belum digunakan. Coba lagi.')}
        beforeArm={() => { const state = useMoneeStore.getState(); const result = validateGoalUse(goal.targetAmount, state.snapshot?.savings.allocationBalance ?? 0); if (!result.ok) throw new Error(`${result.code} — ${result.message}`); return true }}
        onUndo={() => {}} onCommit={async () => {
          setBusy(true)
          try { await useMoneeStore.getState().useGoal(goal.id, goal.targetAmount) }
          finally { setBusy(false) }
        }} />
    </div>
  </Dialog>
}
