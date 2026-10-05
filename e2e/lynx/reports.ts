import type { NativePlatformReport, Platform, StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { evaluateGeometry } from '../../examples/react-lynx/src/compatibility/geometry'
import staticEvidenceJson from '../../examples/react-lynx/src/compatibility/static-evidence.json'
import { compatibilityVersions, getCatalogHash } from './catalog'
import { readEvidenceContext, validateNativeEvidence } from './evidence'
import { validateNativePixelEvidence } from './pixel-evidence'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

export function validateNativeReport(report: NativePlatformReport, platform: Platform, options: { requireGeometryEvidence?: boolean } = {}) {
  assert(report.schemaVersion === 1, `${platform} report schemaVersion must be 1`)
  assert(report.platform === platform, `expected ${platform} report, received ${report.platform}`)
  assert(report.catalogHash === getCatalogHash(), `${platform} report catalog hash is stale`)
  assert(JSON.stringify(report.versions) === JSON.stringify(compatibilityVersions), `${platform} report versions do not match the pinned matrix`)
  assert(!Number.isNaN(Date.parse(report.verifiedAt)), `${platform} report verifiedAt is invalid`)
  const environment = report.environment
  assert(Boolean(environment), `${platform} report environment is missing`)
  assert(environment.osName === (platform === 'ios' ? 'iOS' : 'Android'), `${platform} report has the wrong OS name`)
  for (const [name, value] of Object.entries({
    deviceName: environment.deviceName,
    deviceModel: environment.deviceModel,
    osVersion: environment.osVersion,
    osBuild: environment.osBuild,
    runtimeIdentifier: environment.runtimeIdentifier,
    abi: environment.abi,
  })) {
    assert(Boolean(value) && value !== 'unknown', `${platform} report environment.${name} is not resolved`)
  }
  assert(environment.viewport.width > 0 && environment.viewport.height > 0, `${platform} report viewport is invalid`)
  assert(environment.viewport.pixelRatio > 0, `${platform} report pixel ratio is invalid`)
  if (platform === 'android') {
    assert(Number.isInteger(environment.apiLevel) && environment.apiLevel! > 0, 'android report API level is invalid')
  }
  const expectedIds = compatibilityCases.map(item => item.id).sort()
  const actualIds = report.results.map(item => item.id).sort()
  assert(new Set(actualIds).size === actualIds.length, `${platform} report contains duplicate case IDs`)
  assert(JSON.stringify(actualIds) === JSON.stringify(expectedIds), `${platform} report must contain every catalog case exactly once`)
  const caseById = new Map(compatibilityCases.map(item => [item.id, item]))
  const staticById = new Map((staticEvidenceJson as StaticEvidenceReport).results.map(item => [item.id, item]))
  for (const result of report.results) {
    const item = caseById.get(result.id)
    const staticResult = staticById.get(result.id)
    assert(item && staticResult, `${platform}:${result.id} is missing catalog or static evidence`)
    assert(result.status === 'supported' || result.status === 'unsupported', `${platform}:${result.id} has no final runtime status`)
    assert(result.checkpoints.length > 0, `${platform}:${result.id} has no runtime checkpoint`)
    assert(result.checkpoints.every(checkpoint => typeof checkpoint.passed === 'boolean'), `${platform}:${result.id} has an invalid checkpoint`)
    if (!staticResult.generated || !staticResult.bundled) {
      assert(result.status === 'unsupported', `${platform}:${result.id} cannot be supported after a static generation or encoder failure`)
      assert(result.checkpoints.some(checkpoint => checkpoint.name === 'generated'), `${platform}:${result.id} is missing its generated checkpoint`)
      assert(result.checkpoints.some(checkpoint => checkpoint.name === 'bundled'), `${platform}:${result.id} is missing its bundled checkpoint`)
    }
    else {
      const checkpointPrefix = item.evidence === 'build'
        ? 'build:'
        : item.probe === 'geometry'
          ? 'geometry:'
          : item.probe === 'interaction'
            ? 'interaction:'
            : 'pixel:'
      assert(
        result.checkpoints.some(checkpoint => checkpoint.name.startsWith(checkpointPrefix)),
        `${platform}:${result.id} is missing a ${checkpointPrefix} checkpoint`,
      )
    }
    if (options.requireGeometryEvidence && staticResult.generated && staticResult.bundled && item.evidence === 'runtime' && item.probe === 'geometry') {
      const measured = evaluateGeometry(item, result.geometry)
      assert(measured.status !== 'not-tested', `${platform}:${result.id} geometry 原始测量证据缺失或无效`)
      assert(measured.status === result.status, `${platform}:${result.id} geometry 结论与原始测量不符`)
      const matches = result.checkpoints.length === measured.checkpoints.length && measured.checkpoints.every(expected => result.checkpoints.some(actual => (
        actual.name === expected.name && actual.passed === expected.passed && actual.actual === expected.actual && actual.expected === expected.expected
      )))
      assert(matches, `${platform}:${result.id} geometry checkpoint 与原始测量不符`)
    }
    if (result.status === 'supported') {
      assert(result.checkpoints.every(checkpoint => checkpoint.passed), `${platform}:${result.id} is supported but contains a failed checkpoint`)
    }
    if (result.status === 'unsupported') {
      assert(Boolean(result.reason), `${platform}:${result.id} is unsupported without a reason`)
    }
  }
  return report
}

export async function readNativeReport(reportPath: string, platform: Platform) {
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8')) as NativePlatformReport
  validateNativeReport(report, platform, { requireGeometryEvidence: true })
  const artifactDir = path.dirname(reportPath)
  const context = await readEvidenceContext(artifactDir)
  const crops = await validateNativeEvidence(report, artifactDir, context)
  await validateNativePixelEvidence(report, crops)
  return report
}

export function nativeReportConclusion(report: NativePlatformReport) {
  return {
    schemaVersion: report.schemaVersion,
    platform: report.platform,
    catalogHash: report.catalogHash,
    versions: report.versions,
    results: report.results.map(result => ({
      id: result.id,
      status: result.status,
      reason: result.reason,
      failureStage: result.failureStage,
      checkpoints: result.checkpoints.map(checkpoint => ({
        name: checkpoint.name,
        passed: checkpoint.passed,
      })),
    })),
  }
}

export function defaultReportPath(platform: Platform) {
  return path.join(import.meta.dirname, 'reports', `${platform}.json`)
}
