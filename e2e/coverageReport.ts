import type { CoverageIdentity } from './coverageIdentity'
import type { CoverageCell, CoverageLayer, CoverageStatus } from './coverageRegistry'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compareCoverageIdentity } from './coverageIdentity'
import { COVERAGE_LAYERS, COVERAGE_REGISTRY, validateCoverageRegistry } from './coverageRegistry'

export const COVERAGE_REPORT_SCHEMA_VERSION = 4 as const
export type CoverageResultStatus = 'passed' | 'failed' | 'blocked' | 'not-run' | 'not-applicable' | 'unsupported'
const COVERAGE_RESULT_STATUSES: readonly CoverageResultStatus[] = ['passed', 'failed', 'blocked', 'not-run', 'not-applicable', 'unsupported']

export interface CoverageEvidence {
  cellId: string
  layer: CoverageLayer
  status: CoverageResultStatus
  executor: string
  evidenceSchema: string
  reason?: string
  checkpoints?: string[]
  artifacts?: string[]
  artifactManifest?: CoverageArtifact[]
  environment?: Record<string, string | number | boolean>
  identity?: CoverageIdentity
}

export interface CoverageArtifact {
  path: string
  sha256: string
  kind: 'log' | 'screenshot' | 'bundle' | 'source-map' | 'manifest' | 'other'
}

export interface CoverageSignature {
  algorithm: 'cosign-blob'
  identity: string
  bundleSha256: string
  verified: boolean
}

export interface CoverageReport {
  schemaVersion: typeof COVERAGE_REPORT_SCHEMA_VERSION
  generatedAt: string
  source: 'ci' | 'nightly' | 'local' | 'aggregate'
  identity?: CoverageIdentity
  requiredBy?: 'pr' | 'nightly' | 'release'
  signature?: CoverageSignature
  cells: CoverageEvidence[]
  summary: {
    total: number
    passed: number
    failed: number
    blocked: number
    notRun: number
    notApplicable: number
    unsupported: number
    requiredUnverified: number
    coveragePercent: number
  }
}

export interface CoverageReportOptions {
  identity?: CoverageIdentity
  requiredBy?: CoverageReport['requiredBy']
  signature?: CoverageSignature
}

function requiredStatus(status: CoverageStatus): boolean {
  return status === 'ci-required' || status === 'ci-nightly' || status === 'local-required' || status === 'unsupported-verified'
}

function resultForCell(cell: CoverageCell, layer: CoverageLayer): CoverageEvidence {
  const contract = cell.layers[layer]
  const status: CoverageResultStatus = contract.status === 'not-applicable'
    ? 'not-applicable'
    : contract.status === 'unsupported-verified'
      ? 'unsupported'
      : 'not-run'
  return {
    cellId: cell.id,
    layer,
    status,
    executor: contract.executor,
    evidenceSchema: contract.evidenceSchema,
    ...(contract.reason ? { reason: contract.reason } : {}),
  }
}

function summarize(cells: readonly CoverageEvidence[], registry: readonly CoverageCell[]) {
  const counts = {
    total: cells.length,
    passed: cells.filter(item => item.status === 'passed').length,
    failed: cells.filter(item => item.status === 'failed').length,
    blocked: cells.filter(item => item.status === 'blocked').length,
    notRun: cells.filter(item => item.status === 'not-run').length,
    notApplicable: cells.filter(item => item.status === 'not-applicable').length,
    unsupported: cells.filter(item => item.status === 'unsupported').length,
    requiredUnverified: 0,
    coveragePercent: 0,
  }
  const byKey = new Map(cells.map(item => [`${item.cellId}:${item.layer}`, item]))
  for (const cell of registry) {
    for (const layer of COVERAGE_LAYERS) {
      const contract = cell.layers[layer]
      const result = byKey.get(`${cell.id}:${layer}`)
      if (requiredStatus(contract.status) && result?.status !== 'passed' && result?.status !== 'unsupported') {
        counts.requiredUnverified++
      }
    }
  }
  const measurable = cells.filter(item => item.status !== 'not-applicable').length
  const verified = cells.filter(item => item.status === 'passed' || item.status === 'unsupported').length
  counts.coveragePercent = measurable === 0 ? 100 : Math.round((verified / measurable) * 10000) / 100
  return counts
}

