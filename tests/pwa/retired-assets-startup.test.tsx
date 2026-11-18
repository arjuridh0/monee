import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPwaState, usePwa } from '@/pwa/pwa-state'

vi.mock('@/pwa/service-worker', () => ({
  observeServiceWorker: (listener: (status: { needRefresh: boolean; offlineReady: boolean }) => void) => {
    listener({ needRefresh: false, offlineReady: true })
    return () => undefined
  },
  acceptServiceWorkerUpdate: vi.fn(),
}))

beforeEach(() => resetPwaState())
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('retired assets at PWA startup', () => {
  it('starts cleanup once across subscribers without waiting for deletion to finish', async () => {
    let complete!: (deleted: boolean) => void
    const deleteCache = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve }))
    vi.stubGlobal('caches', { delete: deleteCache })
    const { result, rerender } = renderHook(() => [usePwa(), usePwa()])
    expect(deleteCache).toHaveBeenCalledExactlyOnceWith('monee-mascot-models-v1')
    expect(result.current.every(state => state.offlineReady)).toBe(true)
    rerender()
    expect(deleteCache).toHaveBeenCalledOnce()
    await act(async () => { complete(true) })
  })

  it('keeps PWA startup working when CacheStorage is unsupported', () => {
    vi.stubGlobal('caches', undefined)
    const { result } = renderHook(() => usePwa())
    expect(result.current.offlineReady).toBe(true)
    expect(result.current.message).toBe('')
  })

  it('keeps PWA startup working when cache deletion is rejected', async () => {
    const deleteCache = vi.fn().mockRejectedValue(new Error('Cache access denied'))
    vi.stubGlobal('caches', { delete: deleteCache })
    const { result } = renderHook(() => usePwa())
    await act(async () => { await Promise.resolve() })
    expect(deleteCache).toHaveBeenCalledExactlyOnceWith('monee-mascot-models-v1')
    expect(result.current.offlineReady).toBe(true)
    expect(result.current.message).toBe('')
  })
})
