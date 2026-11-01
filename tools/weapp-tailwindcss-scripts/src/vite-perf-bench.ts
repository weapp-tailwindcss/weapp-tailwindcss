import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync, promises as fs, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseBenchmarkMode, parseBenchmarkNumber, readBenchmarkArg } from './benchmark/options'
import { summarizeRunMetrics } from './benchmark/statistics'

// 模块级正则，避免函数内重复编译
const READY_TIME_DIRECT_RE = /ready\s+in\s+([\d.]+)\s*ms/i
const READY_TIME_FALLBACK_RE = /([\d.]+)\s*ms/i
const READY_KEYWORD_RE = /ready/i
const NEWLINE_SPLIT_RE = /\r?\n/g

interface BenchCliOptions {
  cwd: string
  script: string
  buildScript: string
  runs: number
  timeoutMs: number
  mode: 'optimized' | 'legacy' | 'both'
  output: string
  warmup: number
  projectFile: string
  hotMarker: string
}

interface RunMetrics {
  startupMs: number
  hotUpdateMs: number
  coldBuildMs: number
}

interface Stats {
  mean: number
  median: number
  stddev: number
}

interface SummaryRow {
  metric: keyof RunMetrics
  optimized: Stats
  legacy: Stats
  improvementPercent: number
}

interface BenchReport {
  generatedAt: string
  options: BenchCliOptions
  optimizedRuns: RunMetrics[]
  legacyRuns: RunMetrics[]
  summary: SummaryRow[]
}

interface PnpmCommand {
  command: string
  args: string[]
}

interface StringableChunk {
  toString: (encoding?: string) => string
}

function createExecutableCommand(command: string): PnpmCommand {
  const resolved = realpathSync(command)
  if (resolved.endsWith('.js')) {
    return {
      command: process.platform === 'win32' ? 'node.exe' : 'node',
      args: [resolved],
    }
  }
  return {
    command,
    args: [],
  }
}

