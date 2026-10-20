import type { NativeCaseResult, NativePlatformReport, Platform, StaticEvidenceReport } from '../../../examples/react-lynx/src/compatibility/types'
import { candidateCheckpoint, combineCandidateEvidence, requiresCandidateEvidence } from '../../../examples/react-lynx/src/compatibility/candidate-evidence'
import { compatibilityCases } from '../../../examples/react-lynx/src/compatibility/catalog'
import { evidenceSequence, lynxEvidenceStrategy } from '../../../examples/react-lynx/src/compatibility/evidence'
import { compatibilityVersions, getCatalogHash } from '../catalog'

/** 协议回归固定构造已进入取证阶段的输入，不读取设备报告或推导真实平台支持。 */
export function protocolStaticEvidence(): StaticEvidenceReport {
  return {
    schemaVersion: 1,
    catalogHash: getCatalogHash(),
    generatedAt: '2026-10-19T00:00:00.000Z',
    versions: compatibilityVersions,
    results: compatibilityCases.map(item => ({
      id: item.id,
      generated: true,
      bundled: true,
      generatedDeclarations: [],
      bundledDeclarations: [],
      cssDefinesKnown: [],
      candidates: item.className.split(/\s+/).filter(Boolean).map(className => ({ className, generated: true, bundled: true })),
    })),
  }
}

/** 状态、帧和几何仍由各套合成夹具重新计算，不继承历史 checkpoint 或宿主身份。 */
export function protocolReport(platform: Platform = 'android'): NativePlatformReport {
  const builtById = new Map(protocolStaticEvidence().results.map(item => [item.id, item]))
  return {
    schemaVersion: 1,
    platform,
    catalogHash: getCatalogHash(),
    verifiedAt: '2026-10-19T00:00:00.000Z',
    versions: compatibilityVersions,
    environment: {
      deviceName: 'protocol-fixture',
      deviceModel: 'synthetic',
      osName: platform === 'ios' ? 'iOS' : 'Android',
      osVersion: '1',
      osBuild: 'fixture',
      runtimeIdentifier: 'protocol-fixture',
      abi: 'synthetic',
      viewport: { width: 400, height: 800, pixelRatio: 1 },
      ...(platform === 'android' ? { apiLevel: 30 } : {}),
    },
    results: compatibilityCases.map((item): NativeCaseResult => {
      const built = builtById.get(item.id)!
      if (requiresCandidateEvidence(item.id)) {
        return combineCandidateEvidence(item, built, built.candidates!.map(candidate => ({
          className: candidate.className,
          status: 'supported',
          checkpoints: [{ name: candidateCheckpoint(candidate.className), passed: true }],
        })))
      }
      const sequence = evidenceSequence(item, built)
      const strategy = lynxEvidenceStrategy(item)
      const checkpoint = sequence?.checkpoint ?? (strategy === 'build' ? 'build:generated' : strategy === 'native-geometry' ? 'geometry:probe-vs-control' : 'interaction:progress')
      return { id: item.id, status: 'supported', checkpoints: [{ name: checkpoint, passed: true }] }
    }),
  }
}
