import { updateReport } from './lib/report.mjs'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { serveProduction } from './lib/production.mjs'
import { installQaAccount } from './lib/qa-account.mjs'
import AxeBuilder from '@axe-core/playwright'

const host = await serveProduction()
const browser = await chromium.launch({ headless: true, channel: process.env.MONEE_BROWSER ?? 'msedge' })
const report = { ok: false, scenarios: [], errors: [], layouts: [], performance: [], pwa: {}, deviceMatrix: [], accessibility: [] }
const today = '2026-10-26'
const qaAccountId = `acct_${'a'.repeat(64)}`
const common = { date: today, createdAt: 1, updatedAt: 1 }
const income = { ...common, id: 'salary', type: 'income', categoryId: 'cat-gaji', amount: 1000000 }
const deposit = { ...common, id: 'deposit', type: 'savings_deposit', categoryId: 'cat-tabungan', bucketId: 'bucket-savings', amount: 150000 }
const lunch = { ...common, id: 'lunch', type: 'expense', categoryId: 'cat-makan', bucketId: 'bucket-needs', amount: 100000, note: 'Makan uji' }

async function dbRows(page, store) {
  return page.evaluate(async store => {
    const db = await new Promise(done => { const r = indexedDB.open(`monee-db-acct_${'a'.repeat(64)}`); r.onsuccess = () => done(r.result) })
    const rows = await new Promise(done => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => done(r.result) }); db.close(); return rows
  }, store)
}
async function unlock(page) {
  await page.getByLabel('PIN 6 digit', { exact: true }).fill('123456')
  await page.getByRole('navigation', { name: 'Navigasi utama' }).waitFor()
}
async function go(page, name) {
  await page.getByRole('link', { name, exact: true }).click()
  await page.getByRole('heading', { level: 1, name: name === 'Home' ? 'Beranda' : name }).waitFor()
  await page.waitForFunction(() => {
    const panel = document.querySelector('.tab-content')
    return panel && getComputedStyle(panel).opacity === '1'
  })
}
async function add(page, amount, kind = 'expense', date) {
  await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click(); await page.getByRole('button', { name: 'Ketik manual', exact: true }).click()
  if (kind === 'income') await page.getByRole('radio', { name: 'Pemasukan', exact: true }).click()
  await page.getByLabel('Nominal (Rp)', { exact: true }).fill(String(amount))
  if (date) await page.getByLabel('Tanggal', { exact: true }).fill(date)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}
async function settled(page) { await page.getByRole('dialog').waitFor({ state: 'hidden' }) }
async function auditSurface(page, theme, width, surface) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  report.accessibility.push({ theme, width, page: surface, violations: result.violations })
}
async function assertSavingsFlipIcon(page) {
  await page.mouse.move(0, 0)
  const ratio = await page.getByRole('button', { name: 'Kembali ke saldo periode', exact: true }).evaluate(node => {
    const style = getComputedStyle(node)
    const luminance = color => {
      const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(channel => {
        const value = Number(channel) / 255
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
      })
      return r * .2126 + g * .7152 + b * .0722
    }
    const pair = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a)
    return (pair[0] + .05) / (pair[1] + .05)
  })
  assert.ok(ratio >= 3, `Savings flip icon needs 3:1 contrast; got ${ratio.toFixed(2)}`)
}
async function fixture(run, options = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage(); page.setDefaultTimeout(12000)
  page.on('pageerror', error => report.errors.push(error.message))
  // This test-only transport supplies an isolated QA account; production code still
  // authenticates and validates sessions in the Worker, covered by server tests.
  await installQaAccount(context)
  await page.clock.setFixedTime(new Date(`${today}T03:00:00Z`))
  try {
    await page.goto(host.base); await page.getByLabel('Nama panggilan').waitFor()
    if (!options.fresh) {
      await page.evaluate(async ({ txs, goals }) => {
        const db = await new Promise(done => { const r = indexedDB.open(`monee-db-acct_${'a'.repeat(64)}`); r.onsuccess = () => done(r.result) })
        const salt = 'ab'.repeat(16)
        const pinHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('123456' + salt)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
        const tx = db.transaction(['profile', 'transactions', 'goals'], 'readwrite')
        tx.objectStore('profile').put({ id: 'profile', name: 'Nara', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'bucket-needs', pinHash, pinSalt: salt, createdAt: Date.now() })
        for (const row of txs) tx.objectStore('transactions').put(row)
        for (const row of goals) tx.objectStore('goals').put(row)
        await new Promise((done, fail) => { tx.oncomplete = done; tx.onerror = () => fail(tx.error) }); db.close()
      }, { txs: options.txs ?? [income], goals: options.goals ?? [] })
      await page.reload(); await unlock(page)
    }
    await run(page, context)
  } finally { await context.close() }
}
async function scenario(id, name, run) {
  if (process.argv[2] && Number(process.argv[2]) !== id) return
  try { await run(); report.scenarios.push({ id, name, pass: true }); console.log(`PASS ${id}: ${name}`) }
  catch (error) { report.scenarios.push({ id, name, pass: false, error: error.stack }); console.log(`FAIL ${id}: ${error.message}`) }
}

