import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { expect } from 'vitest'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { evaluateGeometry } from '../../examples/react-lynx/src/compatibility/geometry'
import { CaseCard } from '../../examples/react-lynx/src/components/CaseCard'
import { repoRoot } from './catalog'
import { fixtureHtml } from './fixture-html'

/** 用实际组件和 encoder 输入 CSS 验证 flex 压力；浏览器几何不替代原生验收。 */
export async function verifyFlexFixture(css: string, id: string) {
  const item = compatibilityCases.find(item => item.id === id)!
  const browser = await chromium.launch({ headless: true })
  const artifacts = path.join(repoRoot, 'e2e/.artifacts/lynx-static')
  const samples: unknown[] = []
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 900 } })
    try {
      const render = () => page.setContent(`<style>${css}</style>${fixtureHtml(CaseCard({ item }))}`)
      const read = () => page.evaluate((id) => {
        const rect = (name: string) => document.getElementById(name)!.getBoundingClientRect().toJSON()
        return {
          probe: rect(`probe-${id}`),
          control: rect(`control-${id}`),
          probeContainer: rect(`probe-container-${id}`),
          controlContainer: rect(`control-container-${id}`),
          probeChild: rect(`probe-child-${id}-a`),
          controlChild: rect(`probe-child-control-${id}-a`),
        }
      }, id)
      await render()
      const evidence = await read()
      samples.push({ evidence })
      // 数值来自 160px 画布、两侧 6px padding 与显式竞争项，不从判定器读取预期。
      expect(evidence.probeContainer.width).toBeCloseTo(160, 1)
      if (id === 'flex-grow') {
        expect(evidence.probe.width).toBeCloseTo(91, 1)
        expect(evidence.control.width).toBeCloseTo(24, 1)
      }
      else if (id === 'flex-wrap-order') {
        expect(evidence.probe.left - evidence.probeContainer.left).toBeCloseTo(30, 1)
        expect(evidence.probe.height).toBeCloseTo(52, 1)
        expect(evidence.probeChild.top - evidence.probe.top).toBeCloseTo(28, 1)
      }
      else {
        expect(evidence.probe.width).toBeCloseTo(108, 1)
        expect(evidence.probeChild.width).toBeCloseTo(80, 1)
        expect(evidence.controlChild.width).toBeCloseTo(12, 1)
      }
      expect(evaluateGeometry(item, evidence)).toMatchObject({ status: 'supported' })
      for (const candidate of item.className.split(/\s+/)) {
        await render()
        await page.evaluate(candidate => document.querySelectorAll(`.${CSS.escape(candidate)}`).forEach(element => element.classList.remove(candidate)), candidate)
        const missing = await read()
        samples.push({ missing: candidate, evidence: missing })
        expect(evaluateGeometry(item, missing), `${id} 缺少 ${candidate}`).toMatchObject({ status: 'unsupported' })
      }
    }
    catch (error) {
      await page.screenshot({ path: path.join(artifacts, `${id}-failure.png`) })
      throw error
    }
  }
  finally {
    try {
      await fs.writeFile(path.join(artifacts, `${id}-fixtures.json`), `${JSON.stringify(samples, null, 2)}\n`)
    }
    finally {
      await browser.close()
    }
  }
}
