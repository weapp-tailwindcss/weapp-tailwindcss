import { describe, expect, it } from 'vitest'
import { assertionPassed } from './tailwind-capabilities/report'
import { weappContract, weappExpectedStyles, weappPhases, weappRuntimeAssertions } from './tailwind-capabilities/weapp/contract'
import { weappProbes } from './tailwind-capabilities/weapp/fixtures'

function probe(id: string) {
  const found = weappProbes.find(item => item.id === id)
  expect(found, `缺少预声明的微信夹具 ${id}`).toBeDefined()
  return found!
}

describe('微信动态颜色权重的支持边界', () => {
  it('限制在执行前声明，三个阶段分别验证目标、独立参考和变量见证', () => {
    const item = probe('runtime-color-weight-limit')
    const contract = weappContract(item)
    expect(item.candidates).toContain('bg-sky-500/(--my-alpha-value)')
    expect(contract.expectation).toMatchObject({ support: 'unsupported', stage: 'negative', reason: expect.stringContaining('百分比') })
    expect(weappPhases(item)).toEqual(['before', 'after', 'restored'])
    for (const phase of weappPhases(item)) {
      expect(weappExpectedStyles(item, phase)).toEqual({ 'background-color': 'rgb(0, 165, 234)' })
      for (const suffix of ['style/background-color', 'reference/background-color', 'witness/opacity', 'semantic-difference', 'pixel-0', 'reference-pixel-0']) {
        expect(contract.requiredAssertions).toContain(`${phase}/${suffix}`)
      }
    }
    expect(new Set(contract.requiredAssertions).size).toBe(contract.requiredAssertions.length)
    expect(contract.expectedValues['before/reference/background-color']).toBe('rgba(0, 165, 234, 0.5)')
    expect(contract.expectedValues['after/reference/background-color']).toBe('rgba(0, 165, 234, 0.25)')
    expect(contract.expectedValues['restored/witness/opacity']).toBe('0.5')
  })

  it('目标真正支持、参考未切换或变量未生效均不能成为负向通过', () => {
    const item = probe('runtime-color-weight-limit')
    const actual = { 'background-color': 'rgb(0, 165, 234)' }
    const reference = { 'background-color': 'rgba(0, 165, 234, 0.25)' }
    const correct = weappRuntimeAssertions(item, 'after', actual, reference, { opacity: '0.25' })
    expect(correct.every(assertionPassed)).toBe(true)
    expect(weappRuntimeAssertions(item, 'after', reference, reference, { opacity: '0.25' }).every(assertionPassed)).toBe(false)
    expect(weappRuntimeAssertions(item, 'after', actual, { 'background-color': 'rgba(0, 165, 234, 0.5)' }, { opacity: '0.25' }).every(assertionPassed)).toBe(false)
    expect(weappRuntimeAssertions(item, 'after', actual, reference, { opacity: '0.5' }).every(assertionPassed)).toBe(false)
  })

  it('静态百分比和有限类切换始终保留正向支持预期', () => {
    for (const id of ['alpha-zero', 'alpha-quarter', 'alpha-half', 'alpha-full', 'alpha-fraction', 'alpha-source-translucent', 'alpha-static-variable', 'alpha-static-alias', 'alpha-dynamic-class']) {
      const item = probe(id)
      expect(weappContract(item).expectation).toEqual({ support: 'supported', stage: 'runtime' })
    }
    const item = probe('alpha-dynamic-class')
    expect(weappPhases(item)).toEqual(['before', 'after', 'restored'])
    expect(weappExpectedStyles(item, 'before')).toEqual({ 'background-color': 'rgba(255, 0, 0, 0.25)' })
    expect(weappExpectedStyles(item, 'after')).toEqual({ 'background-color': 'rgba(255, 0, 0, 0.5)' })
    expect(weappExpectedStyles(item, 'restored')).toEqual(weappExpectedStyles(item, 'before'))
  })
})
