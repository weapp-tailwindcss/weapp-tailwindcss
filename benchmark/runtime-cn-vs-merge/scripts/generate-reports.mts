import { writeFileSync } from 'node:fs'
import {
  comparisonReportPath,
  performanceReportPath,
  benchPath,
  bundlePath,
  parityPath,
} from '../src/paths'
import {
  indexBench,
  readJson,
  type BenchFile,
  type BundleFile,
  type ParityFile,
} from '../src/report-format'
import { renderWeappComparisonReport } from '../src/weapp-comparison-report'
import { renderWeappPerformanceReport } from '../src/weapp-performance-report'

const parity = readJson<ParityFile>(parityPath)
const bundle = readJson<BundleFile>(bundlePath)
const bench = readJson<BenchFile>(benchPath)
const benchBySubject = indexBench(bench)

writeFileSync(comparisonReportPath, `${renderWeappComparisonReport(parity, bundle)}\n`)
writeFileSync(
  performanceReportPath,
  `${renderWeappPerformanceReport(parity, bundle, bench, benchBySubject)}\n`,
)
console.log(`wrote ${comparisonReportPath}`)
console.log(`wrote ${performanceReportPath}`)
