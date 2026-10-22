import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { inspectTaroProduction } from './taro-production.mjs'

it.each([
  { mode: 'correct' },
  { mode: 'lazy-component' },
  { mode: 'layered-reset', error: 'production margin expected 10, received 0' },
  { mode: 'wrong-color', error: 'production colors' },
  { mode: 'partial-height', error: 'production medium expected 100, received 99' },
  { mode: 'hidden-color', error: '生产探针不可见：color' },
  { mode: 'hidden-opacity', error: '生产探针不可见：opacity' },
])('实际生产文档拒绝可见节点的错误样式：$mode', async ({ mode, error }) => {
  const root = await mkdtemp(path.join(tmpdir(), 'taro-production-oracle-'))
  try {
    const utility = `.h-8{height:40px}.h-20{height:${mode === 'partial-height' ? 99 : 100}px}.h-50{height:250px}.mt-2{margin-top:10px}.text-slate-500{color:${mode === 'wrong-color' ? 'red' : '#62748e'}}.bg-emerald-50\\/80{background:rgba(236,253,245,.8)}`
    const css = `html{font-size:20px}*{margin:0;padding:0}${mode === 'layered-reset' ? `@layer utilities{${utility}}` : utility}${mode.startsWith('hidden-') ? `#tw-matrix-${mode.slice(7)}{display:none}` : ''}`
    const classes = { height: 'h-8', medium: 'h-20', large: 'h-50', margin: 'mt-2', color: 'text-slate-500', opacity: 'bg-emerald-50/80' }
    const tag = mode === 'lazy-component' ? 'fixture-view' : 'div'
    const initialize = mode === 'lazy-component'
      ? `<script>setTimeout(() => customElements.define('fixture-view', class extends HTMLElement {
          connectedCallback() { this.style.display = 'block' }
          componentOnReady() { return Promise.resolve(this) }
        }), 100)</script>`
      : ''
    const html = `<style>${css}</style>${Object.entries(classes).map(([key, value]) => `<${tag} id="tw-matrix-${key}" class="${value}">tw-matrix-initial-${key}</${tag}>`).join('')}${initialize}`
    await writeFile(path.join(root, 'index.html'), html)
    const result = inspectTaroProduction({ id: 'fixture:harmony-hybrid', name: 'taro-webpack-react-tailwindcss-v4', target: 'harmony-hybrid' }, root, root)
    if (error) {
      await expect(result).rejects.toThrow(error)
    }
    else {
      expect((await result).computed.margin.margin).toBe(10)
    }
    const evidence = JSON.parse(await readFile(path.join(root, 'production-browser.json'), 'utf8'))
    expect(evidence.requested).toContain('index.html')
    if (!mode.startsWith('hidden-')) {
      expect(evidence.evidence.computed.height.height).toBe(40)
    }
    expect(await readFile(path.join(root, error ? 'production-browser-failure.png' : 'production-browser.png'))).not.toHaveLength(0)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)
