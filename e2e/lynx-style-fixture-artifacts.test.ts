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
const responsiveRule = String.raw`@media(width < 48rem){.max-md\:w-\[200px\]{width:200px}}`
const responsiveMarker = '.probe-responsive-threshold{width:48rem;height:1px}'
let source: string
let bundle: Uint8Array
const directories: string[] = []

beforeAll(async () => {
  const fixture = await fs.readFile(path.join(import.meta.dirname, '..', 'examples', 'react-lynx', 'src', 'styles', 'important-fixtures.css'), 'utf8')
  const overflowFixture = await fs.readFile(path.join(import.meta.dirname, '..', 'examples', 'react-lynx', 'src', 'styles', 'overflow-fixtures.css'), 'utf8')
  // 实际 CSS 入口经 layer import 与 Tailwind 展开会留下完整相同的两份标尺。
  source = `${String.raw`.\!bg-\[\#737373\]{background-color:#737373!important}.bg-\[\#737373\]{background-color:#737373}`}${fixture}.overflow-hidden{overflow:hidden}${overflowFixture}${responsiveRule}${responsiveMarker}${responsiveMarker}${supports}`
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

it('无 mediaGate 自报开关的报告仍验证实际 CSS 和 bundle 的 important、supports 及响应式夹具', async () => {
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
  ['overflow-candidate', (css: string) => css.replace('.overflow-hidden{overflow:hidden}', ''), /overflow/],
  ['overflow-base-hidden', (css: string) => css.replaceAll('overflow: visible', 'overflow: hidden'), /overflow/],
  ['overflow-min-width', (css: string) => css.replace('min-width: 0', 'min-width: 120px'), /overflow/],
  ['overflow-child', (css: string) => css.replace('left: 72px', 'left: 20px'), /overflow/],
  ['important', (css: string) => css.replace('!important', ''), /important 优先级/],
  ['probe-competitor', (css: string) => css.replace(/#probe-syntax-important\s*\{[^}]*\}/, ''), /important 优先级/],
  ['control-competitor', (css: string) => css.replace(/#control-syntax-important\s*\{[^}]*\}/, ''), /important 优先级/],
  ['normal-important', (css: string) => css.replace(String.raw`.bg-\[\#737373\]{background-color:#737373}`, String.raw`.bg-\[\#737373\]{background-color:#737373!important}`), /important 优先级/],
  ['supports-valid', (css: string) => css.replace('(display:grid)', '(display:flex)'), /@supports guard/],
  ['supports-control', (css: string) => css.replace('(display:weapp-invalid)', '(display:grid)'), /@supports guard/],
  ['supports-unconditional', (css: string) => `${css}${String.raw`.supports-\[display\:grid\]\:grid{display:grid}`}`, /@supports guard/],
  ['supports-control-lost', (css: string) => css.slice(0, css.indexOf('@supports(display:weapp-invalid)')), /@supports guard/],
  ['responsive-removed', (css: string) => css.replace(responsiveRule, ''), /响应式/],
  ['responsive-unconditional', (css: string) => css.replace(responsiveRule, String.raw`.max-md\:w-\[200px\]{width:200px}`), /响应式/],
  ['responsive-wrong-threshold', (css: string) => css.replace('width < 48rem', 'width < 768px'), /响应式/],
  ['responsive-wrong-width', (css: string) => css.replace('width:200px', 'width:80px'), /响应式/],
  ['responsive-duplicate-unconditional', (css: string) => `${css}${String.raw`.max-md\:w-\[200px\]{width:200px}`}`, /响应式/],
  ['responsive-missing-marker', (css: string) => css.replaceAll(responsiveMarker, ''), /响应式/],
  ['responsive-changed-marker', (css: string) => css.replace('width:48rem', 'width:768px'), /响应式/],
  ['responsive-conditional-marker', (css: string) => css.replace(responsiveMarker, `@media(width < 48rem){${responsiveMarker}}`), /响应式/],
  ['responsive-supports-rule', (css: string) => css.replace(responsiveRule, `@supports(display:grid){${responsiveRule}}`), /响应式/],
  ['responsive-supports-marker', (css: string) => css.replace(responsiveMarker, `@supports(display:grid){${responsiveMarker}}`), /响应式/],
  ['responsive-marker-height', (css: string) => css.replace(responsiveMarker, responsiveMarker.replace('height:1px', 'height:2px')), /响应式/],
  ['responsive-marker-incomplete', (css: string) => css.replace(responsiveMarker, '.probe-responsive-threshold{width:48rem}'), /响应式/],
  ['responsive-marker-extra', (css: string) => `${css}${responsiveMarker.replace('.probe-responsive-threshold', '.probe-responsive-threshold.extra')}`, /响应式/],
  ['responsive-marker-escaped-conflict', (css: string) => `${css}${responsiveMarker.replace('.probe-responsive-threshold', String.raw`.probe-responsive-thr\65shold`).replace('height:1px', 'height:2px')}`, /响应式/],
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
