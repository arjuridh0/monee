import { lazy, Suspense, useCallback, useState } from 'react'
import {
  Banknote, Check, ChevronRight, Download, Info, Lock, Mic, Repeat,
  ScanFace, Sparkles, Tags, TriangleAlert, Upload, User, ChartPie,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button, TextField, Toggle } from '@/components/ui/controls'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError, Skeleton, Toast } from '@/components/ui/feedback'
import { CodeSlots } from '@/components/reactbits/CodeSlots'
import { DEFAULT_BUCKETS } from '@/core/db/repositories'
import { openDatabase } from '@/core/db/migrations'
import {
  CURRENCY_FORMATS, formatRupiah, normalizeCurrencyFormat,
  type CurrencyFormat,
} from '@/core/finance/currency'
import type { Bucket, MascotId, Profile } from '@/core/finance/types'
import { mascotIndex } from '@/features/mascot/mascot-options'
import type { SaveAllocationInput } from '@/features/settings/allocation-persistence'
import { CategoryManagerSheet } from '@/features/settings/CategoryManagerSheet'
import { RecurringIncomeManagerSheet } from '@/features/settings/RecurringIncomeManagerSheet'
import { BucketManagerSheet } from '@/features/settings/BucketManagerSheet'
import { PeriodSettingsSheet } from '@/features/settings/PeriodSettingsSheet'
import { PwaControls } from '@/pwa/PwaControls'
import { notifyDataChanged } from '@/core/db/changes'
import { APP_VERSION } from '@/app/version'
import { exportBackup, importBackup } from '@/features/settings/backup'
import { applyMascotTheme, MASCOT_THEMES } from '@/theme/mascot-themes'
import { useMoneeStore } from '@/store'
import { useRupiah } from '@/hooks/useRupiah'
import './settings.css'

const MascotCarousel = lazy(() => import('@/features/mascot/MascotCarousel').then(module => ({ default: module.MascotCarousel })))
const VoiceServiceSheet = lazy(() => import('@/features/voice/VoiceServiceSheet').then(module => ({ default: module.VoiceServiceSheet })))

type Sheet = 'name' | 'mascot' | 'currency' | 'allocation' | 'buckets' | 'period' | 'categories' | 'recurring' | 'pin' | 'about' | 'backup-export' | 'backup-import' | 'delete-all' | 'voice' | null
type Tone = 'accent' | 'violet' | 'gold' | 'peach' | 'green' | 'brown' | 'danger'

