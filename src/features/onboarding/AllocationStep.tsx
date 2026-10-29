import { useState } from 'react'
import { Car, HandHeart, Home, PartyPopper, PiggyBank } from 'lucide-react'
import { Button, Toggle } from '@/components/ui/controls'
import { InlineError } from '@/components/ui/feedback'
import { DEFAULT_BUCKETS } from '@/core/db/repositories'
import type { Bucket } from '@/core/finance/types'

const ICONS = [Home, Car, PiggyBank, HandHeart, PartyPopper]

export function AllocationStep({ buckets, onNext, busy }: {
  buckets: Bucket[]; onNext: (buckets: Bucket[]) => void; busy: boolean
}) {
  const [values, setValues] = useState(buckets.map(bucket => String(bucket.allocPercent)))
  const [permissions, setPermissions] = useState(buckets.map(bucket => bucket.allowOverbudget))
  const [custom, setCustom] = useState(buckets.some((bucket, i) => bucket.allocPercent !== DEFAULT_BUCKETS[i]?.allocPercent
    || bucket.allowOverbudget !== DEFAULT_BUCKETS[i]?.allowOverbudget))
  const total = values.reduce((sum, value) => sum + Number(value), 0)
  const valid = values.every(value => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100)
    && Math.abs(total - 100) < 1e-9
  const changeValue = (i: number, value: string) => setValues(current => current.map((old, index) => index === i ? value : old))
  return <form className="onboarding-step" onSubmit={event => {
    event.preventDefault()
    if (valid) onNext(buckets.map((bucket, i) => ({ ...bucket, allocPercent: Number(values[i]), allowOverbudget: permissions[i]! })))
  }}>
    <header className="onboarding-heading"><h1>Beri setiap rupiah tujuan</h1>
      <p>Mulai dari pembagian ini, atau sesuaikan dengan keseharianmu.</p></header>
    <div className="onboarding-presets" role="group" aria-label="Pilihan alokasi">
      <Button variant={custom ? 'secondary' : 'primary'} aria-pressed={!custom} onClick={() => {
        setCustom(false); setValues(DEFAULT_BUCKETS.map(bucket => String(bucket.allocPercent)))
        setPermissions(DEFAULT_BUCKETS.map(bucket => bucket.allowOverbudget))
      }}>Pakai preset</Button>
      <Button variant={custom ? 'primary' : 'secondary'} aria-pressed={custom} onClick={() => setCustom(true)}>Custom sendiri</Button>
    </div>
    <div className="onboarding-buckets">
      {buckets.map((bucket, i) => {
        const Icon = ICONS[i] ?? Home
        return <div className="onboarding-bucket" key={bucket.id}>
          <div className="onboarding-bucket-main"><span className="onboarding-bucket-icon"><Icon size={20} aria-hidden="true" /></span>
            <label htmlFor={`percent-${bucket.id}`}>{bucket.name}</label>
            {custom ? <span className="onboarding-percent"><input id={`percent-${bucket.id}`} aria-label={`Persentase ${bucket.name}`}
              type="number" inputMode="decimal" min="0" max="100" step="any" value={values[i]} onChange={event => changeValue(i, event.target.value)} /><span>%</span></span>
              : <strong>{values[i]}%</strong>}
          </div>
          {custom && <Toggle label={`Boleh lewat batas ${bucket.name}`} checked={permissions[i]!}
            onChange={checked => setPermissions(current => current.map((old, index) => index === i ? checked : old))} />}
        </div>
      })}
    </div>
    <div className="onboarding-total" aria-live="polite"><span>Total alokasi</span><strong>{Number.isFinite(total) ? Number(total.toFixed(4)) : '—'}%</strong></div>
    {!valid && <InlineError>Total alokasi harus 100%, dengan setiap jatah antara 0–100%.</InlineError>}
    <p className="ui-helper">Jatah membatasi pengeluaran. Tabungan boleh lewat jatah secara default. Uang keluar tetap dibatasi saldo periode.</p>
    <Button type="submit" disabled={!valid || busy} loading={busy}>Lanjut</Button>
  </form>
}
