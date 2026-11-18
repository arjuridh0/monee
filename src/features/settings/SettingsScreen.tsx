import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Banknote, Check, ChevronRight, Download, Info, Lock, LogOut, Mic, Repeat,
  ScanFace, Sparkles, TriangleAlert, Upload, User, ChartPie,
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
import { logoutAccount } from '@/features/auth/account-client'
import { useAccount } from '@/features/auth/AccountContext'
import { AccountPinSheet } from '@/features/auth/AccountPinSheet'
import { LegacyDataSheet } from '@/features/auth/LegacyDataSheet'
import { changePin as persistDevicePin } from '@/features/security/change-pin'
import { getSyncStatus, subscribeSyncStatus, type AccountSyncStatus } from '@/features/auth/sync'
import './settings.css'

const MascotCarousel = lazy(() => import('@/features/mascot/MascotCarousel').then(module => ({ default: module.MascotCarousel })))
const VoiceServiceSheet = lazy(() => import('@/features/voice/VoiceServiceSheet').then(module => ({ default: module.VoiceServiceSheet })))

type Sheet = 'name' | 'mascot' | 'currency' | 'allocation' | 'buckets' | 'period' | 'recurring' | 'pin' | 'account-pin' | 'legacy' | 'about' | 'backup-export' | 'backup-import' | 'delete-all' | 'voice' | null
type Tone = 'accent' | 'violet' | 'gold' | 'peach' | 'green' | 'brown' | 'danger'

