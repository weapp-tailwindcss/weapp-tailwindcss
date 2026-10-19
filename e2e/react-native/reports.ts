import type { ReactNativeCaseResult, ReactNativePlatform, ReactNativeReport } from './catalog'
import { nativeBuildCases, nativeFixtures, rejectedNativeCases } from '../../examples/react-native-expo/src/compatibility/protocol'
import { compatibilityCases, reactNativeVersions, RN_CATALOG_HASH, RN_FIXTURE_HASH } from './catalog'

function fail(message: string): never {
  throw new Error(`React Native compatibility report: ${message}`)
}

export function validateReactNativeReport(report: ReactNativeReport, platform: ReactNativePlatform = report.platform, context: { stage?: 'static' | 'runtime', runId?: string, revision?: string, versions?: Record<string, string> } = {}) {
  if (report.schemaVersion !== 2) {
    fail('historical schemaVersion is not fresh runtime evidence; regenerate static evidence and rerun')
  }
  const stage = context.stage ?? 'runtime'
  if (report.stage !== stage) {
    fail(`stage must be ${stage}`)
  }
  if (report.platform !== platform) {
    fail(`platform must be ${platform}`)
  }
  if (report.catalogHash !== RN_CATALOG_HASH || report.fixtureHash !== RN_FIXTURE_HASH) {
    fail('stale catalog or fixture hash')
  }
  if (context.revision && report.revision !== context.revision) {
    fail('stale runtime revision')
  }
  if (!report.runId || (context.runId && report.runId !== context.runId)) {
    fail('stale or missing runId')
  }
  if (!Number.isFinite(Date.parse(report.verifiedAt))) {
    fail('verifiedAt is required')
  }
  const versions = context.versions ?? reactNativeVersions()
  if (Object.entries(versions).some(([name, value]) => report.versions[name] !== value)) {
    fail('actual dependency versions changed')
  }
  if (!report.environment.deviceName || !report.environment.osVersion) {
    fail('actual runtime environment is required')
  }
  if (report.results.length !== compatibilityCases.length) {
    fail('report must contain every catalog case exactly once')
  }
  const ids = new Set<string>()
  for (const result of report.results) {
    const item = compatibilityCases.find(item => item.id === result.id)
    if (!item || ids.has(result.id)) {
      fail(`unknown or duplicate case ${result.id}`)
    }
    ids.add(result.id)
    if (!result.generated || !result.checkpoints.some(checkpoint => checkpoint.name === 'generation:candidates' && checkpoint.passed)) {
      fail(`${result.id} generation failed`)
    }
    for (const [index, declaration] of item.declarations.entries()) {
      if (!result.checkpoints.some(checkpoint => checkpoint.name === `generation:declaration:${index}:${declaration.property}` && checkpoint.passed)) {
        fail(`${result.id} is missing declaration ${declaration.property}`)
      }
    }
    if (rejectedNativeCases.has(result.id)) {
      if (result.status !== 'unsupported' || result.encoded || !result.reason || !result.warnings.some(warning => warning.trim())
        || !result.checkpoints.some(checkpoint => checkpoint.name === 'encoder:expected-rejection' && checkpoint.passed)) {
        fail(`${result.id} does not match the reviewed native rejection`)
      }
      continue
    }
    if (!nativeFixtures[result.id] && !nativeBuildCases.has(result.id)) {
      fail(`${result.id} has no reviewed semantic fixture`)
    }
    if (!result.encoded || result.warnings.length || !result.checkpoints.some(checkpoint => checkpoint.name === 'encoder:complete' && checkpoint.passed)) {
      fail(`${result.id} has partial or missing native encoding`)
    }
    if (stage === 'static' && result.status === 'unverified' && !nativeBuildCases.has(result.id)) {
      continue
    }
    if (result.status !== 'supported' || result.checkpoints.some(checkpoint => !checkpoint.passed)) {
      fail(`${result.id} changed from expected support to ${result.status}`)
    }
    if (nativeBuildCases.has(result.id)) {
      continue
    }
    const phases = nativeFixtures[result.id]!.phases ?? ['default']
    for (const phase of phases) {
      for (const kind of ['geometry', 'pixel', 'style']) {
        if (!result.checkpoints.some(checkpoint => checkpoint.name === `runtime:${phase}:${kind}` && checkpoint.passed)) {
          fail(`${result.id} is missing runtime ${phase} ${kind}`)
        }
      }
      const receipts = report.receipts.filter(receipt => receipt.id === result.id && receipt.phase === phase)
      const receipt = receipts[0]
      if (receipts.length !== 1 || !receipt || receipt.runId !== report.runId || !/^[a-f0-9]{64}$/.test(receipt.artifact.sha256)
        || receipt.artifact.name !== `case-${report.revision}-${result.id}-${phase}.png`
        || receipt.artifact.byteLength < 100 || receipt.checkpoints.length !== 2
        || ['geometry', 'pixel'].some(kind => !receipt.checkpoints.some(checkpoint => checkpoint.name === `runtime:${phase}:${kind}` && checkpoint.passed === true))) {
        fail(`${result.id} is missing fresh native artifact receipt for ${phase}`)
      }
    }
  }
  if (stage === 'runtime') {
    const covered = report.results.filter(result => nativeFixtures[result.id]).reduce((sum, result) => sum + (nativeFixtures[result.id]!.phases?.length ?? 1), 0)
    if (report.receipts.length !== covered) {
      fail('report contains missing or extraneous native screenshot receipts')
    }
  }
  return report
}

/** 旧报告仅供历史展示，不能调用 fresh gate。 */
export function readHistoricalReactNativeReport(report: { schemaVersion: number, platform: string, verifiedAt: string, results: Array<{ id: string, status: string }> }) {
  if (report.schemaVersion !== 1 || !report.verifiedAt || !report.results.length) {
    fail('invalid historical report')
  }
  return { historical: true as const, report }
}

export function nativeReportConclusion(report: ReactNativeReport) {
  return report.results.map(result => `${result.id}:${result.status}`).join('|')
}

export function reportFromStaticEvidence(platform: ReactNativePlatform, results: ReactNativeCaseResult[], environment: ReactNativeReport['environment']): ReactNativeReport {
  return {
    schemaVersion: 2,
    stage: 'static',
    revision: 'static',
    platform,
    catalogHash: RN_CATALOG_HASH,
    fixtureHash: RN_FIXTURE_HASH,
    runId: 'static-generation',
    verifiedAt: new Date().toISOString(),
    versions: reactNativeVersions(),
    environment,
    results,
    receipts: [],
  }
}
