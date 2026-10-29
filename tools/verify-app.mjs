import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serveProduction, outputFolder } from './lib/production.mjs'
import AxeBuilder from '@axe-core/playwright'

const host = await serveProduction(), output = await outputFolder('app')
const browser = await chromium.launch({ headless: true, channel: process.env.MONEE_BROWSER ?? 'msedge' })
const report = { ok: false, scenarios: [], errors: [], layouts: [], performance: [], pwa: {}, deviceMatrix: [], accessibility: [] }
const today = '2026-10-26'
const common = { date: today, createdAt: 1, updatedAt: 1 }
const income = { ...common, id: 'salary', type: 'income', categoryId: 'cat-gaji', amount: 1000000 }
const deposit = { ...common, id: 'deposit', type: 'savings_deposit', categoryId: 'cat-tabungan', bucketId: 'bucket-savings', amount: 150000 }
const lunch = { ...common, id: 'lunch', type: 'expense', categoryId: 'cat-makan', bucketId: 'bucket-needs', amount: 100000, note: 'Makan uji' }

async function dbRows(page, store) {
  return page.evaluate(async store => {
    const db = await new Promise(done => { const r = indexedDB.open('monee-db'); r.onsuccess = () => done(r.result) })
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
}
async function add(page, amount, kind = 'expense', date) {
  await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click()
  if (kind === 'income') await page.getByRole('radio', { name: 'Pemasukan', exact: true }).click()
  await page.getByLabel('Nominal (Rp)', { exact: true }).fill(String(amount))
  if (date) await page.getByLabel('Tanggal', { exact: true }).fill(date)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}
async function settled(page) { await page.getByRole('dialog').waitFor({ state: 'hidden' }) }
async function fixture(run, options = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage(); page.setDefaultTimeout(12000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.clock.setFixedTime(new Date(`${today}T03:00:00Z`))
  try {
    await page.goto(host.base); await page.getByLabel('Nama panggilan').waitFor()
    if (!options.fresh) {
      await page.evaluate(async ({ txs, goals }) => {
        const db = await new Promise(done => { const r = indexedDB.open('monee-db'); r.onsuccess = () => done(r.result) })
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
async function screenshot(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true })
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
  await scenario(3, 'Tema carousel tersimpan setelah reload', () => fixture(async page => {
    await go(page, 'Atur'); await page.getByRole('button', { name: /^Maskot & Tema/ }).click()
    await page.getByRole('button', { name: 'Pilih Luna', exact: true }).click()
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
    await go(page, 'Atur'); await page.getByRole('button', { name: /^Export Backup/ }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Unduh backup JSON', exact: true }).click()
    const path = resolve(output, 'roundtrip.json'); await (await download).saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8'))
    await page.getByRole('button', { name: 'Tutup Export Backup', exact: true }).click()
    if (await page.getByLabel('PIN 6 digit', { exact: true }).isVisible()) await unlock(page)
    await page.getByRole('button', { name: /^Hapus Semua Data/ }).click()
    await page.getByLabel('PIN untuk konfirmasi hapus', { exact: true }).fill('123456')
    await page.getByLabel(/Saya paham data di perangkat ini/).check()
    await page.getByRole('button', { name: 'Hapus semua data', exact: true }).click()
    await page.getByLabel('Nama panggilan').waitFor()
    // A new empty local profile is required to reach the protected import settings.
    await onboard(page, false); await go(page, 'Atur')
    await page.getByRole('button', { name: /^Import Backup/ }).click()
    await page.getByLabel('File backup JSON').setInputFiles(path)
    await page.getByLabel(/Saya paham seluruh data/).check()
    await page.getByRole('button', { name: 'Validasi & pulihkan', exact: true }).click()
    await unlock(page)
    assert.deepEqual(await dbRows(page, 'transactions'), backup.stores.transactions)
    assert.deepEqual(await dbRows(page, 'goals'), backup.stores.goals)
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
  }))
  await scenario(11, 'Navigasi root di empat tab, tidak aksesibel dalam modal/onboarding/lock', () => fixture(async page => {
    for (const tab of ['Home', 'Riwayat', 'Tabungan', 'Atur']) { await go(page, tab); assert.equal(await page.getByRole('navigation').count(), 1) }
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click()
    await page.getByRole('dialog', { name: 'Tambah transaksi' }).waitFor()
    await page.getByRole('navigation').waitFor({ state: 'hidden' })
    assert.equal(await page.getByRole('navigation').count(), 0)
    await page.getByRole('button', { name: 'Catat dengan suara', exact: true }).click()
    await page.getByRole('dialog', { name: 'Catat dengan suara' }).waitFor()
    assert.equal(await page.getByRole('navigation').count(), 0)
    await page.getByRole('button', { name: 'Tutup Catat dengan suara' }).click()
    await page.getByRole('button', { name: 'Tutup Tambah transaksi' }).click()
    await go(page, 'Home'); await page.getByRole('button', { name: 'Kunci Monee' }).click()
    await page.getByLabel('PIN 6 digit', { exact: true }).waitFor(); assert.equal(await page.getByRole('navigation').count(), 0)
    // OCR is out of v1; no nonexistent screen is counted as tested.
  }))
  await scenario(12, 'Perpindahan tab normal selesai dalam kontrak 300ms', () => fixture(async page => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await go(page, 'Riwayat'); await page.waitForTimeout(330)
    const transform = await page.locator('.tab-content:not([aria-hidden])').evaluate(node => getComputedStyle(node).transform)
    assert.equal(transform, 'none')
    assert.equal(await page.locator('.nav-active-pill').count(), 1)
  }))
  await scenario(13, 'Bottom nav <768 dan sidebar ≥768', () => fixture(async page => {
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.locator(width >= 768 ? '.sidebar' : '.bottom-nav').waitFor()
      assert.equal(await page.locator('.sidebar').count(), width >= 768 ? 1 : 0)
      assert.equal(await page.locator('.bottom-nav').count(), width < 768 ? 1 : 0)
    }
  }))
  await scenario(14, 'Empty Riwayat memiliki satu CTA utama dan nav utuh', () => fixture(async page => {
    await go(page, 'Riwayat'); await page.getByText('Belum ada transaksi', { exact: true }).waitFor()
    const empty = page.locator('.history-empty')
    assert.equal(await empty.locator('.ui-button--primary').count(), 1)
    await empty.getByRole('button', { name: /Catat|Tambah/ }).click()
    await page.getByRole('dialog', { name: 'Tambah transaksi' }).waitFor()
  }, { txs: [] }))
  await scenario(15, 'Gangguan DB: maskot sad, kode, assurance dan retry memulihkan layar', () => fixture(async page => {
    await page.addInitScript(() => {
      const transaction = IDBDatabase.prototype.transaction
      window.__blockRead = true
      IDBDatabase.prototype.transaction = function (...args) {
        if (window.__blockRead) throw new DOMException('Simulated read failure', 'UnknownError')
        return transaction.apply(this, args)
      }
    })
    await page.reload(); await page.getByText('ERR_DATA_READ', { exact: true }).waitFor()
    assert.equal(await page.locator('.mascot-canvas[data-state="sad"]').count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Coba lagi', exact: true }).count(), 1)
    await page.evaluate(() => { window.__blockRead = false })
    await page.getByRole('button', { name: 'Coba lagi', exact: true }).click(); await unlock(page)
  }))
  await scenario(16, 'Notch dan FAB 60px tidak bertabrakan dengan empat link', () => fixture(async page => {
    await page.waitForFunction(() => {
      const nav = document.querySelector('.bottom-nav'), button = nav?.querySelector('.nav-add')
      if (!nav || !button) return false
      const n = nav.getBoundingClientRect(), r = button.getBoundingClientRect()
      return Math.abs(r.y + r.height / 2 - n.top) <= 1
    })
    const geometry = await page.locator('.bottom-nav').evaluate(nav => {
      const fab = nav.querySelector('.nav-add').getBoundingClientRect(), box = nav.getBoundingClientRect()
      return { fab: { x: fab.x, y: fab.y, width: fab.width, height: fab.height }, top: box.top,
        notch: getComputedStyle(nav, '::before').width,
        overlaps: [...nav.querySelectorAll('a')].some(node => { const r = node.getBoundingClientRect(); return r.left < fab.right && r.right > fab.left && r.top < fab.bottom && r.bottom > fab.top }) }
    })
    report.notchGeometry = geometry
    assert.equal(geometry.fab.width, 60); assert.equal(geometry.notch, '60px'); assert.equal(geometry.overlaps, false)
    assert.ok(Math.abs(geometry.fab.y + geometry.fab.height / 2 - geometry.top) <= 1, 'FAB center must sit on the notch edge, protruding 30px as specified in doc 04')
  }))
  await scenario(17, 'Hard cap menolak expense dan mempertahankan nominal', () => fixture(async page => {
    await add(page, 500000)
    await page.getByText(/ERR_JATAH_HABIS/).waitFor()
    assert.equal(await page.getByLabel('Nominal (Rp)', { exact: true }).inputValue(), '500000')
    assert.equal((await dbRows(page, 'transactions')).length, 1)
  }))
  await scenario(18, 'Saldo kurang setelah setoran besar meski jatah masih cukup', () => fixture(async page => {
    await add(page, 200000); await page.getByText(/ERR_SALDO_KURANG/).waitFor()
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
    await add(page, 10000, 'expense', today); await page.getByText(/ERR_PERIODE_TERKUNCI/).waitFor()
    await page.getByRole('button', { name: 'Tutup Tambah transaksi' }).click(); await go(page, 'Riwayat')
    await page.getByRole('button', { name: 'Periode sebelumnya' }).click()
    await page.getByRole('button', { name: /Makan.*100.000/ }).click()
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
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click()
    await page.getByRole('button', { name: 'Scan struk', exact: true }).click()
    await page.getByText(/Model pembaca otomatis belum dikonfigurasi/).waitFor()
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
      await screenshot(page, `receipt-review-${width}`)
    }
    await page.getByRole('button', { name: 'Simpan semua item', exact: true }).click()
    await page.getByRole('dialog', { name: 'Tambah transaksi', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Tutup Tambah transaksi', exact: true }).click()
    assert.match(await page.getByLabel('Saldo periode', { exact: true }).innerText(), /970\.000/)
    const saved = (await dbRows(page, 'transactions')).filter(row => row.type === 'expense')
    assert.deepEqual(saved.map(row => row.amount).sort((a, b) => a - b), [5000, 25000])
    assert.equal(saved.some(row => 'image' in row || 'photo' in row), false)
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click()
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
      await page.getByRole('button', { name: `Pilih ${name}`, exact: true }).click()
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
        const charts = page.locator('main').getByRole('img', { name: 'Pengeluaran per kategori', exact: true })
        assert.equal(await charts.count(), 1)
        report.layouts.push({ theme: name, ...layout }); await screenshot(page, `charts-${name.toLowerCase()}-${width}`)
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
      }
    }
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true)
    await page.keyboard.press('Escape'); await settled(page)
    report.keyboard = true
  }, { txs: [income, { ...lunch, refundedAmount: 25000 }, deposit] })

  // Cold startup: fresh context/cache, local server, normal CPU; no device claim.
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto(host.base); await page.getByLabel('Nama panggilan').waitFor()
    const interactiveMs = await page.evaluate(() => performance.now())
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
    report.performance.push(await page.evaluate(interactiveMs => ({ interactiveMs, fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null }), interactiveMs))
    await context.close()
  }
  report.deviceMatrix = report.layouts.map(row => ({ theme: row.theme, width: row.width, browser: 'Edge Chromium', kind: 'desktop viewport emulation', pass: true }))
  report.ok = report.scenarios.length === (process.argv[2] ? 1 : 23) && report.scenarios.every(row => row.pass) && !report.errors.length
    && report.accessibility.every(row => !row.violations.length) && report.performance.every(row => row.interactiveMs < 1000)
  if (!report.ok) process.exitCode = 1
} catch (error) { report.failure = error.stack; process.exitCode = 1 }
finally {
  await writeFile(resolve(output, process.argv[2] ? `report-case-${Number(process.argv[2])}.json` : 'report.json'), JSON.stringify(report, null, 2))
  await browser.close(); await host.close()
  console.log(JSON.stringify({ ...report, scenarios: report.scenarios.map(row => ({ ...row, error: row.error?.slice(0, 700) })), layouts: report.layouts.length }, null, 2))
}
