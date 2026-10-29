import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Leaf, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/controls'
import { InlineError, Skeleton } from '@/components/ui/feedback'
import { openDatabase } from '@/core/db/migrations'
import { DEFAULT_BUCKETS, settingsRepo } from '@/core/db/repositories'
import type { Bucket, MascotId } from '@/core/finance/types'
import { applyMascotTheme } from '@/theme/mascot-themes'
import { mascotIndex } from '@/features/mascot/mascot-options'
import { useMoneeStore } from '@/store'
import { NameStep } from './NameStep'
import { IncomeStep, type FirstIncome } from './IncomeStep'
import { AllocationStep } from './AllocationStep'
import { PinStep } from './PinStep'
import './onboarding.css'

const MascotCarousel = lazy(() => import('@/features/mascot/MascotCarousel').then(module => ({ default: module.MascotCarousel })))
const STEPS = ['Nama', 'Pemasukan', 'Alokasi', 'Maskot', 'PIN']
interface Draft { step: number; name: string; income: FirstIncome | null; buckets: Bucket[]; mascotId: MascotId }
const freshDraft = (): Draft => ({ step: 0, name: '', income: null, buckets: DEFAULT_BUCKETS.map(bucket => ({ ...bucket })), mascotId: 'mochi' })

function restoreDraft(value: Partial<Draft> | undefined): Draft {
  if (!value || typeof value.name !== 'string' || !Number.isInteger(value.step)
    || value.step! < 0 || value.step! > 4 || !['mochi', 'luna', 'bumi'].includes(value.mascotId ?? '')
    || !Array.isArray(value.buckets) || value.buckets.length !== 5) return freshDraft()
  return {
    step: value.step!, name: value.name.slice(0, 40), mascotId: value.mascotId!,
    income: value.income ?? null,
    buckets: DEFAULT_BUCKETS.map(bucket => {
      const saved = value.buckets!.find(item => item.id === bucket.id)
      return saved && Number.isFinite(saved.allocPercent) && saved.allocPercent >= 0 && saved.allocPercent <= 100
        ? { ...bucket, allocPercent: saved.allocPercent, allowOverbudget: saved.allowOverbudget === true } : { ...bucket }
    }),
  }
}

export function OnboardingScreen() {
  const categories = useMoneeStore(state => state.categories)
  const finishOnboarding = useMoneeStore(state => state.finishOnboarding)
  const [draft, setDraft] = useState<Draft>(freshDraft)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const inFlight = useRef(false)
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void openDatabase().then(async db => {
      if (useMoneeStore.getState().categories.length === 0) await useMoneeStore.getState().load()
      return settingsRepo.get<Partial<Draft>>(db, 'onboarding-draft')
    }).then(saved => {
      if (!cancelled) { setDraft(restoreDraft(saved)); setReady(true); setError('') }
    }).catch(() => { if (!cancelled) setError('Pengaturan belum bisa dibuka. Coba lagi, ya.') })
    return () => { cancelled = true }
  }, [retry])
  useEffect(() => {
    if (ready) {
      const heading = content.current?.querySelector<HTMLElement>('h1')
      if (heading) { heading.tabIndex = -1; heading.focus() }
      window.scrollTo(0, 0)
    }
  }, [draft.step, ready])
  useEffect(() => { if (ready) applyMascotTheme(draft.mascotId) }, [draft.mascotId, ready])

  async function advance(patch: Partial<Draft>, step = draft.step + 1) {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true); setError('')
    try {
      const next = { ...draft, ...patch, step }
      await settingsRepo.set(await openDatabase(), 'onboarding-draft', next)
      setDraft(next)
      return true
    } catch { setError('Langkahmu belum tersimpan. Coba lanjut lagi, ya.'); return false }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function finish(pin: string) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setError('')
    try {
      await finishOnboarding({ name: draft.name, buckets: draft.buckets, mascotId: draft.mascotId, pin,
        ...(draft.income ? { income: draft.income } : {}) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pengaturan belum tersimpan. Coba lagi, ya.')
    } finally { inFlight.current = false; setBusy(false) }
  }

  return <section className="onboarding" aria-label="Pengaturan pertama Monee">
    <div className="onboarding-top"><span className="onboarding-brand"><Leaf size={22} aria-hidden="true" /> monee</span>
      <span className="onboarding-private"><ShieldCheck size={14} aria-hidden="true" /> Milikmu, di perangkatmu</span></div>
    {ready ? <>
      <div className="onboarding-progress"><p>Langkah {draft.step + 1} dari 5 <span>{STEPS[draft.step]}</span></p>
        <ol aria-label="Langkah pengaturan">{STEPS.map((step, index) => <li key={step} aria-current={index === draft.step ? 'step' : undefined}
          className={index <= draft.step ? 'is-complete' : ''}><span className="sr-only">{step}</span></li>)}</ol>
      </div>
      <div className="onboarding-back">{draft.step > 0 && <Button variant="ghost" disabled={busy}
        onClick={() => { void advance({}, draft.step - 1) }}><ArrowLeft size={16} aria-hidden="true" /> Kembali</Button>}</div>
      <div className="onboarding-content" ref={content} key={draft.step}>
        {draft.step === 0 && <NameStep name={draft.name} busy={busy} onNext={name => { void advance({ name }) }} />}
        {draft.step === 1 && <IncomeStep income={draft.income} categories={categories} busy={busy} onNext={income => { void advance({ income }) }} />}
        {draft.step === 2 && <AllocationStep buckets={draft.buckets} busy={busy} onNext={buckets => { void advance({ buckets }) }} />}
        {draft.step === 3 && <div className="onboarding-step"><header className="onboarding-heading"><h1>Pilih teman perjalananmu</h1>
          <p>Tiga teman, tiga warna. Mana yang paling kamu banget?</p></header>
          <Suspense fallback={<Skeleton label="Menyiapkan temanmu" />}><MascotCarousel initialIndex={mascotIndex(draft.mascotId)} applying={busy}
            onApply={async mascotId => {
              if (!await advance({ mascotId })) throw new Error('Langkahmu belum tersimpan.')
            }} /></Suspense></div>}
        {draft.step === 4 && <PinStep onFinish={pin => { void finish(pin) }} busy={busy} />}
      </div>
    </> : !error && <Skeleton label="Menyiapkan pengaturan" />}
    {error && <div className="onboarding-load-error"><InlineError>{error}</InlineError>
      {!ready && <Button onClick={() => setRetry(value => value + 1)}>Coba lagi</Button>}</div>}
  </section>
}
