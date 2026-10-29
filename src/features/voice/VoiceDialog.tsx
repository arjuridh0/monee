import { useState } from 'react'
import { Mic, Square } from 'lucide-react'
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

export function VoiceDialog({ onClose }: { onClose: () => void }) {
  const profile = useMoneeStore(state => state.profile)
  const [text, setText] = useState(''), [issues, setIssues] = useState<string[]>([])
  const [drafts, setDrafts] = useState<VoiceDraft[]>([]), [index, setIndex] = useState(0)
  const [serviceOpen, setServiceOpen] = useState(false), [finished, setFinished] = useState(false)
  const [consent, setConsent] = useState(false)
  function parse(value: string) {
    const state = useMoneeStore.getState()
    const parsed = parseVoice(value, { today: getToday(), categories: state.categories, buckets: state.buckets,
      defaultBucketId: state.profile?.defaultBucketId ?? '' })
    setIssues(parsed.issues); setDrafts(parsed.drafts); setIndex(0); setFinished(false)
  }
  const capture = useVoiceCapture(value => { setText(value); parse(value) })
  const active = capture.status !== 'idle'
  if (serviceOpen) return <VoiceServiceSheet onClose={() => setServiceOpen(false)} />
  if (drafts[index]) return <VoiceDraftReview key={`${index}-${drafts.length}`} draft={drafts[index]!} index={index} total={drafts.length}
    onClose={onClose} onNext={() => { if (index + 1 < drafts.length) setIndex(index + 1); else { setDrafts([]); setFinished(true); setText('') } }} />
  return <Dialog open sheet title="Catat dengan suara" onClose={() => { capture.cancel(); onClose() }}>
    <div className="voice-form">
      <div className="voice-mascot"><MascotCanvas mascotId={profile?.mascotId ?? 'mochi'} size={140}
        state={capture.status === 'listening' ? 'listening' : capture.status === 'processing' ? 'thinking' : 'idle'} /></div>
      <p role="status" className="voice-status">{capture.status === 'requesting' ? 'Menyiapkan mikrofon…'
        : capture.status === 'listening' ? 'Aku mendengarkan. Tap berhenti saat selesai.'
        : capture.status === 'processing' ? 'Mengubah rekaman menjadi teks…'
        : finished ? 'Review selesai. Draft yang kamu simpan ada di riwayat.' : 'Ceritakan transaksimu, lalu periksa draft sebelum menyimpan.'}</p>
      <p className="ui-helper">Contoh: “kemarin ngopi 22rb sama parkir 3rb”. Maksimal 30 detik; jeda suara sekitar 2 detik akan mengakhiri rekaman.</p>
      <label className="voice-consent"><input type="checkbox" checked={consent} disabled={active}
        onChange={event => setConsent(event.target.checked)} />
        <span>Saya setuju audio dikirim ke server Monee lalu ke Groq untuk transkripsi pada sesi ini.</span></label>
      <p className="ui-helper">Kamu juga bisa mengetik di bawah tanpa koneksi.</p>
      {capture.status === 'listening' ? <Button onClick={capture.stop}><Square size={18} aria-hidden="true" />Berhenti rekam</Button>
        : <Button onClick={() => { if (consent) void capture.start() }} disabled={active || !consent}><Mic size={18} aria-hidden="true" />Mulai rekam</Button>}
      {active && <Button variant="ghost" onClick={capture.cancel}>Batalkan rekaman</Button>}
      {capture.error && <InlineError>{capture.error}</InlineError>}
      {capture.needsLogin && <a href="/auth/refresh">Masuk ulang layanan suara</a>}
      <Button variant="secondary" disabled={active} onClick={() => setServiceOpen(true)}>Layanan suara</Button>
      <label className="voice-field">Ucapan atau teks transaksi<textarea rows={3} maxLength={4000} value={text} disabled={active}
        placeholder="Contoh: makan 25rb dan setor tabungan 100rb" onChange={event => setText(event.target.value)} /></label>
      {issues.map((issue, i) => <InlineError key={i}>{issue}</InlineError>)}
      <Button disabled={active || !text.trim()} onClick={() => parse(text)}>Buat draft</Button>
      <Button variant="ghost" onClick={() => { capture.cancel(); onClose() }}>Kembali ke input manual</Button>
    </div>
  </Dialog>
}
