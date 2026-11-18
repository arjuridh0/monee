import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupRetiredAssetCaches } from '@/pwa/retired-assets'

afterEach(() => vi.unstubAllGlobals())

describe('retired 3D asset cache cleanup', () => {
  it('deletes only the exact retired model cache without listing any other caches', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true)
    const caches = { delete: deleteCache, keys: vi.fn(() => { throw new Error('Must not enumerate caches') }) }
    await cleanupRetiredAssetCaches(caches)
    expect(deleteCache).toHaveBeenCalledExactlyOnceWith('monee-mascot-models-v1')
    expect(caches.keys).not.toHaveBeenCalled()
  })

  it('does nothing when CacheStorage is unsupported', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(cleanupRetiredAssetCaches()).resolves.toBeUndefined()
  })

  it('treats an already removed cache as successful cleanup', async () => {
    const deleteCache = vi.fn().mockResolvedValue(false)
    await expect(cleanupRetiredAssetCaches({ delete: deleteCache })).resolves.toBeUndefined()
    expect(deleteCache).toHaveBeenCalledExactlyOnceWith('monee-mascot-models-v1')
  })

  it('contains deletion rejections so they cannot fail application startup', async () => {
    const deleteCache = vi.fn().mockRejectedValue(new Error('Cache storage denied'))
    await expect(cleanupRetiredAssetCaches({ delete: deleteCache })).resolves.toBeUndefined()
  })

  it('contains synchronous CacheStorage failures too', async () => {
    const deleteCache = vi.fn(() => { throw new Error('Cache storage unavailable') })
    await expect(cleanupRetiredAssetCaches({ delete: deleteCache })).resolves.toBeUndefined()
  })
})
