import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceCapture } from '@/features/voice/useVoiceCapture'
import { startRecording } from '@/features/voice/recorder'
import { transcribeAudio, VoiceAccessError } from '@/core/stt/transcribe'

vi.mock('@/features/voice/recorder', () => ({ startRecording: vi.fn() }))
vi.mock('@/core/stt/transcribe', async importOriginal => ({ ...await importOriginal<typeof import('@/core/stt/transcribe')>(), transcribeAudio: vi.fn() }))
beforeEach(() => { vi.resetAllMocks() })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('voice capture session', () => {
  it('clears capture errors and the access prompt when cancelling a completed failed run', async () => {
    vi.mocked(startRecording).mockResolvedValue({ stop: vi.fn(), result: Promise.resolve(new Blob(['a'])) })
    vi.mocked(transcribeAudio).mockRejectedValue(new VoiceAccessError())
    const view = renderHook(() => useVoiceCapture(vi.fn()))
    await act(async () => { await view.result.current.start() })
    expect(view.result.current.error).toMatch(/Sesi login berakhir/)
    expect(view.result.current.needsLogin).toBe(true)
    act(() => { view.result.current.cancel() })
    expect(view.result.current.status).toBe('idle')
    expect(view.result.current.error).toBe('')
    expect(view.result.current.needsLogin).toBe(false)
  })
  it.each([
    ['NotAllowedError', /pengaturan browser/], ['NotFoundError', /tidak ditemukan/], ['NotReadableError', /aplikasi perekam lain/],
  ])('explains microphone %s failures and allows retry', async (name, message) => {
    vi.mocked(startRecording).mockRejectedValueOnce(new DOMException('internal', name))
      .mockResolvedValueOnce({ stop: vi.fn(), result: new Promise(() => {}) })
    const view = renderHook(() => useVoiceCapture(vi.fn()))
    await act(async () => { await view.result.current.start() })
    expect(view.result.current.error).toMatch(message)
    expect(view.result.current.status).toBe('idle')
    expect(view.result.current.needsLogin).toBe(false)
    act(() => { void view.result.current.start() })
    await waitFor(() => expect(view.result.current.status).toBe('listening'))
    expect(view.result.current.error).toBe('')
  })
  it('ignores an old upload response after canceling and starting a new capture', async () => {
    let finish!: (text: string) => void
    vi.mocked(startRecording).mockResolvedValueOnce({ stop: vi.fn(), result: Promise.resolve(new Blob(['a'])) })
      .mockResolvedValueOnce({ stop: vi.fn(), result: new Promise(() => {}) })
    vi.mocked(transcribeAudio).mockReturnValue(new Promise(resolve => { finish = resolve }))
    const parsed = vi.fn(), view = renderHook(() => useVoiceCapture(parsed))
    act(() => { void view.result.current.start() })
    await waitFor(() => expect(view.result.current.status).toBe('processing'))
    const signal = vi.mocked(transcribeAudio).mock.calls[0]![1]!
    act(() => { view.result.current.cancel(); void view.result.current.start() })
    await waitFor(() => expect(view.result.current.status).toBe('listening'))
    await act(async () => { finish('old transcript') })
    expect(signal.aborted).toBe(true)
    expect(parsed).not.toHaveBeenCalled()
    expect(view.result.current.status).toBe('listening')
  })
  it('allows immediate retry while an older permission request is still pending', async () => {
    let grant!: (value: Awaited<ReturnType<typeof startRecording>>) => void
    vi.mocked(startRecording).mockReturnValueOnce(new Promise(resolve => { grant = resolve }))
      .mockResolvedValueOnce({ stop: vi.fn(), result: new Promise(() => {}) })
    const parsed = vi.fn(), view = renderHook(() => useVoiceCapture(parsed))
    act(() => { void view.result.current.start() })
    act(() => { view.result.current.cancel(); void view.result.current.start() })
    await waitFor(() => expect(view.result.current.status).toBe('listening'))
    expect(startRecording).toHaveBeenCalledTimes(2)
    const stopNew = vi.mocked(startRecording).mock.results[1]!
    await act(async () => { grant({ stop: vi.fn(), result: Promise.resolve(new Blob(['old'])) }) })
    expect(view.result.current.status).toBe('listening')
    expect(transcribeAudio).not.toHaveBeenCalled()
    act(() => { view.result.current.stop() })
    expect((await stopNew.value).stop).toHaveBeenCalledOnce()
  })

  it('publishes recording progress and clears it on cancellation', async () => {
    vi.mocked(startRecording).mockResolvedValue({ stop: vi.fn(), result: new Promise(() => {}) })
    const view = renderHook(() => useVoiceCapture(vi.fn()))
    act(() => { void view.result.current.start() })
    await waitFor(() => expect(view.result.current.status).toBe('listening'))
    act(() => { vi.mocked(startRecording).mock.calls[0]![1]?.({ elapsedMs: 1200, level: 0.6, speechDetected: true, autoStopAvailable: true }) })
    expect(view.result.current.progress).toEqual({ elapsedMs: 1200, level: 0.6, speechDetected: true, autoStopAvailable: true })
    act(() => { view.result.current.cancel() })
    expect(view.result.current.progress.elapsedMs).toBe(0)
  })
  it('identifies expired access and resets the login prompt for the next recording', async () => {
    const actual = await vi.importActual<typeof import('@/core/stt/transcribe')>('@/core/stt/transcribe')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const accessError = await actual.transcribeAudio(new Blob(['a'], { type: 'audio/webm' })).catch(error => error)
    vi.mocked(transcribeAudio).mockRejectedValueOnce(accessError).mockRejectedValueOnce(new Error('Provider unavailable'))
    vi.mocked(startRecording).mockResolvedValue({ stop: vi.fn(), result: Promise.resolve(new Blob(['a'])) })
    const view = renderHook(() => useVoiceCapture(vi.fn()))
    act(() => { void view.result.current.start() })
    await waitFor(() => expect(view.result.current.needsLogin).toBe(true))
    act(() => { void view.result.current.start() })
    await waitFor(() => expect(view.result.current.error).toBe('Provider unavailable'))
    expect(view.result.current.needsLogin).toBe(false)
  })

  it('ignores a transcription response after the dialog unmounts', async () => {
    let finish!: (text: string) => void
    vi.mocked(startRecording).mockResolvedValue({ stop: vi.fn(), result: Promise.resolve(new Blob(['a'])) })
    vi.mocked(transcribeAudio).mockReturnValue(new Promise(resolve => { finish = resolve }))
    const parsed = vi.fn(), view = renderHook(() => useVoiceCapture(parsed))
    act(() => { void view.result.current.start() })
    await waitFor(() => expect(view.result.current.status).toBe('processing'))
    const signal = vi.mocked(transcribeAudio).mock.calls[0]![1]!
    view.unmount(); expect(signal.aborted).toBe(true)
    await act(async () => { finish('makan 25rb') })
    expect(parsed).not.toHaveBeenCalled()
  })
  it('cancels a hidden-page recording before any upload', async () => {
    let finish!: (blob: Blob) => void
    vi.mocked(startRecording).mockResolvedValue({ stop: vi.fn(), result: new Promise(resolve => { finish = resolve }) })
    const parsed = vi.fn(), view = renderHook(() => useVoiceCapture(parsed))
    act(() => { void view.result.current.start() })
    await waitFor(() => expect(view.result.current.status).toBe('listening'))
    const signal = vi.mocked(startRecording).mock.calls[0]![0]
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(signal.aborted).toBe(true)
    await act(async () => { finish(new Blob(['a'])) })
    expect(transcribeAudio).not.toHaveBeenCalled(); expect(parsed).not.toHaveBeenCalled()
  })
})
