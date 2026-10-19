import type { ConversionObservation, ConversionSnapshot, ReviewedConversionOracle } from './tailwind-capabilities/conversion-audit'
import type { CapabilityReport, CapabilityResult } from './tailwind-capabilities/types'
import { describe, expect, it } from 'vitest'
import { conversionCaseContract, conversionCaseResult, conversionTargets, staticCandidateResults } from './tailwind-capabilities/conversion-audit'
import { assertCapabilitySuccess } from './tailwind-capabilities/report'

const item = { id: 'completion/size-8', candidate: 'size-8', features: ['completion'] }
const artifacts = ['batch.audit.json']
const snapshot: ConversionSnapshot = {
  statements: ['width', 'height'].map(property => ({ selector: '.size-8', conditions: [], property, value: '2rem', important: false })),
  diagnostics: [],
}
const oracle: ReviewedConversionOracle = { id: 'reviewed-size-8', target: 'weapp', candidate: 'size-8', support: 'supported', expected: snapshot }
const observed = (value: ConversionSnapshot): ConversionObservation => ({ execution: 'completed', snapshot: value, diagnosticsScope: 'candidate' })
const generation: CapabilityResult = { id: item.id, status: 'passed', support: 'supported', assertions: [{ name: 'generated', stage: 'generation', actual: true, expected: true }], warnings: [], artifacts }

describe('逐候选转换审计的独立合同', () => {
  it('三目标执行全部失败时保留生成通过，并分别记录转换失败', () => {
    const failure: ConversionObservation = { execution: 'failed', reason: 'converter failed' }
    const results = staticCandidateResults(item, generation, { 'weapp': failure, 'react-native': failure, 'lynx': failure }, artifacts)
    expect(results[0]).toBe(generation)
    expect(results.slice(1).map(result => result.status)).toEqual(['failed', 'failed', 'failed'])
    expect(results.slice(1).every(result => result.support === 'supported')).toBe(true)
    expect(results.map(result => result.id)).toEqual([item.id, ...conversionTargets.map(target => `conversion/${target}/${item.id}`)])
  })

  it.each(conversionTargets)('%s 无 oracle 时完整或空产物均保留 not-run', (target) => {
    for (const value of [snapshot, { statements: [], diagnostics: [] }]) {
      const result = conversionCaseResult(item, target, observed(value), artifacts)
      expect(result.status).toBe('not-run')
      expect(result.reason).toContain('独立语义 oracle')
      expect(result.assertions).toMatchObject([{ name: 'conversion-executed', actual: true }])
    }
  })

  it('空 WXSS 或空 manifest 在正向合同下必须失败', () => {
    for (const target of ['weapp', 'react-native'] as const) {
      const result = conversionCaseResult(item, target, observed({ statements: [], diagnostics: [] }), artifacts, { ...oracle, target })
      expect(result.status).toBe('failed')
      expect(result.support).toBe('supported')
    }
  })

  it('部分声明、错误条件和后续覆盖均不满足完整正向 oracle', () => {
    const wrong: ConversionSnapshot[] = [
      { ...snapshot, statements: snapshot.statements.slice(0, 1) },
      { ...snapshot, statements: snapshot.statements.map(statement => ({ ...statement, conditions: ['@media print'] })) },
      { ...snapshot, statements: [...snapshot.statements, { ...snapshot.statements[0]!, value: '4rem' }] },
    ]
    for (const value of wrong) {
      expect(conversionCaseResult(item, 'weapp', observed(value), artifacts, oracle).status).toBe('failed')
    }
    expect(conversionCaseResult(item, 'weapp', observed(snapshot), artifacts, oracle).status).toBe('passed')
  })

  it('不能登记空正向或缺失诊断的负向 oracle', () => {
    expect(() => conversionCaseContract(item, 'weapp', { ...oracle, expected: { statements: [], diagnostics: [] } })).toThrow('空规则')
    expect(() => conversionCaseContract(item, 'weapp', { ...oracle, support: 'unsupported', reason: '已审查限制', expected: { statements: [], diagnostics: [] } })).toThrow('实际诊断')
    expect(() => conversionCaseContract(item, 'lynx', oracle)).toThrow('身份不匹配')
  })

  it('负向合同依赖逐候选诊断，空输出或其它候选的批次诊断不能代证', () => {
    const rejection = { statements: [], diagnostics: ['unsupported:width', 'unsupported:height'] }
    const negative: ReviewedConversionOracle = { ...oracle, support: 'unsupported', reason: '已审查：不支持 size 属性', expected: rejection }
    expect(conversionCaseResult(item, 'weapp', observed({ statements: [], diagnostics: [] }), artifacts, negative).status).toBe('failed')
    expect(conversionCaseResult(item, 'weapp', { ...observed(rejection), diagnosticsScope: 'batch' } as ConversionObservation, artifacts, negative).status).toBe('not-run')
    expect(conversionCaseResult(item, 'weapp', observed(rejection), artifacts, negative)).toMatchObject({ status: 'passed', support: 'unsupported', reason: negative.reason })
    expect(conversionCaseResult(item, 'weapp', { execution: 'failed', reason: 'encoder crash' }, artifacts, negative).status).toBe('failed')
  })

  it('每个 completion 都保留三个独立目标，CLI 不能只凭 generation 显示全绿', () => {
    const success = observed(snapshot)
    const results = staticCandidateResults(item, generation, { 'weapp': success, 'react-native': success, 'lynx': success }, artifacts)
    expect(results[0]!.status).toBe('passed')
    expect(results.slice(1).every(result => result.status === 'not-run')).toBe(true)
    expect(() => assertCapabilitySuccess({ results } as CapabilityReport)).toThrow('3 项尚未通过')
  })
})
