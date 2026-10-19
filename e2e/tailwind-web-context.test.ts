import type { Page } from 'playwright'
import type { CapabilityReport } from './tailwind-capabilities/types'
import type { ContextAction, ContextProfile, ContextWebProbe } from './tailwind-capabilities/web-context/fixtures'
import { describe, expect, it, vi } from 'vitest'
import { loadDefaultDesignSystem } from './tailwind-capabilities/inventory'
import { validateCapabilityReport } from './tailwind-capabilities/report'
import { activateContextState } from './tailwind-capabilities/web-context/actions'
import { contextWebAssertions, contextWebContract } from './tailwind-capabilities/web-context/contract'
import { contextProfiles, contextWebCandidates, contextWebProbes, renderContextWebProbe } from './tailwind-capabilities/web-context/fixtures'

function protocolReport(probe: ContextWebProbe) {
  const contract = contextWebContract(probe)
  const hash = 'a'.repeat(64)
  const identity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }
  const report: CapabilityReport = {
    schemaVersion: 2,
    runId: 'context-contract',
    target: 'web-chromium',
    observedAt: new Date().toISOString(),
    identity,
    environment: { engine: 'chromium' },
    results: [{ id: contract.id, status: 'passed', support: 'supported', assertions: [{ name: 'generated', stage: 'generation', actual: true, expected: true }, ...probe.steps.flatMap(step => contextWebAssertions(step, step.expected))], artifacts: ['measurement.json'], warnings: [] }],
    artifacts: [{ path: 'measurement.json', sha256: hash, byteLength: 1, kind: 'measurements', runId: 'context-contract', caseIds: [contract.id] }],
  }
  return { report, verify: () => validateCapabilityReport(report, [contract], identity, report.runId, 'web-chromium') }
}

