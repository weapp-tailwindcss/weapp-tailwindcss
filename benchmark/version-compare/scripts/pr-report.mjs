#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { pullRequestBenchmarkKeys } from './ci-matrix.mjs'

export const COMMENT_MARKER = '<!-- weapp-tailwindcss-pr-benchmark-report -->'
export const REPORT_SCHEMA_VERSION = 1
export const MAX_COMMENT_BYTES = 60000

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function median(values) {
  const sorted = values.filter(value => finite(value) !== undefined).sort((a, b) => a - b)
  if (!sorted.length) return undefined
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function average(values) {
  const valid = values.filter(value => finite(value) !== undefined)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : undefined
}

function fmt(value, suffix = '') {
  return finite(value) === undefined ? 'N/A' : `${value.toFixed(2)}${suffix}`
}

function fmtPct(value) {
  return finite(value) === undefined ? 'N/A' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function escapeCell(value) {
  return String(value ?? 'N/A')
    .replaceAll('|', '\\|')
    .replaceAll('`', '\\`')
    .replaceAll(/\r?\n/g, '<br>')
}

function truncate(value, limit = 1200) {
  const text = String(value ?? '').replaceAll(/\r?\n/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

async function findFiles(root, predicate) {
  const files = []
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  }
  catch (error) {
    if (error?.code === 'ENOENT') return files
    throw error
  }
  for (const entry of entries) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...await findFiles(file, predicate))
    else if (predicate(entry.name, file)) files.push(file)
  }
  return files.sort()
}

async function readJson(file) {
  try {
    return { file, value: JSON.parse(await fs.readFile(file, 'utf8')) }
  }
  catch (error) {
    return { file, error: truncate(error?.message ?? error, 500) }
  }
}

function compareAverage(compares, field) {
  return average(compares.map(item => finite(item[field])))
}

export function mergeBenchmarkSummaries(summaries, expectedKeys = pullRequestBenchmarkKeys) {
  const compares = new Map()
  const errors = []
  const observations = []
  const violations = []
  const summaryFiles = []
  let firstSummary

  for (const item of summaries) {
    if (!firstSummary) firstSummary = item.value
    summaryFiles.push(item.file)
    const summary = item.value
    for (const compare of summary?.compares ?? []) {
      if (!compares.has(compare.key)) compares.set(compare.key, compare)
    }
    errors.push(...(summary?.errors ?? []).map(error => ({ ...error, source: item.file })))
    observations.push(...(summary?.performanceGuard?.observations ?? []).map(observation => ({ ...observation, source: item.file })))
    violations.push(...(summary?.performanceGuard?.violations ?? []).map(violation => ({ ...violation, source: item.file })))
  }

  const rows = [...compares.values()].sort((a, b) => a.key.localeCompare(b.key))
  const availableKeys = rows.map(item => item.key)
  const missingKeys = expectedKeys.filter(key => !compares.has(key))
  const guards = summaries.map(item => item.value?.performanceGuard).filter(Boolean)
  const failed = guards.some(guard => guard.passed === false) || errors.some(error => error.version?.startsWith('current:'))
  const baseline = firstSummary?.baseline
  const current = firstSummary?.current

  return {
    available: summaries.length > 0,
    summaryFiles,
    shardCount: summaries.length,
    baseline,
    current,
    options: firstSummary?.options ?? {},
    compares: rows,
    errors,
    missingKeys,
    availableKeys,
    performanceGuard: guards.length
      ? {
          passed: !failed,
          blocking: guards.some(guard => guard.blocking !== false),
          violations,
          observations,
          relevantChanges: [...new Set(guards.flatMap(guard => guard.relevantChanges ?? []))],
          thresholds: guards.find(guard => guard.thresholds)?.thresholds,
        }
      : undefined,
    averages: {
      buildDeltaPct: compareAverage(rows, 'buildDeltaPct'),
      hmrDeltaPct: compareAverage(rows, 'hmrDeltaPct'),
      buildPluginDeltaPct: compareAverage(rows, 'buildPluginDeltaPct'),
      hmrPluginDeltaPct: compareAverage(rows, 'hmrPluginDeltaPct'),
      buildCompareCount: rows.filter(item => finite(item.currentBuild) !== undefined && finite(item.baselineBuild) !== undefined).length,
      watchHmrCompareCount: rows.filter(item => finite(item.currentHmr) !== undefined && finite(item.baselineHmr) !== undefined).length,
    },
  }
}

function normalizeWatchSummary(summary = {}) {
  return {
    count: finite(summary.count) ?? 0,
    avgMs: finite(summary.avgMs ?? summary.hotUpdateAvgMs),
    minMs: finite(summary.minMs ?? summary.hotUpdateMinMs),
    maxMs: finite(summary.maxMs ?? summary.hotUpdateMaxMs),
    p50Ms: finite(summary.p50Ms),
    p95Ms: finite(summary.p95Ms),
  }
}

function memoryRow(memory = {}) {
  return {
    sampleCount: finite(memory.sampleCount),
    debugSampleCount: finite(memory.debugSampleCount),
    baselineRssMb: finite(memory.baselineRssMb),
    peakRssMb: finite(memory.peakRssMb),
    rssDeltaMb: finite(memory.rssDeltaMb ?? memory.maxRssDeltaMb),
    peakHeapUsedMb: finite(memory.peakHeapUsedMb),
    peakMaxProcessRssMb: finite(memory.peakMaxProcessRssMb),
    peakProcessCount: finite(memory.peakProcessCount),
  }
}

function speedRow({ project, platform, mutation = 'all', summary, pluginSummary, initialReadyMs, source }) {
  const normalized = normalizeWatchSummary(summary)
  return {
    project: project || 'unknown',
    platform: platform || 'unknown',
    mutation,
    initialReadyMs: finite(initialReadyMs),
    ...normalized,
    plugin: pluginSummary ? normalizeWatchSummary(pluginSummary) : undefined,
    source,
  }
}

function rowsFromFullReport(report, file) {
  const rows = []
  for (const item of report?.cases ?? []) {
    const project = item.project || item.label || item.name
    const platform = item.platform
    const projectSummary = item.summary || report.summaryByProject?.[project] || (report.cases?.length === 1 ? report.summary : undefined)
    rows.push(speedRow({
      project,
      platform,
      summary: projectSummary,
      pluginSummary: item.pluginProcessSummary,
      initialReadyMs: item.initialReadyMs,
      source: file,
    }))
    for (const [mutation, summary] of Object.entries(item.summaryByMutationKind ?? {})) {
      rows.push(speedRow({ project, platform, mutation, summary, source: file }))
    }
  }
  return rows
}

function rowsFromSpeedReport(report, file) {
  const rows = []
  for (const [project, value] of Object.entries(report?.byProject ?? {})) {
    const platforms = value?.platforms && typeof value.platforms === 'object'
      ? Object.entries(value.platforms)
      : [['unknown', value]]
    for (const [platform, summary] of platforms) rows.push(speedRow({ project, platform, summary, source: file }))
  }
  return rows
}

function rowsFromMemoryReport(report, file) {
  const rows = []
  for (const [project, value] of Object.entries(report?.byProject ?? {})) {
    const platforms = value?.platforms && typeof value.platforms === 'object'
      ? Object.entries(value.platforms)
      : [['unknown', value]]
    for (const [platform, memory] of platforms) rows.push({ project, platform, ...memoryRow(memory), source: file })
  }
  return rows
}

export async function collectWatchReports(root) {
  const files = await findFiles(root, name => name.endsWith('.json'))
  const parsed = await Promise.all(files.map(readJson))
  const fullFiles = new Set(parsed.filter(item => item.value && /^hmr-full-report-/.test(path.basename(item.file))).map(item => path.dirname(item.file)))
  const speedRows = []
  const memoryRows = []
  const errors = []
  for (const item of parsed) {
    if (item.error) {
      errors.push({ file: item.file, error: item.error })
      continue
    }
    const name = path.basename(item.file)
    if (name.startsWith('hmr-full-report-') || item.value?.cases) {
      speedRows.push(...rowsFromFullReport(item.value, item.file))
      for (const oneCase of item.value?.cases ?? []) {
        if (oneCase.memory) memoryRows.push({ project: oneCase.project || oneCase.label, platform: oneCase.platform, ...memoryRow(oneCase.memory), source: item.file })
      }
    }
    else if (name === 'hmr-speed-report.json' && !fullFiles.has(path.dirname(item.file))) speedRows.push(...rowsFromSpeedReport(item.value, item.file))
    else if (name === 'hmr-memory-report.json' && !fullFiles.has(path.dirname(item.file))) memoryRows.push(...rowsFromMemoryReport(item.value, item.file))
  }
  const byKey = new Map()
  for (const row of speedRows) {
    const key = `${row.project}::${row.platform}::${row.mutation}`
    const existing = byKey.get(key)
    if (!existing) byKey.set(key, row)
    else {
      for (const [field, value] of Object.entries(row)) {
        if (existing[field] === undefined && value !== undefined) existing[field] = value
      }
      if (existing.plugin === undefined && row.plugin !== undefined) existing.plugin = row.plugin
    }
  }
  for (const memory of memoryRows) {
    const key = `${memory.project}::${memory.platform}::all`
    const row = byKey.get(key)
    if (row) Object.assign(row, memory)
    else byKey.set(key, { project: memory.project, platform: memory.platform, mutation: 'all', ...memory })
  }
  const rows = [...byKey.values()].sort((a, b) => `${a.project}/${a.platform}/${a.mutation}`.localeCompare(`${b.project}/${b.platform}/${b.mutation}`))
  const timingRows = rows.filter(row => row.mutation === 'all' && finite(row.avgMs) !== undefined)
  return {
    available: rows.length > 0,
    sourceFiles: files,
    errors,
    rows,
    reportCount: parsed.filter(item => item.value).length,
    summary: {
      avgMs: average(timingRows.map(row => row.avgMs)),
      minMs: Math.min(...timingRows.map(row => row.minMs).filter(finite), Infinity),
      maxMs: Math.max(...timingRows.map(row => row.maxMs).filter(finite), 0),
      p50Ms: median(timingRows.map(row => row.p50Ms)),
      p95Ms: median(timingRows.map(row => row.p95Ms)),
      peakRssMb: Math.max(...rows.map(row => row.peakRssMb).filter(finite), 0),
      maxRssDeltaMb: Math.max(...rows.map(row => row.rssDeltaMb).filter(finite), 0),
      peakHeapUsedMb: Math.max(...rows.map(row => row.peakHeapUsedMb).filter(finite), 0),
    },
  }
}

export function buildReport({ benchmark, watch, pr = {}, commit = {}, runs = {}, missingArtifacts = [] }) {
  const status = benchmark?.performanceGuard?.passed === false || runs.benchmark?.conclusion === 'failure' || runs.watch?.conclusion === 'failure'
    ? 'failed'
    : missingArtifacts.length || benchmark?.missingKeys?.length || watch?.errors?.length || !watch?.available
      ? 'partial'
      : 'passed'
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    pr,
    commit,
    runs,
    benchmark,
    watch,
    missingArtifacts,
    status,
  }
}