export function SettingsScreen() {
  const profile = useMoneeStore(state => state.profile)
  const buckets = useMoneeStore(state => state.buckets)
  const categories = useMoneeStore(state => state.categories)
  const recurringIncomes = useMoneeStore(state => state.recurringIncomes)
  const saveProfile = useMoneeStore(state => state.saveProfile)
  const saveAllocation = useMoneeStore(state => state.saveAllocation)
  const changePin = useMoneeStore(state => state.changePin)
  const deleteAllData = useMoneeStore(state => state.deleteAllData)
  const rupiah = useRupiah()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toast, setToast] = useState('')
  const dismissToast = useCallback(() => setToast(''), [])

  if (!profile) return null
  const format = normalizeCurrencyFormat(profile.currency?.format)
  const mascotName = MASCOT_THEMES[profile.mascotId]?.name ?? 'Mochi'
  const saved = (message: string) => { setSheet(null); setToast(message) }

  return <section className="settings-screen" aria-label="Pengaturan Monee">
    <header className="settings-header"><h1>Atur</h1><p>Semua preferensi Monee kamu</p></header>

    <button type="button" className="settings-profile" aria-label={`Ubah nama, sekarang ${profile.name}`}
      onClick={() => setSheet('name')}>
      <span className="settings-avatar" aria-hidden="true"><User size={29} /></span>
      <span className="settings-profile-copy"><strong>{profile.name}</strong>
        <small>Pengguna tunggal · data lokal</small></span>
      <span className="settings-chevron" aria-hidden="true"><ChevronRight size={16} /></span>
    </button>

    <SettingsGroup title="Profil">
      <SettingRow icon={User} tone="accent" label="Nama" value={profile.name} onClick={() => setSheet('name')} />
      <SettingRow icon={Sparkles} tone="violet" label="Maskot & Tema" value={mascotName} onClick={() => setSheet('mascot')} />
    </SettingsGroup>

    <SettingsGroup title="Uang & Bucket">
      <SettingRow icon={ChartPie} tone="gold" label="Alokasi Bucket" value={`${buckets.length} bucket`}
        onClick={() => setSheet('allocation')} />
      <SettingRow icon={ChartPie} tone="green" label="Kelola Bucket" value="Nama & tampilan" onClick={() => setSheet('buckets')} />
      <SettingRow icon={Repeat} tone="gold" label="Awal Periode" value={`Tanggal ${profile.periodChanges?.slice(-1)[0]?.startDay ?? profile.periodStartDay}`}
        onClick={() => setSheet('period')} />
      <SettingRow icon={Tags} tone="peach" label="Kelola Kategori" value={`${categories.length} kategori`}
        onClick={() => setSheet('categories')} />
      <SettingRow icon={Repeat} tone="green" label="Pemasukan Rutin" value={`${recurringIncomes.length} template`}
        onClick={() => setSheet('recurring')} />
      <SettingRow icon={Banknote} tone="brown" label="Format Rupiah" value={formatRupiah(20_000, format)}
        onClick={() => setSheet('currency')} />
    </SettingsGroup>

    <SettingsGroup title="Keamanan">
      <SettingRow icon={Lock} tone="accent" label="Ganti PIN" value="6 digit" onClick={() => setSheet('pin')} />
      <SettingRow icon={ScanFace} tone="violet" label="Buka dengan sidik jari" value="Belum aktif" disabled />
    </SettingsGroup>

    <SettingsGroup title="Data & Backup">
      <SettingRow icon={Download} tone="green" label="Export Backup" value="JSON" onClick={() => setSheet('backup-export')} />
      <SettingRow icon={Upload} tone="brown" label="Import Backup" value="JSON" onClick={() => setSheet('backup-import')} />
      <SettingRow icon={Mic} tone="accent" label="Layanan suara" value="Dikelola Monee" onClick={() => setSheet('voice')} />
    </SettingsGroup>

    <SettingsGroup title="Lainnya">
      <SettingRow icon={Info} tone="peach" label="Tentang Monee" value={`v${APP_VERSION}`} onClick={() => setSheet('about')} />
      <SettingRow icon={TriangleAlert} tone="danger" label="Hapus Semua Data" value="Permanen" onClick={() => setSheet('delete-all')} />
    </SettingsGroup>

    <PwaControls />

    <footer className="settings-footer">
      <span>Monee v{APP_VERSION} · Semua data tersimpan di perangkat ini</span>
    </footer>

    {sheet === 'voice' && <Suspense fallback={<Skeleton label="Menyiapkan pengaturan voice" />}><VoiceServiceSheet onClose={() => setSheet(null)} /></Suspense>}
    {sheet === 'name' && <NameSheet profile={profile} saveProfile={saveProfile} onClose={() => setSheet(null)}
      onSaved={() => saved('Nama diperbarui.')} />}
    {sheet === 'mascot' && <MascotSheet profile={profile} saveProfile={saveProfile} onClose={() => setSheet(null)}
      onSaved={() => saved('Maskot & tema diperbarui.')} />}
    {sheet === 'currency' && <CurrencySheet profile={profile} saveProfile={saveProfile} rupiah={rupiah}
      onClose={() => setSheet(null)} onSaved={() => saved('Format rupiah diperbarui.')} />}
    {sheet === 'allocation' && <AllocationSheet buckets={buckets} saveAllocation={saveAllocation}
      onClose={() => setSheet(null)} onSaved={() => saved('Alokasi bucket diperbarui.')} />}
    {sheet === 'categories' && <CategoryManagerSheet onClose={() => setSheet(null)} />}
    {sheet === 'buckets' && <BucketManagerSheet onClose={() => setSheet(null)} />}
    {sheet === 'period' && <PeriodSettingsSheet onClose={() => setSheet(null)} />}
    {sheet === 'recurring' && <RecurringIncomeManagerSheet onClose={() => setSheet(null)} />}
    {sheet === 'pin' && <ChangePinSheet changePin={changePin} onClose={() => setSheet(null)}
      onSaved={() => saved('PIN berhasil diganti.')} />}
    {sheet === 'about' && <AboutSheet onClose={() => setSheet(null)} />}
    {(sheet === 'backup-export' || sheet === 'backup-import') && <BackupSheet
      mode={sheet === 'backup-export' ? 'export' : 'import'} onClose={() => setSheet(null)}
      onImported={async () => { await useMoneeStore.getState().load(); notifyDataChanged(); saved('Backup dipulihkan.') }} />}
    {sheet === 'delete-all' && <DeleteAllSheet expectedPinHash={profile.pinHash} deleteAllData={deleteAllData}
      onClose={() => setSheet(null)} />}

    {toast && <Toast message={toast} onDismiss={dismissToast} />}
  </section>
}

