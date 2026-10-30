import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync, promises as fs, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

interface BenchCliOptions {
  cwd: string
  script: string
  runs: number
  warmup: number
  timeoutMs: number
  mode: 'optimized' | 'legacy' | 'both'
  output: string
  projectFile: string
  hotMarker: string
  injectPages: number
  injectPagesRoot: string
  pagesJsonPath: string
  forcePolling: boolean
}

interface PnpmCommand {
  command: string
  args: string[]
}

interface StringableChunk {
  toString: (encoding?: string) => string
}

interface RunMetrics {
  startupMs: number
  hmrMs: number
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

interface DevSession {
  child: ChildProcessWithoutNullStreams
  waitForReady: () => Promise<number>
  waitForNextBuildComplete: (baselineCount: number) => Promise<number>
  getBuildCompleteCount: () => number
  stop: () => Promise<void>
}

interface ProjectInjectionState {
  cleanup: () => Promise<void>
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

const BENCH_PAGES_START_MARKER = '// BENCH_BIG_START'
const BENCH_PAGES_END_MARKER = '// BENCH_BIG_END'

// 模块级正则，避免函数内重复编译
const READY_TIME_DIRECT_RE = /ready\s+in\s+([\d.]+)\s*ms/i
const READY_TIME_FALLBACK_RE = /([\d.]+)\s*ms/i
const READY_KEYWORD_RE = /ready/i
const BUILD_COMPLETE_RE = /build complete\.\s*watching for changes/i
const DONE_BUILD_COMPLETE_RE = /done\s+build complete/i
const NEWLINE_SPLIT_RE = /\r?\n/g
const SRC_PREFIX_RE = /^src\//
const LEADING_SLASH_RE = /^\//

function parseArg(flag: string, argv: string[]) {
  const prefix = `${flag}=`
  const inline = argv.find(value => value.startsWith(prefix))
  if (inline) {
    return inline.slice(prefix.length)
  }
  const index = argv.indexOf(flag)
  if (index === -1) {
    return undefined
  }
  return argv[index + 1]
}

function parseNumber(value: string | undefined, fallback: number) {
  if (value == null) {
    return fallback
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function parseBooleanFlag(value: string | undefined) {
  if (value == null) {
    return false
  }
  const normalized = value.toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
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
  const mode = (parseArg('--mode', argv) ?? 'both') as BenchCliOptions['mode']
  const baseCwd = resolveBaseCwd()
  const cwd = resolvePathArg(baseCwd, parseArg('--cwd', argv), 'demo/uni-app-vite-tailwindcss-v4')
  const output = resolvePathArg(baseCwd, parseArg('--output', argv), 'benchmark/vite-adapter/vite-dev-hmr-report.json')

  return {
    cwd,
    script: parseArg('--script', argv) ?? 'dev',
    runs: parseNumber(parseArg('--runs', argv), 5),
    warmup: parseNumber(parseArg('--warmup', argv), 1),
    timeoutMs: parseNumber(parseArg('--timeout', argv), 120000),
    mode,
    output,
    projectFile: parseArg('--project-file', argv) ?? 'src/pages/index/index.vue',
    hotMarker: parseArg('--hot-marker', argv) ?? 'text-[#0f0f0f]',
    injectPages: parseNumber(parseArg('--inject-pages', argv), 0),
    injectPagesRoot: parseArg('--inject-pages-root', argv) ?? 'src/pages/bench-big',
    pagesJsonPath: parseArg('--pages-json', argv) ?? 'src/pages.json',
    forcePolling: parseBooleanFlag(parseArg('--force-polling', argv)),
  }
}

function now() {
  return performance.now()
}

function createEnv(mode: 'optimized' | 'legacy', options: BenchCliOptions) {
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
  if (options.forcePolling) {
    env['CHOKIDAR_USEPOLLING'] = '1'
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

function isBuildCompleteLine(line: string) {
  return BUILD_COMPLETE_RE.test(line)
    || DONE_BUILD_COMPLETE_RE.test(line)
}

function formatStats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((acc, value) => acc + value, 0) / sorted.length
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
  const variance = sorted.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / sorted.length
  return {
    mean,
    median,
    stddev: Math.sqrt(variance),
  }
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  timeoutMessage: string,
) {
  const start = now()
  await new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        if (predicate()) {
          clearInterval(timer)
          resolve()
          return
        }
        if (now() - start > timeoutMs) {
          clearInterval(timer)
          reject(new Error(timeoutMessage))
        }
      }
      catch (error) {
        clearInterval(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }, 100)
  })
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
  allowSignal = false,
) {
  if (result.code === 0) {
    return
  }
  if (allowSignal && result.signal) {
    return
  }
  if (allowSignal && result.code === 1 && result.signal == null) {
    return
  }
  throw new Error(`Process exited with code=${result.code ?? 'null'} signal=${result.signal ?? 'null'}`)
}

async function stopProcess(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode != null || child.signalCode != null) {
    ensureProcessSucceeded({ code: child.exitCode, signal: child.signalCode }, true)
    return
  }
  child.kill('SIGTERM')
  const exited = await waitForProcessExit(child)
  ensureProcessSucceeded(exited, true)
}

function createDevSession(options: BenchCliOptions, env: NodeJS.ProcessEnv): DevSession {
  const child = spawnPnpm(['run', options.script], {
    cwd: options.cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let readyMs = 0
  let readyCaptured = false
  let buildCompleteCount = 0
  let lastBuildCompleteAt = 0
  let parseError: Error | undefined
  let stdoutBuffer = ''
  let stderrBuffer = ''

  const processLine = (rawLine: string) => {
    const line = rawLine
    if (!readyCaptured) {
      const nextReady = extractReadyTime(line)
      if (nextReady && nextReady > 0) {
        readyMs = nextReady
        readyCaptured = true
      }
    }

    if (isBuildCompleteLine(line)) {
      buildCompleteCount += 1
      lastBuildCompleteAt = now()
    }
  }

  const consumeChunk = (chunk: StringableChunk, channel: 'stdout' | 'stderr') => {
    try {
      const text = chunk.toString('utf8')
      const buffer = channel === 'stdout' ? stdoutBuffer : stderrBuffer
      const lines = (buffer + text).split(NEWLINE_SPLIT_RE)
      const trailing = lines.pop() ?? ''
      if (channel === 'stdout') {
        stdoutBuffer = trailing
      }
      else {
        stderrBuffer = trailing
      }
      for (const line of lines) {
        processLine(line)
      }
    }
    catch (error) {
      parseError = error instanceof Error ? error : new Error(String(error))
    }
  }

  child.stdout.on('data', (chunk: StringableChunk) => {
    consumeChunk(chunk, 'stdout')
  })

  child.stderr.on('data', (chunk: StringableChunk) => {
    consumeChunk(chunk, 'stderr')
  })

  const ensureAlive = () => {
    if (parseError) {
      throw parseError
    }
    if (child.exitCode != null || child.signalCode != null) {
      throw new Error(`dev process exited unexpectedly: code=${child.exitCode ?? 'null'} signal=${child.signalCode ?? 'null'}`)
    }
  }

  return {
    child,
    async waitForReady() {
      await waitUntil(() => {
        ensureAlive()
        return readyCaptured
      }, options.timeoutMs, 'timeout waiting for dev ready log')

      await waitUntil(() => {
        ensureAlive()
        return buildCompleteCount > 0
      }, options.timeoutMs, 'timeout waiting for first build complete log')

      return readyMs
    },
    async waitForNextBuildComplete(baselineCount: number) {
      await waitUntil(() => {
        ensureAlive()
        return buildCompleteCount > baselineCount
      }, options.timeoutMs, 'timeout waiting for next build complete log after file mutation')
      return lastBuildCompleteAt
    },
    getBuildCompleteCount() {
      return buildCompleteCount
    },
    async stop() {
      await stopProcess(child)
    },
  }
}

async function mutateProjectFile(filePath: string, marker: string) {
  const original = await fs.readFile(filePath, 'utf8')
  const needle = '</template>'
  const index = original.lastIndexOf(needle)
  if (index === -1) {
    throw new Error(`unable to find template closing tag in ${filePath}`)
  }
  const next = `${original.slice(0, index)}\n  <view class="${marker}">bench-dev-hmr</view>\n${original.slice(index)}`
  await fs.writeFile(filePath, next, 'utf8')
  return async () => {
    await fs.writeFile(filePath, original, 'utf8')
  }
}

async function injectLargePagesIfNeeded(options: BenchCliOptions): Promise<ProjectInjectionState> {
  if (options.injectPages <= 0) {
    return {
      async cleanup() {
      },
    }
  }

  const pagesJsonFullPath = path.resolve(options.cwd, options.pagesJsonPath)
  const injectRootFullPath = path.resolve(options.cwd, options.injectPagesRoot)

  const originalPagesJson = await fs.readFile(pagesJsonFullPath, 'utf8')
  await fs.mkdir(injectRootFullPath, { recursive: true })

  for (let index = 1; index <= options.injectPages; index++) {
    const name = `p${String(index).padStart(3, '0')}`
    const filePath = path.join(injectRootFullPath, `${name}.vue`)
    const code = `<template>\n  <view class="p-4">\n    <view class="text-[#123456] bg-[#f5f5f5] rounded px-2 py-1">bench-${name}</view>\n  </view>\n</template>\n\n<script setup lang="ts">\nconst pageId = '${name}'\n</script>\n`
    await fs.writeFile(filePath, code, 'utf8')
  }

  let nextPagesJson = originalPagesJson
  const markerRegExp = new RegExp(`${BENCH_PAGES_START_MARKER}[\\s\\S]*?${BENCH_PAGES_END_MARKER}\\n?`, 'g')
  nextPagesJson = nextPagesJson.replace(markerRegExp, '')

  const insertPos = nextPagesJson.indexOf('],\n  "globalStyle"')
  if (insertPos === -1) {
    throw new Error(`unable to locate pages array end in ${pagesJsonFullPath}`)
  }

  const pagesRoot = options.injectPagesRoot
    .replace(SRC_PREFIX_RE, '')
    .replace(LEADING_SLASH_RE, '')

  const items: string[] = []
  for (let index = 1; index <= options.injectPages; index++) {
    const name = `p${String(index).padStart(3, '0')}`
    items.push(`    {\n      "path": "${pagesRoot}/${name}",\n      "style": {\n        "navigationBarTitleText": "bench-${name}"\n      }\n    }`)
  }

  const block = `\n    ${BENCH_PAGES_START_MARKER}\n${items.join(',\n')}\n    ${BENCH_PAGES_END_MARKER}\n`
  const before = nextPagesJson.slice(0, insertPos)
  const after = nextPagesJson.slice(insertPos)
  const separator = before.trimEnd().endsWith('[') ? '' : ','

  await fs.writeFile(pagesJsonFullPath, `${before}${separator}${block}${after}`, 'utf8')

  return {
    async cleanup() {
      await fs.writeFile(pagesJsonFullPath, originalPagesJson, 'utf8')
      await fs.rm(injectRootFullPath, { recursive: true, force: true })
    },
  }
}

async function runSingleCase(options: BenchCliOptions, mode: 'optimized' | 'legacy', round: number): Promise<RunMetrics> {
  const env = createEnv(mode, options)
  const projectFilePath = path.resolve(options.cwd, options.projectFile)
  const devSession = createDevSession(options, env)

  try {
    const startupMs = await devSession.waitForReady()
    const baselineBuildCount = devSession.getBuildCompleteCount()

    const restore = await mutateProjectFile(projectFilePath, `${options.hotMarker}-${mode}-${round}`)
    const hotStart = now()

    try {
      await devSession.waitForNextBuildComplete(baselineBuildCount)
    }
    finally {
      await restore()
    }

    const hmrMs = now() - hotStart
    return {
      startupMs,
      hmrMs,
    }
  }
  finally {
    await devSession.stop()
  }
}

function summarizeRuns(optimizedRuns: RunMetrics[], legacyRuns: RunMetrics[]): SummaryRow[] {
  const metrics: Array<keyof RunMetrics> = ['startupMs', 'hmrMs']
  return metrics.map((metric) => {
    const optimizedValues = optimizedRuns.map(run => run[metric])
    const legacyValues = legacyRuns.map(run => run[metric])
    const optimized = formatStats(optimizedValues)
    const legacy = formatStats(legacyValues)
    const improvementPercent = legacy.mean === 0
      ? 0
      : ((legacy.mean - optimized.mean) / legacy.mean) * 100
    return {
      metric,
      optimized,
      legacy,
      improvementPercent,
    }
  })
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
      process.stdout.write(`[bench-dev-hmr] ${mode} round ${round - options.warmup}/${options.runs} startup=${result.startupMs.toFixed(2)}ms hmr=${result.hmrMs.toFixed(2)}ms\n`)
    }
    else {
      process.stdout.write(`[bench-dev-hmr] ${mode} warmup ${round}/${options.warmup} done\n`)
    }
  }
  return results
}

async function main() {
  const options = resolveOptions()
  const injection = await injectLargePagesIfNeeded(options)

  try {
    const optimizedRuns = options.mode === 'legacy'
      ? []
      : await runMode(options, 'optimized')
    const legacyRuns = options.mode === 'optimized'
      ? []
      : await runMode(options, 'legacy')

    const summary = legacyRuns.length > 0 ? summarizeRuns(optimizedRuns, legacyRuns) : []
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
    process.stdout.write(`[bench-dev-hmr] report written to ${options.output}\n`)
  }
  finally {
    await injection.cleanup()
  }
}

main().catch((error) => {
  console.error('[bench-dev-hmr] failed:', error)
  process.exitCode = 1
})