function benchmarkRows(summary) {
  return (summary?.compares ?? []).map(item => {
    const buildBase = item.baselineBuildSamples ?? []
    const buildCurrent = item.currentBuildSamples ?? []
    const baseSteady = median(buildBase.slice(1))
    const currentSteady = median(buildCurrent.slice(1))
    return [
      item.key,
      item.target,
      `${fmt(buildBase[0])} / ${fmt(baseSteady)}`,
      `${fmt(buildCurrent[0])} / ${fmt(currentSteady)}`,
      fmtPct(item.buildDeltaPct),
      `${fmt(item.baselineHmrMedian)} / ${fmt(item.baselineHmr)}`,
      `${fmt(item.currentHmrMedian)} / ${fmt(item.currentHmr)}`,
      fmtPct(item.hmrDeltaPct),
      item.currentError || item.baselineError ? 'error' : 'ok',
    ]
  })
}

function benchmarkPluginRows(summary) {
  return (summary?.compares ?? []).map(item => [
    item.key,
    `${fmt(item.baselineBuildPlugin)} / ${fmt(item.currentBuildPlugin)}`,
    fmtPct(item.buildPluginDeltaPct),
    `${fmt(item.baselineHmrPlugin)} / ${fmt(item.currentHmrPlugin)}`,
    fmtPct(item.hmrPluginDeltaPct),
  ])
}