export function SettingsScreen() {
  const { pinAuth } = useAccount()
  const profile = useMoneeStore(state => state.profile)
  const buckets = useMoneeStore(state => state.buckets)
  const recurringIncomes = useMoneeStore(state => state.recurringIncomes)
  const saveProfile = useMoneeStore(state => state.saveProfile)
  const saveBuckets = useMoneeStore(state => state.saveBuckets)
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
        <small>Akun Monee · sinkron lintas perangkat</small></span>
      <span className="settings-chevron" aria-hidden="true"><ChevronRight size={16} /></span>
    </button>

    <SettingsGroup title="Profil">
      <SettingRow icon={User} tone="accent" label="Nama" value={profile.name} onClick={() => setSheet('name')} />
      <SettingRow icon={Sparkles} tone="violet" label="Maskot & Tema" value={mascotName} onClick={() => setSheet('mascot')} />
    </SettingsGroup>

    <SettingsGroup title="Uang & Bucket">
      <SettingRow icon={ChartPie} tone="gold" label="Alokasi Bucket" value={`${buckets.length} bucket · nama & jatah`}
        onClick={() => setSheet('allocation')} />
      <SettingRow icon={ChartPie} tone="green" label="Kelola Bucket" value="Tambah, ikon & warna" onClick={() => setSheet('buckets')} />
      <SettingRow icon={Repeat} tone="gold" label="Awal Periode" value={`Tanggal ${profile.periodChanges?.slice(-1)[0]?.startDay ?? profile.periodStartDay}`}
        onClick={() => setSheet('period')} />
      <SettingRow icon={Repeat} tone="green" label="Pemasukan Rutin" value={`${recurringIncomes.length} template`}
        onClick={() => setSheet('recurring')} />
      <SettingRow icon={Banknote} tone="brown" label="Format Rupiah" value={formatRupiah(20_000, format)}
        onClick={() => setSheet('currency')} />
    </SettingsGroup>

    <SettingsGroup title="Keamanan">
      {pinAuth && <SettingRow icon={Lock} tone="accent" label="Ganti PIN akun" value="Berlaku di semua perangkat" onClick={() => setSheet('account-pin')} />}
      <SettingRow icon={Lock} tone="accent" label={profile.pinHash ? (pinAuth ? 'Ganti kunci perangkat' : 'Ganti PIN') : 'Atur PIN perangkat'} value={profile.pinHash ? '6 digit' : 'Opsional · belum aktif'} onClick={() => setSheet('pin')} />
      <SettingRow icon={ScanFace} tone="violet" label="Buka dengan sidik jari" value="Belum aktif" disabled />
    </SettingsGroup>

    <AccountSettings />

    <SettingsGroup title="Data & Backup">
      <SettingRow icon={Download} tone="green" label="Data lama di browser ini" value="Impor opsional" onClick={() => setSheet('legacy')} />
      <SettingRow icon={Download} tone="green" label="Export Backup" value="JSON" onClick={() => setSheet('backup-export')} />
      <SettingRow icon={Upload} tone="brown" label="Import Backup" value="JSON" onClick={() => setSheet('backup-import')} />
      <SettingRow icon={Mic} tone="accent" label="Layanan suara" value="Dikelola Monee" onClick={() => setSheet('voice')} />
    </SettingsGroup>

    <SettingsGroup title="Lainnya">
      <SettingRow icon={Info} tone="peach" label="Tentang Monee" value={`v${APP_VERSION}`} onClick={() => setSheet('about')} />
      <SettingRow icon={TriangleAlert} tone="danger" label="Hapus Semua Data" value="Akun & semua perangkat" onClick={() => setSheet('delete-all')} />
    </SettingsGroup>

    <PwaControls />
    {sheet === 'account-pin' && <AccountPinSheet onClose={() => setSheet(null)} />}
    {sheet === 'legacy' && <LegacyDataSheet onClose={() => setSheet(null)} />}

    <footer className="settings-footer">
      <span>Monee v{APP_VERSION} · Data akun tersinkron antarperangkat</span>
    </footer>

    {sheet === 'voice' && <Suspense fallback={<Dialog open sheet title="Layanan suara" onClose={() => setSheet(null)}><Skeleton label="Menyiapkan layanan suara" /></Dialog>}><VoiceServiceSheet onClose={() => setSheet(null)} /></Suspense>}
    {sheet === 'name' && <NameSheet profile={profile} saveProfile={saveProfile} onClose={() => setSheet(null)}
      onSaved={() => saved('Nama diperbarui.')} />}
    {sheet === 'mascot' && <MascotSheet profile={profile} saveProfile={saveProfile} onClose={() => setSheet(null)}
      onSaved={() => saved('Maskot & tema diperbarui.')} />}
    {sheet === 'currency' && <CurrencySheet profile={profile} saveProfile={saveProfile} rupiah={rupiah}
      onClose={() => setSheet(null)} onSaved={() => saved('Format rupiah diperbarui.')} />}
    {sheet === 'allocation' && <AllocationSheet buckets={buckets} saveBuckets={saveBuckets}
      onClose={() => setSheet(null)} onSaved={() => saved('Alokasi bucket diperbarui.')} />}
    {sheet === 'buckets' && <BucketManagerSheet onClose={() => setSheet(null)} />}
    {sheet === 'period' && <PeriodSettingsSheet onClose={() => setSheet(null)} />}
    {sheet === 'recurring' && <RecurringIncomeManagerSheet onClose={() => setSheet(null)} />}
    {sheet === 'pin' && <ChangePinSheet hasPin={Boolean(profile.pinHash)} changePin={changePin} onClose={() => setSheet(null)}
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

function AccountSettings() {
  const [status, setStatus] = useState<AccountSyncStatus>(getSyncStatus())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => subscribeSyncStatus(setStatus), [])

  const description = status.state === 'offline' ? 'Offline · perubahan menunggu koneksi'
    : status.conflicts ? `${status.conflicts} perubahan perlu ditinjau`
      : status.pending ? `${status.pending} perubahan menunggu sinkronisasi`
        : status.state === 'syncing' ? 'Sedang menyinkronkan…' : 'Tersinkron'

  async function logout() {
    if (busy) return
    setBusy(true); setError('')
    try {
      await logoutAccount()
      localStorage.removeItem('monee:active-account')
      window.location.assign('/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Belum bisa keluar dari akun. Coba lagi.')
    } finally { setBusy(false) }
  }

  return <SettingsGroup title="Akun">
    <div className="settings-account">
      <div className="settings-account__copy"><strong>Sinkronisasi akun</strong><span>{description}</span>
        <small>Catatanmu tersinkron di semua perangkat. Perubahan saat offline dikirim setelah tersambung kembali.</small></div>
      {error && <InlineError>{error}</InlineError>}
      <Button variant="secondary" loading={busy} onClick={() => { void logout() }}>
        <LogOut size={17} aria-hidden="true" /> Keluar dari akun
      </Button>
    </div>
  </SettingsGroup>
}

function DeleteAllSheet({ expectedPinHash, deleteAllData, onClose }: {
  expectedPinHash: string; deleteAllData: (pin: string | undefined, expectedPinHash: string) => Promise<void>; onClose: () => void
}) {
  const [pin, setPin] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (expectedPinHash && pin.length !== 6) || !confirmed) return
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
        <p>Semua transaksi, bucket, tujuan, dan pengaturan akun akan dihapus permanen dari semua perangkat. Akunmu tetap ada dan bisa membuat ledger baru.</p>
      </div></div>
      {expectedPinHash && <CodeSlots ariaLabel="PIN untuk konfirmasi hapus" value={pin} disabled={busy}
        onChange={value => { setPin(value); setError('') }} />
      }
      <label className="settings-backup-confirm"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} /> Saya paham data akun di semua perangkat akan dihapus permanen.</label>
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button type="submit" variant="danger" loading={busy} disabled={(Boolean(expectedPinHash) && pin.length !== 6) || !confirmed}>Hapus semua data</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
      </div>
    </form>
  </Dialog>
}

