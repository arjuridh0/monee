import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button, TextField } from '@/components/ui/controls'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'

export function NameStep({ name, onNext, busy }: {
  name: string; onNext: (name: string) => void; busy: boolean
}) {
  const [value, setValue] = useState(name)
  return <form className="onboarding-step" onSubmit={event => { event.preventDefault(); if (value.trim()) onNext(value.trim()) }}>
    <div className="onboarding-art"><MascotCanvas state="greeting" size={216} /></div>
    <header className="onboarding-heading"><h1>Hai, kenalan dulu yuk!</h1>
      <p>Aku Mochi. Kita mulai dari panggilan kesukaanmu.</p></header>
    <TextField label="Nama panggilan" autoComplete="given-name" autoFocus maxLength={40}
      placeholder="Mau dipanggil siapa?" value={value} onChange={event => setValue(event.target.value)}
      hint="Bisa kamu ubah kapan saja di Atur." />
    <Button type="submit" disabled={!value.trim() || busy} loading={busy}>Lanjut <ArrowRight size={18} aria-hidden="true" /></Button>
  </form>
}
