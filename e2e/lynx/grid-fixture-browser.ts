import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { expect } from 'vitest'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { evaluateGeometry } from '../../examples/react-lynx/src/compatibility/geometry'
import { CaseCard } from '../../examples/react-lynx/src/components/CaseCard'
import { repoRoot } from './catalog'
import { fixtureHtml } from './fixture-html'

/** 用实际组件结构及送入 encoder 的 CSS 核对标准几何；不替代 Lynx 原生验收。 */
export async function verifyGridFixtures(css: string) {
  const browser = await chromium.launch({ headless: true })
  const artifacts = path.join(repoRoot, 'e2e/.artifacts/lynx-static')
  const samples: unknown[] = []
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 500 } })
    try {
      for (const id of ['grid-placement', 'grid-auto', 'grid-justify-self', 'variant-supports']) {
        const item = compatibilityCases.find(item => item.id === id)!
        await page.setContent(`<style>${css}</style>${fixtureHtml(CaseCard({ item }))}`)
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
        const evidence = await read()
        samples.push({ id, evidence })
        if (id === 'variant-supports') {
          expect(evidence.probeChild.left - evidence.probe.left).toBeCloseTo(44, 1)
          expect(evidence.controlChild.left - evidence.control.left).toBeCloseTo(0, 1)
          expect(evidence.controlChild.top - evidence.control.top).toBeCloseTo(16, 1)
        }
        expect(evaluateGeometry(item, evidence), id).toMatchObject({ status: 'supported' })
        const probe = page.locator(`#probe-${id}`)
        const classes = await probe.getAttribute('class')
        for (const candidate of item.className.split(/\s+/)) {
          await probe.evaluate((element, candidate) => element.classList.remove(candidate), candidate)
          const missing = await read()
          samples.push({ id, missing: candidate, evidence: missing })
          expect(evaluateGeometry(item, missing), `${id} 缺少 ${candidate}`).toMatchObject({ status: 'unsupported' })
          await probe.evaluate((element, classes) => element.setAttribute('class', classes!), classes)
        }
        if (id === 'variant-supports') {
          await page.locator(`#control-${id}`).evaluate((element) => {
            element.style.display = 'grid'
          })
          const flattened = await read()
          samples.push({ id, mutation: '无效条件被展平', evidence: flattened })
          expect(evaluateGeometry(item, flattened)).toMatchObject({ status: 'not-tested' })
        }
      }
    }
    catch (error) {
      await page.screenshot({ path: path.join(artifacts, 'grid-fixture-failure.png') })
      throw error
    }
    finally {
      await fs.writeFile(path.join(artifacts, 'grid-fixtures.json'), `${JSON.stringify(samples, null, 2)}\n`)
    }
  }
  finally {
    await browser.close()
  }
}
