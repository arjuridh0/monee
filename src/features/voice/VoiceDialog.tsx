import { useState, type CSSProperties } from 'react'
import { ArrowUp, Keyboard, LoaderCircle, Mic, ScanLine, Settings2, Square } from 'lucide-react'
import { Button } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { getToday } from '@/core/finance/period'
import { useMoneeStore } from '@/store'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import { parseVoice, type VoiceDraft } from './parser'
import { useVoiceCapture } from './useVoiceCapture'
import { VoiceServiceSheet } from './VoiceServiceSheet'
import { VoiceDraftReview } from './VoiceDraftReview'
import './voice.css'

export function VoiceDialog({ onClose, onManual = onClose, onReceipt }: { onClose: () => void; onManual?: () => void; onReceipt?: () => void }) {
  const profile = useMoneeStore(state => state.profile)
  const [text, setText] = useState(''), [issues, setIssues] = useState<string[]>([])
  const [drafts, setDrafts] = useState<VoiceDraft[]>([]), [index, setIndex] = useState(0)
  const [serviceOpen, setServiceOpen] = useState(false), [finished, setFinished] = useState(false)
  function parse(value: string) {
    const state = useMoneeStore.getState()
    const parsed = parseVoice(value, { today: getToday(), categories: state.categories, buckets: state.buckets,
      defaultBucketId: state.profile?.defaultBucketId ?? '' })
    setIssues(parsed.issues); setDrafts(parsed.drafts); setIndex(0); setFinished(false)
  }
  const capture = useVoiceCapture(value => { setText(value); parse(value) })
  const active = capture.status !== 'idle'
  const listening = capture.status === 'listening'
  const seconds = Math.min(30, Math.floor(capture.progress.elapsedMs / 1000))
  const level = capture.progress.level ?? 0
  if (serviceOpen) return <VoiceServiceSheet onClose={() => setServiceOpen(false)} />
  if (drafts[index]) return <VoiceDraftReview key={`${index}-${drafts.length}`} draft={drafts[index]!} index={index} total={drafts.length}
    transcript={text} issues={issues}
    onClose={onClose} onNext={() => { if (index + 1 < drafts.length) setIndex(index + 1); else { capture.cancel(); setDrafts([]); setFinished(true); setText('') } }} />
  return <Dialog open sheet title="Catat dengan suara" onClose={() => { capture.cancel(); onClose() }}>
    <div className="voice-form">
      <div className={`voice-capture voice-capture--${capture.status}`} style={{ '--voice-level': level } as CSSProperties}>
        <div className="voice-mascot">
          <span className="voice-halo" aria-hidden="true" />
          <MascotCanvas mascotId={profile?.mascotId ?? 'mochi'} size={176}
            state={listening ? 'listening' : active ? 'thinking' : 'idle'} />
        </div>
        <p role="status" aria-atomic="true" className="voice-status">
          {(capture.status === 'requesting' || capture.status === 'processing') && <LoaderCircle className="voice-spinner" size={18} aria-hidden="true" />}
          {capture.status === 'requesting' ? 'Menunggu izin mikrofon…'
            : listening ? 'Aku mendengarkan. Ceritakan transaksimu.'
            : capture.status === 'processing' ? 'Mengubah suara menjadi teks dan draft…'
            : finished ? 'Review selesai. Draft yang kamu simpan ada di riwayat.' : 'Ceritakan transaksimu, lalu periksa draft sebelum menyimpan.'}
        </p>
        <button type="button" className="voice-record-button" data-state={capture.status}
          aria-label={listening ? 'Berhenti rekam' : capture.status === 'requesting' ? 'Menyiapkan mikrofon' : capture.status === 'processing' ? 'Memproses rekaman' : capture.error ? 'Coba rekam ulang' : 'Mulai rekam'}
          aria-pressed={listening} aria-busy={active && !listening || undefined} disabled={active && !listening}
          onClick={() => { if (listening) capture.stop(); else void capture.start() }}>
          {listening ? <Square size={23} fill="currentColor" aria-hidden="true" /> : active ? <LoaderCircle className="voice-spinner" size={30} aria-hidden="true" /> : <Mic size={30} strokeWidth={1.8} aria-hidden="true" />}
        </button>
        {!active && <span className="voice-record-caption">{capture.error ? 'Ketuk untuk mencoba lagi' : 'Ketuk untuk bicara'}</span>}
        {listening && <>
          <div className="voice-level" role="meter" aria-label="Level suara mikrofon" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)} aria-valuetext={capture.progress.level === null ? 'Level suara tidak tersedia' : `${Math.round(level * 100)} persen`}>
            {[0.4, 0.65, 0.85, 1, 0.85, 0.65, 0.4].map((weight, i) => <span key={i} aria-hidden="true"
              style={{ transform: `scaleY(${0.12 + level * weight * 0.88})` }} />)}
          </div>
          <p className="voice-timer" aria-label={`Durasi rekaman ${seconds} detik, maksimal 30 detik`}>00:{String(seconds).padStart(2, '0')} / 00:30</p>
          <p className="ui-helper voice-capture-hint">{capture.progress.autoStopAvailable
            ? capture.progress.speechDetected ? 'Sudah terdengar. Jeda sekitar 2 detik untuk membuat draft otomatis.' : 'Mulai bicara, ya. Jika belum terdengar dalam 8 detik, kamu bisa mencoba lagi.'
            : 'Tap Berhenti rekam saat selesai. Rekaman dibatasi 30 detik.'}</p>
        </>}
        {capture.status === 'requesting' && <p className="ui-helper voice-capture-hint">Izinkan mikrofon pada pop-up browser. Kamu bisa membatalkan sambil menunggu.</p>}
        {capture.status === 'processing' && <p className="ui-helper voice-capture-hint">Rekaman selesai. Draft akan terbuka otomatis setelah teks siap.</p>}
      </div>
      {active && <Button variant="ghost" onClick={capture.cancel}>{capture.status === 'processing' ? 'Batalkan pemrosesan' : 'Batalkan rekaman'}</Button>}
      {capture.error && <InlineError>{capture.error}</InlineError>}
      {capture.needsLogin && <a href="/auth/refresh">Masuk ulang layanan suara</a>}
      {!active && <>
        <div className="voice-entry-actions">
          <Button variant="secondary" onClick={() => { capture.cancel(); onManual() }}><Keyboard size={18} aria-hidden="true" />Ketik manual</Button>
          {onReceipt && <Button variant="secondary" onClick={onReceipt}><ScanLine size={18} aria-hidden="true" />Scan struk</Button>}
        </div>
        <div className="voice-composer">
          <label className="voice-field">Ucapan atau teks transaksi<textarea rows={2} maxLength={4000} value={text}
            placeholder="Ngopi 22rb dan parkir 3rb…" onChange={event => setText(event.target.value)} /></label>
          <button type="button" className="voice-composer-send" aria-label="Buat draft" disabled={!text.trim()} onClick={() => parse(text)}><ArrowUp size={20} aria-hidden="true" /></button>
        </div>
        {issues.map((issue, i) => <InlineError key={i}>{issue}</InlineError>)}
        <div className="voice-service-link"><p className="ui-helper">Audio dikirim melalui server Monee ke Groq saat kamu merekam. Teks bisa diproses tanpa internet.</p>
          <Button variant="ghost" onClick={() => setServiceOpen(true)} aria-label="Layanan suara"><Settings2 size={18} aria-hidden="true" /></Button></div>
      </>}
    </div>
  </Dialog>
}