async function onboard(page, withIncome) {
  assert.equal(await page.getByRole('navigation').count(), 0)
  await page.getByLabel('Nama panggilan').fill('Nara')
  await page.getByRole('button', { name: 'Lanjut', exact: true }).click()
  if (withIncome) {
    await page.getByLabel('Nominal pemasukan (Rp)').fill('1000000')
    await page.getByRole('button', { name: 'Catat & lanjut', exact: true }).click()
  } else await page.getByRole('button', { name: 'Lewati dulu', exact: true }).click()
  await page.getByRole('button', { name: 'Lanjut', exact: true }).click()
  await page.getByRole('button', { name: 'Pilih Maskot ini', exact: true }).click()
  await page.getByLabel('Buat PIN 6 digit', { exact: true }).fill('123456')
  await page.getByLabel('Ulangi PIN 6 digit', { exact: true }).fill('123456')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Selesai & masuk', exact: true }).click()
  await page.getByRole('heading', { name: 'Beranda', exact: true }).waitFor()
}

try {
  await scenario(1, 'Onboarding lima langkah: isi/Lewati, tanpa income ganda saat reload', async () => {
    for (const withIncome of [false, true]) await fixture(async page => {
      await onboard(page, withIncome)
      assert.equal((await dbRows(page, 'transactions')).length, withIncome ? 1 : 0)
      await page.reload(); await unlock(page)
      assert.equal((await dbRows(page, 'transactions')).length, withIncome ? 1 : 0)
      assert.equal(await page.getByLabel('Nama panggilan').count(), 0)
    }, { fresh: true })
  })
  await scenario(2, 'Expense manual mengurangi saldo, progress dan reaksi maskot', () => fixture(async page => {
    await add(page, 25000)
    await page.getByRole('button', { name: 'Batal', exact: true }).waitFor()
    assert.ok(await page.locator('.mascot-canvas[data-state="happy"]').count() > 0)
    await settled(page)
    assert.match(await page.getByLabel('Saldo periode', { exact: true }).innerText(), /975\.000/)
    assert.match(await page.getByRole('progressbar', { name: 'Pemakaian Kebutuhan Pokok' }).getAttribute('aria-valuetext'), /6,3%/)
  }))
  await scenario(3, 'Tabungan terbaca; swipe asli, putaran simetris dan tema tersimpan', () => fixture(async (page, context) => {
    await page.getByRole('button', { name: 'Lihat tabungan', exact: true }).click()
    const savingsAudit = await new AxeBuilder({ page }).include('.dashboard-balance-stage').withRules(['color-contrast']).analyze()
    assert.deepEqual(savingsAudit.violations, [], 'Flipped savings pockets must have readable text')
    await assertSavingsFlipIcon(page)
    await page.getByRole('button', { name: 'Kembali ke saldo periode', exact: true }).click()
    await go(page, 'Atur'); await page.getByRole('button', { name: /^Maskot & Tema/ }).click()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    const swipe = async (dx, dy = 2, cancel = false) => {
      const r = await page.locator('.mascot-preview[data-position="0"]').boundingBox()
      const start = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + dx * step / 8, y: start.y + dy * step / 8, id: 1 }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
    }
    const ids = ['mochi', 'luna', 'bumi']
    let selected = 0
    for (const direction of [1, 1, 1, -1, -1, -1, 1, -1]) {
      await swipe(-direction * 100)
      selected = (selected + direction + 3) % 3
      assert.equal(await page.locator('.mascot-carousel').getAttribute('data-mascot'), ids[selected], 'Real touch swipes must survive implicit capture transfer')
      assert.equal(await page.locator(`[data-wrap="${direction}"]`).count(), 1)
      await page.waitForFunction(() => !document.querySelector('.mascot-stage').getAnimations({ subtree: true }).some(a => a.playState === 'running'))
    }
    await swipe(100, 2, true)
    assert.equal(await page.locator('.mascot-carousel').getAttribute('data-mascot'), ids[selected])
    await swipe(5, -90)
    assert.equal(await page.locator('.mascot-carousel').getAttribute('data-mascot'), ids[selected], 'Vertical scrolling must not change mascot')
    await page.evaluate(() => {
      window.__carouselWraps = []
      document.querySelector('.mascot-stage').addEventListener('animationstart', event => {
        if (event.animationName.startsWith('mascot-wrap-')) window.__carouselWraps.push({
          direction: event.target.dataset.wrap,
          frames: event.target.getAnimations().filter(a => a instanceof CSSAnimation).flatMap(a => a.effect.getKeyframes()),
        })
      })
    })
    for (const direction of [-1, 1]) {
      await page.evaluate(() => { window.__carouselWraps = [] })
      await page.getByRole('button', { name: direction === -1 ? 'Maskot sebelumnya' : 'Maskot berikutnya', exact: true }).click()
      await page.waitForFunction(() => window.__carouselWraps.length > 0)
      const wrap = await page.evaluate(() => window.__carouselWraps.at(-1))
      assert.equal(wrap.direction, String(direction))
      assert.ok(wrap.frames.some(frame => Number(frame.opacity) === 0), 'Wrapping mascot must pass behind the center invisibly')
      await page.waitForFunction(() => !document.querySelector('.mascot-stage').getAnimations({ subtree: true }).some(a => a.playState === 'running'))
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await cdp.detach()
    await page.getByRole('option', { name: /Luna/ }).click()
    await page.getByRole('button', { name: 'Pilih Maskot ini', exact: true }).click(); await settled(page)
    await page.reload(); await unlock(page)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mascot), 'luna')
  }))
  await scenario(4, 'Income mid-month menaikkan jatah', () => fixture(async page => {
    assert.match(await page.getByRole('group', { name: 'Jatah Kebutuhan Pokok', exact: true }).innerText(), /400\.000/)
    await add(page, 1000000, 'income'); await settled(page)
    assert.match(await page.getByRole('group', { name: 'Jatah Kebutuhan Pokok', exact: true }).innerText(), /800\.000/)
  }))
  await scenario(5, 'Rollover membuat sweep saldo akhir tepat sekali dan reset periode', () => fixture(async page => {
    await page.clock.setFixedTime(new Date('2026-11-01T03:00:00Z')); await page.reload(); await unlock(page)
    const sweeps = await dbRows(page, 'monthSweeps')
    assert.equal(sweeps.length, 1); assert.equal(sweeps[0].amount, 750000)
    await page.getByText('Belum ada pemasukan bulan ini', { exact: true }).waitFor()
    await page.reload(); await unlock(page); assert.equal((await dbRows(page, 'monthSweeps')).length, 1)
  }, { txs: [income, lunch, deposit] }))
  await scenario(6, 'Setor memenuhi goal lalu Gunakan tanpa mengurangi saldo periode lagi', () => fixture(async page => {
    await go(page, 'Tabungan'); await page.getByRole('button', { name: 'Tambah tujuan', exact: true }).click()
    await page.getByLabel('Nama tujuan', { exact: true }).fill('Kamera')
    await page.getByLabel('Target (Rp)', { exact: true }).fill('50000')
    await page.getByRole('button', { name: 'Simpan tujuan' }).click(); await settled(page)
    await page.getByRole('button', { name: 'Setor ke Allocation', exact: true }).click()
    await page.getByLabel('Nominal (Rp)', { exact: true }).fill('50000')
    await page.getByRole('button', { name: 'Simpan setoran', exact: true }).click(); await settled(page)
    await page.getByRole('button', { name: 'Gunakan tujuan Kamera', exact: true }).click()
    await page.getByRole('button', { name: 'Konfirmasi gunakan', exact: true }).click(); await settled(page)
    const rows = await dbRows(page, 'transactions')
    assert.equal(rows.filter(row => row.type === 'savings_expense').length, 1)
    assert.equal((await dbRows(page, 'goals'))[0].usedAt > 0, true)
    await go(page, 'Home'); assert.match(await page.getByLabel('Saldo periode', { exact: true }).innerText(), /950\.000/)
  }))
  await scenario(7, 'Export → hapus data melalui UI → import, ledger identik', () => fixture(async page => {
    const expectedTransactions = await dbRows(page, 'transactions')
    const expectedGoals = await dbRows(page, 'goals')
    await go(page, 'Atur'); await page.getByRole('button', { name: /^Export Backup/ }).click()
    const download = page.waitForEvent('download')
    await page.getByLabel('Passphrase (minimal 8 karakter)', { exact: true }).fill('qa-backup-passphrase')
    await page.getByRole('button', { name: 'Unduh backup JSON', exact: true }).click()
    const stream = await (await download).createReadStream()
    assert.ok(stream, 'Backup download must provide a readable stream')
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const backupBuffer = Buffer.concat(chunks)
    const backup = JSON.parse(backupBuffer.toString('utf8'))
    assert.equal(backup.encrypted, true)
    await page.getByRole('button', { name: 'Tutup Export Backup', exact: true }).click()
    if (await page.getByLabel('PIN 6 digit', { exact: true }).isVisible()) await unlock(page)
    await page.getByRole('button', { name: /^Hapus Semua Data/ }).click()
    await page.getByLabel('PIN untuk konfirmasi hapus', { exact: true }).fill('123456')
    await page.getByLabel(/Saya paham data akun di semua perangkat/).check()
    await page.getByRole('button', { name: 'Hapus semua data', exact: true }).click()
    await page.getByLabel('Nama panggilan').waitFor()
    // A new empty local profile is required to reach the protected import settings.
    await onboard(page, false); await go(page, 'Atur')
    await page.getByRole('button', { name: /^Import Backup/ }).click()
    await page.getByLabel('File backup JSON').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: backupBuffer })
    await page.getByLabel('Passphrase (jika backup dienkripsi)', { exact: true }).fill('qa-backup-passphrase')
    await page.getByLabel(/Saya paham seluruh data/).check()
    await page.getByRole('button', { name: 'Validasi & pulihkan', exact: true }).click()
    // The imported profile has a different salt, so the store correctly locks and asks for its PIN.
    await page.getByLabel('PIN 6 digit', { exact: true }).waitFor()
    await unlock(page)
    assert.deepEqual(await dbRows(page, 'transactions'), expectedTransactions)
    await page.reload()
    await unlock(page)
    assert.deepEqual(await dbRows(page, 'transactions'), expectedTransactions)
    assert.deepEqual(await dbRows(page, 'goals'), expectedGoals)
  }, { txs: [income, lunch, deposit] }))
  const wrongPins = async page => {
    for (let i = 0; i < 3; i++) {
      await page.getByLabel('PIN 6 digit', { exact: true }).fill('000000')
      await page.waitForFunction(() => document.querySelector('input[aria-label="PIN 6 digit"]')?.value === '')
    }
  }
  await scenario(8, 'PIN salah tiga kali menunda, PIN benar membuka setelah jeda', () => fixture(async page => {
    await page.getByRole('button', { name: 'Kunci Monee', exact: true }).click(); await wrongPins(page)
    await page.getByText(/Coba lagi dalam/).waitFor()
    assert.equal(await page.getByLabel('PIN 6 digit', { exact: true }).isDisabled(), true)
    await page.clock.setFixedTime(new Date('2026-10-26T03:00:06Z'))
    await page.getByLabel('PIN 6 digit', { exact: true }).waitFor(); await unlock(page)
    assert.equal((await dbRows(page, 'lockout'))[0]?.attempts ?? 0, 0)
  }))
  await scenario(9, 'Reload offline dan transaksi lokal tetap bekerja', () => fixture(async (page, context) => {
    await page.evaluate(() => navigator.serviceWorker.ready)
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) { await page.reload(); await unlock(page) }
    await page.waitForFunction(() => navigator.serviceWorker.controller)
    await context.setOffline(true); await page.reload(); await unlock(page)
    await add(page, 10000); await settled(page)
    assert.equal((await dbRows(page, 'transactions')).length, 2)
    await context.setOffline(false)
  }))
  await scenario(10, 'Reduced motion meniadakan transform perpindahan', () => fixture(async page => {
    await go(page, 'Riwayat'); await page.waitForTimeout(180)
    assert.equal(await page.locator('.tab-content:not([aria-hidden])').evaluate(node => getComputedStyle(node).transform), 'none')
    const duration = await page.locator('.nav-add').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration))
    assert.ok(duration <= 0.001)
    const indicatorDuration = await page.locator('.bottom-nav .nav-active-pill').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration))
    assert.ok(indicatorDuration <= 0.001, 'Reduced motion must disable highlight translation')
  }))
  await scenario(11, 'Navigasi root di empat tab, tidak aksesibel dalam modal/onboarding/lock', () => fixture(async page => {
    for (const tab of ['Home', 'Riwayat', 'Tabungan', 'Atur']) { await go(page, tab); assert.equal(await page.getByRole('navigation').count(), 1) }
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click(); await page.getByRole('button', { name: 'Ketik manual', exact: true }).click()
    const addDialog = page.getByRole('dialog', { name: 'Tambah transaksi' })
    await addDialog.waitFor()
    await page.waitForFunction(() => document.querySelector('dialog[open]')?.matches(':modal'))
    assert.equal(await addDialog.evaluate(node => node.matches(':modal')), true)
    await page.getByRole('button', { name: 'Catat dengan suara', exact: true }).click()
    const voiceDialog = page.getByRole('dialog', { name: 'Catat dengan suara' })
    await voiceDialog.waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')]
      .some(node => node.querySelector('h2')?.textContent?.trim() === 'Catat dengan suara' && node.matches(':modal')))
    assert.equal(await voiceDialog.evaluate(node => node.matches(':modal')), true)
      await page.getByRole('button', { name: 'Tutup Catat dengan suara' }).click()
      await settled(page)
      assert.equal(await page.getByRole('dialog').count(), 0, 'Closing voice must close the entry flow')
    await go(page, 'Home'); await page.getByRole('button', { name: 'Kunci Monee' }).click()
    await page.getByLabel('PIN 6 digit', { exact: true }).waitFor(); assert.equal(await page.getByRole('navigation').count(), 0)
    // Receipt upload and review are covered by the dedicated OCR/browser checks.
  }))
  await scenario(12, 'Perpindahan tab normal selesai dalam kontrak 300ms', () => fixture(async page => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    // Capture the actual shared-layout indicator during route scroll restoration.
    // Checking only its final position missed a 500px jump above the fixed bar.
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      await go(page, 'Atur')
      await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'instant' }))
      await page.waitForFunction(() => scrollY >= 400)
      await go(page, 'Tabungan')
      for (const target of ['Atur', 'Tabungan']) {
        await page.evaluate(() => {
          window.__navSamples = []
          window.__navSamplingDone = false
          const nav = document.querySelector('.bottom-nav')
          nav.addEventListener('click', () => {
            const start = performance.now()
            const sample = () => {
              const bar = nav.getBoundingClientRect()
              window.__navSamples.push({ elapsed: performance.now() - start, scroll: scrollY,
                pills: [...nav.querySelectorAll('.nav-active-pill')].map(node => {
                  const r = node.getBoundingClientRect()
                  return { top: r.top - bar.top, bottom: r.bottom - bar.top, left: r.left - bar.left, right: r.right - bar.left, barWidth: bar.width, barHeight: bar.height }
                }) })
              if (performance.now() - start < 450) requestAnimationFrame(sample)
              else window.__navSamplingDone = true
            }
            requestAnimationFrame(sample)
          }, { capture: true, once: true })
        })
        await page.getByRole('link', { name: target, exact: true }).click()
        await page.waitForFunction(() => window.__navSamplingDone)
        const samples = await page.evaluate(() => window.__navSamples)
        assert.ok(samples.length >= 3, 'Sample the moving indicator across real frames')
        assert.ok(samples.some(frame => target === 'Atur' ? frame.scroll >= 400 : frame.scroll < 1), `Exercise restored scroll on ${target}`)
        const escaped = samples.flatMap(frame => frame.pills).filter(p => p.top < -1 || p.bottom > p.barHeight + 1 || p.left < -1 || p.right > p.barWidth + 1)
        assert.deepEqual(escaped, [], `Mobile highlight must stay inside fixed navbar at ${width}px while scroll restores`)
        report.navigationMotion ??= []
        report.navigationMotion.push({ width, target, frames: samples.length, escapedFrames: escaped.length })
      }
      for (const name of ['Atur', 'Tabungan', 'Atur', 'Tabungan', 'Atur']) await page.getByRole('link', { name, exact: true }).click()
      await page.getByRole('heading', { level: 1, name: 'Atur', exact: true }).waitFor()
      await page.waitForTimeout(250)
      assert.equal(await page.locator('.nav-active-pill').count(), 1)
      const aligned = await page.locator('.nav-active-pill').evaluate(node => {
        const pill = node.getBoundingClientRect(), active = document.querySelector('.bottom-nav a[aria-current="page"]').getBoundingClientRect()
        return Math.abs(pill.x - active.x) <= 1 && Math.abs(pill.y - active.y) <= 1
      })
      assert.equal(aligned, true, 'Rapid taps must finish with the highlight on the final active tab')
    }
    await go(page, 'Riwayat'); await page.waitForTimeout(330)
    const transform = await page.locator('.tab-content:not([aria-hidden])').evaluate(node => getComputedStyle(node).transform)
    assert.equal(transform, 'none')
    assert.equal(await page.locator('.nav-active-pill').count(), 1)
  }))
  await scenario(13, 'Bottom nav <768 dan sidebar ≥768', () => fixture(async page => {
    for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.locator(width >= 768 ? '.sidebar' : '.bottom-nav').waitFor()
      assert.equal(await page.locator('.sidebar').count(), width >= 768 ? 1 : 0)
      assert.equal(await page.locator('.bottom-nav').count(), width < 768 ? 1 : 0)
      await go(page, 'Riwayat')
      const summary = await page.locator('.history-summary').evaluate(node => ({
        columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
        values: [...node.querySelectorAll('strong')].map(value => ({
          whiteSpace: getComputedStyle(value).whiteSpace,
          clientWidth: value.clientWidth,
          scrollWidth: value.scrollWidth,
          height: value.getBoundingClientRect().height,
        })),
      }))
      if (width < 480) assert.equal(summary.columns, 2, `mobile history summary should use two columns at ${width}px`)
      assert.ok(summary.values.every(value => value.whiteSpace === 'nowrap' && value.scrollWidth <= value.clientWidth && value.height <= 24), `Rupiah summaries should stay on one line at ${width}px`)
    }
  }))
  await scenario(14, 'Empty Riwayat memiliki satu CTA utama dan nav utuh', () => fixture(async page => {
    await go(page, 'Riwayat'); await page.getByText('Belum ada transaksi', { exact: true }).waitFor()
    const empty = page.locator('.history-empty')
    assert.equal(await empty.locator('.ui-button--primary').count(), 1)
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const mascot = await empty.locator('.mascot-canvas').boundingBox()
      const heading = await empty.getByRole('heading', { name: 'Belum ada transaksi', exact: true }).boundingBox()
      assert.ok(mascot && heading && mascot.y + mascot.height <= heading.y,
        `Empty-history mascot must not cover the heading at ${width}px`)
    }
    await empty.getByRole('button', { name: /Catat|Tambah/ }).click()
    await page.getByRole('dialog', { name: 'Tambah transaksi' }).waitFor()
  }, { txs: [] }))
  await scenario(15, 'Gangguan DB: pesan aman, maskot sad, assurance dan retry memulihkan layar', () => fixture(async page => {
    await page.addInitScript(() => {
      const transaction = IDBDatabase.prototype.transaction
      window.__blockRead = true
      IDBDatabase.prototype.transaction = function (...args) {
        if (window.__blockRead) throw new DOMException('Simulated read failure', 'UnknownError')
        return transaction.apply(this, args)
      }
    })
    await page.reload(); await page.getByRole('heading', { name: 'Akun belum bisa diperiksa', exact: true }).waitFor()
    await page.getByText(/Akun belum bisa dimuat di browser ini/).waitFor()
    assert.equal(await page.getByText('ERR_DATA_READ', { exact: true }).count(), 0)
    assert.equal(await page.locator('.mascot-canvas[data-state="sad"]').count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Coba lagi', exact: true }).count(), 1)
    await page.evaluate(() => { window.__blockRead = false })
    await page.getByRole('button', { name: 'Coba lagi', exact: true }).click(); await unlock(page)
  }))
  await scenario(16, 'FAB navigasi 48px tidak bertabrakan dengan empat link', () => fixture(async page => {
    const geometry = await page.locator('.bottom-nav').evaluate(nav => {
      const fab = nav.querySelector('.nav-add').getBoundingClientRect(), box = nav.getBoundingClientRect()
      return { fab: { x: fab.x, y: fab.y, width: fab.width, height: fab.height }, top: box.top,
        notch: getComputedStyle(nav, '::before').width,
        overlaps: [...nav.querySelectorAll('a')].some(node => { const r = node.getBoundingClientRect(); return r.left < fab.right && r.right > fab.left && r.top < fab.bottom && r.bottom > fab.top }) }
    })
    report.notchGeometry = geometry
    assert.equal(geometry.fab.width, 48); assert.equal(geometry.fab.height, 48)
    assert.equal(await page.locator('.bottom-nav').evaluate(nav => getComputedStyle(nav, '::before').display), 'none')
    assert.equal(geometry.overlaps, false)
  }))
  await scenario(17, 'Hard cap menolak expense dan mempertahankan nominal', () => fixture(async page => {
    await add(page, 500000)
    await page.getByText(/Jatah Kebutuhan Pokok tinggal/).waitFor()
    assert.equal(await page.getByLabel('Nominal (Rp)', { exact: true }).inputValue(), '500000')
    assert.equal((await dbRows(page, 'transactions')).length, 1)
  }))
  await scenario(18, 'Saldo kurang setelah setoran besar meski jatah masih cukup', () => fixture(async page => {
    await add(page, 200000); await page.getByText(/Saldo periode tinggal/).waitFor()
    assert.equal((await dbRows(page, 'transactions')).length, 2)
  }, { txs: [income, { ...deposit, amount: 900000 }] }))
  await scenario(19, 'Lockout persisten setelah reload', () => fixture(async page => {
    await page.getByRole('button', { name: 'Kunci Monee' }).click(); await wrongPins(page)
    await page.reload(); await page.getByText(/Coba lagi dalam/).waitFor()
    assert.equal(await page.getByLabel('PIN 6 digit', { exact: true }).isDisabled(), true)
    assert.equal((await dbRows(page, 'lockout'))[0].attempts, 3)
  }))
  await scenario(20, 'Periode tersweep menolak pencatatan dan menyembunyikan aksi koreksi', () => fixture(async page => {
    await page.clock.setFixedTime(new Date('2026-11-01T03:00:00Z')); await page.reload(); await unlock(page)
    await add(page, 10000, 'expense', today); await page.getByText(/Periode ini sudah ditutup/).waitFor()
    await page.getByRole('button', { name: 'Tutup Tambah transaksi' }).click(); await go(page, 'Riwayat')
    await page.getByRole('button', { name: 'Periode sebelumnya' }).click()
    await page.getByRole('button', { name: /Makan uji.*100.000/ }).click()
    const detail = page.getByRole('dialog')
    assert.equal(await detail.getByRole('button', { name: /^Edit$|^Hapus$|^Refund$/ }).count(), 0)
    assert.match(await detail.innerText(), /ditutup/)
  }, { txs: [income, lunch] }))
  await scenario(21, 'Pengeluaran Allocation menyebabkan goal regress dan tidak dapat digunakan', () => fixture(async page => {
    await go(page, 'Tabungan')
    assert.equal(await page.getByRole('button', { name: 'Gunakan tujuan Kamera' }).isEnabled(), true)
    await page.getByRole('button', { name: 'Pakai Allocation', exact: true }).click()
    await page.getByLabel('Nominal (Rp)', { exact: true }).fill('100000')
    await page.getByLabel('Catatan', { exact: true }).fill('Keperluan mendadak')
    await page.getByRole('button', { name: 'Simpan pengeluaran', exact: true }).click(); await settled(page)
    assert.equal(await page.getByRole('button', { name: 'Gunakan tujuan Kamera' }).count(), 0)
    assert.match(await page.getByRole('progressbar', { name: 'Progress Kamera' }).getAttribute('aria-valuetext'), /50/)
  }, { txs: [income, deposit], goals: [{ id: 'camera', name: 'Kamera', targetAmount: 100000, sortOrder: 0, createdAt: 1 }] }))

  await scenario(22, 'Receipt review, atomic save and rejected batch preserve the ledger', () => fixture(async page => {
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click(); await page.getByRole('button', { name: 'Ketik manual', exact: true }).click()
    await page.getByRole('button', { name: 'Scan struk', exact: true }).click()
    await page.getByText(/Gemini/).first().waitFor()
    assert.equal(await page.getByRole('button', { name: 'Baca otomatis', exact: true }).isDisabled(), true)
    await page.getByLabel('Foto struk', { exact: true }).setInputFiles({ name: 'receipt.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7V0AAAAASUVORK5CYII=', 'base64') })
    await page.getByAltText('Pratinjau foto struk').waitFor()
    await page.getByLabel('Nama toko (opsional)', { exact: true }).fill('Warung uji')
    await page.getByLabel('Nama item 1', { exact: true }).fill('Nasi')
    await page.getByLabel('Nominal item 1 (Rp)', { exact: true }).fill('25000')
    await page.getByRole('button', { name: 'Tambah item', exact: true }).click()
    await page.getByLabel('Nama item 2', { exact: true }).fill('Kopi')
    await page.getByLabel('Nominal item 2 (Rp)', { exact: true }).fill('5000')
    assert.equal((await dbRows(page, 'transactions')).length, 1, 'Review must not write before confirmation')
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      report.accessibility.push({ theme: 'Mochi', width, page: 'Scan struk', violations: audit.violations })

    }
    await page.getByRole('button', { name: 'Simpan semua item', exact: true }).click()
    await page.getByRole('dialog', { name: 'Tambah transaksi', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Tutup Tambah transaksi', exact: true }).click()
    assert.match(await page.getByLabel('Saldo periode', { exact: true }).innerText(), /970\.000/)
    const saved = (await dbRows(page, 'transactions')).filter(row => row.type === 'expense')
    assert.deepEqual(saved.map(row => row.amount).sort((a, b) => a - b), [5000, 25000])
    assert.equal(saved.some(row => 'image' in row || 'photo' in row), false)
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click(); await page.getByRole('button', { name: 'Ketik manual', exact: true }).click()
    await page.getByRole('button', { name: 'Scan struk', exact: true }).click()
    await page.getByLabel('Nama item 1', { exact: true }).fill('Tidak cukup dana')
    await page.getByLabel('Nominal item 1 (Rp)', { exact: true }).fill('2000000')
    await page.getByRole('button', { name: 'Simpan semua item', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.equal((await dbRows(page, 'transactions')).filter(row => row.type === 'expense').length, 2)
    assert.equal(await page.getByRole('dialog', { name: 'Scan struk', exact: true }).isVisible(), true)
  }))

  await scenario(23, 'Production excludes playground and serves scripts with distinct cache rules', () => fixture(async (page, context) => {
    const html = await (await context.request.get(host.base)).text()
    const script = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]
    assert.ok(script)
    const asset = await context.request.get(`${host.base}${script}`)
    assert.match(asset.headers()['content-type'], /javascript/)
    assert.match(asset.headers()['cache-control'], /immutable/)
    assert.doesNotMatch(asset.headers()['cache-control'], /no-cache/)
    assert.equal((await context.request.get(`${host.base}/sw.js`)).headers()['cache-control'], 'no-cache')
    assert.equal((await context.request.get(`${host.base}/riwayat`)).headers()['cache-control'], 'no-cache')
    await page.goto(`${host.base}/dev/ui`)
    await unlock(page)
    await page.getByRole('heading', { name: 'Beranda', exact: true }).waitFor()
    assert.equal(await page.getByRole('heading', { name: 'Ruang coba UI', exact: true }).count(), 0)
  }))

  if (!process.argv[2]) {
  // Layout/keyboard/contrast sweep, all mascot themes with real production header enforcement.
  await fixture(async (page, context) => {
    const response = await context.request.get(host.base)
    assert.doesNotMatch(response.headers()['content-security-policy'], /api\.groq\.com/)
    assert.match(response.headers()['content-security-policy'], /connect-src 'self'/)
    assert.equal(response.headers()['x-content-type-options'], 'nosniff')
    const manifest = await (await context.request.get(`${host.base}/manifest.webmanifest`)).json()
    for (const icon of manifest.icons) assert.equal((await context.request.get(`${host.base}/${icon.src}`)).status(), 200)
    report.pwa = { manifest: true, icons: true, headers: true, offline: report.scenarios.find(row => row.id === 9)?.pass }
    for (const name of ['Mochi', 'Luna', 'Bumi']) {
      await go(page, 'Atur'); await page.getByRole('button', { name: /^Maskot & Tema/ }).click()
      await page.getByRole('option', { name: new RegExp(name) }).click()
      await page.getByRole('button', { name: 'Pilih Maskot ini', exact: true }).click(); await settled(page)
      for (const width of [320, 375, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 }); await go(page, 'Riwayat')
        await page.getByText('Grafik periode', { exact: true }).click()
        await page.waitForTimeout(150)
        const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
          small: [...document.querySelectorAll('button,a[href],summary,select,input:not([type=hidden])')].filter(node => {
            const r = node.getBoundingClientRect(), style = getComputedStyle(node)
            return r.width && r.height && r.bottom > 0 && r.top < innerHeight && style.visibility !== 'hidden' && !node.closest('[inert]') && !node.matches('.skip-link') && (r.width < 43.9 || r.height < 43.9)
          }).map(node => node.getAttribute('aria-label') || node.textContent.slice(0, 40)) }))
        assert.ok(layout.scroll <= width); assert.deepEqual(layout.small, [])
        assert.equal(await page.locator('.history-summary strong').evaluateAll(nodes => nodes.some(node => node.scrollWidth > node.clientWidth)), false, 'Rupiah summaries must remain fully readable')
        const charts = page.locator('main').getByRole('img', { name: 'Pengeluaran per bucket', exact: true })
        assert.equal(await charts.count(), 1)
        report.layouts.push({ theme: name, ...layout })
        if (width === 320 || width === 1440) {
          const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
          report.accessibility.push({ theme: name, width, page: 'Riwayat', violations: audit.violations.map(row => ({ id: row.id, impact: row.impact, nodes: row.nodes.map(node => ({ target: node.target, summary: node.failureSummary, html: node.html.slice(0, 500), checks: [...node.any, ...node.all].map(check => ({ data: check.data, related: check.relatedNodes })) })) })) })
        }
        await page.getByText('Grafik periode', { exact: true }).click()
      }
      for (const tab of ['Home', 'Tabungan', 'Atur']) for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 900 }); await go(page, tab); await page.waitForTimeout(180)

        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        report.accessibility.push({ theme: name, width, page: tab, violations: audit.violations.map(row => ({ id: row.id, impact: row.impact, nodes: row.nodes.map(node => ({ target: node.target, summary: node.failureSummary, html: node.html.slice(0, 500), checks: [...node.any, ...node.all].map(check => ({ data: check.data, related: check.relatedNodes })) })) })) })
        if (tab === 'Home') {
          await page.getByRole('button', { name: 'Lihat tabungan', exact: true }).click()
          const backAudit = await new AxeBuilder({ page }).include('.dashboard-balance-stage').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
          report.accessibility.push({ theme: name, width, page: 'Home: flipped savings', violations: backAudit.violations })
          await assertSavingsFlipIcon(page)
          const pockets = await page.locator('.rb-flip--back .dashboard-savings-pocket').evaluateAll(nodes => nodes.map(node => {
            const r = node.getBoundingClientRect()
            return { left: r.left, right: r.right, width: innerWidth, clippedText: [...node.children].some(child => child.scrollWidth > child.clientWidth) }
          }))
          assert.ok(pockets.every(p => p.left >= 0 && p.right <= p.width && !p.clippedText), 'Visible savings pockets must fit the viewport and show their full text')
          await page.getByRole('button', { name: 'Kembali ke saldo periode', exact: true }).click()
        }
      }
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 900 }); await go(page, 'Atur')
        for (const label of ['Nama', 'Alokasi Bucket', 'Kelola Bucket', 'Awal Periode', 'Pemasukan Rutin', 'Format Rupiah', 'Ganti PIN', 'Export Backup', 'Import Backup', 'Data lama di browser ini', 'Layanan suara', 'Tentang Monee', 'Hapus Semua Data']) {
          const trigger = page.getByRole('button', { name: new RegExp(`^${label}`) })
          if (!await trigger.count()) continue
          await trigger.click(); await page.getByRole('dialog').waitFor()
          await auditSurface(page, name, width, `Atur: ${label}`)
          await page.keyboard.press('Escape'); await settled(page)
        }
        await page.getByRole('button', { name: /^Maskot & Tema/ }).click()
        await page.getByRole('listbox').waitFor(); await page.waitForTimeout(200)
        await auditSurface(page, name, width, 'Maskot & Tema')
        await page.keyboard.press('Escape'); await settled(page)
        await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click(); await page.getByRole('button', { name: 'Ketik manual', exact: true }).click()
        await page.getByLabel('Nominal (Rp)', { exact: true }).waitFor()
        await auditSurface(page, name, width, 'Catat: manual')
        await page.getByRole('button', { name: 'Scan struk', exact: true }).click()
        await page.getByLabel('Foto struk', { exact: true }).waitFor()
        assert.equal(await page.getByRole('checkbox').count(), 0)
        await auditSurface(page, name, width, 'Catat: struk')
        await page.keyboard.press('Escape')
        await page.getByLabel('Nominal (Rp)', { exact: true }).waitFor()
        await page.getByRole('button', { name: 'Catat dengan suara', exact: true }).click()
        await page.getByRole('button', { name: 'Mulai rekam', exact: true }).waitFor()
        assert.equal(await page.getByRole('checkbox').count(), 0)
        await auditSurface(page, name, width, 'Catat: suara')
        await page.keyboard.press('Escape'); await settled(page)
      }
    }
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click(); await page.getByRole('button', { name: 'Ketik manual', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true)
    await page.keyboard.press('Escape'); await settled(page)
    report.keyboard = true
  }, { txs: [income, { ...lunch, refundedAmount: 25000 }, deposit] })

  // Exercise empty and locked layouts at mobile and desktop widths.
  await fixture(async page => {
    assert.equal(await page.getByRole('button', { name: 'Tambah pemasukan', exact: true }).count(), 1)
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await go(page, 'Home')

    }
    await page.getByRole('button', { name: 'Kunci Monee', exact: true }).click()
    await page.getByLabel('PIN 6 digit', { exact: true }).waitFor()
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 })

    }
  }, { txs: [] })

  // Cold startup: fresh context/cache, local server, normal CPU; no device claim.
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext(), page = await context.newPage()
    await installQaAccount(context)
    await page.goto(host.base); await page.getByLabel('Nama panggilan').waitFor()
    const interactiveMs = await page.evaluate(() => performance.now())
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
    report.performance.push(await page.evaluate(interactiveMs => ({ interactiveMs, fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null }), interactiveMs))
    await context.close()
  }
  }
  report.deviceMatrix = report.layouts.map(row => ({ theme: row.theme, width: row.width, browser: 'Edge Chromium', kind: 'desktop viewport emulation', pass: true }))
  report.ok = report.scenarios.length === (process.argv[2] ? 1 : 23) && report.scenarios.every(row => row.pass) && !report.errors.length
    && report.accessibility.every(row => !row.violations.length) && report.performance.every(row => row.interactiveMs < 1000)
  if (!report.ok) process.exitCode = 1
} catch (error) { report.failure = error.stack; process.exitCode = 1 }
finally {
  await updateReport('app', report)
  await browser.close(); await host.close()
  console.log(JSON.stringify({ ...report, scenarios: report.scenarios.map(row => ({ ...row, error: row.error?.slice(0, 700) })), layouts: report.layouts.length }, null, 2))
}