function BackupSheet({ mode, onClose, onImported }: {
  mode: 'export' | 'import'; onClose: () => void; onImported: () => Promise<void>
}) {
  const [passphrase, setPassphrase] = useState('')
  const [encrypted, setEncrypted] = useState(true)
  const [fileContents, setFileContents] = useState('')
  const [reading, setReading] = useState(false)
  const readVersion = useRef(0)
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
    if (!fileContents || !confirmed || busy || reading) return
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
          const version = ++readVersion.current
          setFileContents(''); setError('')
          setReading(false)
          if (!file) return
          if (file.size > 20 * 1024 * 1024) { setError('File backup melebihi batas 20 MB.'); return }
          setReading(true)
          void file.text().then(contents => { if (version === readVersion.current) setFileContents(contents) })
            .catch(() => { if (version === readVersion.current) setError('File tidak bisa dibaca.') })
            .finally(() => { if (version === readVersion.current) setReading(false) })
        }} />
      {reading && <Skeleton label="Membaca file backup" />}
      <TextField label="Passphrase (jika backup dienkripsi)" type="password" value={passphrase}
        autoComplete="current-password" disabled={busy} onChange={event => setPassphrase(event.target.value)} />
      <label className="settings-backup-confirm"><input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event => setConfirmed(event.target.checked)} /> Saya paham seluruh data saat ini akan diganti.</label>
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy} disabled={reading || !fileContents || !confirmed}>Validasi & pulihkan</Button>
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

  return <Dialog open presentation="immersive" title="Maskot & Tema" onClose={() => { if (!applying) onClose() }}>
    <Suspense fallback={<Skeleton label="Menyiapkan maskot" />}>
      <MascotCarousel initialIndex={mascotIndex(profile.mascotId)} applying={applying}
        onApply={apply} />
    </Suspense>
    {error && <InlineError>{error}</InlineError>}
  </Dialog>
}

