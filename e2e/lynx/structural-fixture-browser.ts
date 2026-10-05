import path from 'node:path'
import { chromium } from 'playwright'
import { expect } from 'vitest'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { CaseCard } from '../../examples/react-lynx/src/components/CaseCard'
import { repoRoot } from './catalog'
import { fixtureHtml } from './fixture-html'
import { PNG } from './png'
import { evaluateStructural } from './structural'

/** 同时验证选择器的命中位置、非命中位置和每条 utility 的必要性。 */
export async function verifyStructuralFixture(css: string) {
  const item = compatibilityCases.find(item => item.id === 'variant-structural')!
  const browser = await chromium.launch({ headless: true })
  try {
    for (const scale of [1, 2.625, 3]) {
      const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: scale })
      await page.setContent(`<style>${css}</style>${fixtureHtml(CaseCard({ item }))}`)
      const text = page.locator('#probe-variant-structural .probe-structural-text')
      const styles = await text.evaluateAll(elements => elements.map(element => ({ weight: getComputedStyle(element).fontWeight, opacity: getComputedStyle(element).opacity })))
      expect(styles).toEqual([{ weight: '700', opacity: '0.5' }, { weight: '400', opacity: '1' }, { weight: '400', opacity: '0.5' }])
      const images = []
      for (const frame of ['probe', 'control', 'reference']) {
        images.push(PNG.sync.read(await page.locator(`#${frame}-container-${item.id}`).screenshot({ path: path.join(repoRoot, 'e2e/.artifacts/lynx-static', `structural-${scale}-${frame}.png`) })))
      }
      expect(evaluateStructural(images).status).toBe('supported')
      for (const candidate of item.className.split(/\s+/)) {
        await text.evaluateAll((elements, value) => elements.forEach(element => element.classList.remove(value)), candidate)
        images[0] = PNG.sync.read(await page.locator(`#probe-container-${item.id}`).screenshot())
        expect(evaluateStructural(images).status).toBe('unsupported')
        await text.evaluateAll((elements, value) => elements.forEach(element => element.classList.add(value)), candidate)
      }
      // 模拟错误地移除伪类限制：偶数项或第三项不得获得首项效果。
      await text.evaluateAll(elements => elements.forEach(element => element.setAttribute('style', 'font-weight:700;opacity:0.5')))
      images[0] = PNG.sync.read(await page.locator(`#probe-container-${item.id}`).screenshot())
      expect(evaluateStructural(images).status).toBe('unsupported')
      await page.close()
    }
  }
  finally {
    await browser.close()
  }
}