function benchmarkMemoryRows(summary) {
  return (summary?.compares ?? []).map(item => [
    item.key,
    `${fmt(item.baselineBuildPeakRssMb)} / ${fmt(item.baselineBuildSteadyRssMb)}`,
    `${fmt(item.currentBuildPeakRssMb)} / ${fmt(item.currentBuildSteadyRssMb)}`,
    fmtPct(item.buildPeakRssDeltaPct),
    `${fmt(item.baselineHmrPeakRssMb)} / ${fmt(item.baselineHmrSteadyRssMb)}`,
    `${fmt(item.currentHmrPeakRssMb)} / ${fmt(item.currentHmrSteadyRssMb)}`,
    fmtPct(item.hmrPeakRssDeltaPct),
  ])
}

export function renderMarkdown(report, { artifactUrl, benchmarkUrl, watchUrl } = {}) {
  const benchmark = report.benchmark
  const watch = report.watch
  const lines = [
    COMMENT_MARKER,
    `## PR 性能基准报告：${report.status === 'passed' ? '通过' : report.status === 'failed' ? '失败' : '部分结果'}`,
    '',
    `- Commit：\`${escapeCell(report.commit?.sha || report.pr?.headSha || 'unknown').slice(0, 12)}\``,
    `- 生成时间：${report.generatedAt}`,
    `- Benchmark：${report.runs?.benchmark?.conclusion || (benchmark?.available ? 'available' : 'unavailable')}`,
    `- Watch：${watch?.available ? (report.runs?.watch?.conclusion || 'available') : '未触发/无产物'}`,
    '',
    '### 总览',
    '',
    '| 指标 | 结果 |',
    '| --- | ---: |',
    `| Build 稳态中位数平均变化 | ${fmtPct(benchmark?.averages?.buildDeltaPct)} |`,
    `| HMR 稳态 P95 平均变化 | ${fmtPct(benchmark?.averages?.hmrDeltaPct)} |`,
    `| 插件 Build 中位数平均变化 | ${fmtPct(benchmark?.averages?.buildPluginDeltaPct)} |`,
    `| 插件 HMR 门禁统计平均变化 | ${fmtPct(benchmark?.averages?.hmrPluginDeltaPct)} |`,
    `| Watch HMR p50 / p95 | ${fmt(watch?.summary?.p50Ms)} / ${fmt(watch?.summary?.p95Ms)} ms |`,
    `| Watch RSS 峰值 / 最大增量 | ${fmt(watch?.summary?.peakRssMb)} / ${fmt(watch?.summary?.maxRssDeltaMb)} MB |`,
    `| Watch Heap 峰值 | ${fmt(watch?.summary?.peakHeapUsedMb)} MB |`,
    '',
    '### Benchmark 项目矩阵',
    '',
    '| 项目 | 平台 | Base Build 冷/稳态(ms) | Current Build 冷/稳态(ms) | Build 变化 | Base HMR median/P95(ms) | Current HMR median/P95(ms) | HMR 变化 | 状态 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...benchmarkRows(benchmark).map(row => `| ${row.map(escapeCell).join(' | ')} |`),
    '',
    '### Benchmark 插件处理阶段',
    '',
    '| 项目 | Build Plugin base/current(ms) | 变化 | HMR Plugin base/current(ms) | 变化 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...benchmarkPluginRows(benchmark).map(row => `| ${row.map(escapeCell).join(' | ')} |`),
    '',
    '### Benchmark 内存',
    '',
    '| 项目 | Build RSS base peak/steady(MB) | Build RSS current peak/steady(MB) | Peak 变化 | HMR RSS base peak/steady(MB) | HMR RSS current peak/steady(MB) | Peak 变化 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...benchmarkMemoryRows(benchmark).map(row => `| ${row.map(escapeCell).join(' | ')} |`),
    '',
    '### Watch 明细',
    '',
    '| 项目 | 平台 | 变更类型 | 样本数 | ready(ms) | avg/p50/p95/max(ms) | 插件 p50/p95(ms) | RSS peak/delta(MB) | Heap peak(MB) |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...(watch?.rows ?? []).map(row => `| ${[
      row.project,
      row.platform,
      row.mutation,
      row.count,
      fmt(row.initialReadyMs),
      `${fmt(row.avgMs)} / ${fmt(row.p50Ms)} / ${fmt(row.p95Ms)} / ${fmt(row.maxMs)}`,
      row.plugin ? `${fmt(row.plugin.p50Ms)} / ${fmt(row.plugin.p95Ms)}` : 'N/A',
      `${fmt(row.peakRssMb)} / ${fmt(row.rssDeltaMb)}`,
      fmt(row.peakHeapUsedMb),
    ].map(escapeCell).join(' | ')} |`),
    '',
    '### 门禁与诊断',
    '',
    `- Benchmark 性能门禁：${benchmark?.performanceGuard ? (benchmark.performanceGuard.passed ? '通过' : '失败') : '无数据'}`,
    `- Benchmark 缺失项目：${benchmark?.missingKeys?.length ? benchmark.missingKeys.map(escapeCell).join(', ') : '无'}`,
    `- Benchmark 错误：${benchmark?.errors?.length || 0}`,
    `- Watch 解析错误：${watch?.errors?.length || 0}`,
  ]
  for (const item of benchmark?.performanceGuard?.violations ?? []) lines.push(`- 性能违规：${escapeCell(truncate(`${item.key} / ${item.metric}: ${item.message || ''}`))}`)
  for (const item of benchmark?.errors ?? []) lines.push(`- Benchmark 错误：${escapeCell(truncate(`${item.key}: ${item.error}`))}`)
  for (const item of watch?.errors ?? []) lines.push(`- Watch 产物错误：${escapeCell(truncate(`${item.file}: ${item.error}`))}`)
  lines.push('', '### 运行链接', '')
  if (benchmarkUrl) lines.push(`- [Benchmark Actions run](${benchmarkUrl})`)
  if (watchUrl) lines.push(`- [E2E Watch Actions run](${watchUrl})`)
  if (artifactUrl) lines.push(`- [合并后的完整 artifact](${artifactUrl})`)
  lines.push('', '<details><summary>统计口径</summary>', '', '- Build/HMR 版本对照沿用现有 benchmark 的 base/current 和门禁统计。', '- Watch 仅报告当前提交的真实跨平台 watcher 结果，不额外运行 base；跨 shard 总览分位数按各报告摘要聚合，项目/平台行保留原始口径。', '- 未触发或缺失的场景显示为 N/A，不当作 0。', '', '</details>')
  return `${lines.join('\n')}\n`
}

export function limitComment(markdown, maxBytes = MAX_COMMENT_BYTES) {
  const bytes = Buffer.byteLength(markdown, 'utf8')
  if (bytes <= maxBytes) return { markdown, truncated: false }
  const suffix = '\n\n> 评论内容过长，已截断；请查看完整 artifact。\n'
  let low = 0
  let high = markdown.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(`${markdown.slice(0, middle)}${suffix}`, 'utf8') <= maxBytes) low = middle
    else high = middle - 1
  }
  const end = low
  return { markdown: `${markdown.slice(0, end)}${suffix}`, truncated: true }
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback
}

async function main() {
  const outputDir = path.resolve(arg('--output-dir', '.tmp/benchmark-pr-report'))
  await fs.mkdir(outputDir, { recursive: true })
  const benchmarkDir = path.resolve(arg('--benchmark-dir', path.join(outputDir, 'benchmark')))
  const watchDir = path.resolve(arg('--watch-dir', path.join(outputDir, 'watch')))
  const summaries = (await findFiles(benchmarkDir, name => name === 'summary.json')).map(readJson)
  const summaryResults = await Promise.all(summaries)
  const parsedSummaries = summaryResults.filter(item => item.value)
  const benchmark = mergeBenchmarkSummaries(parsedSummaries)
  const malformedBenchmarkArtifacts = summaryResults.filter(item => item.error)
  for (const item of malformedBenchmarkArtifacts) {
    benchmark.errors.push({ version: 'report', key: path.basename(path.dirname(item.file)), error: item.error, source: item.file })
  }
  const watch = await collectWatchReports(watchDir)
  const missingArtifacts = []
  if (!benchmark.available) missingArtifacts.push('Benchmark summary.json')
  if (benchmark.missingKeys.length) missingArtifacts.push(`Benchmark shards: ${benchmark.missingKeys.join(', ')}`)
  if (malformedBenchmarkArtifacts.length) missingArtifacts.push(`损坏的 Benchmark artifact: ${malformedBenchmarkArtifacts.length}`)
  if (!watch.available) missingArtifacts.push('E2E Watch HMR reports')
  if (watch.errors.length) missingArtifacts.push(`损坏的 Watch artifact: ${watch.errors.length}`)
  const report = buildReport({
    benchmark,
    watch,
    missingArtifacts,
    pr: { number: arg('--pr', ''), repository: arg('--repository', '') },
    commit: { sha: arg('--head-sha', '') },
    runs: {
      benchmark: { id: arg('--benchmark-run-id', ''), conclusion: arg('--benchmark-conclusion', '') },
      watch: { id: arg('--watch-run-id', ''), conclusion: arg('--watch-conclusion', '') },
    },
  })
  const markdown = renderMarkdown(report, {
    artifactUrl: arg('--artifact-url', ''),
    benchmarkUrl: arg('--benchmark-url', ''),
    watchUrl: arg('--watch-url', ''),
  })
  const limited = limitComment(markdown)
  report.comment = { truncated: limited.truncated, bytes: Buffer.byteLength(limited.markdown, 'utf8') }
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await fs.writeFile(path.join(outputDir, 'report.md'), markdown, 'utf8')
  await fs.writeFile(path.join(outputDir, 'comment.md'), limited.markdown, 'utf8')
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) await fs.writeFile(summaryPath, limited.markdown, 'utf8')
  process.stdout.write(`[pr-report] status=${report.status} report=${path.join(outputDir, 'report.md')}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
