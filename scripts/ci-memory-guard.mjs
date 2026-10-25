#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { renderMarkdown, renderStdoutSummary } from './ci-memory/diagnostics.mjs'
import { createPeakSnapshot, sampleProcessTree } from './ci-memory/process-sampling.mjs'

function parseArgs(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const options = {
    label: 'ci-command',
    outDir: 'e2e/benchmark/ci-memory',
    maxRssMb: Number(process.env.CI_MEMORY_MAX_RSS_MB || 0),
    maxRssDeltaMb: Number(process.env.CI_MEMORY_MAX_RSS_DELTA_MB || 0),
    baselineReport: process.env.CI_MEMORY_BASELINE_REPORT || '',
    maxRegressionPercent: Number(process.env.CI_MEMORY_MAX_REGRESSION_PERCENT || 5),
  }
  const command = []
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index]
    if (item === '--') {
      command.push(...args.slice(index + 1))
      break
    }
    if (item === '--label') {
      options.label = args[++index] ?? options.label
      continue
    }
    if (item === '--out-dir') {
      options.outDir = args[++index] ?? options.outDir
      continue
    }
    if (item === '--max-rss-mb') {
      options.maxRssMb = Number(args[++index] ?? 0)
      continue
    }
    if (item === '--max-rss-delta-mb') {
      options.maxRssDeltaMb = Number(args[++index] ?? 0)
      continue
    }
    if (item === '--baseline-report') {
      options.baselineReport = args[++index] ?? ''
      continue
    }
    if (item === '--max-regression-percent') {
      options.maxRegressionPercent = Number(args[++index] ?? 5)
      continue
    }
    command.push(item)
  }
  return { options, command }
}

function formatTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

export function summarizeMemorySamples(samples) {
  if (samples.length === 0) {
    return {
      count: 0,
      baselineRssMb: 0,
      peakRssMb: 0,
      peakAt: null,
      steadyRssMb: 0,
      rssDeltaMb: 0,
      peakMaxProcessRssMb: 0,
      peakProcessCount: 0,
      durationMs: 0,
    }
  }
  const first = samples.find(sample => sample.processCount > 1 && sample.rssMb >= 128) ?? samples[0]
  const firstAt = samples[0].at
  const lastAt = samples.at(-1).at
  const peakRssMb = Math.max(...samples.map(sample => sample.rssMb))
  const activeSamples = samples.filter(sample => sample.processCount > 0 && sample.rssMb > 0)
  const steadyCount = Math.max(1, Math.ceil(activeSamples.length * 0.2))
  const steadyValues = activeSamples.slice(-steadyCount).map(sample => sample.rssMb).sort((a, b) => a - b)
  const steadyMiddle = Math.floor(steadyValues.length / 2)
  const steadyRssMb = steadyValues.length % 2 === 0
    ? ((steadyValues[steadyMiddle - 1] ?? 0) + (steadyValues[steadyMiddle] ?? 0)) / 2
    : (steadyValues[steadyMiddle] ?? 0)
  return {
    count: samples.length,
    baselineRssMb: first.rssMb,
    peakRssMb,
    peakAt: samples.findLast(sample => sample.rssMb === peakRssMb).at,
    steadyRssMb,
    rssDeltaMb: Math.max(0, peakRssMb - first.rssMb),
    peakMaxProcessRssMb: Math.max(...samples.map(sample => sample.maxProcessRssMb)),
    peakProcessCount: Math.max(...samples.map(sample => sample.processCount)),
    durationMs: Math.max(0, lastAt - firstAt),
  }
}

export function evaluateRelativeMemoryGuard(baseline, current, maxRegressionPercent = 5) {
  const violations = []
  for (const metric of ['peakRssMb', 'steadyRssMb']) {
    const baselineValue = Number(baseline?.[metric])
    const currentValue = Number(current?.[metric])
    if (!Number.isFinite(baselineValue) || baselineValue <= 0 || !Number.isFinite(currentValue)) {
      violations.push({ metric, message: `baseline report is missing summary.${metric}` })
      continue
    }
    const regressionPercent = ((currentValue - baselineValue) / baselineValue) * 100
    if (regressionPercent > maxRegressionPercent) {
      violations.push({ metric, baseline: baselineValue, current: currentValue, regressionPercent })
    }
  }
  return {
    passed: violations.length === 0,
    thresholdPercent: maxRegressionPercent,
    violations,
  }
}

async function writeReports(options, report) {
  const outDir = path.resolve(options.outDir)
  await mkdir(outDir, { recursive: true })
  const base = `${formatTimestamp()}-${options.label.replace(/[^\w.-]+/g, '-')}`
  const jsonFile = path.join(outDir, `${base}.json`)
  const mdFile = path.join(outDir, `${base}.md`)
  await writeFile(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(mdFile, renderMarkdown(report), 'utf8')
  process.stdout.write(`[ci-memory] report written: ${path.relative(process.cwd(), mdFile)}\n`)
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2))
  if (command.length === 0) {
    throw new Error('missing command after --')
  }

  const samples = []
  let peakProcesses
  let peakRssMb = -1
  const startedAt = Date.now()
  const child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  const record = () => {
    const sample = sampleProcessTree(child.pid)
    if (sample) {
      const { rows, ...aggregate } = sample
      samples.push(aggregate)
      if (sample.rssMb >= peakRssMb) {
        peakRssMb = sample.rssMb
        peakProcesses = createPeakSnapshot({ ...aggregate, rows })
      }
    }
  }
  const timer = setInterval(record, 1000)
  timer.unref?.()
  record()

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => resolve(code ?? 1))
  })
  clearInterval(timer)
  record()

  const summary = summarizeMemorySamples(samples)
  const report = {
    generatedAt: new Date(startedAt).toISOString(),
    label: options.label,
    command,
    exitCode,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    summary,
    peakProcesses,
    samples,
  }
  await writeReports(options, report)
  process.stdout.write(renderStdoutSummary(report))

  if (exitCode !== 0) {
    process.exitCode = exitCode
    return
  }
  if (options.maxRssMb > 0 && summary.peakRssMb > options.maxRssMb) {
    throw new Error(`[ci-memory] ${options.label} RSS peak exceeded budget: ${summary.peakRssMb}MB > ${options.maxRssMb}MB`)
  }
  if (options.maxRssDeltaMb > 0 && summary.rssDeltaMb > options.maxRssDeltaMb) {
    throw new Error(`[ci-memory] ${options.label} RSS delta exceeded budget: ${summary.rssDeltaMb}MB > ${options.maxRssDeltaMb}MB`)
  }
  if (options.baselineReport) {
    const baseline = JSON.parse(await readFile(path.resolve(options.baselineReport), 'utf8'))
    const guard = evaluateRelativeMemoryGuard(baseline?.summary, summary, options.maxRegressionPercent)
    if (!guard.passed) {
      const violation = guard.violations[0]
      throw new Error(`[ci-memory] ${options.label} ${violation.metric} ${violation.message ?? `regressed ${violation.regressionPercent.toFixed(2)}% > ${guard.thresholdPercent}%`}`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