export async function readCommittedCompatibilityEvidence(repoRoot: string): Promise<CoverageEvidence[]> {
  const evidence: CoverageEvidence[] = []
  const sources = [
    { source: 'react-native', platforms: ['web', 'android', 'ios'], dir: path.join(repoRoot, 'e2e', 'react-native', 'reports') },
    { source: 'lynx', platforms: ['android', 'ios'], dir: path.join(repoRoot, 'e2e', 'lynx', 'reports') },
  ] as const
  for (const item of sources) {
    for (const platform of item.platforms) {
      const file = path.join(item.dir, `${platform}.json`)
      let raw: string
      try {
        raw = await fs.readFile(file, 'utf8')
      }
      catch {
        continue
      }
      const report = JSON.parse(raw) as { results?: Array<{ id: string, status: 'supported' | 'unsupported', reason?: string }> }
      for (const result of report.results ?? []) {
        const cellId = `${item.source}/${platform}/${result.id}`
        const status: CoverageResultStatus = result.status === 'supported' ? 'passed' : 'unsupported'
        const reason = result.reason ?? (status === 'unsupported' ? '兼容性 catalog 明确标记为 unsupported。' : undefined)
        for (const layerName of ['static', 'dev', 'runtime', 'visual', 'negative'] as const) {
          evidence.push({
            cellId,
            layer: layerName,
            status,
            executor: `pnpm e2e:${item.source}:${platform}`,
            evidenceSchema: `${item.source}-${layerName === 'negative' ? 'negative' : layerName}-v1`,
            ...(reason ? { reason } : {}),
          })
        }
      }
    }
  }
  return evidence
}

export function createCoverageReport(evidence: readonly CoverageEvidence[] = [], source: CoverageReport['source'] = 'aggregate', registry: readonly CoverageCell[] = COVERAGE_REGISTRY, options: CoverageReportOptions = {}): CoverageReport {
  validateCoverageRegistry(registry)
  const expected = registry.flatMap(cell => COVERAGE_LAYERS.map(layer => resultForCell(cell, layer)))
  const byKey = new Map(expected.map(item => [`${item.cellId}:${item.layer}`, item]))
  const seenEvidence = new Set<string>()
  for (const item of evidence) {
    const key = `${item.cellId}:${item.layer}`
    if (!byKey.has(key)) {
      throw new Error(`coverage evidence references unknown cell/layer: ${key}`)
    }
    if (seenEvidence.has(key)) {
      throw new Error(`duplicate coverage evidence input: ${key}`)
    }
    seenEvidence.add(key)
    byKey.set(key, item)
  }
  const cells = [...byKey.values()]
  return {
    schemaVersion: COVERAGE_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source,
    ...(options.identity ? { identity: options.identity } : {}),
    ...(options.requiredBy ? { requiredBy: options.requiredBy } : {}),
    ...(options.signature ? { signature: options.signature } : {}),
    cells,
    summary: summarize(cells, registry),
  }
}

export function validateReleaseCertificate(report: CoverageReport, expectedIdentity: CoverageIdentity, registry: readonly CoverageCell[] = COVERAGE_REGISTRY) {
  validateCoverageReport(report, registry)
  if (report.source !== 'ci' && report.source !== 'nightly' && report.source !== 'local') {
    throw new Error('release certificate must come from ci, nightly or local source')
  }
  if (!report.identity || !compareCoverageIdentity(report.identity, expectedIdentity)) {
    throw new Error('release certificate identity does not match current commit/toolchain')
  }
  if (report.requiredBy !== 'release') {
    throw new Error('release certificate must be marked requiredBy=release')
  }
  if (!report.signature?.verified || report.signature.algorithm !== 'cosign-blob' || !report.signature.identity || !/^[a-f0-9]{64}$/.test(report.signature.bundleSha256)) {
    throw new Error('release certificate signature is missing or invalid')
  }
  const required = new Set(registry.flatMap(cell => COVERAGE_LAYERS
    .filter(layer => ['ci-required', 'ci-nightly', 'local-required', 'unsupported-verified'].includes(cell.layers[layer].status))
    .map(layer => `${cell.id}:${layer}`)))
  const seen = new Set<string>()
  for (const item of report.cells) {
    const key = `${item.cellId}:${item.layer}`
    if (!required.has(key)) {
      continue
    }
    if (item.status !== 'passed' && item.status !== 'unsupported') {
      throw new Error(`${key} is not verified for release`)
    }
    if (!item.artifactManifest?.length) {
      throw new Error(`${key} is missing release artifact manifest`)
    }
    if (!item.identity || !compareCoverageIdentity(item.identity, expectedIdentity)) {
      throw new Error(`${key} evidence identity mismatch`)
    }
    seen.add(key)
  }
  if (seen.size !== required.size) {
    throw new Error(`release certificate is missing ${required.size - seen.size} required evidence cells`)
  }
  return report
}

