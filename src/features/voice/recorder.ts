export interface VoiceRecording { stop(): void; result: Promise<Blob> }
export interface VoiceProgress {
  elapsedMs: number
  /** Normalized RMS level; null when Web Audio is unavailable. */
  level: number | null
  speechDetected: boolean
  autoStopAvailable: boolean
}

/** Permission prompts cannot be dismissed programmatically; release any late grant. */
function requestMicrophone(signal: AbortSignal): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Rekaman dibatalkan.'))
    signal.addEventListener('abort', abort, { once: true })
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); abort() }
      else resolve(stream)
    }, cause => { signal.removeEventListener('abort', abort); reject(cause) })
  })
}

/** Owns the stream, timers and optional silence detector for exactly one utterance. */
export async function startRecording(signal: AbortSignal, onProgress?: (progress: VoiceProgress) => void): Promise<VoiceRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Mikrofon belum didukung di browser ini. Ketik manual, ya.')
  }
  if (signal.aborted) throw new Error('Rekaman dibatalkan.')
  const stream = await requestMicrophone(signal)
  const release = () => stream.getTracks().forEach(track => track.stop())
  if (signal.aborted) { release(); throw new Error('Rekaman dibatalkan.') }
  let recorder: MediaRecorder
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch { release(); throw new Error('Rekaman belum bisa dimulai. Ketik manual, ya.') }

  let finished = false, stopping = false, maxTimer = 0, progressTimer = 0
  let context: AudioContext | undefined
  let analyser: AnalyserNode | undefined, samples: Uint8Array<ArrayBuffer> | undefined
  let heardSpeech = false, speechFrames = 0, lastSpeech = 0, analysedMs = 0
  const startedAt = performance.now()
  let resolveAudio!: (audio: Blob) => void, rejectAudio!: (error: Error) => void
  const chunks: Blob[] = []
  let bytes = 0
  const result = new Promise<Blob>((resolve, reject) => { resolveAudio = resolve; rejectAudio = reject })
  const cleanup = () => {
    window.clearTimeout(maxTimer); window.clearInterval(progressTimer)
    signal.removeEventListener('abort', abort)
    stream.getTracks().forEach(track => track.removeEventListener?.('ended', disconnected))
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
  const disconnected = () => fail('Mikrofon terputus. Sambungkan kembali, lalu coba rekam ulang.')
  const stop = () => {
    if (finished || stopping || recorder.state === 'inactive') return
    if (analysedMs >= 300 && !heardSpeech) { fail('Suara belum terdengar. Dekatkan mikrofon, lalu coba rekam ulang.'); return }
    stopping = true
    try { recorder.stop() } catch { fail('Rekaman terputus. Coba rekam ulang atau ketik manual, ya.') }
  }
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
  stream.getTracks().forEach(track => track.addEventListener?.('ended', disconnected))
  try {
    recorder.start(250)
    maxTimer = window.setTimeout(stop, 30000)
    // Web Audio is optional: manual stop and the duration limit work without it.
    if (typeof AudioContext !== 'undefined') {
      try {
        context = new AudioContext()
        analyser = context.createAnalyser(); analyser.fftSize = 512
        context.createMediaStreamSource(stream).connect(analyser)
        samples = new Uint8Array(analyser.fftSize)
        void context.resume().catch(() => undefined)
      } catch { /* Manual stop and 30-second limit remain available without Web Audio. */ }
    }
    progressTimer = window.setInterval(() => {
      if (finished || stopping) return
      const now = performance.now()
      let level: number | null = null
      if (analyser && samples && context?.state === 'running') {
        try {
          analyser.getByteTimeDomainData(samples)
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length)
          level = Math.min(1, rms * 5)
          analysedMs += 100
          if (rms > 0.025) {
            speechFrames++; lastSpeech = now
            // Ignore isolated clicks before enabling end-of-speech detection.
            if (speechFrames >= 3) heardSpeech = true
          } else speechFrames = 0
        } catch { analyser = undefined }
      }
      onProgress?.({ elapsedMs: now - startedAt, level, speechDetected: heardSpeech, autoStopAvailable: level !== null })
      if (level !== null && !heardSpeech && analysedMs >= 8000) fail('Suara belum terdengar. Dekatkan mikrofon, lalu coba rekam ulang.')
      else if (level !== null && heardSpeech && now - lastSpeech >= 2000) stop()
    }, 100)
  } catch { fail('Rekaman belum bisa dimulai. Ketik manual, ya.') }
  return { stop, result }
}
