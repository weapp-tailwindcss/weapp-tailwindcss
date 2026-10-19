import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { encodeLynxCss } from './lynx/batch-encode'
import { createEvidenceContext, validateNativeEvidence } from './lynx/evidence'
import iosReport from './lynx/reports/ios.json'

// 只隔离截图/几何的报告维度；生成 CSS、生产 encoder、WASM decoder 和样式门禁均使用真实实现。
vi.mock('../examples/react-lynx/src/compatibility/evidence', () => ({ evidenceArtifactNames: () => [], lynxEvidenceStrategy: () => 'css' }))
vi.mock('../examples/react-lynx/src/compatibility/static-evidence.json', () => ({ default: { results: [] } }))

const supports = String.raw`@supports(display:grid){.supports-\[display\:grid\]\:grid{display:grid}}@supports(display:weapp-invalid){.supports-\[display\:weapp-invalid\]\:grid{display:grid}}`
let source: string
let bundle: Uint8Array
const directories: string[] = []

beforeAll(async () => {
  const fixture = await fs.readFile(path.join(import.meta.dirname, '..', 'examples', 'react-lynx', 'src', 'styles', 'important-fixtures.css'), 'utf8')
  source = `${String.raw`.\!bg-\[\#737373\]{background-color:#737373!important}.bg-\[\#737373\]{background-color:#737373}`}${fixture}${supports}`
  bundle = (await encodeLynxCss(source, { mode: 'wasm', applyCompatibility: false })).buffer
})

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture(css = source, bytes = bundle) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx style fixture '))
  directories.push(directory)
  await fs.writeFile(path.join(directory, 'main.css'), css)
  await fs.writeFile(path.join(directory, 'main.lynx.bundle'), bytes)
  // 正确 serializer 输入始终保留，不能为篡改后的实际 bundle 补证。
  await fs.writeFile(path.join(directory, 'tasm.json'), JSON.stringify({ sourceCss: source }))
  const context = createEvidenceContext(bytes)
  const report = structuredClone(iosReport) as NativePlatformReport
  delete report.mediaGate
  report.results = []
  report.evidence = { ...context, artifacts: [] }
  return { directory, report, context }
}

it('无 mediaGate 自报开关的报告仍验证实际 CSS 和 bundle 的 important 及 supports 夹具', async () => {
  const { directory, report, context } = await fixture()
  await expect(validateNativeEvidence(report, directory, context)).resolves.toBe(path.join(directory, 'crops', context.runId))
})

it('实际样式证据完整时不读取 serializer 输入作为通过条件', async () => {
  const { directory, report, context } = await fixture()
  await fs.rm(path.join(directory, 'tasm.json'))
  await expect(validateNativeEvidence(report, directory, context)).resolves.toBe(path.join(directory, 'crops', context.runId))
})

it.each(['main.css', 'main.lynx.bundle'])('本轮 %s 缺失时，报告无 mediaGate 也必须阻断', async (name) => {
  const { directory, report, context } = await fixture()
  await fs.rm(path.join(directory, name))
  await expect(validateNativeEvidence(report, directory, context)).rejects.toThrow(/ENOENT/)
})

it('伪 bundle 不得回退到正确 CSS 或 serializer 输入', async () => {
  const { directory, report, context } = await fixture(source, new TextEncoder().encode('dummy bundle'))
  await expect(validateNativeEvidence(report, directory, context)).rejects.toThrow()
})

const mutations = [
  ['important', (css: string) => css.replace('!important', ''), /important 优先级/],
  ['probe-competitor', (css: string) => css.replace(/#probe-syntax-important\s*\{[^}]*\}/, ''), /important 优先级/],
  ['control-competitor', (css: string) => css.replace(/#control-syntax-important\s*\{[^}]*\}/, ''), /important 优先级/],
  ['normal-important', (css: string) => css.replace(String.raw`.bg-\[\#737373\]{background-color:#737373}`, String.raw`.bg-\[\#737373\]{background-color:#737373!important}`), /important 优先级/],
  ['supports-valid', (css: string) => css.replace('(display:grid)', '(display:flex)'), /@supports guard/],
  ['supports-control', (css: string) => css.replace('(display:weapp-invalid)', '(display:grid)'), /@supports guard/],
  ['supports-unconditional', (css: string) => `${css}${String.raw`.supports-\[display\:grid\]\:grid{display:grid}`}`, /@supports guard/],
  ['supports-control-lost', (css: string) => css.slice(0, css.indexOf('@supports(display:weapp-invalid)')), /@supports guard/],
] as const

for (const stage of ['generation', 'encoding'] as const) {
  it.each(mutations)(`${stage} 的 %s 篡改必须被报告门禁拒绝`, async (_mode, mutate, error) => {
    const changed = mutate(source)
    expect(changed).not.toBe(source)
    const bytes = stage === 'encoding' ? (await encodeLynxCss(changed, { mode: 'wasm', applyCompatibility: false })).buffer : bundle
    const { directory, report, context } = await fixture(stage === 'generation' ? changed : source, bytes)
    await expect(validateNativeEvidence(report, directory, context)).rejects.toThrow(error)
  })
}