function DeleteAllSheet({ expectedPinHash, deleteAllData, onClose }: {
  expectedPinHash: string; deleteAllData: (pin: string, expectedPinHash: string) => Promise<void>; onClose: () => void
}) {
  const [pin, setPin] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || pin.length !== 6 || !confirmed) return
    setBusy(true); setError('')
    try { await deleteAllData(pin, expectedPinHash) }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Data belum bisa dihapus. Coba lagi, ya.')
      setPin('')
    }
    finally { setBusy(false) }
  }

  return <Dialog open sheet title="Hapus Semua Data" onClose={() => { if (!busy) onClose() }}>
    <form className="settings-form" onSubmit={event => { void submit(event) }}>
      <div className="settings-warning"><TriangleAlert size={20} aria-hidden="true" /><div>
        <strong>Tindakan ini tidak bisa dibatalkan</strong>
        <p>Semua profil, PIN, transaksi, kategori, bucket, tujuan, dan pengaturan di perangkat ini akan dihapus permanen.</p>
      </div></div>
      <CodeSlots ariaLabel="PIN untuk konfirmasi hapus" value={pin} disabled={busy}
        onChange={value => { setPin(value); setError('') }} />
      <label className="settings-backup-confirm"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} /> Saya paham data di perangkat ini akan dihapus permanen.</label>
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button type="submit" variant="danger" loading={busy} disabled={pin.length !== 6 || !confirmed}>Hapus semua data</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
      </div>
    </form>
  </Dialog>
}

function BackupSheet({ mode, onClose, onImported }: {
  mode: 'export' | 'import'; onClose: () => void; onImported: () => Promise<void>
}) {
  const [passphrase, setPassphrase] = useState('')
  const [encrypted, setEncrypted] = useState(false)
  const [fileContents, setFileContents] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function exportFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (encrypted && passphrase.length < 8)) return
    setBusy(true); setError('')
    try {
      const contents = await exportBackup(await openDatabase(), encrypted ? passphrase : undefined)
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `monee-backup-${new Date().toISOString().slice(0, 10)}.json`
      anchor.target = '_self'
      anchor.hidden = true
      document.querySelector('dialog[open]')?.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Backup belum bisa dibuat.')
    } finally { setBusy(false) }
  }

  async function restore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!fileContents || !confirmed || busy) return
    setBusy(true); setError('')
    try {
      await importBackup(await openDatabase(), fileContents, passphrase || undefined)
      await onImported()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Backup belum bisa dipulihkan.')
    } finally { setBusy(false) }
  }

  return <Dialog open sheet title={mode === 'export' ? 'Export Backup' : 'Import Backup'} onClose={() => { if (!busy) onClose() }}>
    {mode === 'export' ? <form className="settings-form" onSubmit={event => { void exportFile(event) }}>
      <div className="settings-warning"><Lock size={20} aria-hidden="true" /><div>
        <strong>File berisi data sensitif</strong>
        <p>Backup mencakup transaksi, nama, hash PIN, dan pengaturan. Simpan file di tempat pribadi. File JSON biasa tidak dienkripsi.</p>
      </div></div>
      <Toggle label="Enkripsi dengan passphrase" checked={encrypted} disabled={busy} onChange={setEncrypted} />
      {encrypted && <TextField label="Passphrase (minimal 8 karakter)" type="password" value={passphrase}
        autoComplete="new-password" disabled={busy} onChange={event => setPassphrase(event.target.value)} />}
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy} disabled={encrypted && passphrase.length < 8}>Unduh backup JSON</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Tutup</Button>
      </div>
    </form> : <form className="settings-form" onSubmit={event => { void restore(event) }}>
      <div className="settings-warning"><TriangleAlert size={20} aria-hidden="true" /><div>
        <strong>Import akan mengganti seluruh data</strong>
        <p>Pilih backup Monee yang tepercaya. File akan divalidasi sebelum data saat ini diganti.</p>
      </div></div>
      <TextField label="File backup JSON" type="file" accept="application/json,.json" disabled={busy}
        onChange={event => {
          const file = event.target.files?.[0]
          setFileContents(''); setError('')
          if (!file) return
          if (file.size > 20 * 1024 * 1024) { setError('File backup melebihi batas 20 MB.'); return }
          void file.text().then(setFileContents).catch(() => setError('File tidak bisa dibaca.'))
        }} />
      <TextField label="Passphrase (jika backup dienkripsi)" type="password" value={passphrase}
        autoComplete="current-password" disabled={busy} onChange={event => setPassphrase(event.target.value)} />
      <label className="settings-backup-confirm"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} /> Saya paham seluruh data saat ini akan diganti.</label>
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy} disabled={!fileContents || !confirmed}>Validasi & pulihkan</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
      </div>
    </form>}
  </Dialog>
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="settings-group"><h2>{title}</h2><div className="settings-card">{children}</div></section>
}

