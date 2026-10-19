import type { NativeCandidateResult, NativeMediaGateEvidence, StaticCaseEvidence } from '../examples/react-lynx/src/compatibility/types'
import { describe, expect, it } from 'vitest'
import { combineCandidateEvidence, validateCandidateEvidence } from '../examples/react-lynx/src/compatibility/candidate-evidence'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { MEDIA_GATE_LIMITATION_ID, MEDIA_GATE_PROBE_IDS } from '../examples/react-lynx/src/compatibility/media-gate-contract'
import { parseGeneratedRules, staticMediaGuard } from './lynx/static-evidence'

const item = compatibilityCases.find(item => item.id === 'variant-state')!
const className = 'hover:bg-[#ef4444]'
const rect = (width: number) => ({ width, height: width, left: 0, top: 0, right: width, bottom: width })
const proof = (): NativeMediaGateEvidence => ({
  limitationId: MEDIA_GATE_LIMITATION_ID,
  sdkVersion: '4.0.1', runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64),
  probes: MEDIA_GATE_PROBE_IDS.map(id => ({ id, probe: { ...rect(id === 'unguarded' || id === 'min-width' ? 32 : 16), height: 16, bottom: 16 }, container: rect(64) })),
})
function built(): StaticCaseEvidence {
  const rules = parseGeneratedRules('@media (hover:hover){.hover\\:bg-\\[\\#ef4444\\]:hover{background-color:#ef4444}}')
  return { id: item.id, generated: true, bundled: true, generatedDeclarations: [], bundledDeclarations: [], cssDefinesKnown: [], candidates: [
    { className: 'active:bg-[#dc2626]', generated: true, bundled: true },
    { className, generated: true, bundled: true, mediaGuard: staticMediaGuard(className, rules, rules) },
  ] }
}
const active: NativeCandidateResult = { className: 'active:bg-[#dc2626]', status: 'supported', checkpoints: [{ name: 'interaction:pseudo-active', passed: true }] }

describe('必要媒体条件拒绝与下游未执行边界', () => {
  it('完整独立媒体合同可以拒绝原候选，但不生成 hover 状态结论', () => {
    const result = combineCandidateEvidence(item, built(), [active], proof())
    expect(result.status).toBe('unsupported')
    expect(result.candidates![1]).toMatchObject({ status: 'unsupported', mediaGate: { gate: 'media', downstream: { hoverInput: 'not-tested', pseudoState: 'not-tested' } } })
    expect(result.candidates![1]!.checkpoints).toEqual([{ name: 'media:necessary-guard-v1', passed: true }])
    expect(() => validateCandidateEvidence(item, built(), result, { mediaGate: proof() })).not.toThrow()
  })
  it('只有无效果或仅有静态guard都不能替代本轮原生媒体证据', () => {
    expect(combineCandidateEvidence(item, built(), [active]).status).toBe('not-tested')
  })
  it.each(['missing', 'guard', 'source', 'sdk', 'downstream', 'interaction'] as const)('拒绝 %s 不完整或混淆输入的证明', (mode) => {
    const staticResult = built()
    const mediaGate = proof()
    const result = combineCandidateEvidence(item, staticResult, [active], mediaGate)
    if (mode === 'guard') staticResult.candidates![1]!.mediaGuard!.generatedRules[0]!.mediaConditions = []
    if (mode === 'source') staticResult.candidates![1]!.mediaGuard!.sourceSha256 = 'b'.repeat(64)
    if (mode === 'sdk') mediaGate.sdkVersion = '4.0.2'
    const candidate = result.candidates![1]!
    if (mode === 'downstream') (candidate.mediaGate!.downstream as unknown as { hoverInput: string }).hoverInput = 'supported'
    if (mode === 'interaction') candidate.checkpoints.push({ name: 'interaction:pseudo-hover', passed: true })
    expect(() => validateCandidateEvidence(item, staticResult, result, { mediaGate: mode === 'missing' ? undefined : mediaGate })).toThrow()
  })
})
