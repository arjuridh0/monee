const RETIRED_MODEL_CACHE = 'monee-mascot-models-v1'

/** Retire only the old 3D runtime cache; other caches and application storage are untouched. */
export async function cleanupRetiredAssetCaches(cacheStorage?: Pick<CacheStorage, 'delete'>): Promise<void> {
  try {
    // Access inside the try: browser storage policies can reject even reading CacheStorage.
    const storage = cacheStorage ?? globalThis.caches
    if (typeof storage?.delete !== 'function') return
    await storage.delete(RETIRED_MODEL_CACHE)
  } catch {
    // Best effort only. Storage restrictions must never prevent the application starting.
  }
}
