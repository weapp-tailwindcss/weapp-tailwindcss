import type { StaticEvidenceReport } from '../examples/react-lynx/src/compatibility/types'
import { describe, expect, it } from 'vitest'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { compatibilityVersions, getCatalogHash } from './lynx/catalog'
import { analyzeStaticCase, declarationMatches, selectorHasCandidate } from './lynx/static-evidence'
import { assertCurrentStaticEvidence } from './lynx/static-report'

describe('Lynx static declaration evidence', () => {
  it('类名必须完整命中，不能从 flex-col 或 escaped variant 前缀借用声明', () => {
    expect(selectorHasCandidate('.flex-col', 'flex')).toBe(false)
    expect(selectorHasCandidate('.flex\\:something', 'flex')).toBe(false)
    expect(selectorHasCandidate('.flex:hover > .child', 'flex')).toBe(true)
    expect(selectorHasCandidate('.hover\\:block:hover', 'hover:block')).toBe(true)
  })

  it('active 与 hover 的编码结果独立，另一候选的 selector 拒绝不会污染 active', () => {
    const item = compatibilityCases.find(item => item.id === 'variant-state')!
    const active = { selector: '.active\\:bg-\\[\\#dc2626\\]:active', declarations: [{ property: 'background-color', value: '#dc2626' }] }
    const hover = { selector: '.hover\\:bg-\\[\\#ef4444\\]:hover', declarations: [{ property: 'background-color', value: '#ef4444' }] }
    const report = analyzeStaticCase(item, [active, hover], [active, hover], `Unsupported selector "${hover.selector}"`)
    expect(report.generated).toBe(true)
    expect(report.bundled).toBe(false)
    expect(report.candidates).toMatchObject([
      { className: 'active:bg-[#dc2626]', generated: true, bundled: true },
      { className: 'hover:bg-[#ef4444]', generated: true, bundled: false, failureStage: 'encoder' },
    ])
  })

  it('group 与 peer 分别保存声明与编码结论', () => {
    const item = compatibilityCases.find(item => item.id === 'variant-group-peer')!
    const group = { selector: '.group-hover\\:block:hover', declarations: [{ property: 'display', value: 'block' }] }
    const peer = { selector: '.peer-checked\\:opacity-100', declarations: [{ property: 'opacity', value: '1' }] }
    const report = analyzeStaticCase(item, [group, peer], [group])
    expect(report.candidates).toMatchObject([{ bundled: true }, { bundled: false, failureStage: 'encoder' }])
  })

  it('@source 编译成功与 utility 的 encoder 拒绝保持分层', () => {
    const item = compatibilityCases.find(item => item.id === 'directive-source')!
    const underline = { selector: '.underline', declarations: [{ property: 'text-decoration-line', value: 'underline' }] }
    const focus = { selector: '.focus\\:bg-red-600:focus', declarations: [{ property: 'background-color', value: '#dc2626' }] }
    expect(analyzeStaticCase(item, [underline, focus], [focus], 'Unsupported property "text-decoration-line"')).toMatchObject({ generated: true, bundled: false, failureStage: 'encoder' })
  })

  it('空 CSS 不会因 @import 无候选而被 vacuous every 判为成功', () => {
    const item = compatibilityCases.find(item => item.id === 'directive-import')!
    expect(analyzeStaticCase(item, [], []).generated).toBe(false)
  })

  it.each([
    ['0.5', '50%', true],
    ['1', '100%', true],
    ['50', '50%', false],
    ['0.25', '50%', false],
    ['var(--opacity)', '50%', false],
    ['50% 0', '50%', false],
  ])('opacity %s 与 %s 的语义比较为 %s', (actual, expected, matches) => {
    expect(declarationMatches({ property: 'opacity', value: actual }, { property: 'opacity', value: expected }, true)).toBe(matches)
  })

  it('不把其它属性的数字与百分比当作等价值', () => {
    expect(declarationMatches({ property: 'width', value: '0.5' }, { property: 'width', value: '50%' }, true)).toBe(false)
  })

  it('requires an expected value to match instead of accepting the property name alone', () => {
    expect(declarationMatches(
      { property: 'width', value: '100px' },
      { property: 'width', value: '200px' },
      true,
    )).toBe(false)
  })

  it('normalizes insignificant whitespace and enforces important when requested', () => {
    expect(declarationMatches(
      { property: 'min-width', value: 'calc(100%  -  2rem)', important: true },
      { property: 'min-width', value: 'calc(100% - 2rem)', important: true },
      true,
    )).toBe(true)
    expect(declarationMatches(
      { property: 'display', value: 'flex' },
      { property: 'display', value: 'flex', important: true },
      true,
    )).toBe(false)
  })

  it('allows a property-only expectation for values that vary by Tailwind internals', () => {
    expect(declarationMatches(
      { property: 'box-shadow', value: '0 10px 15px rgb(0 0 0 / 0.1)' },
      { property: 'box-shadow' },
      true,
    )).toBe(true)
  })
})

describe('Lynx 历史与本轮静态证据边界', () => {
  function currentProtocolFixture(): StaticEvidenceReport {
    // 此处只构造协议回归数据，不冒充真实构建或原生验收产物。
    return {
      schemaVersion: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      catalogHash: getCatalogHash(),
      versions: { ...compatibilityVersions },
      results: compatibilityCases.map(item => ({
        id: item.id,
        generated: true,
        bundled: true,
        generatedDeclarations: [],
        bundledDeclarations: [],
        cssDefinesKnown: [],
        candidates: item.className.trim().split(/\s+/).filter(Boolean).map(className => ({ className, generated: true, bundled: true })),
      })),
    }
  }

  it('本轮完整协议可通过，结果不依赖已提交基线是否已更新', () => {
    expect(() => assertCurrentStaticEvidence(currentProtocolFixture())).not.toThrow()
  })

  it.each(['catalog', 'cssDefines'] as const)('固定旧 %s 身份不能启动本轮验收', (field) => {
    const report = currentProtocolFixture()
    // 固定于共享目录迁移前的真实身份；正常更新静态基线不能把反例变成本轮报告。
    if (field === 'catalog') {
      report.catalogHash = 'a8c3b45f993d9aa28782f308fc959a09e160d67a9097d11b1bc6a8a38b93c886'
    }
    else {
      report.versions.cssDefines = '0.0.16'
    }
    expect(() => assertCurrentStaticEvidence(report)).toThrow(/历史 catalog 或依赖版本/)
  })

  it('重复 case 和混合交互缺少独立候选不能通过本轮门禁', () => {
    const duplicate = currentProtocolFixture()
    duplicate.results[1] = duplicate.results[0]!
    expect(() => assertCurrentStaticEvidence(duplicate)).toThrow(/完整且唯一/)
    const missing = currentProtocolFixture()
    missing.results.find(item => item.id === 'variant-state')!.candidates!.pop()
    expect(() => assertCurrentStaticEvidence(missing)).toThrow(/逐候选静态证据/)
  })
})