function resolveBaseCwd() {
  let cursor = path.resolve(process.env['INIT_CWD'] || process.cwd())
  while (true) {
    if (existsSync(path.join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) {
      return process.cwd()
    }
    cursor = parent
  }
}

function resolvePathArg(baseCwd: string, value: string | undefined, fallbackPath: string) {
  const nextPath = value ?? fallbackPath
  return path.isAbsolute(nextPath) ? nextPath : path.resolve(baseCwd, nextPath)
}

function resolveOptions(): BenchCliOptions {
  const argv = process.argv.slice(2)
  const mode = parseBenchmarkMode(readBenchmarkArg('--mode', argv))
  const baseCwd = resolveBaseCwd()
  const cwd = resolvePathArg(baseCwd, readBenchmarkArg('--cwd', argv), 'templates/uni-app-tailwindcss-v4')
  const output = resolvePathArg(baseCwd, readBenchmarkArg('--output', argv), 'benchmark/vite-adapter-perf-report.json')

  return {
    cwd,
    script: readBenchmarkArg('--script', argv) ?? 'dev:mp-weixin',
    buildScript: readBenchmarkArg('--build-script', argv) ?? 'build:mp-weixin',
    runs: parseBenchmarkNumber(readBenchmarkArg('--runs', argv), 5, '--runs', 'positive-integer'),
    timeoutMs: parseBenchmarkNumber(readBenchmarkArg('--timeout', argv), 120000, '--timeout', 'positive-number'),
    warmup: parseBenchmarkNumber(readBenchmarkArg('--warmup', argv), 1, '--warmup', 'nonnegative-integer'),
    mode,
    output,
    projectFile: readBenchmarkArg('--project-file', argv) ?? 'src/pages/index/index.vue',
    hotMarker: readBenchmarkArg('--hot-marker', argv) ?? 'text-[#0f0f0f]',
  }
}

function now() {
  return performance.now()
}

function createEnv(mode: 'optimized' | 'legacy') {
  const env = { ...process.env }
  const pathValue = env['PATH'] || env['Path'] || env['path']
  env['PATH'] = [
    path.dirname(process.execPath),
    pathValue,
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(Boolean).join(path.delimiter)
  if (mode === 'legacy') {
    env['WEAPP_TW_VITE_FORCE_RUNTIME_REFRESH'] = '1'
    env['WEAPP_TW_VITE_DISABLE_DIRTY'] = '1'
    env['WEAPP_TW_VITE_DISABLE_JS_PRECHECK'] = '1'
  }
  else {
    delete env['WEAPP_TW_VITE_FORCE_RUNTIME_REFRESH']
    delete env['WEAPP_TW_VITE_DISABLE_DIRTY']
    delete env['WEAPP_TW_VITE_DISABLE_JS_PRECHECK']
  }
  env['WEAPP_TW_BENCH'] = '1'
  return env
}

function resolvePnpmCommand(): PnpmCommand {
  const pathPnpm = process.env['PATH']
    ?.split(path.delimiter)
    .map(item => path.join(item, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'))
    .find(item => existsSync(item))
  if (pathPnpm) {
    return createExecutableCommand(pathPnpm)
  }

  const pnpmBin = process.env['PNPM_HOME']
    ? path.join(process.env['PNPM_HOME'], process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
    : undefined
  if (pnpmBin && existsSync(pnpmBin)) {
    return createExecutableCommand(pnpmBin)
  }

  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: [],
  }
}

function spawnPnpm(args: string[], options: SpawnOptionsWithoutStdio) {
  const pnpmCommand = resolvePnpmCommand()
  return spawn(pnpmCommand.command, [...pnpmCommand.args, ...args], options)
}

function extractReadyTime(line: string): number | undefined {
  const normalized = line.trim()
  const direct = normalized.match(READY_TIME_DIRECT_RE)
  if (direct) {
    return Number(direct[1])
  }
  const fallback = normalized.match(READY_TIME_FALLBACK_RE)
  if (!fallback) {
    return undefined
  }
  if (!READY_KEYWORD_RE.test(normalized)) {
    return undefined
  }
  return Number(fallback[1])
}

function waitForProcessExit(child: ChildProcessWithoutNullStreams) {
  return new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('exit', (code, signal) => {
      resolve({ code, signal })
    })
    child.once('error', reject)
  })
}

function ensureProcessSucceeded(
  result: { code: number | null, signal: NodeJS.Signals | null },
  options?: {
    allowSignal?: boolean
  },
) {
  const allowSignal = options?.allowSignal === true
  if (result.code === 0) {
    return
  }
  if (allowSignal && result.code === null && result.signal) {
    return
  }
  if (allowSignal && result.code === 1 && result.signal == null) {
    return
  }
  throw new Error(`Process exited with code=${result.code ?? 'null'} signal=${result.signal ?? 'null'}`)
}

async function stopProcess(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode != null || child.signalCode != null) {
    const exited = await waitForProcessExit(child)
    ensureProcessSucceeded(exited, {
      allowSignal: true,
    })
    return
  }

  child.kill('SIGTERM')
  const exited = await waitForProcessExit(child)
  ensureProcessSucceeded(exited, {
    allowSignal: true,
  })
}

async function collectReadyTime(options: BenchCliOptions, env: NodeJS.ProcessEnv) {
  const child = spawnPnpm(['run', options.script], {
    cwd: options.cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let readyMs = 0
  let startupDone = false
  let parseError: Error | undefined

  const timeout = setTimeout(() => {
    child.kill('SIGTERM')
  }, options.timeoutMs)

  child.stdout.on('data', (chunk: StringableChunk) => {
    try {
      const text = chunk.toString('utf8')
      for (const line of text.split(NEWLINE_SPLIT_RE)) {
        const value = extractReadyTime(line)
        if (value && value > 0) {
          readyMs = value
          startupDone = true
          break
        }
      }
    }
    catch (error) {
      parseError = error instanceof Error ? error : new Error(String(error))
    }
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        if (startupDone) {
          clearInterval(interval)
          resolve()
          return
        }
        if (parseError) {
          clearInterval(interval)
          reject(parseError)
          return
        }
        if (child.exitCode != null || child.signalCode != null) {
          clearInterval(interval)
          reject(new Error(`Process exited before startup ready: code=${child.exitCode ?? 'null'} signal=${child.signalCode ?? 'null'}`))
        }
      }, 100)
    })
    await stopProcess(child)
  }
  finally {
    clearTimeout(timeout)
  }

  return readyMs
}

