import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { userInfo } from 'node:os'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export function verifyImageVersion(info, versions) {
  const version = versions[0]
  assert.match(version, /^\d+\.\d+\.\d+$/)
  assert.ok(versions.every(value => value === version), `Playwright 依赖版本不一致：${versions.join(', ')}`)
  assert.equal(info?.driverVersion, version, '预装镜像与实际 Playwright 版本不一致')
  assert.equal(info?.dockerImageName, `mcr.microsoft.com/playwright:v${version}-noble`, '必须使用匹配的官方 Noble 镜像')
}

export function verifyBrowserHome(homeDirectory, account, ownerUid) {
  assert.equal(homeDirectory, account.homedir, '浏览器 HOME 必须与容器实际用户一致')
  assert.equal(ownerUid, account.uid, '浏览器 HOME 必须属于当前容器用户')
}

export async function verifyBrowserRendering(playwright, engines) {
  assert.ok(engines.length > 0 && engines.every(name => ['chromium', 'firefox', 'webkit'].includes(name)), '必须指定受支持的浏览器')
  for (const name of engines) {
    const browser = await playwright[name].launch({ headless: true, timeout: 30_000 })
    try {
      const page = await browser.newPage()
      page.setDefaultTimeout(5_000)
      await page.setContent('<!doctype html><title>Playwright CI probe</title><p id="probe" style="color: rgb(1, 2, 3)">中文 ready 🎨</p>')
      const probe = page.locator('#probe')
      await probe.waitFor({ state: 'visible' })
      assert.equal(await page.title(), 'Playwright CI probe')
      assert.equal(await probe.textContent(), '中文 ready 🎨')
      assert.equal(await probe.evaluate(node => getComputedStyle(node).color), 'rgb(1, 2, 3)')
      const png = await page.screenshot({ timeout: 5_000 })
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', '浏览器必须产生实际 PNG')
      console.log(`${name} 预装浏览器已通过后台渲染：${browser.version()}`)
    }
    finally {
      await browser.close()
    }
  }
}

async function main() {
  // 此入口只用于官方 Linux CI 容器，拒绝用户缓存或下载兜底。
  assert.equal(process.platform, 'linux')
  assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, '/ms-playwright')
  const account = userInfo()
  verifyBrowserHome(process.env.HOME, account, (await stat(account.homedir)).uid)
  const rootRequire = createRequire(new URL('../../package.json', import.meta.url))
  const websiteRequire = createRequire(new URL('../../website/package.json', import.meta.url))
  const websiteDriver = createRequire(websiteRequire.resolve('@playwright/test/package.json'))
  const versions = [
    rootRequire('playwright/package.json').version,
    websiteRequire('@playwright/test/package.json').version,
    websiteDriver('playwright/package.json').version,
  ]
  const info = JSON.parse(await readFile('/ms-playwright/.docker-info', 'utf8'))
  verifyImageVersion(info, versions)
  await verifyBrowserRendering(rootRequire('playwright'), process.argv.slice(2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
