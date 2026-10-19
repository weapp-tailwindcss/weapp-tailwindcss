import type { NativePlatformReport, StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import { requiresCandidateEvidence, validateCandidateEvidence } from '../../examples/react-lynx/src/compatibility/candidate-evidence'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import staticEvidence from '../../examples/react-lynx/src/compatibility/static-evidence.json'
import { nativeReportConclusion } from './reports'

/** 部分采集仅允许已验证的混合候选记录，返回明确的待测清单。 */
export function pendingNativeCandidates(report: NativePlatformReport) {
  return report.results.flatMap((result) => {
    if (result.status !== 'not-tested') {
      return []
    }
    const item = compatibilityCases.find(item => item.id === result.id)
    if (!item || !requiresCandidateEvidence(item.id)) {
      throw new Error(`${result.id} 不是允许部分采集的混合候选案例`)
    }
    validateCandidateEvidence(item, (staticEvidence as StaticEvidenceReport).results.find(item => item.id === result.id), result, { allowPending: true })
    return result.candidates!.filter(candidate => candidate.status === 'not-tested').map(candidate => ({ id: result.id, className: candidate.className, reason: candidate.reason! }))
  })
}

/** 采集时逐一比较已完成案例，待测候选保留 partial；默认最终比较不放行缺证。 */
export function assertNativeConclusionsMatch(actual: NativePlatformReport, expected: NativePlatformReport, options: { allowPendingCandidates?: boolean } = {}) {
  const pending = pendingNativeCandidates(actual)
  if (pending.length && !options.allowPendingCandidates) {
    throw new Error(`${actual.platform} 仍有待测的独立候选，不能比较或更新最终基线`)
  }
  const pendingIds = new Set(pending.map(item => item.id))
  const first = nativeReportConclusion(actual)
  const second = nativeReportConclusion(expected)
  if (pendingIds.size) {
    first.results = first.results.filter(item => !pendingIds.has(item.id))
    second.results = second.results.filter(item => !pendingIds.has(item.id))
  }
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error(`${actual.platform} 已完成的运行时结论与已提交报告不一致，请审查 artifact 后显式刷新双端基线。`)
  }
  return pending
}
