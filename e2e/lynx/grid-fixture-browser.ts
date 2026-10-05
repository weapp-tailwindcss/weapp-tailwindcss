import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { expect } from 'vitest'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { evaluateGeometry } from '../../examples/react-lynx/src/compatibility/geometry'
import { GridProbePair } from '../../examples/react-lynx/src/components/GridProbePair'
import { repoRoot } from './catalog'

function html(tree: unknown): string {
  if (Array.isArray(tree)) {
    return tree.map(html).join('')
  }
  if (!tree || typeof tree !== 'object' || !('type' in tree) || !('props' in tree)) {
    return ''
  }
  const node = tree as { type: string, props: { id?: string, className?: string, children?: unknown } }
  if (node.type !== 'view') {
    throw new Error(`grid 夹具出现未支持的节点：${node.type}`)
  }
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  return `<div id="${escape(node.props.id ?? '')}" class="${escape(node.props.className ?? '')}">${html(node.props.children)}</div>`
}

/** 用实际组件结构及送入 encoder 的 CSS 核对标准几何；不替代 Lynx 原生验收。 */
export async function verifyGridFixtures(css: string) {
  const browser = await chromium.launch({ headless: true })
  const artifacts = path.join(repoRoot, 'e2e/.artifacts/lynx-static')
  const samples: unknown[] = []
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 500 } })
    try {
      for (const id of ['grid-placement', 'grid-auto', 'grid-justify-self']) {
        const item = compatibilityCases.find(item => item.id === id)!
        await page.setContent(`<style>${css}</style>${html(GridProbePair({ item }))}`)
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
