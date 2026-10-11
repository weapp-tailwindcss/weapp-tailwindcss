import type { CoverageEvidence, CoverageReport } from '../e2e/coverageReport'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createCoverageArtifact } from '../e2e/coverageArtifacts'
import { collectCoverageIdentity } from '../e2e/coverageIdentity'
import { createCoverageReport, readCommittedCompatibilityEvidence, validateCoverageReport } from '../e2e/coverageReport'

function value(name: string, fallback: string) {
  const index = process.argv.lastIndexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback
}

function requiredByFor(source: CoverageReport['source']): CoverageReport['requiredBy'] {
  if (source === 'ci') {
    return 'pr'
  }
  if (source === 'nightly') {
    return 'nightly'
  }
  return undefined
}

async function readEvidence(file: string | undefined) {
  if (!file) {
    return [] as CoverageEvidence[]
  }
  const raw = JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) as unknown
  if (!Array.isArray(raw)) {
    throw new TypeError(`coverage evidence must be an array: ${file}`)
  }
  return raw as CoverageEvidence[]
}

function artifactKind(file: string) {
  const extension = path.extname(file).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
    return 'screenshot' as const
  }
  if (['.js', '.mjs', '.cjs', '.css', '.wxss', '.acss', '.ttss'].includes(extension)) {
    return 'bundle' as const
  }
  if (extension === '.map') {
    return 'source-map' as const
  }
  if (['.json', '.yaml', '.yml'].includes(extension)) {
    return 'manifest' as const
  }
  if (['.log', '.txt', '.md'].includes(extension)) {
    return 'log' as const
  }
  return 'other' as const
}

async function hydrateArtifactManifests(evidence: CoverageEvidence[], repoRoot: string) {
  for (const item of evidence) {
    if (item.artifactManifest?.length || !item.artifacts?.length) {
      continue
    }
    item.artifactManifest = await Promise.all(item.artifacts.map(file => createCoverageArtifact(repoRoot, file, artifactKind(file))))
  }
}

async function main() {
  const source = value('--source', process.env['COVERAGE_REPORT_SOURCE'] ?? 'aggregate') as CoverageReport['source']
  if (!['ci', 'nightly', 'local', 'aggregate'].includes(source)) {
    throw new Error(`invalid coverage report source: ${source}`)
  }
  const evidence = await readEvidence(process.env['COVERAGE_REPORT_INPUT'] ?? (process.argv.includes('--input') ? value('--input', '') : undefined))
  if (process.argv.includes('--include-baselines')) {
    evidence.push(...await readCommittedCompatibilityEvidence(process.cwd()))
  }
  await hydrateArtifactManifests(evidence, process.cwd())
  const identity = source === 'aggregate' ? undefined : await collectCoverageIdentity(process.cwd())
  const requiredBy = value('--required-by', requiredByFor(source) ?? '') as CoverageReport['requiredBy']
  if (requiredBy && !['pr', 'nightly', 'release'].includes(requiredBy)) {
    throw new Error(`invalid requiredBy: ${requiredBy}`)
  }
  if (requiredBy === 'release' && source === 'aggregate') {
    throw new Error('aggregate reports cannot be release certificates')
  }
  const report = createCoverageReport(evidence, source, undefined, {
    ...(identity ? { identity } : {}),
    ...(requiredBy ? { requiredBy } : {}),
  })
  validateCoverageReport(report)
  const output = path.resolve(value('--out', process.env['COVERAGE_REPORT_OUT'] ?? 'e2e/.artifacts/coverage/coverage-report.json'))
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`[coverage-report] ${report.summary.coveragePercent}% verified (${report.summary.requiredUnverified} required unverified)\n`)
  process.stdout.write(`[coverage-report] report written: ${path.relative(process.cwd(), output)}\n`)
  if ((source === 'ci' || source === 'nightly') && report.summary.requiredUnverified > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
