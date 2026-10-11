import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const packageRoot = join(here, '..')
export const dataDir = join(packageRoot, 'data')
export const repoRoot = join(packageRoot, '..', '..')

export const parityPath = join(dataDir, 'parity.json')
export const bundlePath = join(dataDir, 'bundle.json')
export const benchPath = join(dataDir, 'bench.json')
export const comparisonReportPath = join(packageRoot, 'comparison-report.md')
export const performanceReportPath = join(packageRoot, 'performance-report.md')
export const upstreamReportPath = join(packageRoot, 'upstream-cn-vs-tailwind-merge.md')

export function ensureDataDir() {
  mkdirSync(dataDir, { recursive: true })
}