export async function verifyCoverageArtifacts(report: CoverageReport, repoRoot: string) {
  const failures: string[] = []
  for (const item of report.cells) {
    for (const artifact of item.artifactManifest ?? []) {
      const relativePath = path.relative(repoRoot, path.resolve(repoRoot, artifact.path))
      if (path.isAbsolute(artifact.path) || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        failures.push(`${item.cellId}:${item.layer} has unsafe artifact path ${artifact.path}`)
        continue
      }
      const file = path.resolve(repoRoot, artifact.path)
      try {
        const data = await fs.readFile(file)
        const hash = createHash('sha256').update(data).digest('hex')
        if (hash !== artifact.sha256) {
          failures.push(`${item.cellId}:${item.layer} artifact checksum mismatch: ${artifact.path}`)
        }
      }
      catch {
        failures.push(`${item.cellId}:${item.layer} artifact is missing: ${artifact.path}`)
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`release artifacts are invalid:\n${failures.join('\n')}`)
  }
  return report
}

export function validateCoverageReport(report: CoverageReport, registry: readonly CoverageCell[] = COVERAGE_REGISTRY) {
  validateCoverageRegistry(registry)
  if (report.schemaVersion !== COVERAGE_REPORT_SCHEMA_VERSION) {
    throw new Error('coverage report schemaVersion is stale')
  }
  const expected = registry.length * COVERAGE_LAYERS.length
  if (report.cells.length !== expected) {
    throw new Error(`coverage report must contain ${expected} cells`)
  }
  const ids = new Set<string>()
  const expectedIds = new Set(registry.flatMap(cell => COVERAGE_LAYERS.map(layer => `${cell.id}:${layer}`)))
  for (const item of report.cells) {
    const key = `${item.cellId}:${item.layer}`
    if (!expectedIds.has(key)) {
      throw new Error(`coverage report references unknown cell/layer: ${key}`)
    }
    if (ids.has(key)) {
      throw new Error(`duplicate coverage evidence: ${key}`)
    }
    ids.add(key)
    if (!item.executor || !item.evidenceSchema) {
      throw new Error(`${key} missing executor/evidenceSchema`)
    }
    if (!COVERAGE_RESULT_STATUSES.includes(item.status)) {
      throw new Error(`${key} has unknown result status: ${String(item.status)}`)
    }
    const contract = registry.find(cell => cell.id === item.cellId)?.layers[item.layer]
    if (!contract || item.executor !== contract.executor || item.evidenceSchema !== contract.evidenceSchema) {
      throw new Error(`${key} executor/evidenceSchema does not match registry contract`)
    }
    for (const artifact of item.artifactManifest ?? []) {
      if (!/^[a-f0-9]{64}$/.test(artifact.sha256) || !artifact.path) {
        throw new Error(`${key} has invalid artifact manifest entry`)
      }
    }
    if ((item.status === 'blocked' || item.status === 'failed' || item.status === 'unsupported') && !item.reason) {
      throw new Error(`${key} ${item.status} requires reason`)
    }
  }
  if (ids.size !== expectedIds.size) {
    throw new Error('coverage report is missing one or more registry cells')
  }
  const expectedSummary = summarize(report.cells, registry)
  if (JSON.stringify(expectedSummary) !== JSON.stringify(report.summary)) {
    throw new Error('coverage report summary is stale or inconsistent')
  }
  if (report.source !== 'aggregate' && !report.identity) {
    throw new Error(`${report.source} coverage report must include checkout identity`)
  }
  const requiredUnverified = report.summary.requiredUnverified
  if (requiredUnverified !== 0 && (report.source === 'ci' || report.source === 'nightly')) {
    throw new Error(`required coverage is unverified: ${requiredUnverified}`)
  }
  return report
}
