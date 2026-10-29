import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serveProduction, outputFolder } from './lib/production.mjs'

// Production assets, a disposable browser profile, fake audio and an intercepted managed transcription response.
// No real key, microphone or external request is used by this harness.
const host = await serveProduction(), output = await outputFolder('voice')
const base = host.base
const browser = await chromium.launch({ headless: true, channel: process.env.MONEE_BROWSER ?? 'msedge' })
const report = { ok: false, layouts: [], errors: [], checks: {} }

async function capture(page, name) {
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    small: [...document.querySelectorAll('dialog[open] button,dialog[open] a,dialog[open] input,dialog[open] select,dialog[open] textarea')].filter(node => {
      const r = node.getBoundingClientRect()
      return r.width && r.height && (r.width < 43.9 || r.height < 43.9)
    }).map(node => node.getAttribute('aria-label') || node.textContent.trim().slice(0, 50)) }))
  assert.ok(layout.scroll <= layout.width, `${name}: overflow`)
  assert.deepEqual(layout.small, [], `${name}: touch targets under 44px`)
  report.layouts.push({ name, ...layout })
  await page.screenshot({ path: resolve(output, `${name}.png`) })
}
async function seed(page) {
  await page.goto(base); await page.getByLabel('Nama panggilan').waitFor()
  await page.evaluate(async () => {
    const db = await new Promise(done => { const request = indexedDB.open('monee-db'); request.onsuccess = () => done(request.result) })
    const salt = 'ab'.repeat(16)
    const pinHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`123456${salt}`)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
    const tx = db.transaction(['profile', 'transactions'], 'readwrite')
    tx.objectStore('profile').put({ id: 'profile', name: 'Nara', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'bucket-needs', pinHash, pinSalt: salt, createdAt: Date.now() })
    const common = { date: today, createdAt: Date.now(), updatedAt: Date.now() }
    tx.objectStore('transactions').put({ ...common, id: 'salary', type: 'income', amount: 5000000, categoryId: 'cat-gaji' })
    tx.objectStore('transactions').put({ ...common, id: 'deposit', type: 'savings_deposit', amount: 1000000, categoryId: 'cat-tabungan', bucketId: 'bucket-savings' })
    await new Promise((done, fail) => { tx.oncomplete = done; tx.onerror = () => fail(tx.error) }); db.close()
  })
  await page.reload(); await page.getByLabel('PIN 6 digit', { exact: true }).fill('123456')
  await page.getByRole('navigation', { name: 'Navigasi utama' }).waitFor()
}
async function voice(page) {
  await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click()
  await page.getByRole('button', { name: 'Catat dengan suara', exact: true }).click()
  await page.getByRole('dialog', { name: 'Catat dengan suara' }).waitFor()
}
async function count(page, note, deleted = false) {
  return page.evaluate(async ({ note, deleted }) => {
    const db = await new Promise(done => { const r = indexedDB.open('monee-db'); r.onsuccess = () => done(r.result) })
    const rows = await new Promise(done => { const r = db.transaction('transactions').objectStore('transactions').getAll(); r.onsuccess = () => done(r.result) }); db.close()
    return rows.filter(row => row.note === note && !!row.deleted === deleted).length
  }, { note, deleted })
}

