import type { ReactNativeCaseResult, ReactNativePlatform, ReactNativeReport } from './catalog'
import { compatibilityCases, RN_CATALOG_HASH, RN_VERSIONS } from './catalog'

const requiredCheckpoint = new Map(compatibilityCases.map(item => [item.id, item.evidence === 'build' ? 'build:bundled' : `${item.probe}:probe`]))

function fail(message: string): never {
  throw new Error(`React Native compatibility report: ${message}`)
}

export function validateReactNativeReport(report: ReactNativeReport, platform: ReactNativePlatform = report.platform) {
  if (report.schemaVersion !== 1) {
    fail('schemaVersion must be 1')
  }
  if (report.platform !== platform) {
    fail(`platform must be ${platform}`)
  }
  if (report.catalogHash !== RN_CATALOG_HASH) {
    fail('stale catalog hash')
  }
  if (!report.verifiedAt || report.verifiedAt === 'unknown') {
    fail('verifiedAt is required')
  }
  if (!report.environment.deviceName || report.environment.deviceName === 'unknown') {
    fail('environment.deviceName is required')
  }
  if (!report.environment.osVersion || report.environment.osVersion === 'unknown') {
    fail('environment.osVersion is required')
  }
  if (report.results.length !== compatibilityCases.length) {
    fail('report must contain every catalog case exactly once')
  }
  const ids = new Set<string>()
  for (const result of report.results) {
    if (ids.has(result.id)) {
      fail(`duplicate case ${result.id}`)
    }
    ids.add(result.id)
    const expectedCheckpoint = requiredCheckpoint.get(result.id)
    if (!expectedCheckpoint) {
      fail(`unknown case ${result.id}`)
    }
    if (result.status !== 'supported' && result.status !== 'unsupported') {
      fail(`${result.id} has invalid status ${String(result.status)}`)
    }
    if (!result.checkpoints.length) {
      fail(`${result.id} has no checkpoint`)
    }
    if (result.status === 'unsupported' && !result.reason) {
      fail(`${result.id} unsupported result needs a reason`)
    }
    if (result.status === 'unsupported' && !result.warnings?.length) {
      fail(`${result.id} unsupported result needs a warning`)
    }
    if (result.status === 'supported' && result.checkpoints.some(checkpoint => !checkpoint.passed)) {
      fail(`${result.id} supported result contains a failed checkpoint`)
    }
    const hasExpected = result.checkpoints.some(checkpoint => checkpoint.name.startsWith(expectedCheckpoint))
    const hasStaticEvidence = result.checkpoints.some(checkpoint => checkpoint.name.startsWith('build:'))
    if (!hasExpected && !hasStaticEvidence) {
      fail(`${result.id} is missing ${expectedCheckpoint} checkpoint`)
    }
  }
  return report
}

export function nativeReportConclusion(report: ReactNativeReport) {
  return report.results.map(result => `${result.id}:${result.status}`).join('|')
}

export function reportFromStaticEvidence(platform: ReactNativePlatform, results: ReactNativeCaseResult[], environment: ReactNativeReport['environment']): ReactNativeReport {
  const report: ReactNativeReport = {
    schemaVersion: 1,
    platform,
    catalogHash: RN_CATALOG_HASH,
    verifiedAt: new Date().toISOString(),
    versions: { ...RN_VERSIONS },
    environment,
    results,
  }
  return validateReactNativeReport(report, platform)
}