export function AllocationSheet({ buckets, saveBuckets, onClose, onSaved }: {
  buckets: Bucket[]
  saveBuckets: (buckets: Bucket[], expected: Bucket[]) => Promise<void>
  onClose: () => void
  onSaved: () => void
}) {
  const formId = useId()
  const ordered = [...buckets].sort((a, b) => a.sortOrder - b.sortOrder)
  const presetBuckets = ordered.map((bucket, index) =>
    DEFAULT_BUCKETS.find(item => item.id === bucket.id) ?? DEFAULT_BUCKETS[index] ?? bucket)
  const [expected] = useState(() => ordered.map(bucket => ({ ...bucket })))
  const [names, setNames] = useState(() => ordered.map(bucket => bucket.name))
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
      await saveBuckets(ordered.map((bucket, index) => ({
          ...bucket,
          name: names[index]!.trim(),
          allocPercent: parsed[index]!,
          allowOverbudget: permissions[index]!,
        })), expected)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Alokasi belum tersimpan. Coba lagi, ya.')
    } finally { setBusy(false) }
  }

  return <Dialog open sheet title="Alokasi Bucket" onClose={() => { if (!busy) onClose() }} footer={<div className="settings-dialog-actions">
    <Button type="submit" form={formId} loading={busy} disabled={!valid}>Simpan alokasi</Button>
    <Button variant="ghost" disabled={busy} onClick={onClose}>Batal</Button>
  </div>}>
    <form id={formId} className="settings-form" onSubmit={event => { void submit(event) }}>
      <p className="settings-helper">Ubah nama bucket langsung di sini. Pilih Custom sendiri untuk mengubah jatah; total harus 100%.</p>
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
              <TextField className="settings-bucket-name" label={`Nama bucket ${index + 1}`} value={names[index]} required maxLength={32} disabled={busy}
                onChange={event => { setNames(current => current.map((value, i) => i === index ? event.target.value : value)); setError('') }} />
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

function ChangePinSheet({ hasPin, changePin, onClose, onSaved }: {
  hasPin: boolean
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
    if ((hasPin && currentPin.length !== 6) || newPin.length !== 6 || confirmation.length !== 6) {
      setError('Isi kolom PIN yang tersedia dulu, ya.'); return
    }
    if (mismatch) { setError('PIN belum sama. Periksa ulang, ya.'); return }
    if (hasPin && newPin === currentPin) { setError('PIN baru harus berbeda dari PIN sekarang.'); return }
    setBusy(true); setError('')
    try {
      await changePin(currentPin, newPin)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PIN belum bisa diganti. Coba lagi, ya.')
    } finally { setBusy(false) }
  }

  return <Dialog open sheet title={hasPin ? 'Ganti PIN' : 'Atur PIN perangkat'} onClose={() => { if (!busy) onClose() }}>
    <form className="settings-form" onSubmit={event => { void submit(event) }}>
      {hasPin && <CodeSlots ariaLabel="PIN sekarang" value={currentPin} disabled={busy}
        onChange={value => { setCurrentPin(value); setError('') }} />}
      <CodeSlots ariaLabel="PIN baru" value={newPin} disabled={busy}
        onChange={value => { setNewPin(value); setError('') }} />
      <CodeSlots ariaLabel="Ulangi PIN baru" value={confirmation} disabled={busy}
        onChange={value => { setConfirmation(value); setError('') }} />
      {error && <InlineError>{error}</InlineError>}
      <div className="settings-warning"><Lock size={20} aria-hidden="true" /><div>
        <strong>PIN tidak bisa dipulihkan</strong>
        <p>PIN hanya mengunci perangkat ini. PIN tidak diperlukan untuk membuka akun di perangkat baru.</p>
      </div></div>
      <div className="settings-dialog-actions">
        <Button type="submit" loading={busy}>{hasPin ? 'Simpan PIN baru' : 'Aktifkan PIN'}</Button>
        {hasPin && <Button variant="secondary" disabled={busy || currentPin.length !== 6} onClick={() => {
          setBusy(true); setError('')
          void (async () => {
            const db = await openDatabase(), profile = await db.get('profile', 'profile')
            if (!profile) throw new Error('Profil belum tersedia.')
            await persistDevicePin(db, { currentPin, newPin: '', remove: true, expectedPinHash: profile.pinHash })
            await useMoneeStore.getState().load(); notifyDataChanged(); onSaved()
          })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Kunci belum dinonaktifkan.')).finally(() => setBusy(false))
        }}>Nonaktifkan kunci perangkat</Button>}
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
      <p>Ledger akun tersinkron antarperangkat. PIN, jika dipakai, hanya mengunci perangkat ini.</p>
    </div>
  </Dialog>
}
