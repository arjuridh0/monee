export interface VoiceRecording { stop(): void; result: Promise<Blob> }

/** Owns the stream, timers and optional silence detector for exactly one utterance. */
export async function startRecording(signal: AbortSignal): Promise<VoiceRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Mikrofon belum didukung di browser ini. Ketik manual, ya.')
  }
  if (signal.aborted) throw new Error('Rekaman dibatalkan.')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const release = () => stream.getTracks().forEach(track => track.stop())
  if (signal.aborted) { release(); throw new Error('Rekaman dibatalkan.') }
  let recorder: MediaRecorder
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch { release(); throw new Error('Rekaman belum bisa dimulai. Ketik manual, ya.') }

  let finished = false, maxTimer = 0, silenceTimer = 0
  let context: AudioContext | undefined
  let resolveAudio!: (audio: Blob) => void, rejectAudio!: (error: Error) => void
  const chunks: Blob[] = []
  let bytes = 0
  const result = new Promise<Blob>((resolve, reject) => { resolveAudio = resolve; rejectAudio = reject })
  const cleanup = () => {
    window.clearTimeout(maxTimer); window.clearInterval(silenceTimer)
    signal.removeEventListener('abort', abort)
    release()
    if (context) void context.close().catch(() => undefined)
    chunks.length = 0
  }
  const fail = (message: string) => {
    if (finished) return
    finished = true
    // Disable handlers first: stopping a cancelled recorder must never resolve/upload audio.
    recorder.onstop = null; recorder.ondataavailable = null; recorder.onerror = null
    if (recorder.state !== 'inactive') { try { recorder.stop() } catch { /* Already stopped. */ } }
    cleanup(); rejectAudio(new Error(message))
  }
  const abort = () => fail('Rekaman dibatalkan.')
  const stop = () => { if (!finished && recorder.state !== 'inactive') recorder.stop() }
  recorder.ondataavailable = event => {
    bytes += event.data.size
    if (bytes > 10 * 1024 * 1024) { fail('Rekaman terlalu besar. Ulangi lebih singkat, ya.'); return }
    if (event.data.size) chunks.push(event.data)
  }
  recorder.onerror = () => fail('Rekaman terputus. Ulangi atau ketik manual, ya.')
  recorder.onstop = () => {
    if (finished) return
    finished = true
    const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' })
    cleanup()
    if (!blob.size) rejectAudio(new Error('Rekaman kosong. Ulangi atau ketik manual, ya.'))
    else resolveAudio(blob)
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    recorder.start(250)
    maxTimer = window.setTimeout(stop, 30000)
    // Optional VAD: after speech is detected, two seconds of silence ends the utterance.
    if (typeof AudioContext !== 'undefined') {
      try {
        context = new AudioContext()
        const analyser = context.createAnalyser(); analyser.fftSize = 512
        context.createMediaStreamSource(stream).connect(analyser)
        const samples = new Uint8Array(analyser.fftSize)
        let heardSpeech = false, lastSpeech = performance.now()
        silenceTimer = window.setInterval(() => {
          analyser.getByteTimeDomainData(samples)
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length)
          if (rms > 0.025) { heardSpeech = true; lastSpeech = performance.now() }
          if (heardSpeech && performance.now() - lastSpeech >= 2000) stop()
        }, 100)
        void context.resume().catch(() => undefined)
      } catch { /* Manual stop and 30-second limit remain available without Web Audio. */ }
    }
  } catch { fail('Rekaman belum bisa dimulai. Ketik manual, ya.') }
  return { stop, result }
}
