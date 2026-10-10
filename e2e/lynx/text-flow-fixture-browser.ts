import type { PngPixels } from './png'
import { chromium } from 'playwright'
import { expect } from 'vitest'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { CaseCard } from '../../examples/react-lynx/src/components/CaseCard'
import { createFixtureDiagnostics } from './fixture-diagnostics'
import { fixtureHtml } from './fixture-html'
import { evaluateTextFlow } from './text-flow'
import { textPixelBrowserOptions } from './text-pixel-browser'

/** 在实际组件和 encoder 输入 CSS 上证明每项 utility 必须独立生效。 */
export async function verifyTextFlowFixture(css: string) {
  const item = compatibilityCases.find(item => item.id === 'type-flow')!
  const launchOptions = textPixelBrowserOptions()
  const browser = await chromium.launch(launchOptions)
  try {
    for (const { scale, font } of [1, 2.625, 3].flatMap(scale => ['serif', 'sans-serif', 'system-ui'].map(font => ({ scale, font })))) {
      const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: scale })
      const diagnostics = createFixtureDiagnostics(page, { name: `text-flow-${font}-${scale}`, caseId: item.id, launchOptions })
      await diagnostics.verify(async () => {
        await page.setContent(`<style>${css}\n.probe-flow-line,.probe-flow-text,.probe-flow-row { font-family:${font}; }</style>${fixtureHtml(CaseCard({ item }))}`)
        const images: PngPixels[] = []
        for (const frame of ['probe', 'control', 'reference']) {
          images.push(await diagnostics.capture(frame, `#${frame}-container-${item.id}`))
        }
        expect(evaluateTextFlow(images).status).toBe('supported')
        for (const [selector, candidate] of [['.probe-flow-marker', 'align-middle'], ['.probe-flow-text', 'whitespace-pre-wrap']]) {
          const target = page.locator(`#probe-type-flow ${selector}`)
          await target.evaluate((element, value) => element.classList.remove(value!), candidate)
          images[0] = await diagnostics.capture('probe', '#probe-container-type-flow', `removed-${candidate}`)
          expect(evaluateTextFlow(images).status).toBe('unsupported')
          await target.evaluate((element, value) => element.classList.add(value!), candidate)
        }
        for (const whitespace of ['normal', 'pre-line', 'pre', 'nowrap']) {
          await page.locator('#probe-type-flow .probe-flow-text').evaluate((element, value) => element.setAttribute('style', `white-space:${value}`), whitespace)
          images[0] = await diagnostics.capture('probe', '#probe-container-type-flow', `whitespace-${whitespace}`)
          expect(evaluateTextFlow(images).status, whitespace).toBe('unsupported')
        }
      })
      await page.close()
    }
  }
  finally {
    await browser.close()
  }
}
