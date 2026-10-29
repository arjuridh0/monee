import type { MascotId } from '@/core/finance/types'
import { GLB_FILE } from '@/core/mascot/model-map'

const SNAPSHOT_SIZE = 640

type ThreeModule = typeof import('three')
type GLTFLoaderInstance = import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader

let threePromise: Promise<ThreeModule> | null = null
let loaderPromise: Promise<GLTFLoaderInstance> | null = null
let renderer: import('three').WebGLRenderer | null = null
let dracoLoader: import('three/examples/jsm/loaders/DRACOLoader.js').DRACOLoader | null = null
let consumers = 0
let renderQueue: Promise<unknown> = Promise.resolve()
const cache = new Map<MascotId, Promise<string>>()

function getThree(): Promise<ThreeModule> {
  threePromise ??= import('three')
  return threePromise
}

function getLoader(): Promise<GLTFLoaderInstance> {
  loaderPromise ??= (async () => {
    await getThree()
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
    ])
    const draco = new DRACOLoader()
    dracoLoader = draco
    draco.setDecoderPath('/draco/')
    return new GLTFLoader().setDRACOLoader(draco)
  })()
  return loaderPromise
}

async function getRenderer(): Promise<import('three').WebGLRenderer> {
  const THREE = await getThree()
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setSize(SNAPSHOT_SIZE, SNAPSHOT_SIZE, false)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
  }
  return renderer
}

function disposeModel(root: import('three').Object3D): void {
  root.traverse((child) => {
    const mesh = child as import('three').Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value) {
          ;(value as import('three').Texture).dispose()
        }
      }
      material.dispose()
    }
  })
}

async function renderMascot(id: MascotId): Promise<string> {
  const [THREE, loader, webgl] = await Promise.all([getThree(), getLoader(), getRenderer()])
  const gltf = await loader.loadAsync(`/mascots/3d/${GLB_FILE[id]}`)
  const model = gltf.scene

  try {
    const bounds = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    model.scale.multiplyScalar(2.05 / Math.max(size.y, 0.001))
    model.updateMatrixWorld(true)

    const scaledBounds = new THREE.Box3().setFromObject(model)
    const center = new THREE.Vector3()
    scaledBounds.getCenter(center)
    model.position.sub(center)
    model.updateMatrixWorld(true)

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.6))
    const key = new THREE.DirectionalLight(0xfff7e8, 2.4)
    key.position.set(2.5, 4, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xffffff, 1.1)
    rim.position.set(-3, 1, -2)
    scene.add(rim)
    scene.add(model)

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
    camera.position.set(0, 0.02, 3.55)
    camera.lookAt(0, 0, 0)

    webgl.render(scene, camera)
    const snapshot = webgl.domElement.toDataURL('image/webp', 0.92)
    return snapshot
  } finally {
    disposeModel(model)
  }
}

/** Shared imports and the queue stay valid while any picker is mounted.
 * Release only after queued jobs finish; never dispose a renderer mid-render. */
export function retainMascotSnapshots(): () => void {
  consumers += 1
  let released = false
  return () => {
    if (released) return
    released = true
    consumers -= 1
    void renderQueue.finally(() => {
      if (consumers) return
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = null
      dracoLoader?.dispose()
      dracoLoader = null
      loaderPromise = null
      cache.clear()
    })
  }
}

export function canRenderMascotSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof WebGLRenderingContext !== 'undefined'
}

export function getMascotSnapshot(id: MascotId): Promise<string> {
  const cached = cache.get(id)
  if (cached) return cached

  const task = renderQueue.then(() => renderMascot(id))
  renderQueue = task.catch(() => undefined)
  const pending = task.catch((error: unknown) => {
    cache.delete(id)
    throw error
  })
  cache.set(id, pending)
  return pending
}
