import type { PngPixels } from './png'
import { chromium } from 'playwright'
import { expect } from 'vitest'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { CaseCard } from '../../examples/react-lynx/src/components/CaseCard'
import { createFixtureDiagnostics } from './fixture-diagnostics'
import { fixtureHtml } from './fixture-html'
import { evaluateStructural } from './structural'
import { textPixelBrowserOptions } from './text-pixel-browser'

/** 同时验证选择器的命中位置、非命中位置和每条 utility 的必要性。 */
export async function verifyStructuralFixture(css: string) {
  const item = compatibilityCases.find(item => item.id === 'variant-structural')!
  const launchOptions = textPixelBrowserOptions()
  const browser = await chromium.launch(launchOptions)
  try {
    for (const scale of [1, 2.625, 3]) {
      const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: scale })
      const diagnostics = createFixtureDiagnostics(page, { name: `structural-${scale}`, caseId: item.id, launchOptions })
      await diagnostics.verify(async () => {
        await page.setContent(`<style>${css}</style>${fixtureHtml(CaseCard({ item }))}`)
        const lines = page.locator('#probe-variant-structural .probe-structural-line')
        const styles = await lines.evaluateAll(elements => elements.map(element => ({ weight: getComputedStyle(element).fontWeight, opacity: getComputedStyle(element).opacity })))
        const images: PngPixels[] = []
        for (const frame of ['probe', 'control', 'reference']) {
          images.push(await diagnostics.capture(frame, `#${frame}-container-${item.id}`))
        }
        expect(styles).toEqual([{ weight: '700', opacity: '0.5' }, { weight: '400', opacity: '1' }, { weight: '400', opacity: '0.5' }])
        expect(evaluateStructural(images).status).toBe('supported')
        for (const [index, candidate] of item.className.split(/\s+/).entries()) {
          await lines.evaluateAll((elements, value) => elements.forEach(element => element.classList.remove(value)), candidate)
          images[0] = await diagnostics.capture('probe', `#probe-container-${item.id}`, `removed-${index}`)
          expect(evaluateStructural(images).status).toBe('unsupported')
          await lines.evaluateAll((elements, value) => elements.forEach(element => element.classList.add(value)), candidate)
        }
        // 模拟错误地移除伪类限制：偶数项或第三项不得获得首项效果。
        await lines.evaluateAll(elements => elements.forEach(element => element.setAttribute('style', 'font-weight:700;opacity:0.5')))
        images[0] = await diagnostics.capture('probe', `#probe-container-${item.id}`, 'incorrect-effect')
        expect(evaluateStructural(images).status).toBe('unsupported')
        await lines.evaluateAll(elements => elements.forEach(element => element.removeAttribute('style')))
        await lines.first().evaluate(element => element.setAttribute('style', 'font-size:34px;font-weight:400;opacity:0.5'))
        await page.locator('#reference-variant-structural .probe-structural-text').first().evaluate(element => element.setAttribute('style', 'font-size:34px;font-weight:400;opacity:0.5'))
        images[0] = await diagnostics.capture('probe', `#probe-container-${item.id}`, 'resized-text')
        images[2] = await diagnostics.capture('reference', `#reference-container-${item.id}`, 'resized-text')
        expect(() => evaluateStructural(images)).toThrow('对照')
      })
      await page.close()
    }
  }
  finally {
    await browser.close()
  }
}