function SettingRow({ icon: Icon, label, value, tone, onClick, disabled = false }: {
  icon: LucideIcon; label: string; value: string; tone: Tone; onClick?: () => void; disabled?: boolean
}) {
  return <button type="button" className="settings-row" onClick={onClick} disabled={disabled}>
    <span className={`settings-tile settings-tile--${tone}`} aria-hidden="true"><Icon size={17} /></span>
    <span className="settings-row-label">{label}</span>
    <span className="settings-row-value">{value}</span>
    <ChevronRight className="settings-row-chevron" size={16} aria-hidden="true" />
  </button>
}

function NameSheet({ profile, saveProfile, onClose, onSaved }: {
  profile: Profile; saveProfile: (profile: Profile) => Promise<void>; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(profile.name)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()
  const validation = !trimmed ? 'Nama wajib diisi.' : trimmed.length > 40 ? 'Nama maksimal 40 karakter.' : ''
  const shownError = error || (touched ? validation : '')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTouched(true)
    if (validation || busy) return
    setBusy(true); setError('')
    try {
      await saveProfile({ ...profile, name: trimmed })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nama belum tersimpan. Coba lagi, ya.')
    } finally { setBusy(false) }
  }

  return <Dialog open sheet title="Ubah nama" onClose={() => { if (!busy) onClose() }}>
    <form className="settings-form" onSubmit={event => { void submit(event) }}>
      <TextField label="Nama" value={name} maxLength={40} autoFocus disabled={busy}
        onChange={event => { setName(event.target.value); setError('') }} />
      {shownError && <InlineError>{shownError}</InlineError>}
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy}>Simpan nama</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
      </div>
    </form>
  </Dialog>
}

function MascotSheet({ profile, saveProfile, onClose, onSaved }: {
  profile: Profile; saveProfile: (profile: Profile) => Promise<void>; onClose: () => void; onSaved: () => void
}) {
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  async function apply(id: MascotId) {
    if (applying) return
    setApplying(true); setError('')
    try {
      await saveProfile({ ...profile, mascotId: id })
      applyMascotTheme(id)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Maskot belum tersimpan. Coba lagi, ya.')
      throw cause
    } finally { setApplying(false) }
  }

  return <Dialog open sheet title="Maskot & Tema" onClose={() => { if (!applying) onClose() }}>
    <Suspense fallback={<Skeleton label="Menyiapkan maskot" />}>
      <MascotCarousel initialIndex={mascotIndex(profile.mascotId)} applying={applying}
        onApply={apply} />
    </Suspense>
    {error && <InlineError>{error}</InlineError>}
  </Dialog>
}