async function mutateProjectFile(filePath: string, marker: string) {
  const original = await fs.readFile(filePath, 'utf8')
  const needle = '</template>'
  const index = original.lastIndexOf(needle)
  if (index === -1) {
    throw new Error(`Unable to find template closing tag in ${filePath}`)
  }
  const next = `${original.slice(0, index)}\n  <view class="${marker}">bench-hot-update</view>\n${original.slice(index)}`
  await fs.writeFile(filePath, next, 'utf8')
  return async () => {
    await fs.writeFile(filePath, original, 'utf8')
  }
}

async function runBuild(
  options: BenchCliOptions,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const buildStart = now()
  const child = spawnPnpm(['run', options.buildScript], {
    cwd: options.cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const exited = await waitForProcessExit(child)
  ensureProcessSucceeded(exited)
  return now() - buildStart
}

async function runSingleCase(options: BenchCliOptions, mode: 'optimized' | 'legacy', round: number): Promise<RunMetrics> {
  const env = createEnv(mode)
  const startupMs = await collectReadyTime(options, env)
  const coldBuildMs = await runBuild(options, env)

  const projectFilePath = path.resolve(options.cwd, options.projectFile)
  const restore = await mutateProjectFile(projectFilePath, `${options.hotMarker}-${mode}-${round}`)

  try {
    const hotUpdateMs = await runBuild(options, env)
    return {
      startupMs,
      hotUpdateMs,
      coldBuildMs,
    }
  }
  finally {
    await restore()
  }
}

function printSummary(summary: SummaryRow[]) {
  const table = summary.map((row) => {
    return {
      metric: row.metric,
      optimized_mean_ms: row.optimized.mean.toFixed(2),
      optimized_median_ms: row.optimized.median.toFixed(2),
      optimized_stddev_ms: row.optimized.stddev.toFixed(2),
      legacy_mean_ms: row.legacy.mean.toFixed(2),
      legacy_median_ms: row.legacy.median.toFixed(2),
      legacy_stddev_ms: row.legacy.stddev.toFixed(2),
      improvement_percent: `${row.improvementPercent.toFixed(2)}%`,
    }
  })
  console.table(table)
}

async function runMode(options: BenchCliOptions, mode: 'optimized' | 'legacy') {
  const results: RunMetrics[] = []
  const totalRounds = options.warmup + options.runs
  for (let index = 0; index < totalRounds; index++) {
    const round = index + 1
    const result = await runSingleCase(options, mode, round)
    if (index >= options.warmup) {
      results.push(result)
      process.stdout.write(`[bench] ${mode} round ${round - options.warmup}/${options.runs} startup=${result.startupMs.toFixed(2)}ms hot=${result.hotUpdateMs.toFixed(2)}ms cold=${result.coldBuildMs.toFixed(2)}ms\n`)
    }
    else {
      process.stdout.write(`[bench] ${mode} warmup ${round}/${options.warmup} done\n`)
    }
  }
  return results
}

async function main() {
  const options = resolveOptions()
  const optimizedRuns = options.mode === 'legacy'
    ? []
    : await runMode(options, 'optimized')
  const legacyRuns = options.mode === 'optimized'
    ? []
    : await runMode(options, 'legacy')

  const summary = summarizeRunMetrics(options.mode, optimizedRuns, legacyRuns, ['startupMs', 'hotUpdateMs', 'coldBuildMs'])
  if (summary.length > 0) {
    printSummary(summary)
  }

  const report: BenchReport = {
    generatedAt: new Date().toISOString(),
    options,
    optimizedRuns,
    legacyRuns,
    summary,
  }

  await fs.mkdir(path.dirname(options.output), { recursive: true })
  await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`[bench] report written to ${options.output}\n`)
}

main().catch((error) => {
  console.error('[bench] failed:', error)
  process.exitCode = 1
})
