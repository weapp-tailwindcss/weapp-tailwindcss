import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  buildSummary,
  confirmHmrMemoryViolations,
  evaluatePerformanceGuard,
  markHmrMemoryConfirmationUnavailable,
} from './ci-report.mjs'

export async function runHmrMemoryConfirmation({
  resultDir,
  currentVersion,
  baselineVersion,
  performanceGuard,
  regressionPercent,
  runMatrix,
}) {
  const versionsFile = path.join(resultDir, 'memory-confirmation-versions.json')
  const outputFile = path.join(resultDir, 'memory-confirmation-raw.json')
  const summaryFile = path.join(resultDir, 'memory-confirmation-summary.json')
  await fs.writeFile(versionsFile, JSON.stringify([
    currentVersion,
    baselineVersion,
  ], null, 2), 'utf8')
  process.stdout.write('[benchmark] confirming HMR memory regression with reversed current->baseline order\n')
  await runMatrix({ versionsFile, outputFile, matrixBuildRuns: 0 })
  const raw = JSON.parse(await fs.readFile(outputFile, 'utf8'))
  const summary = buildSummary(raw, baselineVersion.version, currentVersion.version)
  const confirmationGuard = evaluatePerformanceGuard(summary, { regressionPercent })
  await fs.writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  const confirmationError = summary.errors.length > 0
    ? `matrix has ${summary.errors.length} failed row(s)`
    : confirmationGuard.violations.some(violation => violation.metric === 'hmrMemorySamples')
      ? 'matrix has incomplete RSS samples'
      : undefined
  const result = confirmationError
    ? markHmrMemoryConfirmationUnavailable(performanceGuard, confirmationError)
    : confirmHmrMemoryViolations(performanceGuard, confirmationGuard)
  process.stdout.write(`[benchmark] HMR memory confirmation -> ${summaryFile}\n`)
  return result
}