function AllocationSheet({ buckets, saveAllocation, onClose, onSaved }: {
  buckets: Bucket[]
  saveAllocation: (input: SaveAllocationInput) => Promise<void>
  onClose: () => void
  onSaved: () => void
}) {
  const ordered = [...buckets].sort((a, b) => a.sortOrder - b.sortOrder)
  const presetBuckets = ordered.map((bucket, index) =>
    DEFAULT_BUCKETS.find(item => item.id === bucket.id) ?? DEFAULT_BUCKETS[index] ?? bucket)
  const [expected] = useState(() => ordered.map(bucket => ({
    id: bucket.id,
    allocPercent: bucket.allocPercent,
    allowOverbudget: bucket.allowOverbudget,
  })))
  const [custom, setCustom] = useState(() => ordered.some((bucket, index) =>
    bucket.allocPercent !== presetBuckets[index]!.allocPercent
    || bucket.allowOverbudget !== presetBuckets[index]!.allowOverbudget))
  const [values, setValues] = useState(() => ordered.map(bucket => String(bucket.allocPercent)))
  const [permissions, setPermissions] = useState(() => ordered.map(bucket => bucket.allowOverbudget))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const parsed = values.map(value => value.trim() === '' ? Number.NaN : Number(value))
  const total = parsed.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
  const valid = parsed.every(value => Number.isFinite(value) && value >= 0 && value <= 100)
    && Math.abs(total - 100) < 1e-9
  const totalLabel = parsed.every(value => Number.isFinite(value)) ? `${Number(total.toFixed(4))}%` : '—'
  const shownError = error || (custom && !valid
    ? 'Total alokasi harus 100%, dengan setiap jatah antara 0–100%.' : '')

  function choosePreset() {
    setCustom(false)
    setError('')
    setValues(presetBuckets.map(bucket => String(bucket.allocPercent)))
    setPermissions(presetBuckets.map(bucket => bucket.allowOverbudget))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !valid) return
    setBusy(true)
    setError('')
    try {
      await saveAllocation({
        expected,
        changes: ordered.map((bucket, index) => ({
          id: bucket.id,
          allocPercent: parsed[index]!,
          allowOverbudget: permissions[index]!,
        })),
      })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Alokasi belum tersimpan. Coba lagi, ya.')
    } finally { setBusy(false) }
  }

  return <Dialog open sheet title="Alokasi Bucket" onClose={() => { if (!busy) onClose() }}>
    <form className="settings-form" onSubmit={event => { void submit(event) }}>
      <p className="settings-helper">Total harus 100%. Jatah membatasi pengeluaran; saldo periode tetap dicek.</p>
      <div className="settings-allocation-presets" role="group" aria-label="Pilihan alokasi">
        <Button variant={custom ? 'secondary' : 'primary'} aria-pressed={!custom} disabled={busy}
          onClick={choosePreset}>Pakai preset</Button>
        <Button variant={custom ? 'primary' : 'secondary'} aria-pressed={custom} disabled={busy}
          onClick={() => { setCustom(true); setError('') }}>Custom sendiri</Button>
      </div>
      <div className="settings-allocation-list">
        {ordered.map((bucket, index) => {
          const invalidPercent = !Number.isFinite(parsed[index]) || parsed[index]! < 0 || parsed[index]! > 100
          return <div className="settings-allocation-item" key={bucket.id}>
            <div className="settings-allocation-main">
              <span className="settings-allocation-icon" style={{ background: bucket.color }}>
                <CategoryIcon name={bucket.icon} />
              </span>
              <span className="settings-allocation-name">{bucket.name}</span>
              {custom ? <span className="settings-allocation-percent">
                <input className="settings-allocation-input" aria-label={`Persentase ${bucket.name}`}
                  aria-invalid={invalidPercent} type="number" inputMode="decimal" min="0" max="100" step="any"
                  value={values[index]} disabled={busy}
                  onChange={event => {
                    const next = event.target.value
                    setValues(current => current.map((old, i) => i === index ? next : old))
                    setError('')
                  }} />
                <span aria-hidden="true">%</span>
              </span> : <strong className="settings-allocation-value">{Number(parsed[index]!.toFixed(4))}%</strong>}
            </div>
            {custom && <Toggle label={`Boleh lewat batas ${bucket.name}`} checked={permissions[index]!}
              disabled={busy}
              onChange={checked => {
                setPermissions(current => current.map((old, i) => i === index ? checked : old))
                setError('')
              }} />}
          </div>
        })}
      </div>
      <div className={`settings-allocation-total${valid ? ' is-valid' : ''}`} aria-live="polite">
        <span>Total alokasi</span>
        <strong>{totalLabel}{valid && <Check size={17} aria-hidden="true" />}</strong>
      </div>
      {shownError && <InlineError>{shownError}</InlineError>}
      <p className="ui-helper">Tabungan boleh lewat jatah secara default. Uang keluar tetap dibatasi saldo periode.</p>
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy} disabled={!valid}>Simpan alokasi</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
      </div>
    </form>
  </Dialog>
}

