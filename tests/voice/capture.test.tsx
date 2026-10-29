import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceCapture } from '@/features/voice/useVoiceCapture'
import { startRecording } from '@/features/voice/recorder'
import { transcribeAudio } from '@/core/stt/transcribe'

vi.mock('@/features/voice/recorder', () => ({ startRecording: vi.fn() }))
vi.mock('@/core/stt/transcribe', async importOriginal => ({ ...await importOriginal<typeof import('@/core/stt/transcribe')>(), transcribeAudio: vi.fn() }))
beforeEach(() => { vi.resetAllMocks() })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('voice capture session', () => {
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