try {
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    window.__micStops = 0; window.__micRequests = 0
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      window.__micRequests++
      return { getTracks: () => [{ stop: () => { window.__micStops++ } }] }
    } } })
    class Recorder {
      static isTypeSupported(type) { return type.startsWith('audio/webm') }
      state = 'inactive'; mimeType = 'audio/webm'
      start() { this.state = 'recording' }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['test audio'], { type: 'audio/webm' }) }); this.onstop?.() }
    }
    window.MediaRecorder = Recorder
  })
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.errors.push(error.message))
  let uploads = 0, loginRedirectRequests = 0, expireAccess = false
  await context.route('https://api.groq.com/**', () => { throw new Error('Browser must not contact the voice provider') })
  await context.route(`${base}/access-login-test`, async route => { loginRedirectRequests++; await route.fulfill({ body: 'Login required' }) })
  await context.route(`${base}/api/transcribe`, async route => {
    uploads++
    assert.equal(new URL(route.request().url()).origin, base)
    assert.equal(route.request().method(), 'POST')
    assert.equal(route.request().headers().authorization, undefined)
    const body = route.request().postDataBuffer().toString()
    assert.equal((body.match(/Content-Disposition: form-data;/g) ?? []).length, 1)
    assert.match(body, /name="file"; filename="audio.webm"/)
    if (expireAccess) await route.fulfill({ status: 302, headers: { location: `${base}/access-login-test` } })
    else await route.fulfill({ json: { text: 'ngopi 22rb sama parkir 3rb' } })
  })
  await seed(page)
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await voice(page); await capture(page, `voice-${width}`)
    await page.getByLabel('Ucapan atau teks transaksi').fill('makan dua puluh lima ribu')
    await page.getByRole('button', { name: 'Buat draft' }).click()
    await page.getByText('Draft 1 dari 1', { exact: true }).waitFor(); await capture(page, `review-${width}`)
    assert.equal(await count(page, 'makan dua puluh lima ribu'), 0)
    await page.getByRole('button', { name: 'Tutup Review transaksi' }).click()
    await page.getByRole('button', { name: 'Tutup Tambah transaksi' }).click()
  }
  report.checks.responsive = true; report.checks.noAutoSave = true

  // Managed service settings explain sharing and access without credentials.
  await page.getByRole('link', { name: 'Atur', exact: true }).click()
  await page.getByRole('button', { name: /^Layanan suara/ }).click()
  await page.getByText(/server Monee.*Groq/).waitFor()
  assert.equal(await page.getByRole('dialog').locator('input').count(), 0)
  await capture(page, 'voice-service-desktop')
  await page.getByRole('button', { name: 'Tutup Layanan suara' }).click()
  report.checks.managedServicePrivacy = true

  // Long press enters voice without requesting mic permission until explicit record.
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  const fab = page.getByRole('button', { name: 'Tambah transaksi', exact: true })
  await fab.hover(); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up()
  await page.getByRole('dialog', { name: 'Catat dengan suara' }).waitFor()
  assert.equal(await page.evaluate(() => window.__micRequests), 0)
  report.checks.longPress = true; report.checks.sessionConsent = true
  assert.equal(await page.getByRole('button', { name: 'Mulai rekam' }).isDisabled(), true)
  await page.getByRole('checkbox', { name: /Saya setuju.*server Monee.*Groq/ }).check()
  await page.getByRole('button', { name: 'Mulai rekam' }).click()
  await page.getByRole('button', { name: 'Berhenti rekam' }).waitFor()
  assert.equal(await page.locator('.voice-mascot [data-state]').getAttribute('data-state'), 'listening')
  await page.getByRole('button', { name: 'Berhenti rekam' }).click()
  await page.getByText('Draft 1 dari 2', { exact: true }).waitFor()
  assert.equal(uploads, 1); assert.ok(await page.evaluate(() => window.__micStops > 0))
  report.checks.recordingToDraft = true
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click()
  await page.getByRole('button', { name: 'Batal', exact: true }).waitFor()
  assert.equal(await count(page, 'ngopi 22rb'), 1)
  await page.getByRole('button', { name: 'Batal', exact: true }).click()
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).waitFor()
  assert.equal(await count(page, 'ngopi 22rb'), 0); assert.equal(await count(page, 'ngopi 22rb', true), 1)
  report.checks.undo = true
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click()
  await page.getByText('Draft 2 dari 2', { exact: true }).waitFor()
  assert.equal(await count(page, 'ngopi 22rb'), 1)
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click()
  await page.getByText(/Review selesai/).waitFor()
  assert.equal(await count(page, 'parkir 3rb'), 1)
  report.checks.queue = true

  // Four transaction kinds use the same guarded store path.
  for (const text of ['gajian 1 juta', 'setor tabungan 50rb', 'pakai tabungan allocation 30rb buat buku']) {
    await page.getByLabel('Ucapan atau teks transaksi').fill(text)
    await page.getByRole('button', { name: 'Buat draft' }).click()
    await page.getByRole('button', { name: 'Simpan draft', exact: true }).click()
    await page.getByText(/Review selesai/).waitFor()
    assert.equal(await count(page, text), 1)
  }
  report.checks.fourTypes = true

  // A domain error keeps values and allows correcting amount then retrying.
  await page.getByLabel('Ucapan atau teks transaksi').fill('makan 999 juta')
  await page.getByRole('button', { name: 'Buat draft' }).click()
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click()
  await page.getByText(/ERR_JATAH_HABIS|ERR_SALDO_KURANG/).waitFor()
  assert.equal(await page.getByLabel('Nominal (Rp)', { exact: true }).inputValue(), '999000000')
  await page.getByRole('button', { name: 'Tutup Review transaksi' }).click()
  await page.getByRole('button', { name: 'Catat dengan suara', exact: true }).click()
  report.checks.domainFailure = true

  // Cancelling an active capture stops tracks and never creates another upload.
  await page.getByRole('checkbox', { name: /Saya setuju/ }).check()
  await page.getByRole('button', { name: 'Mulai rekam' }).click()
  await page.getByRole('button', { name: 'Berhenti rekam' }).waitFor()
  await page.getByRole('button', { name: 'Tutup Catat dengan suara' }).click()
  assert.equal(uploads, 1); assert.ok(await page.evaluate(() => window.__micStops >= 2))
  report.checks.cancelNoUpload = true

  // Offline fallback remains local after the voice chunk has been loaded.
  await page.getByRole('button', { name: 'Catat dengan suara', exact: true }).click()
  await context.setOffline(true)
  await page.getByRole('checkbox', { name: /Saya setuju/ }).check()
  await page.getByRole('button', { name: 'Mulai rekam' }).click()
  await page.getByText(/Voice membutuhkan internet/).waitFor()
  await page.getByLabel('Ucapan atau teks transaksi').fill('makan 20rb')
  await page.getByRole('button', { name: 'Buat draft' }).click()
  await page.getByText('Draft 1 dari 1', { exact: true }).waitFor()
  report.checks.offline = true
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Tutup Review transaksi' }).click()
  await page.getByRole('button', { name: 'Tutup Tambah transaksi' }).click()
  // Close the phase 8 handoff gap with production theme preview, dismiss, apply and reload.
  await page.getByRole('link', { name: 'Atur', exact: true }).click()
  await page.getByRole('button', { name: /^Maskot & Tema/ }).click()
  await page.getByRole('button', { name: 'Pilih Luna', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.mascot === 'luna')
  await page.getByRole('button', { name: 'Tutup Maskot & Tema' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.mascot === 'mochi')
  await page.getByRole('button', { name: /^Maskot & Tema/ }).click()
  await page.getByRole('button', { name: 'Pilih Luna', exact: true }).click()
  await page.getByRole('button', { name: 'Pilih Maskot ini', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.reload(); await page.getByLabel('PIN 6 digit', { exact: true }).fill('123456')
  await page.getByRole('navigation', { name: 'Navigasi utama' }).waitFor()
  await page.waitForFunction(() => document.documentElement.dataset.mascot === 'luna')
  report.checks.themePreviewDismissPersist = true

  // An expired edge session is an opaque redirect; audio must not follow it to login.
  expireAccess = true
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await voice(page)
  await page.getByRole('checkbox', { name: /Saya setuju/ }).check()
  await page.getByRole('button', { name: 'Mulai rekam' }).click()
  await page.getByRole('button', { name: 'Berhenti rekam' }).click()
  const login = page.getByRole('link', { name: 'Masuk ulang layanan suara' })
  await login.waitFor()
  assert.equal(await login.getAttribute('href'), '/auth/refresh')
  assert.equal(await login.getAttribute('target'), null)
  assert.equal(uploads, 2)
  assert.equal(loginRedirectRequests, 0)
  report.checks.expiredAccessRecovery = true
  await capture(page, 'voice-access-expired')
  await context.close()
  assert.deepEqual(report.errors, [])
  report.ok = true
} catch (error) {
  report.failure = error.stack; process.exitCode = 1
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close(); await host.close()
  console.log(JSON.stringify({ ...report, layouts: report.layouts.length }, null, 2))
}
