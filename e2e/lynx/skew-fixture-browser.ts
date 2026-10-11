import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { expect } from 'vitest'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { CaseCard } from '../../examples/react-lynx/src/components/CaseCard'
import { repoRoot } from './catalog'
import { evaluatePixelEffect } from './pixel-effects'
import { PNG } from './png'

interface Node {
  type: unknown
  props: { id?: string, className?: string, children?: unknown }
}

function children(tree: unknown): Node[] {
  if (Array.isArray(tree)) {
    return tree.flatMap(children)
  }
  if (!tree || typeof tree !== 'object' || !('type' in tree) || !('props' in tree)) {
    return []
  }
  const node = tree as Node
  return [node, ...children(node.props.children)]
}

// 仅序列化 CaseCard 内的固定捕获子树，不另写一个可能偏离原生组件的 HTML 夹具。
function html(node: Node): string {
  if (node.type !== 'view') {
    throw new Error('skew 捕获区域必须仅包含 view')
  }
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  const directChildren = Array.isArray(node.props.children) ? node.props.children : [node.props.children]
  return `<div id="${escape(node.props.id ?? '')}" class="${escape(node.props.className ?? '')}">${directChildren.flatMap(value => children(value).slice(0, 1)).map(html).join('')}</div>`
}

/** 以实际组件和 encoder 输入 CSS 校准像素几何；浏览器截图不替代 Lynx 设备验收。 */
export async function verifySkewFixture(css: string) {
  const item = compatibilityCases.find(item => item.id === 'transform-skew')!
  const pair = children(CaseCard({ item })).find(node => node.props.className?.includes('probe-capture-pair'))!
  const browser = await chromium.launch({ headless: true })
  const artifacts = path.join(repoRoot, 'e2e/.artifacts/lynx-static')
  const samples: unknown[] = []
  try {
    for (const scale of [1, 2.625, 3]) {
      const context = await browser.newContext({ viewport: { width: 600, height: 600 }, deviceScaleFactor: scale })
      try {
        const page = await context.newPage()
        await page.setContent(`<style>${css}</style>${html(pair)}`)
        const probe = page.locator('#probe-transform-skew')
        const capture = async (prefix: string, label: string) => {
          const data = await page.locator(`#${prefix}-container-transform-skew`).screenshot({ path: path.join(artifacts, `skew-${scale}-${label}.png`), animations: 'disabled' })
          return PNG.sync.read(data)
        }
        const control = await capture('control', 'control')
        const check = async (label: string, expected: string) => {
          const result = evaluatePixelEffect(item.id, await capture('probe', label), control)
          samples.push({ scale, label, result })
          expect(result, `scale=${scale}, ${label}`).toMatchObject({ status: expected })
        }
        await check('both', 'supported')
        const original = await probe.getAttribute('class')
        for (const candidate of item.className.split(/\s+/)) {
          await probe.evaluate((element, candidate) => element.classList.remove(candidate), candidate)
          await check(`without-${candidate}`, 'unsupported')
          await probe.evaluate((element, original) => element.setAttribute('class', original!), original)
        }
        for (const [label, transform] of [['translate', 'translate(4px, 3px)'], ['scale', 'scale(1.1)'], ['rotate', 'rotate(6deg)']]) {
          await probe.evaluate((element, transform) => {
            element.style.transform = transform!
          }, transform)
          await check(label!, 'unsupported')
        }
      }
      finally {
        await context.close()
      }
    }
  }
  finally {
    try {
      await fs.writeFile(path.join(artifacts, 'skew-fixtures.json'), `${JSON.stringify(samples, null, 2)}\n`)
    }
    finally {
      await browser.close()
    }
  }
}
