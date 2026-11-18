// Architectural regression: the picker must stay independent of 3D runtimes.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('ships neither snapshot loaders nor GLB/Draco assets', () => {
  for (const file of ['src/features/mascot/model-snapshot.ts', 'src/core/mascot/model-map.ts',
    'public/mascots/3d', 'public/draco', 'tools/render.html', 'tools/render_png.mjs']) {
    expect(existsSync(resolve(file)), file).toBe(false)
  }
  const picker = readFileSync(resolve('src/features/mascot/MascotCarousel.tsx'), 'utf8')
  expect(picker).toContain('MascotCanvas')
  expect(picker).not.toMatch(/model-snapshot|three|GLTF|DRACO|requestAnimationFrame/)
  expect(readFileSync(resolve('public/_headers'), 'utf8')).not.toContain('wasm-unsafe-eval')
  const studio = readFileSync(resolve('tools/studio/index.html'), 'utf8')
  expect(studio).toContain('MascotCanvas')
  expect(studio).not.toMatch(/three|GLTF|DRACO|\.glb/i)
})
