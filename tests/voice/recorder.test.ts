import { afterEach, describe, expect, it, vi } from 'vitest'
import { startRecording } from '@/features/voice/recorder'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
function setup() {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] }
  const recorders: Recorder[] = []
  class Recorder {
    constructor() { recorders.push(this) }
    static isTypeSupported = (type: string) => type === 'audio/mp4'
    state = 'inactive'
    mimeType = 'audio/mp4'
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: (() => void) | null = null
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop?.() }
  }
  vi.stubGlobal('MediaRecorder', Recorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } })
  return { stop, stream, recorders }
}
describe('recording lifetime', () => {
  it('returns audio with a supported MIME and releases the microphone', async () => {
    const { stop } = setup()
    const capture = await startRecording(new AbortController().signal)
    capture.stop()
    expect((await capture.result).type).toBe('audio/mp4')
    expect(stop).toHaveBeenCalled()
  })
  it('limits recording to 30 seconds', async () => {
    vi.useFakeTimers(); const { stop } = setup()
    const capture = await startRecording(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(30000)
    expect((await capture.result).size).toBeGreaterThan(0)
    expect(stop).toHaveBeenCalled()
  })
  it('ends an utterance after speech followed by two seconds of silence', async () => {
    vi.useFakeTimers(); const { stop } = setup()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    let speaking = true
    const close = vi.fn().mockResolvedValue(undefined)
    class Context {
      state = 'running'
      close = close
      resume = () => Promise.resolve()
      createMediaStreamSource() { return { connect() {} } }
      createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(speaking ? 150 : 128) } }
    }
    vi.stubGlobal('AudioContext', Context)
    const capture = await startRecording(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(400)
    speaking = false
    await vi.advanceTimersByTimeAsync(2000)
    expect((await capture.result).size).toBeGreaterThan(0)
    expect(stop).toHaveBeenCalled(); expect(close).toHaveBeenCalled()
  })
  it('discards the result when aborted', async () => {
    const { stop } = setup(); const controller = new AbortController()
    const capture = await startRecording(controller.signal)
    const rejected = expect(capture.result).rejects.toThrow(/dibatalkan/)
    controller.abort(); await rejected
    expect(stop).toHaveBeenCalled()
  })
  it('stops and discards chunks once the combined managed upload exceeds 10 MiB', async () => {
    const { stop, recorders } = setup()
    const capture = await startRecording(new AbortController().signal)
    const rejected = expect(capture.result).rejects.toThrow(/terlalu besar/i)
    recorders[0]!.ondataavailable?.({ data: new Blob([new Uint8Array(6 * 1024 * 1024)]) })
    recorders[0]!.ondataavailable?.({ data: new Blob([new Uint8Array(5 * 1024 * 1024)]) })
    capture.stop()
    await rejected
    expect(stop).toHaveBeenCalled()
    expect(recorders[0]!.state).toBe('inactive')
  })
  it('releases late streams when closed while permission is pending', async () => {
    const { stop, stream } = setup(); const controller = new AbortController()
    let grant!: (stream: unknown) => void
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise(resolve => { grant = resolve }))
    const pending = startRecording(controller.signal)
    controller.abort(); grant(stream)
    await expect(pending).rejects.toThrow(/dibatalkan/)
    expect(stop).toHaveBeenCalled()
  })
  it('settles cancellation before a pending microphone permission is granted', async () => {
    const { stop, stream } = setup(); const controller = new AbortController()
    let grant!: (stream: unknown) => void
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(new Promise(resolve => { grant = resolve }))
    const pending = startRecording(controller.signal)
    const rejected = expect(pending).rejects.toThrow(/dibatalkan/)
    controller.abort()
    await rejected
    grant(stream)
    await Promise.resolve()
    expect(stop).toHaveBeenCalledOnce()
  })
  it('reports real levels and rejects silence without producing audio to upload', async () => {
    vi.useFakeTimers(); const { stop } = setup()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    const close = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('AudioContext', class {
      state = 'running'
      close = close
      resume = () => Promise.resolve()
      createMediaStreamSource() { return { connect() {} } }
      createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128) } }
    })
    const progress = vi.fn()
    const capture = await startRecording(new AbortController().signal, progress)
    const rejected = expect(capture.result).rejects.toThrow(/belum terdengar/i)
    await vi.advanceTimersByTimeAsync(8000)
    await rejected
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ level: 0, autoStopAvailable: true, speechDetected: false }))
    expect(stop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps manual stop available when Web Audio cannot resume', async () => {
    vi.useFakeTimers(); setup()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    vi.stubGlobal('AudioContext', class {
      state = 'suspended'
      close = () => Promise.resolve()
      resume = () => Promise.reject(new Error('blocked'))
      createMediaStreamSource() { return { connect() {} } }
      createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128) } }
    })
    const progress = vi.fn(), capture = await startRecording(new AbortController().signal, progress)
    await vi.advanceTimersByTimeAsync(10000)
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ elapsedMs: 10000, level: null, autoStopAvailable: false }))
    capture.stop()
    expect((await capture.result).size).toBeGreaterThan(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('discards audio and releases resources when a microphone track disconnects', async () => {
    const { stop, stream } = setup(), track = new EventTarget()
    Object.assign(track, { stop })
    vi.spyOn(stream, 'getTracks').mockReturnValue([track as unknown as { stop: typeof stop }])
    const capture = await startRecording(new AbortController().signal)
    const rejected = expect(capture.result).rejects.toThrow(/Mikrofon terputus/)
    track.dispatchEvent(new Event('ended'))
    await rejected
    expect(stop).toHaveBeenCalledOnce()
  })
  it('does not count a short click as speech and falls back when audio analysis is unavailable', async () => {
    vi.useFakeTimers(); setup()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    let loud = true
    vi.stubGlobal('AudioContext', class {
      state = 'running'
      close = () => Promise.resolve()
      resume = () => Promise.resolve()
      createMediaStreamSource() { return { connect() {} } }
      createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(loud ? 150 : 128) } }
    })
    const capture = await startRecording(new AbortController().signal)
    const rejected = expect(capture.result).rejects.toThrow(/belum terdengar/i)
    await vi.advanceTimersByTimeAsync(100); loud = false
    await vi.advanceTimersByTimeAsync(7900); await rejected
    vi.stubGlobal('AudioContext', undefined)
    const progress = vi.fn(), fallback = await startRecording(new AbortController().signal, progress)
    await vi.advanceTimersByTimeAsync(10000)
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ level: null, autoStopAvailable: false }))
    fallback.stop()
    expect((await fallback.result).size).toBeGreaterThan(0)
  })
})
