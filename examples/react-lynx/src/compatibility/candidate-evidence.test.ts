import type { NativeCandidateResult, StaticCaseEvidence } from './types'
import { describe, expect, it } from 'vitest'
import { candidateCheckpoint, combineCandidateEvidence, validateCandidateEvidence } from './candidate-evidence'
import { compatibilityCases } from './catalog'

describe('混合候选独立证据', () => {
  const item = compatibilityCases.find(item => item.id === 'variant-state')!
  const built: StaticCaseEvidence = {
    id: item.id,
    generated: true,
    bundled: true,
    generatedDeclarations: [],
    bundledDeclarations: [],
    cssDefinesKnown: [],
    candidates: item.className.split(/\s+/).map(className => ({ className, generated: true, bundled: true })),
  }
  const observed = (className: string): NativeCandidateResult => ({ className, status: 'supported', checkpoints: [{ name: candidateCheckpoint(className), passed: true }] })

  it('只验证 active 不能将 active/hover 总结为支持', () => {
    const result = combineCandidateEvidence(item, built, [observed(built.candidates![0]!.className)])
    expect(result.status).toBe('not-tested')
    expect(result.candidates!.map(candidate => candidate.status)).toEqual(['supported', 'not-tested'])
    expect(() => validateCandidateEvidence(item, built, result)).toThrow(/尚未全部验证/)
  })

  it('必须包含每一个不同候选，重复和额外候选不能凑齐数量', () => {
    const result = combineCandidateEvidence(item, built, built.candidates!.map(candidate => observed(candidate.className)))
    expect(result.status).toBe('supported')
    expect(() => validateCandidateEvidence(item, built, result)).not.toThrow()
    result.candidates![1] = result.candidates![0]!
    expect(() => validateCandidateEvidence(item, built, result)).toThrow(/完整且唯一/)
  })

  it('旧报告或缺少静态候选的报告只可展示，不补造独立结论', () => {
    const result = combineCandidateEvidence(item, { ...built, candidates: undefined })
    expect(result.status).toBe('not-tested')
    expect(() => validateCandidateEvidence(item, built, { id: item.id, status: 'supported', checkpoints: [] })).toThrow(/历史报告/)
  })

  it('几何或其它状态 checkpoint 不能替代 hover 的独立验证', () => {
    const result = combineCandidateEvidence(item, built, built.candidates!.map(candidate => observed(candidate.className)))
    result.candidates![1]!.checkpoints = [{ name: 'interaction:pseudo-active', passed: true }]
    expect(() => validateCandidateEvidence(item, built, result)).toThrow(/checkpoint 无效/)
  })

  it('group 与 peer 分别保留 encoder 拒绝及未注入状态，不互相覆盖', () => {
    const relation = compatibilityCases.find(item => item.id === 'variant-group-peer')!
    const [group, peer] = relation.className.split(/\s+/) as [string, string]
    const result = combineCandidateEvidence(relation, {
      ...built,
      id: relation.id,
      bundled: false,
      candidates: [{ className: group, generated: true, bundled: true }, { className: peer, generated: true, bundled: false, reason: 'peer selector 被 encoder 删除' }],
    })
    expect(result.status).toBe('not-tested')
    expect(result.candidates).toMatchObject([{ className: group, status: 'not-tested' }, { className: peer, status: 'unsupported', reason: 'peer selector 被 encoder 删除' }])
  })

  it('encoder 拒绝的候选不能在汇总为 unsupported 时暗中标记 supported', () => {
    const rejected = { ...built, bundled: false, candidates: built.candidates!.map(candidate => ({ ...candidate, bundled: false })) }
    const result = combineCandidateEvidence(item, rejected)
    expect(() => validateCandidateEvidence(item, rejected, result)).not.toThrow()
    result.candidates![0] = observed(result.candidates![0]!.className)
    expect(() => validateCandidateEvidence(item, rejected, result)).toThrow(/checkpoint 无效/)
  })

  it('原生不支持结论同样要求该候选自己的失败状态 checkpoint', () => {
    const result = combineCandidateEvidence(item, built, built.candidates!.map(candidate => observed(candidate.className)))
    result.status = 'unsupported'
    result.candidates![1] = { ...result.candidates![1]!, status: 'unsupported', reason: 'hover 无效果', checkpoints: [{ name: 'unrelated', passed: false }] }
    expect(() => validateCandidateEvidence(item, built, result)).toThrow(/checkpoint 无效/)
    result.candidates![1]!.checkpoints = [{ name: candidateCheckpoint(result.candidates![1]!.className), passed: false }]
    expect(() => validateCandidateEvidence(item, built, result)).not.toThrow()
  })
})
