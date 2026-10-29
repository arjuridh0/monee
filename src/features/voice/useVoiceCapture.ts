import { useEffect, useRef, useState } from 'react'
import { transcribeAudio, VoiceAccessError } from '@/core/stt/transcribe'
import { startRecording, type VoiceRecording } from './recorder'

export function useVoiceCapture(onText: (text: string) => void) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'listening' | 'processing'>('idle')
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const recording = useRef<VoiceRecording | null>(null)
  const callback = useRef(onText); callback.current = onText
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) { controller.current?.abort(); setStatus('idle') }
    }
    document.addEventListener('visibilitychange', hidden)
    return () => { document.removeEventListener('visibilitychange', hidden); controller.current?.abort(); controller.current = null }
  }, [])

  async function start() {
    if (controller.current) return
    setError(''); setNeedsLogin(false)
    if (!navigator.onLine) { setError('Voice membutuhkan internet. Ketik transaksi di bawah untuk membuat draft offline.'); return }
    const run = new AbortController(); controller.current = run
    setStatus('requesting')
    try {
      recording.current = await startRecording(run.signal)
      if (!run.signal.aborted) setStatus('listening')
      const audio = await recording.current.result
      if (run.signal.aborted) return
      setStatus('processing')
      const text = await transcribeAudio(audio, run.signal)
      if (!run.signal.aborted && controller.current === run) callback.current(text)
    } catch (cause) {
      if (!run.signal.aborted && controller.current === run) {
        setNeedsLogin(cause instanceof VoiceAccessError)
        setError(cause instanceof Error && cause.name !== 'NotAllowedError' ? cause.message : 'Izin mikrofon belum diberikan. Izinkan mikrofon atau ketik manual, ya.')
      }
    } finally {
      if (controller.current === run) { controller.current = null; recording.current = null; setStatus('idle') }
    }
  }
  return { status, error, needsLogin, start, stop: () => recording.current?.stop(),
    cancel: () => { controller.current?.abort(); setStatus('idle') } }
}
