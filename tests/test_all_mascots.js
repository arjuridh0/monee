import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { MascotCanvas, STATES } from '../mascots/core/mascot_canvas.js';
import { MASCOTS } from '../mascots/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

console.log('=== VERIFIKASI ARSITEKTUR & INTEGRITAS ASET MASKOT MONEE ===\n');

// 1. Core Engine 2.5D
const coreFiles = ['mascot_canvas.js', 'states.js', 'draw_util.js'];
coreFiles.forEach(f => {
  const fp = path.join(ROOT, 'mascots', 'core', f);
  assert.ok(fs.existsSync(fp), `File core mascots/core/${f} harus ada`);
  console.log(`[PASS] Core engine: mascots/core/${f}`);
});

// 2. States Verification (14 states seragam)
const statesContent = fs.readFileSync(path.join(ROOT, 'mascots', 'core', 'states.js'), 'utf8');
const expectedStates = [
  'idle', 'gabut', 'greeting', 'tap', 'pet', 'happy',
  'angry', 'sad', 'surprised', 'listening', 'thinking',
  'annoyed', 'celebrate', 'sleepy'
];
expectedStates.forEach(st => {
  assert.ok(statesContent.includes(`'${st}'`), `State '${st}' harus terdefinisi di states.js`);
});
assert.deepEqual(STATES, expectedStates, 'Engine harus mengekspor tepat 14 state yang disepakati');
assert.equal(typeof MascotCanvas, 'function', 'Class engine harus dapat diimpor sebagai ESM');
console.log(`[PASS] 14 State seragam terverifikasi di states.js (${expectedStates.length} states)`);

// 3. Modul Maskot (mochi, luna, bumi)
const mascotDefs = [
  { id: 'mochi', name: 'Mochi', file: 'mochi.js', png: 'mochi.png' },
  { id: 'luna',  name: 'Luna',  file: 'luna.js', png: 'luna.png' },
  { id: 'bumi',  name: 'Bumi',  file: 'bumi.js', png: 'bumi.png' },
];

mascotDefs.forEach(m => {
  // Engine file
  const enginePath = path.join(ROOT, 'mascots', m.file);
  assert.ok(fs.existsSync(enginePath), `Modul mascots/${m.file} harus ada`);
  const code = fs.readFileSync(enginePath, 'utf8');
  assert.ok(code.includes(`id: '${m.id}'`), `Modul ${m.file} harus mengekspor id '${m.id}'`);
  assert.ok(code.includes('motion(') && code.includes('draw('), `Modul ${m.file} harus memiliki hook motion() dan draw()`);
  const implementation = MASCOTS[m.id];
  assert.equal(implementation.id, m.id, 'Registry harus menunjuk implementasi maskot yang sesuai');
  assert.equal(typeof implementation.draw, 'function');
  for (const state of STATES) {
    for (const t of [0, 0.5, 2, 10]) {
      const motion = implementation.motion({ state, t, st: t });
      assert.ok(motion && Object.values(motion).every(Number.isFinite), `${m.id}/${state} harus menghasilkan gerak valid pada t=${t}`);
    }
  }

  // PNG render
  const pngPath = path.join(ROOT, 'mascots', 'png', m.png);
  assert.ok(fs.existsSync(pngPath), `File PNG mascots/png/${m.png} harus ada`);
  assert.ok(fs.statSync(pngPath).size > 50000, `Ukuran ${m.png} harus valid (> 50KB)`);

  console.log(`[PASS] Paket maskot ${m.name} (${m.id}): JS engine 2.5D dan arsip PNG valid.`);
});

// 4. Mockup PNG tetap tersedia untuk desain, tanpa membaca format internal editor.
const mockups = [
  ...['idle', 'greeting', 'listening', 'thinking', 'happy', 'celebrate', 'sad'].map(state => `mochi-${state}.png`),
  ...['luna', 'bumi'].flatMap(id => ['idle', 'greeting', 'listening', 'happy'].map(state => `${id}-${state}.png`)),
];
for (const image of mockups) {
  const imagePath = path.join(ROOT, 'mascots', 'png2_5d', image);
  assert.ok(fs.existsSync(imagePath), `Sumber mockup ${image} harus ada`);
  assert.equal(fs.readFileSync(imagePath).subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${image} harus berupa PNG`);
}

// 5. Studio dan picker hanya memakai engine 2.5D; aset dan loader lama tidak dikirim.
const previewPath = path.join(ROOT, 'tools', 'studio', 'index.html');
assert.ok(fs.existsSync(previewPath), 'tools/studio/index.html harus ada');
const previewContent = fs.readFileSync(previewPath, 'utf8');
assert.ok(previewContent.includes('id="stage"'), 'Studio harus memiliki elemen stage carousel');
assert.ok(previewContent.includes('MascotCanvas'), 'Studio harus memuat MascotCanvas');
assert.ok(previewContent.includes('../../mascots/core/mascot_canvas.js'), 'Studio harus memakai engine aplikasi');
assert.ok(!/three|GLTF|DRACO|\.glb/i.test(previewContent), 'Studio tidak boleh memuat runtime 3D');
const picker = fs.readFileSync(path.join(ROOT, 'src/features/mascot/MascotCarousel.tsx'), 'utf8');
assert.ok(picker.includes('MascotCanvas'), 'Picker harus memakai canvas 2.5D');
assert.ok(!/model-snapshot|three|GLTF|DRACO/.test(picker), 'Picker tidak boleh memuat snapshot 3D');
for (const oldPath of ['public/mascots/3d', 'public/draco', 'src/features/mascot/model-snapshot.ts',
  'src/core/mascot/model-map.ts', 'tools/render.html', 'tools/render_png.mjs']) {
  assert.ok(!fs.existsSync(path.join(ROOT, oldPath)), `${oldPath} harus sudah dihapus`);
}
console.log('[PASS] Studio dan picker hanya memakai Canvas 2.5D, tanpa model atau decoder 3D.');

// 6. Root README
const rootReadme = path.join(ROOT, 'README.md');
assert.ok(fs.existsSync(rootReadme), 'Root README.md harus ada');
console.log('[PASS] Root README.md terverifikasi.');

console.log('\n=== SELURUH ASET & ARSITEKTUR MASKOT MONEE TERVERIFIKASI 100% (PASS) ===');
