import path from 'node:path'
import { chromium } from 'playwright'
import { expect } from 'vitest'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { CaseCard } from '../../examples/react-lynx/src/components/CaseCard'
import { repoRoot } from './catalog'
import { evaluateColorScheme } from './color-scheme'
import { fixtureHtml } from './fixture-html'
import { PNG } from './png'

/** 核对真实媒体条件和文字消费节点；浏览器不替代原生颜色模式取证。 */
export async function verifyDarkFixture(css: string) {
  const item = compatibilityCases.find(item => item.id === 'variant-dark')!
  const browser = await chromium.launch({ headless: true })
  try {
    for (const scale of [1, 2.625, 3]) {
      const page = await browser.newPage({ viewport: { width: 600, height: 800 }, colorScheme: 'light', deviceScaleFactor: scale })
      await page.setContent(`<style>${css}</style>${fixtureHtml(CaseCard({ item }))}`)
      const probe = page.locator('#probe-variant-dark .probe-dark-text')
      const control = page.locator('#control-variant-dark .probe-dark-text')
      const color = (prefix: string) => page.locator(`#${prefix}-variant-dark .probe-dark-text`).evaluate(element => getComputedStyle(element).color)
      const images = []
      for (const phase of ['light', 'dark', 'restored'] as const) {
        const scheme = phase === 'dark' ? 'dark' : 'light'
        await page.emulateMedia({ colorScheme: scheme })
        expect(await color('probe')).toBe(scheme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(19, 32, 38)')
        expect(await color('control')).toBe('rgb(19, 32, 38)')
        for (const prefix of ['probe', 'control']) {
          const bytes = await page.locator(`#${prefix}-container-variant-dark`).screenshot({ path: path.join(repoRoot, 'e2e/.artifacts/lynx-static', `dark-${scale}-${phase}-${prefix}.png`) })
          if (phase !== 'restored') {
            images.push(PNG.sync.read(bytes))
          }
        }
      }
      expect(evaluateColorScheme(images).status).toBe('supported')
      await page.emulateMedia({ colorScheme: 'dark' })
      await probe.evaluate((element, candidate) => element.classList.remove(candidate), item.className)
      expect(await color('probe')).toBe(await color('control'))
      expect(await control.textContent()).toBe(await probe.textContent())
      images[2] = PNG.sync.read(await page.locator('#probe-container-variant-dark').screenshot())
      expect(evaluateColorScheme(images).status).toBe('unsupported')
      await page.close()
    }
  }
  finally {
    await browser.close()
  }
}
