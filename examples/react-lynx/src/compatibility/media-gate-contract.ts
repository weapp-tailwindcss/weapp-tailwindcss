import type { NativeCandidateResult, NativeEvidenceContext, NativeMediaGateEvidence, StaticCandidateEvidence, StaticMediaGuardEvidence } from './types'

/** 此限制在运行前登记，只拒绝必要媒体条件，不替代 hover 输入或伪状态取证。 */
export const MEDIA_GATE_LIMITATION_ID = 'lynx4.0.1-media-hover-unknown-v1' as const
export const MEDIA_GATE_SOURCE_SHA256 = '46d718942757e574136fdb02ce32c0acddbc2de0c80b421c5b7023d64ee13f73'
export const MEDIA_GATE_PROBE_IDS = ['base', 'control', 'unguarded', 'min-width', 'hover-hover', 'hover-none'] as const
export const MEDIA_GATE_CANDIDATES = ['hover:bg-[#ef4444]', 'group-hover:block'] as const
export const MEDIA_GATE_REASON = 'Lynx 4.0.1 未暴露 hover 媒体能力，必要条件 (hover:hover) 不匹配；hover 输入和伪状态仍未测试'

export function mediaGateArtifactNames() {
  return [...MEDIA_GATE_PROBE_IDS.map(id => `media-hover-v1-${id}.png`), 'media-hover-v1.native.json']
}

export function mediaGuardValid(proof: StaticMediaGuardEvidence | undefined, className = proof?.className) {
  const needle = className ? `.${className.replace(/[^\w-]/g, '\\$&')}` : ''
  const ownsSelector = (selector: string) => {
    if (!needle) {
      return false
    }
    let offset = selector.indexOf(needle)
    while (offset >= 0) {
      const next = selector[offset + needle.length]
      if (next === undefined || !/[\w\\-]/.test(next)) {
        return true
      }
      offset = selector.indexOf(needle, offset + needle.length)
    }
    return false
  }
  return proof?.limitationId === MEDIA_GATE_LIMITATION_ID && proof.sourceSha256 === MEDIA_GATE_SOURCE_SHA256
    && proof.className === className && (MEDIA_GATE_CANDIDATES as readonly (string | undefined)[]).includes(className)
    && proof.condition === '(hover:hover)' && [proof.generatedRules, proof.bundledRules].every(rules => Array.isArray(rules) && rules.length > 0
      && rules.every(rule => typeof rule.selector === 'string' && ownsSelector(rule.selector) && Array.isArray(rule.mediaConditions) && rule.mediaConditions.includes('(hover:hover)')))
}

/** 宿主的身份和几何是必要条件；验收端还必须独立读取侧车和 PNG。 */
export function validateMediaGateEvidence(evidence: NativeMediaGateEvidence | undefined, context?: NativeEvidenceContext): asserts evidence is NativeMediaGateEvidence {
  if (!evidence || evidence.limitationId !== MEDIA_GATE_LIMITATION_ID || evidence.sdkVersion !== '4.0.1'
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(evidence.runId) || !/^[a-f0-9]{64}$/.test(evidence.bundleSha256)
    || (context && (evidence.runId !== context.runId || evidence.bundleSha256 !== context.bundleSha256))
    || !Array.isArray(evidence.probes) || evidence.probes.length !== MEDIA_GATE_PROBE_IDS.length) {
    throw new Error('Lynx media gate 缺少固定 SDK、本轮身份或完整探针')
  }
  const ids = new Set<string>()
  for (const item of evidence.probes) {
    const positive = item.id === 'unguarded' || item.id === 'min-width'
    const { probe, container } = item
    const validRect = (rect: typeof probe) => rect && Object.values(rect).every(value => typeof value === 'number' && Number.isFinite(value))
      && Math.abs(rect.right - rect.left - rect.width) < 0.1 && Math.abs(rect.bottom - rect.top - rect.height) < 0.1
    if (!MEDIA_GATE_PROBE_IDS.includes(item.id) || ids.has(item.id) || !validRect(probe) || !validRect(container)
      || Math.abs(container.width - 64) > 0.5 || Math.abs(container.height - 64) > 0.5
      || Math.abs(probe.width - (positive ? 32 : 16)) > 0.5 || Math.abs(probe.height - 16) > 0.5
      || Math.abs(probe.left - container.left) > 0.5 || Math.abs(probe.top - container.top) > 0.5) {
      throw new Error(`Lynx media gate 探针重复、缺证或几何不符合运行前合同：${item.id}`)
    }
    ids.add(item.id)
  }
}

export function mediaGateRejection(className: string, proof: StaticMediaGuardEvidence | undefined, evidence: NativeMediaGateEvidence): NativeCandidateResult {
  validateMediaGateEvidence(evidence)
  if (!(MEDIA_GATE_CANDIDATES as readonly string[]).includes(className) || !mediaGuardValid(proof, className)) {
    throw new Error(`${className} 缺少固定来源及所有规则的必要 media guard`)
  }
  return {
    className,
    status: 'unsupported',
    reason: MEDIA_GATE_REASON,
    mediaGate: { limitationId: MEDIA_GATE_LIMITATION_ID, stage: 'runtime', gate: 'media', condition: '(hover:hover)', sourceSha256: MEDIA_GATE_SOURCE_SHA256, evidenceId: 'media-hover-v1', downstream: { hoverInput: 'not-tested', pseudoState: 'not-tested' } },
    checkpoints: [{ name: 'media:necessary-guard-v1', passed: true }],
  }
}

function sameData(actual: unknown, expected: unknown): boolean {
  if (actual === expected) {
    return true
  }
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') {
    return false
  }
  const keys = Object.keys(actual)
  return keys.length === Object.keys(expected).length && keys.every(key => Object.hasOwn(expected, key)
    && sameData(Reflect.get(actual, key), Reflect.get(expected, key)))
}

/** 媒体 gate 是独立拒绝分支，不接受失败或成功的 interaction checkpoint 作为替代。 */
export function validateMediaGateCandidate(candidate: NativeCandidateResult, built: StaticCandidateEvidence | undefined, evidence: NativeMediaGateEvidence | undefined, context?: NativeEvidenceContext) {
  validateMediaGateEvidence(evidence, context)
  if (!built?.generated || !built.bundled) {
    throw new Error(`${candidate.className} 的媒体拒绝不能掩盖生成或 encoder 失败`)
  }
  const expected = mediaGateRejection(candidate.className, built.mediaGuard, evidence)
  if (!sameData(candidate, expected)) {
    throw new Error(`${candidate.className} 的必要媒体条件证据不完整或混淆了未执行的 hover 输入`)
  }
}
