import type { StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import { requiresCandidateEvidence } from '../../examples/react-lynx/src/compatibility/candidate-evidence'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { compatibilityVersions, getCatalogHash } from './catalog'

/** 历史静态报告仅供展示；启动设备之前必须确认本轮共享目录、版本与逐候选证据。 */
export function assertCurrentStaticEvidence(report: StaticEvidenceReport) {
  const versionsMatch = Object.entries(compatibilityVersions).every(([key, value]) => report.versions[key as keyof typeof report.versions] === value)
  if (report.catalogHash !== getCatalogHash() || !versionsMatch) {
    throw new Error('Lynx 静态证据属于历史 catalog 或依赖版本；请在允许构建后执行 pnpm e2e:lynx:static:update，历史报告不能作为本轮验收')
  }
  const expected = compatibilityCases.map(item => item.id).sort()
  const actual = report.results.map(item => item.id).sort()
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('Lynx 静态证据缺少完整且唯一的 catalog case')
  }
  for (const item of compatibilityCases.filter(item => requiresCandidateEvidence(item.id))) {
    const candidates = report.results.find(result => result.id === item.id)?.candidates?.map(candidate => candidate.className).sort()
    if (JSON.stringify(candidates) !== JSON.stringify(item.className.split(/\s+/).filter(Boolean).sort())) {
      throw new Error(`${item.id} 缺少逐候选静态证据，请重新生成 Lynx 静态基线`)
    }
  }
}
