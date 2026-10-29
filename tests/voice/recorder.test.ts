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
      close = close
      resume = () => Promise.resolve()
      createMediaStreamSource() { return { connect() {} } }
      createAnalyser() { return { fftSize: 512, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(speaking ? 150 : 128) } }
    }
    vi.stubGlobal('AudioContext', Context)
    const capture = await startRecording(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(100)
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
})
