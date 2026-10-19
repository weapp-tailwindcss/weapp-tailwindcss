import type { CompatibilityCase, NativeCandidateResult, NativeCaseResult, StaticCaseEvidence } from './types'

export function requiresCandidateEvidence(id: string) {
  return id === 'variant-state' || id === 'variant-group-peer'
}

export function candidateCheckpoint(className: string) {
  if (className.startsWith('active:')) {
    return 'interaction:pseudo-active'
  }
  if (className.startsWith('hover:')) {
    return 'interaction:pseudo-hover'
  }
  if (className.startsWith('group-hover:')) {
    return 'interaction:group-hover'
  }
  if (className.startsWith('peer-checked:')) {
    return 'interaction:peer-checked'
  }
  throw new Error(`尚未登记 ${className} 的独立状态取证契约`)
}

/** 每个候选独立取证，active 的结果不能代替 hover，group 的结果不能代替 peer。 */
export function combineCandidateEvidence(
  item: CompatibilityCase,
  built: StaticCaseEvidence | undefined,
  measured: NativeCandidateResult[] = [],
): NativeCaseResult {
  const candidates = item.className.trim().split(/\s+/).filter(Boolean).map((className): NativeCandidateResult => {
    const candidate = built?.candidates?.find(candidate => candidate.className === className)
    if (!candidate) {
      return { className, status: 'not-tested', reason: '静态证据缺少该候选的独立生成及编码结果，请重新生成静态证据', checkpoints: [{ name: 'interaction:candidate-static', passed: false }] }
    }
    if (!candidate.generated || !candidate.bundled) {
      return {
        className,
        status: 'unsupported',
        reason: candidate.reason ?? '该候选未通过生成或 encoder',
        checkpoints: [{ name: 'generated', passed: candidate.generated }, { name: 'bundled', passed: candidate.bundled }],
      }
    }
    const observed = measured.find(candidate => candidate.className === className)
    return observed ?? {
      className,
      status: 'not-tested',
      reason: '原生 host 尚未对该候选注入并验证独立状态，不能沿用其它候选的结果',
      checkpoints: [{ name: 'interaction:candidate-input', passed: false }],
    }
  })
  const pending = candidates.filter(candidate => candidate.status === 'not-tested')
  const rejected = candidates.filter(candidate => candidate.status === 'unsupported')
  const status = pending.length > 0 ? 'not-tested' : rejected.length > 0 ? 'unsupported' : 'supported'
  return {
    id: item.id,
    status,
    ...(status === 'supported' ? {} : { reason: [...pending, ...rejected].map(candidate => `${candidate.className}: ${candidate.reason}`).join('; ') }),
    candidates,
    checkpoints: [
      ...candidates.flatMap(candidate => candidate.checkpoints),
      { name: 'interaction:candidates-complete', passed: pending.length === 0, actual: candidates.map(candidate => `${candidate.className}=${candidate.status}`).join('; ') },
    ],
  }
}

/** 本轮验收只接受候选齐全且汇总一致的报告；历史展示无需补造这些结果。 */
export function validateCandidateEvidence(item: CompatibilityCase, built: StaticCaseEvidence | undefined, result: NativeCaseResult) {
  if (!requiresCandidateEvidence(item.id)) {
    return
  }
  const expected = item.className.trim().split(/\s+/).filter(Boolean).sort()
  const actual = result.candidates?.map(candidate => candidate.className).sort()
  if (!actual || JSON.stringify(actual) !== JSON.stringify(expected) || new Set(actual).size !== actual.length) {
    throw new Error(`${item.id} 缺少完整且唯一的候选证据，历史报告不能作为本轮验收`)
  }
  const combined = combineCandidateEvidence(item, built, result.candidates)
  if (combined.status === 'not-tested' || combined.status !== result.status) {
    throw new Error(`${item.id} 的候选尚未全部验证或汇总结论不一致`)
  }
  for (const candidate of result.candidates ?? []) {
    const staticCandidate = built?.candidates?.find(item => item.className === candidate.className)
    const rejectedByStatic = !staticCandidate?.generated || !staticCandidate.bundled
    const stateCheckpoint = candidate.checkpoints.find(checkpoint => checkpoint.name === candidateCheckpoint(candidate.className))
    const staticCheckpointsMatch = candidate.checkpoints.some(checkpoint => checkpoint.name === 'generated' && checkpoint.passed === staticCandidate?.generated)
      && candidate.checkpoints.some(checkpoint => checkpoint.name === 'bundled' && checkpoint.passed === staticCandidate?.bundled)
    if (!['supported', 'unsupported'].includes(candidate.status)
      || !candidate.checkpoints.length || candidate.checkpoints.some(checkpoint => typeof checkpoint.passed !== 'boolean')
      || (rejectedByStatic && (candidate.status !== 'unsupported' || !staticCheckpointsMatch))
      || (candidate.status === 'supported' && (candidate.checkpoints.some(checkpoint => !checkpoint.passed)
        || !stateCheckpoint?.passed))
      || (candidate.status === 'unsupported' && (!candidate.reason || (!rejectedByStatic && stateCheckpoint?.passed !== false)))) {
      throw new Error(`${item.id}:${candidate.className} 的独立 checkpoint 无效`)
    }
  }
}
