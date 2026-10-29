import { afterEach, expect, it, vi } from 'vitest'

const resources = vi.hoisted(() => ({
  disposeRenderer: vi.fn(), loseContext: vi.fn(), disposeDraco: vi.fn(),
  disposeGeometry: vi.fn(), disposeMaterial: vi.fn(), render: vi.fn(),
  load: vi.fn(),
}))
vi.mock('three', () => {
  class Object3D {
    position = { sub: vi.fn(), set: vi.fn() }
    scale = { multiplyScalar: vi.fn() }
    updateMatrixWorld() {}
    add() {}
  }
  return {
    SRGBColorSpace: 'srgb', ACESFilmicToneMapping: 4,
    WebGLRenderer: class {
      setPixelRatio() {}; setSize() {}; setClearColor() {}
      render = resources.render
      dispose = resources.disposeRenderer
      forceContextLoss = resources.loseContext
      domElement = { toDataURL: () => 'data:image/webp;base64,mascot' }
    },
    Box3: class { setFromObject() { return this }; getSize(v: { y: number }) { v.y = 1 }; getCenter() {} },
    Vector3: class { y = 1 }, Scene: Object3D, AmbientLight: Object3D, DirectionalLight: Object3D,
    PerspectiveCamera: class extends Object3D { lookAt() {} },
  }
})
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { setDRACOLoader() { return this }; loadAsync = resources.load },
}))
vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class { setDecoderPath() {}; dispose = resources.disposeDraco },
}))

function model() {
  return { scene: {
    scale: { multiplyScalar() {} }, position: { sub() {} }, updateMatrixWorld() {},
    traverse: (visit: (mesh: unknown) => void) => visit({ isMesh: true, geometry: { dispose: resources.disposeGeometry }, material: { dispose: resources.disposeMaterial } }),
  } }
}
afterEach(() => { vi.resetModules(); vi.clearAllMocks() })

it('deduplicates one model across pickers and disposes resources only after the last owner leaves', async () => {
  resources.load.mockResolvedValue(model())
  const snapshots = await import('@/features/mascot/model-snapshot')
  const releaseFirst = snapshots.retainMascotSnapshots()
  const releaseSecond = snapshots.retainMascotSnapshots()
  const first = snapshots.getMascotSnapshot('mochi')
  const duplicate = snapshots.getMascotSnapshot('mochi')
  expect(first).toBe(duplicate)
  await first
  releaseFirst()
  await Promise.resolve()
  expect(resources.disposeRenderer).not.toHaveBeenCalled()
  releaseSecond()
  await Promise.resolve()
  expect(resources.load).toHaveBeenCalledOnce()
  expect(resources.disposeGeometry).toHaveBeenCalledOnce()
  expect(resources.disposeMaterial).toHaveBeenCalledOnce()
  expect(resources.disposeRenderer).toHaveBeenCalledOnce()
  expect(resources.loseContext).toHaveBeenCalledOnce()
  expect(resources.disposeDraco).toHaveBeenCalledOnce()
})

it('allows an unmounted pending snapshot to finish before disposing its renderer', async () => {
  let resolveLoad!: (value: ReturnType<typeof model>) => void
  resources.load.mockImplementation(() => new Promise(resolve => { resolveLoad = resolve }))
  const snapshots = await import('@/features/mascot/model-snapshot')
  const release = snapshots.retainMascotSnapshots()
  const pending = snapshots.getMascotSnapshot('luna')
  await vi.waitFor(() => expect(resources.load).toHaveBeenCalledOnce())
  release()
  expect(resources.disposeRenderer).not.toHaveBeenCalled()
  resolveLoad(model())
  await pending
  await Promise.resolve()
  expect(resources.render).toHaveBeenCalledOnce()
  expect(resources.disposeRenderer).toHaveBeenCalledOnce()
})

it('disposes model buffers even when snapshot rendering fails and permits a retry', async () => {
  resources.load.mockResolvedValue(model())
  resources.render.mockImplementationOnce(() => { throw new Error('context lost') })
  const snapshots = await import('@/features/mascot/model-snapshot')
  const release = snapshots.retainMascotSnapshots()
  await expect(snapshots.getMascotSnapshot('bumi')).rejects.toThrow('context lost')
  expect(resources.disposeGeometry).toHaveBeenCalledOnce()
  await expect(snapshots.getMascotSnapshot('bumi')).resolves.toMatch(/^data:image/)
  release()
  await Promise.resolve()
})
