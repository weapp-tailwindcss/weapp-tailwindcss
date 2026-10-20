import type { AuthoringWebMeasurement } from './tailwind-capabilities/authoring-web/contract'
import { describe, expect, it } from 'vitest'
import { authoringFrameHtml } from './tailwind-capabilities/authoring-web/browser'
import { authoringMeasurementAssertions, authoringStates, authoringWebContract, authoringWebOutcome } from './tailwind-capabilities/authoring-web/contract'
import { authoringWebCoverage, authoringWebProfiles } from './tailwind-capabilities/authoring-web/profiles'

const measurement: AuthoringWebMeasurement = { group: 0, properties: ['display', 'padding'], product: ['flex', '17px'], reference: ['flex', '17px'], baseline: ['block', '0px'], referenceSupported: [true, true] }
const profile = (id: string) => authoringWebProfiles.find(profile => profile.fixture.id === id)!

describe('authoring 浏览器独立参考合同', () => {
  it('18 authoring 与 11 scanning 全部登记独立语义，单夹具 HMR 范围与通用 HMR 分开记录', () => {
    expect(authoringWebProfiles).toHaveLength(29)
    expect(authoringWebProfiles.filter(profile => !profile.reason)).toHaveLength(29)
    expect(authoringWebProfiles.filter(profile => profile.fixture.id.startsWith('scan-')).every(profile => profile.official && profile.groups.length)).toBe(true)
    for (const id of ['source-inline', 'source-not-inline', 'theme-function']) {
      expect(profile(id).official).toBeTruthy()
    }
    expect(authoringWebCoverage().every(entry => entry.hmr === 'not-run' && entry.hmrScope === 'authoring-fixture-only')).toBe(true)
    expect(authoringWebCoverage().filter(entry => entry.id.startsWith('authoring/scan-')).every(entry => entry.runtimeScope === 'scanned-css-dom-semantics' && entry.sourceExecution === 'scanner-only-no-jsx-vue-branch-execution')).toBe(true)
    expect(profile('source-inline').groups.map(group => group.className)).toEqual(['hover:bg-red-500', 'focus:bg-red-600', 'hover:bg-red-600', 'focus:bg-red-500', 'bg-red-500', 'bg-red-600'])
  })

  it('错误值或部分声明丢失时不能用其余相同属性通过', () => {
    expect(authoringWebOutcome(authoringMeasurementAssertions('computed', measurement))).toBe('passed')
    expect(authoringWebOutcome(authoringMeasurementAssertions('computed', { ...measurement, product: ['flex', '0px'] }))).toBe('failed')
    expect(authoringWebOutcome(authoringMeasurementAssertions('computed', { ...measurement, product: ['flex', ''] }))).toBe('failed')
  })

  it('产品与参考同时回落默认值、参考不可测或空集合不能通过', () => {
    expect(authoringWebOutcome(authoringMeasurementAssertions('computed', { ...measurement, reference: measurement.baseline, product: measurement.baseline }))).toBe('not-run')
    expect(authoringWebOutcome(authoringMeasurementAssertions('computed', { ...measurement, referenceSupported: [false, false] }))).toBe('not-run')
    expect(authoringWebOutcome([])).toBe('not-run')
  })

  it('条件 before/after/restored 逐态登记，恢复错误不能由 after 代证', () => {
    for (const id of ['variant', 'custom-variant', 'source-inline']) {
      const item = profile(id)
      expect(authoringStates(item)).toEqual(['before', 'after', 'restored'])
      const contract = authoringWebContract(item)
      expect(contract.requiredAssertions.some(name => name.startsWith('restored/computed/'))).toBe(true)
    }
    expect(authoringWebOutcome(authoringMeasurementAssertions('restored', { ...measurement, product: ['grid', '17px'] }))).toBe('failed')
  })

  it('生成或浏览器错误始终失败，不能被参考不可用掩盖', () => {
    const assertions = authoringMeasurementAssertions('computed', { ...measurement, referenceSupported: [false, false] })
    expect(authoringWebOutcome([...assertions, { name: 'generated', stage: 'generation', actual: false, expected: true }])).toBe('failed')
    expect(authoringWebOutcome([...assertions, { name: 'no-page-errors', stage: 'runtime', actual: false, expected: true }])).toBe('failed')
  })

  it('隔离 inline 参考不加载产品 CSS，important 必须打败真实 inline 竞争', () => {
    const item = profile('important')
    const css = '.flex{display:flex!important}'
    const product = authoringFrameHtml(item, item.groups[0]!, 'product', css, true)
    const reference = authoringFrameHtml(item, item.groups[0]!, 'reference', css, true)
    const baseline = authoringFrameHtml(item, item.groups[0]!, 'baseline', css, true)
    expect(product).toContain(css)
    expect(product).toContain('style="display:block"')
    expect(reference).not.toContain(css)
    expect(reference).toContain('style="display:flex!important"')
    expect(baseline).not.toContain(css)
    expect(baseline).toContain('style="display:block"')
  })

  it('主题期望与宿主上下文独立声明，不能给产品补入应由 @theme 生成的变量', () => {
    expect(profile('theme').variables).toEqual({})
    expect(profile('theme').groups[0]!.declarations[0]!.value).toBe('#123456')
    expect(profile('theme-inline').variables).toEqual({ '--brand': '#456789' })
    expect(profile('reference').variables).toEqual({})
    expect(profile('reference').groups[0]!.declarations).toContainEqual({ property: 'background-color', value: '#123456' })
  })

  it('真实源扫描 fixture 不从渲染探针反向注入 candidates 或 inline source', () => {
    for (const id of ['source-file', 'source-exclusion', 'scan-html-literal', 'scan-tsx-map']) {
      const item = profile(id)
      expect(item.fixture.candidates).toEqual([])
      expect(item.fixture.css).not.toContain('@source inline')
      expect(Object.keys(item.fixture.files).length).toBeGreaterThan(0)
    }
  })

  it('负向产物必须与基线相同且参考有真实效果，非法候选使用显式独立观测对照', () => {
    const negative = { ...measurement, excluded: true, product: measurement.baseline }
    expect(authoringWebOutcome(authoringMeasurementAssertions('computed', negative))).toBe('passed')
    expect(authoringWebOutcome(authoringMeasurementAssertions('computed', { ...negative, product: measurement.reference }))).toBe('failed')
    expect(authoringWebOutcome(authoringMeasurementAssertions('computed', { ...negative, reference: measurement.baseline }))).toBe('not-run')
    expect(profile('scan-interpolation-negative').groups.every(group => group.excluded)).toBe(true)
    expect(profile('scan-business-text').official!.control).toContain('padding:17px')
    expect(profile('source-not-inline').groups.find(group => group.className === 'p-2')?.excluded).toBe(true)
  })
})
