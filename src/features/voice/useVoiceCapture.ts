import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio, VoiceAccessError } from '@/core/stt/transcribe'
import { startRecording, type VoiceProgress, type VoiceRecording } from './recorder'

const initialProgress: VoiceProgress = { elapsedMs: 0, level: null, speechDetected: false, autoStopAvailable: false }

export function useVoiceCapture(onText: (text: string) => void) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'listening' | 'processing'>('idle')
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const [progress, setProgress] = useState(initialProgress)
  const controller = useRef<AbortController | null>(null)
  const recording = useRef<VoiceRecording | null>(null)
  const callback = useRef(onText); callback.current = onText
  const cancel = useCallback(() => {
    const run = controller.current
    // Invalidate first so late permission/results cannot occupy a newer session.
    controller.current = null; recording.current = null
    run?.abort()
    setProgress(initialProgress); setStatus('idle'); setError(''); setNeedsLogin(false)
  }, [])
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      const run = controller.current
      controller.current = null; recording.current = null; run?.abort()
    }
  }, [cancel])

  async function start() {
    if (controller.current) return
    setError(''); setNeedsLogin(false); setProgress(initialProgress)
    if (!navigator.onLine) { setError('Voice membutuhkan internet. Ketik transaksi di bawah untuk membuat draft offline.'); return }
    const run = new AbortController(); controller.current = run
    setStatus('requesting')
    try {
      const current = await startRecording(run.signal, value => {
        if (!run.signal.aborted && controller.current === run) setProgress(value)
      })
      if (run.signal.aborted || controller.current !== run) { void current.result.catch(() => undefined); return }
      recording.current = current
      setStatus('listening')
      const audio = await current.result
      if (run.signal.aborted) return
      setStatus('processing')
      const text = await transcribeAudio(audio, run.signal)
      if (!run.signal.aborted && controller.current === run) callback.current(text)
    } catch (cause) {
      if (!run.signal.aborted && controller.current === run) {
        setNeedsLogin(cause instanceof VoiceAccessError)
        const name = cause instanceof Error || cause instanceof DOMException ? cause.name : ''
        setError(name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Izin mikrofon belum diberikan. Izinkan mikrofon di pengaturan browser, lalu coba rekam ulang atau ketik manual.'
          : name === 'NotFoundError' ? 'Mikrofon tidak ditemukan. Sambungkan mikrofon, lalu coba rekam ulang.'
          : name === 'NotReadableError' ? 'Mikrofon sedang digunakan atau tidak bisa dibuka. Tutup aplikasi perekam lain, lalu coba lagi.'
          : cause instanceof Error ? cause.message : 'Rekaman belum bisa dimulai. Coba rekam ulang atau ketik manual, ya.')
      }
    } finally {
      if (controller.current === run) { controller.current = null; recording.current = null; setStatus('idle') }
    }
  }
  return { status, error, needsLogin, progress, start,
    stop: () => { if (recording.current) { setStatus('processing'); recording.current.stop() } }, cancel }
}
