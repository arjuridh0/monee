import { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, CircleAlert } from 'lucide-react'
import { applyMascotTheme, MASCOT_THEMES, type MascotId } from '@/theme/mascot-themes'
import { Button, Card, Chip, ProgressBar, TextField, Toggle } from '@/components/ui/controls'
import { EmptyState, InlineError, Skeleton, Toast } from '@/components/ui/feedback'
import { BottomSheet, Dialog } from '@/components/ui/Dialog'
import { FlipCard } from '@/components/reactbits/FlipCard'
import { CodeSlots } from '@/components/reactbits/CodeSlots'
import { RubberSegment } from '@/components/reactbits/RubberSegment'
import { FuseButton } from '@/components/reactbits/FuseButton'
import { MascotCarousel } from '@/features/mascot/MascotCarousel'
import { MASCOT_OPTIONS } from '@/features/mascot/mascot-options'
import './playground.css'

export function UIPlayground() {
  const [theme, setTheme] = useState<MascotId>('mochi')
  const [overbudget, setOverbudget] = useState(false)
  const [category, setCategory] = useState('Makan')
  const [showError, setShowError] = useState(false)
  const [amount, setAmount] = useState('25.000')
  const [pin, setPin] = useState('')
  const [pinStatus, setPinStatus] = useState<'idle' | 'error' | 'success'>('idle')
  const [feedback, setFeedback] = useState('Kosong')
  const [dialog, setDialog] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [toast, setToast] = useState('')
  const [actions, setActions] = useState(0)
  const [undoWindow, setUndoWindow] = useState(2000)
  const dismissToast = useCallback(() => setToast(''), [])
  useEffect(() => applyMascotTheme(theme), [theme])

  return <div className="demo-page">
    <header className="demo-header">
      <h1>Ruang coba UI</h1>
      <p>Warm Clay, komponen, dan gerak sebelum menjadi layar aplikasi.</p>
      <span className="demo-badge"><Check size={14} aria-hidden="true" /> Data contoh</span>
      <p className="ui-helper">Tidak menulis data keuangan. Tema pratinjau tidak mengubah profil.</p>
    </header>

    <div className="demo-stack">
      <h2 className="demo-section-title">Pilih suasanamu</h2>
      <RubberSegment aria-label="Tema maskot" value={theme}
        items={Object.values(MASCOT_THEMES).map(t => ({ value: t.id, label: t.name }))}
        onChange={value => {
          const next = Object.values(MASCOT_THEMES).find(t => t.id === value)
          if (next) setTheme(next.id)
        }} />
    </div>

    <Card className="demo-stack">
      <h2 className="demo-section-title">Carousel maskot 3D</h2>
      <p className="demo-secondary">Drag, scroll, atau pakai panah. Kartu tengah frontal dan latar berganti mengikuti maskot aktif.</p>
      <div className="demo-carousel">
        <MascotCarousel
          key={theme}
          initialIndex={MASCOT_OPTIONS.findIndex(option => option.id === theme)}
          onApply={(id) => {
            setTheme(id)
            setToast(`${MASCOT_THEMES[id].name} dipilih. Pratinjau tema saja; profil tidak diubah.`)
          }}
        />
      </div>
    </Card>

    <section className="demo-stack" aria-labelledby="flip-title">
      <h2 id="flip-title" className="demo-section-title">Dua sisi, dua konteks</h2>
      <FlipCard front={<div className="demo-stack">
        <p className="demo-amount font-tabular">Rp4.800.000</p>
        <div className="demo-money-meta"><span><ArrowDownLeft size={15} /> Masuk Rp6,2jt</span>
          <span><ArrowUpRight size={15} /> Keluar Rp1,4jt</span></div>
        <p className="ui-helper">Belanja Rp900rb + setoran Rp500rb. Contoh, bukan saldo pribadi.</p>
      </div>} back={<div className="demo-stack">
        <p className="demo-amount font-tabular">Rp1.540.000</p>
        <div className="demo-compartments"><div><span>Sisa</span><strong>Rp340.000</strong></div>
          <div><span>Allocation</span><strong>Rp1.200.000</strong></div></div>
        <p>Isi berganti seluruhnya, bukan hanya nominal.</p>
      </div>} />
    </section>

    <Card className="demo-stack">
      <h2 className="demo-section-title">Jatah & batas</h2>
      <div className="demo-budget-label"><span>Kebutuhan Pokok</span><strong>16,1%</strong></div>
      <ProgressBar label="Kebutuhan Pokok" value={16.1} />
      <p className="ui-helper">Rp400rb dari Rp2,48jt</p>
      <div className="demo-budget-label"><span>Fun</span><strong className="demo-danger">Penuh · 100%</strong></div>
      <ProgressBar label="Fun" value={100} />
      <Toggle label="Boleh lewat batas" hint="Saldo periode tetap diperiksa." checked={overbudget} onChange={setOverbudget} />
      {!overbudget && <InlineError>Jatah Fun habis. Pilih bucket lain atau tambah pemasukan.</InlineError>}
    </Card>

    <Card className="demo-stack">
      <h2 className="demo-section-title">Form yang jelas</h2>
      <TextField label="Nominal" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)}
        {...(showError ? { error: 'Saldo tinggal Rp10.000. Kurangi nominal atau catat pemasukan.' } : { hint: 'Isi contoh; tidak akan disimpan.' })} />
      <div className="demo-actions">{['Makan', 'Transport', 'Tabungan'].map(label =>
        <Chip key={label} selected={category === label} onClick={() => setCategory(label)}>{label}</Chip>)}</div>
      <Toggle label="Tampilkan error" checked={showError} onChange={setShowError} />
      <div className="demo-actions"><Button loading>Memuat</Button><Button disabled>Nonaktif</Button></div>
    </Card>

    <Card className="demo-stack">
      <h2 className="demo-section-title">PIN tetap privat</h2>
      <CodeSlots value={pin} onChange={setPin} status={pinStatus} />
      <p className="ui-helper">PIN contoh tidak disimpan atau diverifikasi. Coba keyboard dan paste.</p>
      <div className="demo-actions"><Button variant="secondary" onClick={() => setPinStatus('error')}>Uji PIN salah</Button>
        <Button variant="ghost" onClick={() => { setPin(''); setPinStatus('idle') }}>Reset PIN</Button></div>
    </Card>

    <Card className="demo-stack">
      <h2 className="demo-section-title">Undo tanpa kejutan</h2>
      <p className="demo-secondary">Seluruh tombol menjadi Batal selama jendela undo.</p>
      <RubberSegment aria-label="Jendela undo" items={['2 detik', '4 detik']} value={undoWindow === 2000 ? '2 detik' : '4 detik'}
        onChange={value => setUndoWindow(value === '2 detik' ? 2000 : 4000)} />
      <FuseButton label="Coba simpan" undoWindow={undoWindow} onCommit={() => setActions(n => n + 1)} onUndo={() => setActions(n => n - 1)} />
      <p className="ui-helper" aria-live="polite">Aksi contoh: {actions}. Tidak ada transaksi yang dibuat.</p>
    </Card>

    <Card className="demo-stack">
      <h2 className="demo-section-title">Feedback yang membantu</h2>
      <RubberSegment aria-label="Status data" items={['Kosong', 'Memuat', 'Gagal']} value={feedback} onChange={setFeedback} />
      {feedback === 'Kosong' && <EmptyState title="Belum ada transaksi" message="Mulai dari pemasukan pertamamu."
        action={<Button variant="secondary" onClick={() => setSheet(true)}>Coba formulir</Button>} />}
      {feedback === 'Memuat' && <Skeleton label="Memuat riwayat contoh" />}
      {feedback === 'Gagal' && <div className="demo-stack"><InlineError>Data contoh gagal dimuat. Coba lagi.</InlineError>
        <Button variant="secondary" onClick={() => setFeedback('Kosong')}>Coba lagi</Button></div>}
      <div className="demo-actions"><Button variant="secondary" onClick={() => setDialog(true)}>Buka dialog</Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>Buka sheet</Button>
        <Button variant="ghost" onClick={() => setToast('Contoh notifikasi. Data pribadi tidak berubah.')}>Coba toast</Button></div>
    </Card>

    <Dialog open={dialog} title="Konfirmasi contoh" onClose={() => setDialog(false)}
      footer={<><Button variant="secondary" onClick={() => setDialog(false)}>Kembali</Button>
        <Button onClick={() => { setDialog(false); setToast('Contoh dikonfirmasi.') }}>Konfirmasi</Button></>}>
      <p>Coba Tab, Shift+Tab, dan Escape. Fokus kembali ke pemicu ketika ditutup.</p>
    </Dialog>
    <BottomSheet open={sheet} title="Catat contoh" onClose={() => setSheet(false)}
      footer={<Button onClick={() => { setSheet(false); setToast('Contoh selesai. Tidak ada transaksi disimpan.') }}>Simpan contoh</Button>}>
      <div className="demo-stack"><TextField label="Nominal contoh" inputMode="numeric" placeholder="Rp0" />
        <TextField label="Catatan contoh" placeholder="Opsional" />
        <p className="ui-helper">Form transaksi sesungguhnya dibuat pada FASE 5.</p></div>
    </BottomSheet>
    {toast && <Toast message={toast} onDismiss={dismissToast} />}
  </div>
}

export function UIAnalytics() {
  return <><Card className="demo-stack"><h2 className="demo-section-title">Fondasi, bukan saldo</h2>
    <p className="demo-secondary">Semua angka di ruang coba adalah contoh. Engine dan IndexedDB tidak dipanggil dari halaman ini.</p>
    <div className="demo-note"><CircleAlert size={18} aria-hidden="true" /><p>Onboarding dan PIN Gate aktif dibangun di FASE 4.</p></div>
  </Card><Card className="demo-stack"><h2 className="demo-section-title">Yang perlu dicoba</h2>
    <ul className="demo-checklist"><li>Pindah tema maskot</li><li>Tab dan Shift+Tab</li><li>PIN tanpa digit terbaca</li><li>Undo selama 2 atau 4 detik</li><li>Dialog dan layar sempit</li></ul>
  </Card></>
}
