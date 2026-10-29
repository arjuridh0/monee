import { chromium, devices } from 'playwright'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serveProduction, outputFolder } from './lib/production.mjs'

const host = await serveProduction(), output = await outputFolder('pwa')
const browser = await chromium.launch({ channel: process.env.MONEE_BROWSER ?? 'msedge', headless: true })
const report = { ok: false, devices: [], pwa: {}, errors: [] }
async function unlock(page) {
  await page.getByLabel('PIN 6 digit', { exact: true }).fill('123456')
  await page.getByRole('navigation', { name: 'Navigasi utama' }).waitFor()
}
async function onboarding(page) {
  await page.getByLabel('Nama panggilan').fill('Nara')
  await page.getByRole('button', { name: 'Lanjut', exact: true }).click()
  await page.getByLabel('Nominal pemasukan (Rp)').fill('1000000')
  await page.getByRole('button', { name: 'Catat & lanjut', exact: true }).click()
  await page.getByRole('button', { name: 'Lanjut', exact: true }).click()
  await page.getByRole('button', { name: 'Pilih Maskot ini', exact: true }).click()
  await page.getByLabel('Buat PIN 6 digit', { exact: true }).fill('123456')
  await page.getByLabel('Ulangi PIN 6 digit', { exact: true }).fill('123456')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Selesai & masuk', exact: true }).click()
  await page.getByRole('heading', { name: 'Beranda', exact: true }).waitFor()
}
try {
  for (const name of ['Pixel 7', 'iPad Mini', 'Desktop Chrome']) {
    const context = await browser.newContext({ ...devices[name], reducedMotion: 'reduce', ...(name === 'Desktop Chrome' ? { viewport: { width: 1366, height: 768 } } : {}) })
    const page = await context.newPage(); page.setDefaultTimeout(15000)
    page.on('pageerror', error => report.errors.push(error.message))
    await page.goto(host.base); await onboarding(page)
    await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click()
    await page.getByRole('dialog', { name: 'Tambah transaksi' }).waitFor()
    assert.equal(await page.getByRole('navigation').count(), 0)
    await page.getByLabel('Nominal (Rp)', { exact: true }).fill('10000')
    const geometry = await page.getByRole('dialog').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x, width: r.width, bottom: r.bottom } })
    assert.ok(geometry.width <= (name === 'Pixel 7' ? 520 : 560))
    await page.screenshot({ path: resolve(output, `device-${name.replaceAll(' ', '-').toLowerCase()}.png`) })
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.match(await page.getByLabel('Saldo periode', { exact: true }).innerText(), /990\.000/)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflow, false)
    report.devices.push({ name, engine: 'Edge Chromium', emulated: true, touch: devices[name].hasTouch, geometry, pass: true })
    if (name === 'Pixel 7') {
      // The event is controlled; browser/OS installation itself is not emulated as a success.
      await page.evaluate(() => {
        window.__installPrompts = 0
        const event = new Event('beforeinstallprompt', { cancelable: true })
        event.prompt = async () => { window.__installPrompts++ }
        event.userChoice = Promise.resolve({ outcome: 'accepted' })
        window.dispatchEvent(event)
      })
      await page.getByRole('link', { name: 'Atur', exact: true }).click()
      await page.getByText('Aplikasi dan penyimpanan', { exact: true }).click()
      await page.getByRole('button', { name: 'Pasang Monee', exact: true }).click()
      await page.getByText('Permintaan pemasangan diterima browser.', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.__installPrompts), 1)
      assert.equal(await page.getByRole('button', { name: 'Pasang Monee', exact: true }).count(), 0)
      report.pwa.installEventFlow = 'controlled event; not OS installation'
      await page.evaluate(() => navigator.serviceWorker.ready)
      if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) { await page.reload(); await unlock(page) }
      await page.getByRole('link', { name: 'Home', exact: true }).click()
      await page.getByRole('button', { name: 'Tambah transaksi', exact: true }).click()
      await page.getByLabel('Nominal (Rp)', { exact: true }).fill('25000')
      host.reviseWorker('qa-update')
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update() })
      await page.locator('.pwa-update').waitFor()
      assert.equal(await page.getByLabel('Nominal (Rp)', { exact: true }).inputValue(), '25000')
      report.pwa.updateKeepsDraft = true
      await page.getByRole('button', { name: 'Tutup Tambah transaksi' }).click()
      await page.getByRole('button', { name: 'Nanti', exact: true }).click()
      assert.equal(await page.locator('.pwa-update').count(), 0)
      await page.reload(); await unlock(page)
      await page.getByRole('button', { name: 'Perbarui sekarang', exact: true }).waitFor()
      const navigation = page.waitForEvent('framenavigated', frame => frame === page.mainFrame())
      await page.getByRole('button', { name: 'Perbarui sekarang', exact: true }).click(); await navigation
      await unlock(page)
      assert.match(await page.getByLabel('Saldo periode', { exact: true }).innerText(), /990\.000/)
      report.pwa.actualWorkerUpdate = true
      await context.setOffline(true); await page.reload(); await unlock(page)
      assert.match(await page.getByLabel('Saldo periode', { exact: true }).innerText(), /990\.000/)
      report.pwa.offlineAfterUpdate = true
      await context.setOffline(false)
      const probe = await context.newPage()
      for (const route of ['/api/missing', '/api?probe=1', '/cdn-cgi/access/logout']) {
        const response = await probe.goto(host.base + route)
        assert.equal(response.status(), 404)
        assert.equal(response.fromServiceWorker(), false)
      }
      const authResponse = probe.waitForResponse(response => new URL(response.url()).pathname === '/auth/refresh')
      await probe.goto(host.base + '/auth/refresh')
      const refresh = await authResponse
      assert.equal(refresh.status(), 302)
      assert.equal(refresh.fromServiceWorker(), false)
      assert.equal(new URL(probe.url()).pathname, '/')
      report.pwa.apiAndAccessBypassShell = true
      report.pwa.reauthenticationReachesNetwork = true
      await probe.close()
    }
    await context.close()
  }
  assert.deepEqual(report.errors, []); report.ok = true
} catch (error) { report.failure = error.stack; process.exitCode = 1 }
finally {
  await writeFile(resolve(output, 'pwa-device-report.json'), JSON.stringify(report, null, 2))
  await browser.close(); await host.close(); console.log(JSON.stringify(report, null, 2))
}
