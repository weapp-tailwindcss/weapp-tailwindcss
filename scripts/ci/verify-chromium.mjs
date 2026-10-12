import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, timeout: 30_000 })
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(5_000)
  await page.setContent('<!doctype html><title>Chromium CI probe</title><p id="probe" style="color: rgb(1, 2, 3)">ready</p>')
  await page.locator('#probe').waitFor({ state: 'visible' })
  assert.equal(await page.title(), 'Chromium CI probe')
  assert.equal(await page.locator('#probe').textContent(), 'ready')
  assert.equal(await page.locator('#probe').evaluate(node => getComputedStyle(node).color), 'rgb(1, 2, 3)')
  console.log(`Chromium 已通过后台启动与页面渲染验证：${browser.version()}`)
}
finally {
  await browser.close()
}