describe('需要独立 context 的真实变体合同', () => {
  it('七个 feature 都是严格正向预期，不伪造 none 或 contrast-less', async () => {
    expect(contextWebCandidates).toHaveLength(7)
    expect(contextWebProbes.flatMap(probe => probe.features)).toEqual(['pointer-coarse', 'pointer-fine', 'any-pointer-coarse', 'any-pointer-fine', 'noscript', 'user-invalid', 'user-valid'].map(root => `variant/static/${root}`))
    const ds = await loadDefaultDesignSystem()
    for (const probe of contextWebProbes) {
      expect(ds.candidatesToCss([probe.candidate])[0], probe.id).toBeTruthy()
      expect(contextWebContract(probe).expectation).toEqual({ support: 'supported', stage: 'runtime' })
      expect(protocolReport(probe).verify).not.toThrow()
    }
  })

  it.each(contextWebProbes)('$id 样式正确也不能遗漏 context/lifecycle 断言或恢复状态', (probe) => {
    const good = protocolReport(probe)
    expect(good.verify).not.toThrow()
    const broken = protocolReport(probe)
    const key = probe.steps[0]!.name
    broken.report.results[0]!.assertions = broken.report.results[0]!.assertions.filter(assertion => !assertion.name.startsWith(`${key}/`))
    expect(broken.verify).toThrow()
    const unsupported = protocolReport(probe)
    unsupported.report.results[0]!.support = 'unsupported'
    expect(unsupported.verify).toThrow('擅自改变预期支持状态')
  })

  it.each(['context-pointer-coarse', 'context-pointer-fine', 'context-any-pointer-coarse', 'context-any-pointer-fine'])('%s 检查真实媒体查询、原生指针类型和无候选 control', (id) => {
    const probe = contextWebProbes.find(probe => probe.id === id)!
    expect(probe.steps.map(step => step.profile)).toEqual(['desktop', 'touch', 'desktop'])
    expect(contextProfiles.touch.hasTouch).toBe(true)
    expect(contextProfiles.desktop.hasTouch).toBe(false)
    for (const key of ['touch/media/(pointer: coarse)', 'touch/native/pointer-touch', 'touch/control']) {
      const broken = protocolReport(probe)
      const assertion = broken.report.results[0]!.assertions.find(assertion => assertion.name === key)!
      assertion.actual = assertion.actual === true ? false : 'wrong'
      expect(broken.verify).toThrow(key)
    }
  })

  it('noscript 必须同时证明脚本禁用、scripting:none 和原生内容可见', () => {
    const probe = contextWebProbes.find(probe => probe.id === 'context-noscript')!
    expect(contextProfiles.noscript.javaScriptEnabled).toBe(false)
    expect(probe.steps.map(step => step.profile)).toEqual(['desktop', 'noscript', 'desktop'])
    for (const key of ['disabled/script', 'disabled/media/(scripting: none)', 'disabled/noscript-visible']) {
      const broken = protocolReport(probe)
      const assertion = broken.report.results[0]!.assertions.find(assertion => assertion.name === key)!
      assertion.actual = assertion.actual === true ? false : 'still-executing'
      expect(broken.verify).toThrow(key)
    }
  })

  it.each(['context-user-invalid', 'context-user-valid'])('%s 不能用初始原生 invalid、脚本填值或缺少提交来证明用户状态', (id) => {
    const probe = contextWebProbes.find(probe => probe.id === id)!
    expect(probe.steps.map(step => step.name)).toEqual(['pristine', 'invalid-blurred', 'invalid-submitted', 'valid-blurred', 'valid-submitted', 'reset'])
    expect(probe.steps[0]!.expected['input/valid']).toBe(false)
    expect(probe.steps[0]!.expected['matches/user-invalid']).toBe(false)
    expect(probe.steps.at(-1)!.expected['matches/user-valid']).toBe(false)
    for (const key of ['invalid-blurred/native/input-current', 'invalid-blurred/native/change-current', 'invalid-blurred/native/blur-current', 'invalid-submitted/native/invalid', 'valid-submitted/native/submit', 'reset/native/reset', 'valid-blurred/matches/user-valid']) {
      const broken = protocolReport(probe)
      const assertion = broken.report.results[0]!.assertions.find(assertion => assertion.name === key)!
      assertion.actual = false
      expect(broken.verify).toThrow(key)
    }
    const untrusted = protocolReport(probe)
    untrusted.report.results[0]!.assertions.find(assertion => assertion.name === 'invalid-blurred/native/untrusted')!.actual = true
    expect(untrusted.verify).toThrow('native/untrusted')
  })

  it('不能把错误环境的预期一起改写以接受正确颜色', () => {
    const probe = contextWebProbes[0]!
    const broken = protocolReport(probe)
    const assertion = broken.report.results[0]!.assertions.find(assertion => assertion.name === 'touch/media/(pointer: coarse)')!
    assertion.actual = false
    assertion.expected = false
    expect(broken.verify).toThrow('擅自改变')
  })

  it('缺少唯一状态或独立预期不能登记合同', () => {
    const probe = contextWebProbes[0]!
    expect(() => contextWebContract({ ...probe, steps: [] })).toThrow()
    expect(() => contextWebContract({ ...probe, steps: [probe.steps[0]!, probe.steps[0]!] })).toThrow()
    expect(() => contextWebContract({ ...probe, steps: [{ ...probe.steps[0]!, expected: {} }] })).toThrow()
  })

  it('模板同时包含原生表单和独立无 class control，候选不直接充当预期', () => {
    for (const probe of contextWebProbes) {
      const html = renderContextWebProbe(probe, '.generated{}')
      expect(html).toContain('id="control"')
      expect(html).toContain(`data-context-fixture="${probe.id}"`)
      expect(html).not.toContain('CANDIDATE')
    }
  })
})

describe('原生交互调用边界', () => {
  it.each([
    ['invalid-input', 'desktop', [['click', '#probe'], ['key', 'ControlOrMeta+A'], ['type', '#probe', 'invalid'], ['key', 'Tab']]],
    ['valid-input', 'desktop', [['click', '#probe'], ['key', 'ControlOrMeta+A'], ['type', '#probe', 'valid@example.com'], ['key', 'Tab']]],
    ['invalid-submit', 'desktop', [['click', '#submit']]],
    ['valid-submit', 'desktop', [['click', '#submit']]],
    ['reset', 'desktop', [['click', '#reset']]],
    ['pointer', 'desktop', [['click', '#probe']]],
    ['pointer', 'touch', [['tap', '#probe']]],
  ] as const)('%s/%s 只使用真实键盘、tap、click', async (action, profile, expected) => {
    const calls: string[][] = []
    const page = {
      locator: (selector: string) => ({
        click: async () => { calls.push(['click', selector]) },
        tap: async () => { calls.push(['tap', selector]) },
        pressSequentially: async (text: string) => { calls.push(['type', selector, text]) },
      }),
      keyboard: { press: async (key: string) => { calls.push(['key', key]) } },
      evaluate: vi.fn(() => { throw new Error('不允许脚本模拟') }),
    } as unknown as Page
    await activateContextState(page, action as ContextAction, profile as ContextProfile)
    expect(calls).toEqual(expected)
    expect(page.evaluate).not.toHaveBeenCalled()
  })
})