function CurrencySheet({ profile, saveProfile, rupiah, onClose, onSaved }: {
  profile: Profile; saveProfile: (profile: Profile) => Promise<void>; rupiah: (amount: number) => string
  onClose: () => void; onSaved: () => void
}) {
  const [selected, setSelected] = useState<CurrencyFormat>(normalizeCurrencyFormat(profile.currency?.format))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try {
      await saveProfile({ ...profile, currency: { code: 'IDR', format: selected } })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Format belum tersimpan. Coba lagi, ya.')
    } finally { setBusy(false) }
  }

  return <Dialog open sheet title="Format Rupiah" onClose={() => { if (!busy) onClose() }}>
    <div className="settings-form">
      <p className="settings-helper">Contoh tampilan saldo: <strong>{rupiah(20_000)}</strong></p>
      <fieldset className="settings-currency">
        <legend className="sr-only">Pilih format rupiah</legend>
        {CURRENCY_FORMATS.map(preset => <label key={preset.value}
          className={`settings-currency-option${selected === preset.value ? ' is-selected' : ''}`}>
          <input type="radio" name="currency-format" value={preset.value} aria-label={preset.example}
            checked={selected === preset.value} disabled={busy}
            onChange={() => setSelected(preset.value)} />
          <span><strong>{preset.example}</strong><small>{preset.label}</small></span>
        </label>)}
      </fieldset>
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button loading={busy} onClick={() => { void save() }}>Simpan format</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
      </div>
    </div>
  </Dialog>
}

function ChangePinSheet({ changePin, onClose, onSaved }: {
  changePin: (currentPin: string, newPin: string) => Promise<void>; onClose: () => void; onSaved: () => void
}) {
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mismatch = confirmation.length === 6 && confirmation !== newPin

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (currentPin.length !== 6 || newPin.length !== 6 || confirmation.length !== 6) {
      setError('Isi ketiga PIN 6 digit dulu, ya.'); return
    }
    if (mismatch) { setError('PIN belum sama. Periksa ulang, ya.'); return }
    if (newPin === currentPin) { setError('PIN baru harus berbeda dari PIN sekarang.'); return }
    setBusy(true); setError('')
    try {
      await changePin(currentPin, newPin)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PIN belum bisa diganti. Coba lagi, ya.')
    } finally { setBusy(false) }
  }

  return <Dialog open sheet title="Ganti PIN" onClose={() => { if (!busy) onClose() }}>
    <form className="settings-form" onSubmit={event => { void submit(event) }}>
      <CodeSlots ariaLabel="PIN sekarang" value={currentPin} disabled={busy}
        onChange={value => { setCurrentPin(value); setError('') }} />
      <CodeSlots ariaLabel="PIN baru" value={newPin} disabled={busy}
        onChange={value => { setNewPin(value); setError('') }} />
      <CodeSlots ariaLabel="Ulangi PIN baru" value={confirmation} disabled={busy}
        onChange={value => { setConfirmation(value); setError('') }} />
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-warning"><Lock size={20} aria-hidden="true" /><div>
        <strong>PIN tidak bisa dipulihkan</strong>
        <p>Catat dan ingat PIN barumu. Tanpa PIN, data di perangkat ini tidak bisa dibuka.</p>
      </div></div>
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy}>Simpan PIN</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
      </div>
    </form>
  </Dialog>
}

function AboutSheet({ onClose }: { onClose: () => void }) {
  return <Dialog open sheet title="Tentang Monee" onClose={onClose}>
    <div className="settings-about">
      <strong>Monee v{APP_VERSION}</strong>
      <p>Pencatat keuangan pribadi dengan maskot yang menemani kebiasaanmu.</p>
      <p>Semua data tersimpan di perangkat ini.</p>
    </div>
  </Dialog>
}
