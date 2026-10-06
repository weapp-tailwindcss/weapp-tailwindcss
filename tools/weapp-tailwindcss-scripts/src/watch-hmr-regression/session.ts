import type { CliOptions, HmrMemoryDebugSample, MemoryProcessSample, MemoryUsageSample, PluginProcessSample, WatchSession } from './types'
import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { createPnpmCommand } from '../../../../scripts/pnpm-command.mjs'
import { assertWatchCommandActive } from './cancellation'
import { createSpawnEnv, createWatchProcessEnv } from './environment'

export { createSpawnEnv } from './environment'

export async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

// 模块级正则，避免函数内重复编译
const ZERO_WIDTH_SPACE_RE = /\u200B/g
const NEWLINE_SPLIT_RE = /\r?\n/
const ERROR_RE = /error/i
const EMFILE_RE = /emfile/i
const WHITESPACE_RE = /\s+/
const FIRST_WHITESPACE_RE = /\s/
const WATCH_COMMAND_PATTERNS = [
  /weapp-vite(?:\.js)?\s+dev/i,
  /taro-build-guard\.mjs\s+--watch/i,
  /taro-build-runner\.mjs\s+build\s+--type\s+\S+\s+--watch/i,
  /run-mpx-cli-service\.js\s+serve/i,
  /webpack(?:\.js)?\s+--watch/i,
  /gulp[\s\S]+gulpfile\.ts/i,
  /\bnpm\b[\s\S]+build:weapp[\s\S]+--watch/i,
  /hbuilderx[\s\S]+launch[\s\S]+mp-weixin/i,
] as const
const HMR_TIMING_PREFIX = '[weapp-tailwindcss:hmr]'

const sassDeprecationLinePatterns = [
  /^DEPRECATION WARNING \[/,
  /More info: https:\/\/sass\.lang\.com\/d\//,
  /More info and automated migrator: https:\/\/sass\.lang\.com\/d\//,
  /^WARNING: \d+ repetitive deprecation warnings omitted\.$/,
  /^\s*[│╷╵^]/,
  /^\s*\d+\s*│/,
  /^\s*stdin\s+\d+:\d+\s+root stylesheet$/,
  /^\s*src\/\S+\s+\d+:\d+\s+@import$/,
] as const

function isSassDeprecationNoiseLine(line: string) {
  const normalized = line.replace(ZERO_WIDTH_SPACE_RE, '')

  if (normalized.includes('sass-lang.com/d/')) {
    return true
  }

  if (normalized.includes('@import') && normalized.includes('│')) {
    return true
  }

  for (const pattern of sassDeprecationLinePatterns) {
    if (pattern.test(normalized)) {
      return true
    }
  }
  return false
}

export function createLineCollector(
  prefix: string,
  lines: string[],
  limit = 240,
  options: { quietSass?: boolean } = {},
) {
  const quietSass = options.quietSass === true
  return (chunk: Buffer | string) => {
    const text = chunk.toString()
    for (const line of text.split(NEWLINE_SPLIT_RE)) {
      if (!line) {
        continue
      }

      if (quietSass && isSassDeprecationNoiseLine(line)) {
        continue
      }

      lines.push(line)
      if (lines.length > limit) {
        lines.shift()
      }
      process.stdout.write(`[${prefix}] ${line}\n`)
    }
  }
}

const compileSuccessLinePatterns = [
  /compiled successfully/i,
  /compiled with (?:some )?warnings?/i,
  /watching for changes/i,
  /watching for file changes/i,
  /ready in \d+/i,
  /dev(?:elopment)? server ready/i,
  /开发服务已就绪/u,
  /built in [\d.]+s?/i,
  /构建完成/u,
  /编译成功/u,
  /UTS编译完毕/u,
  /已重新构建/u,
  /重新构建/u,
  /^(?:\[\d{2}:\d{2}:\d{2}\]\s*)?(?:DONE\s+)?build complete\.?$/i,
] as const

const compileFailureLinePatterns = [
  /build failed with \d+ error/i,
  /\[unhandleable_error\]/i,
  /unable to start fsevent stream/i,
  /err_pnpm_recursive_run_first_fail/i,
  /error:\s*listen eperm/i,
  /error:\s*listen emfile/i,
] as const

function stripAnsiControlSequences(line: string) {
  let output = ''
  for (let index = 0; index < line.length; index += 1) {
    const current = line.charCodeAt(index)
    const next = line.charCodeAt(index + 1)

    if (current !== 27 || next !== 91) {
      output += line[index]
      continue
    }

    index += 2
    while (index < line.length) {
      const code = line.charCodeAt(index)
      const isUpper = code >= 65 && code <= 90
      const isLower = code >= 97 && code <= 122
      if (isUpper || isLower) {
        break
      }
      index += 1
    }
  }
  return output
}

export function normalizeLogLine(line: string) {
  return stripAnsiControlSequences(line).replace(ZERO_WIDTH_SPACE_RE, '').trim()
}

export function parsePluginProcessSample(line: string): Omit<PluginProcessSample, 'at'> | undefined {
  const normalized = normalizeLogLine(line)
  const payloadStart = normalized.indexOf(HMR_TIMING_PREFIX)
  const payloadText = payloadStart >= 0
    ? normalized.slice(payloadStart + HMR_TIMING_PREFIX.length).trim()
    : undefined
  if (!payloadText) {
    return undefined
  }

  try {
    const payload = JSON.parse(payloadText) as Partial<Omit<PluginProcessSample, 'at'>>
    if (
      typeof payload.bundler !== 'string'
      || typeof payload.phase !== 'string'
      || typeof payload.durationMs !== 'number'
      || !Number.isFinite(payload.durationMs)
    ) {
      return undefined
    }
    return {
      bundler: payload.bundler,
      phase: payload.phase,
      durationMs: Math.max(0, Math.round(payload.durationMs)),
      ...(typeof payload.file === 'string' ? { file: payload.file } : {}),
      ...(payload.metric === 'hook' || payload.metric === 'total' ? { metric: payload.metric } : {}),
      ...(typeof payload.wallMs === 'number' && Number.isFinite(payload.wallMs) ? { wallMs: Math.max(0, Math.round(payload.wallMs)) } : {}),
      details: payload as Record<string, unknown>,
    }
  }
  catch {
    return undefined
  }
}

export function isCompileSuccessLine(line: string) {
  const normalized = normalizeLogLine(line)
  for (const pattern of compileSuccessLinePatterns) {
    if (pattern.test(normalized)) {
      return true
    }
  }
  return false
}

function resolveCompileFatalError(line: string) {
  const normalized = normalizeLogLine(line)
  for (const pattern of compileFailureLinePatterns) {
    if (pattern.test(normalized)) {
      return normalized
    }
  }

  // Some toolchains prefix fatal lines with `ERROR` but include extra symbols/text.
  if (ERROR_RE.test(normalized) && EMFILE_RE.test(normalized)) {
    return normalized
  }
}

export function spawnPnpm(
  args: string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
    detached?: boolean
    stdio: 'pipe'
  },
) {
  // 保留调用方已选择的 CLI，避免切到 demo 后被 Corepack 的就近版本声明重新路由。
  const command = createPnpmCommand(args, { npmExecPath: options.env['npm_execpath'] })
  return spawn(command.command, command.args, {
    ...options,
    shell: command.shell,
    ...(process.platform === 'win32' ? { windowsHide: true } : {}),
  })
}

export function killProcessTreeOnWindows(pid: number) {
  try {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  }
  catch {
  }
}

function listDescendantPidsOnPosix(rootPid: number) {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return []
  }

  const childrenByParent = new Map<number, number[]>()
  for (const line of result.stdout.split(NEWLINE_SPLIT_RE)) {
    const normalized = line.trim()
    if (!normalized) {
      continue
    }

    const [pidText, ppidText] = normalized.split(WHITESPACE_RE)
    const pid = Number(pidText)
    const ppid = Number(ppidText)
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) {
      continue
    }

    const siblings = childrenByParent.get(ppid)
    if (siblings) {
      siblings.push(pid)
    }
    else {
      childrenByParent.set(ppid, [pid])
    }
  }

  const descendants: number[] = []
  const stack = [...(childrenByParent.get(rootPid) ?? [])]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current == null) {
      continue
    }
    descendants.push(current)
    const children = childrenByParent.get(current)
    if (children?.length) {
      stack.push(...children)
    }
  }

  return descendants
}

interface ProcessTreeRow {
  pid: number
  ppid: number
  rssKb: number
  command?: string
}

interface WindowsProcessTreeRow {
  pid: number
  ppid: number
  workingSetBytes: number
  command?: string
}

function readPsToken(value: string, start: number) {
  let index = start
  while (index < value.length && value.charCodeAt(index) <= 32) {
    index += 1
  }
  const tokenStart = index
  while (index < value.length && value.charCodeAt(index) > 32) {
    index += 1
  }
  if (tokenStart === index) {
    return undefined
  }
  return {
    token: value.slice(tokenStart, index),
    nextIndex: index,
  }
}

function parseProcessTreeRowLine(value: string): ProcessTreeRow | undefined {
  const pidColumn = readPsToken(value, 0)
  const ppidColumn = pidColumn ? readPsToken(value, pidColumn.nextIndex) : undefined
  const rssColumn = ppidColumn ? readPsToken(value, ppidColumn.nextIndex) : undefined
  if (!pidColumn || !ppidColumn || !rssColumn) {
    return undefined
  }
  const pid = Number(pidColumn.token)
  const ppid = Number(ppidColumn.token)
  const rssKb = Number(rssColumn.token)
  if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !Number.isFinite(rssKb)) {
    return undefined
  }
  const command = value.slice(rssColumn.nextIndex).trim()
  return {
    pid,
    ppid,
    rssKb,
    ...(command ? { command: command.slice(0, 240) } : {}),
  }
}

function sampleProcessTreeMemoryOnPosix(rootPid: number): Omit<MemoryUsageSample, 'at'> | undefined {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid=,rss=,command='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return undefined
  }

  const rows: ProcessTreeRow[] = []
  for (const line of result.stdout.split(NEWLINE_SPLIT_RE)) {
    const normalized = line.trim()
    if (!normalized) {
      continue
    }

    const row = parseProcessTreeRowLine(normalized)
    if (row) {
      rows.push(row)
    }
  }

  const childrenByParent = new Map<number, ProcessTreeRow[]>()
  const byPid = new Map<number, ProcessTreeRow>()
  for (const row of rows) {
    byPid.set(row.pid, row)
    const siblings = childrenByParent.get(row.ppid)
    if (siblings) {
      siblings.push(row)
    }
    else {
      childrenByParent.set(row.ppid, [row])
    }
  }

  const tracked = new Map<number, ProcessTreeRow>()
  const root = byPid.get(rootPid)
  if (root) {
    tracked.set(root.pid, root)
  }

  const stack = [...(childrenByParent.get(rootPid) ?? [])]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current == null || tracked.has(current.pid)) {
      continue
    }
    tracked.set(current.pid, current)
    const children = childrenByParent.get(current.pid)
    if (children?.length) {
      stack.push(...children)
    }
  }

  if (tracked.size === 0) {
    return undefined
  }

  let totalRssKb = 0
  let maxProcessRssKb = 0
  for (const row of tracked.values()) {
    totalRssKb += row.rssKb
    maxProcessRssKb = Math.max(maxProcessRssKb, row.rssKb)
  }

  return {
    rssMb: Math.round(totalRssKb / 1024),
    maxProcessRssMb: Math.round(maxProcessRssKb / 1024),
    processCount: tracked.size,
    topProcesses: [...tracked.values()]
      .sort((a, b) => b.rssKb - a.rssKb)
      .slice(0, 8)
      .map(row => ({
        pid: row.pid,
        ppid: row.ppid,
        rssMb: Math.round(row.rssKb / 1024),
        ...(row.command ? { command: row.command } : {}),
      })),
  }
}

export function createWindowsProcessTreeMemoryScript(rootPid: number, cwd = process.cwd()) {
  const escapedRootPid = JSON.stringify(rootPid)
  return [
    `$root = [int]${escapedRootPid}`,
    `$repositoryRoot = '${cwd.replaceAll('\'', '\'\'')}'`,
    '$watchCommandPatterns = @("weapp-vite(?:\\.js)?\\s+dev", "taro-build-guard\\.mjs\\s+--watch", "taro-build-runner\\.mjs\\s+build\\s+--type\\s+h5\\s+--watch", "taro-build-runner\\.mjs\\s+build\\s+--type\\s+\\S+\\s+--watch", "run-mpx-cli-service\\.js\\s+serve", "webpack(?:\\.js)?\\s+--watch", "gulp[\\s\\S]+gulpfile\\.ts", "\\bpnpm\\b[\\s\\S]+build:weapp[\\s\\S]+--watch", "hbuilderx[\\s\\S]+launch[\\s\\S]+mp-weixin", "uni\\.js[\\s\\S]+-p\\s+mp-weixin")',
    '$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine)',
    '$children = @{}',
    'foreach ($process in $processes) {',
    '  $parent = [int]$process.ParentProcessId',
    '  if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }',
    '  $children[$parent] += $process',
    '}',
    '$tracked = @{}',
    '$stack = New-Object System.Collections.ArrayList',
    '$rootProcess = $processes | Where-Object { [int]$_.ProcessId -eq $root } | Select-Object -First 1',
    'if ($null -ne $rootProcess) { $tracked[[int]$rootProcess.ProcessId] = $rootProcess }',
    'if ($children.ContainsKey($root)) { foreach ($child in $children[$root]) { [void]$stack.Add($child) } }',
    'while ($stack.Count -gt 0) {',
    '  $current = $stack[$stack.Count - 1]',
    '  $stack.RemoveAt($stack.Count - 1)',
    '  $pid = [int]$current.ProcessId',
    '  if ($tracked.ContainsKey($pid)) { continue }',
    '  $tracked[$pid] = $current',
    '  if ($children.ContainsKey($pid)) { foreach ($child in $children[$pid]) { [void]$stack.Add($child) } }',
    '}',
    'foreach ($process in $processes) {',
    '  $command = if ($null -eq $process.CommandLine) { "" } else { [string]$process.CommandLine }',
    '  if ($command.Length -eq 0 -or -not $command.Contains($repositoryRoot)) { continue }',
    '  foreach ($pattern in $watchCommandPatterns) {',
    '    if ($command -match $pattern) { $tracked[[int]$process.ProcessId] = $process; break }',
    '  }',
    '}',
    '$total = 0',
    '$max = 0',
    'foreach ($process in $tracked.Values) {',
    '  $workingSet = if ($null -eq $process.WorkingSetSize) { 0 } else { [double]$process.WorkingSetSize }',
    '  $total += $workingSet',
    '  if ($workingSet -gt $max) { $max = $workingSet }',
    '}',
    '$top = @($tracked.Values | Sort-Object -Property WorkingSetSize -Descending | Select-Object -First 8 | ForEach-Object { $workingSet = if ($null -eq $_.WorkingSetSize) { 0 } else { [double]$_.WorkingSetSize }; $command = if ($null -eq $_.CommandLine) { "" } else { [string]$_.CommandLine }; @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; rssMb = [int][Math]::Round($workingSet / 1MB); command = $command.Substring(0, [Math]::Min(240, $command.Length)) } })',
    '[Console]::Out.WriteLine((@{ rssMb = [int][Math]::Round($total / 1MB); maxProcessRssMb = [int][Math]::Round($max / 1MB); processCount = [int]$tracked.Count; topProcesses = $top } | ConvertTo-Json -Compress -Depth 4))',
  ].join('; ')
}

function sampleProcessTreeMemoryOnWindows(rootPid: number): Omit<MemoryUsageSample, 'at'> | undefined {
  const script = createWindowsProcessTreeMemoryScript(rootPid)
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  })

  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return undefined
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as Partial<Omit<MemoryUsageSample, 'at'>>
    if (
      typeof parsed.rssMb !== 'number'
      || typeof parsed.maxProcessRssMb !== 'number'
      || typeof parsed.processCount !== 'number'
    ) {
      return undefined
    }
    const topProcesses = normalizeWindowsTopProcesses(parsed.topProcesses)
    const sample: Omit<MemoryUsageSample, 'at'> = {
      rssMb: parsed.rssMb,
      maxProcessRssMb: parsed.maxProcessRssMb,
      processCount: parsed.processCount,
    }
    if (topProcesses.length > 0) {
      sample.topProcesses = topProcesses
    }
    return sample
  }
  catch {
    return undefined
  }
}

function normalizeWindowsTopProcesses(value: unknown): MemoryProcessSample[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? [value]
      : []
  return rows
    .map((row) => {
      const item = row as Partial<WindowsProcessTreeRow & MemoryProcessSample>
      if (
        typeof item.pid !== 'number'
        || typeof item.ppid !== 'number'
        || typeof item.rssMb !== 'number'
      ) {
        return undefined
      }
      return {
        pid: item.pid,
        ppid: item.ppid,
        rssMb: item.rssMb,
        ...(typeof item.command === 'string' && item.command ? { command: item.command } : {}),
      }
    })
    .filter((item): item is MemoryProcessSample => item != null)
}

export function sampleProcessTreeMemory(rootPid: number | undefined): MemoryUsageSample | undefined {
  if (rootPid == null) {
    return undefined
  }
  const sample = process.platform === 'win32'
    ? sampleProcessTreeMemoryOnWindows(rootPid)
    : sampleProcessTreeMemoryOnPosix(rootPid)
  if (!sample) {
    return undefined
  }
  return {
    at: Date.now(),
    ...sample,
  }
}

export function killProcessTreeOnPosix(pid: number, signal: NodeJS.Signals) {
  const descendants = listDescendantPidsOnPosix(pid)

  for (const childPid of descendants.reverse()) {
    try {
      process.kill(childPid, signal)
    }
    catch {
    }
  }

  for (const childPid of descendants) {
    try {
      process.kill(-childPid, signal)
    }
    catch {
    }
  }

  try {
    process.kill(-pid, signal)
    return
  }
  catch {
  }

  try {
    process.kill(pid, signal)
  }
  catch {
  }
}

function listMatchingWatchPidsByCwd(cwd: string) {
  const result = spawnSync('ps', ['-Ao', 'pid=,command='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return []
  }

  const normalizedCwd = path.resolve(cwd)
  const matched = new Set<number>()

  for (const line of result.stdout.split(NEWLINE_SPLIT_RE)) {
    const normalized = line.trim()
    if (!normalized) {
      continue
    }

    const firstWhitespace = normalized.search(FIRST_WHITESPACE_RE)
    if (firstWhitespace <= 0) {
      continue
    }

    const pid = Number(normalized.slice(0, firstWhitespace))
    const command = normalized.slice(firstWhitespace).trim()
    if (!Number.isInteger(pid) || pid <= 0) {
      continue
    }
    if (pid === process.pid) {
      continue
    }
    if (!command.includes(normalizedCwd)) {
      continue
    }
    if (!WATCH_COMMAND_PATTERNS.some(pattern => pattern.test(command))) {
      continue
    }
    matched.add(pid)
  }

  return [...matched]
}

function cleanupExistingWatchProcesses(cwd: string) {
  const pids = listMatchingWatchPidsByCwd(cwd)
  if (pids.length === 0) {
    return
  }

  process.stdout.write(
    `[watch-hmr] cleanup stale watch processes for ${path.relative(process.cwd(), cwd) || '.'}: ${pids.join(', ')}\n`,
  )

  for (const pid of pids) {
    if (process.platform === 'win32') {
      killProcessTreeOnWindows(pid)
      continue
    }
    killProcessTreeOnPosix(pid, 'SIGKILL')
  }
}

function isProcessAlive(pid: number | undefined) {
  if (pid == null) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

function createWatchSpawnEnv(extra: Record<string, string>) {
  return createWatchProcessEnv(process.env, {
    WEAPP_TW_WATCH_REGRESSION: '1',
    // 回归模式优先稳定性。
    // 宿主机上 Webpack/Taro 的 fs.watch 很容易触发 EMFILE，
    // 这里统一切到 polling watcher，必要时仍允许外部环境覆盖。
    WATCHPACK_POLLING: process.env['WATCHPACK_POLLING'] ?? '50',
    WATCHPACK_POLLING_INTERVAL: process.env['WATCHPACK_POLLING_INTERVAL'] ?? '50',
    CHOKIDAR_USEPOLLING: process.env['CHOKIDAR_USEPOLLING'] ?? '1',
    CHOKIDAR_INTERVAL: process.env['CHOKIDAR_INTERVAL'] ?? '50',
    NODE_OPTIONS: process.env['NODE_OPTIONS'] ?? '--max-old-space-size=8192',
    ...extra,
  })
}

export async function runPnpmCommand(cwd: string, args: string[], label: string) {
  const lines: string[] = []
  const child = spawnPnpm(args, {
    cwd,
    env: createSpawnEnv(process.env),
    stdio: 'pipe',
  })

  const collect = createLineCollector(label, lines)
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const closePipes = () => {
    try {
      child.stdin.end()
    }
    catch {
    }
    try {
      child.stdin.destroy()
    }
    catch {
    }
    try {
      child.stdout.destroy()
    }
    catch {
    }
    try {
      child.stderr.destroy()
    }
    catch {
    }
  }

  const exitCode = await new Promise<number>((resolve) => {
    child.once('close', (code) => {
      child.stdout.off('data', collect)
      child.stderr.off('data', collect)
      closePipes()
      resolve(code ?? 1)
    })
  })

  if (exitCode !== 0) {
    throw new Error(`[${label}] command failed with code ${exitCode}\n${lines.join('\n')}`)
  }
}

export async function ensureLocalPackageBuild(baseCwd: string) {
  const packageRoot = path.resolve(baseCwd, 'packages/weapp-tailwindcss')
  process.stdout.write('[watch-hmr] prepare local package build\n')
  await runPnpmCommand(packageRoot, ['run', 'build'], 'build')
}

export function createWatchSession(
  cwd: string,
  devScript: string,
  options: Pick<CliOptions, 'quietSass'>,
  env: Record<string, string> = {},
): WatchSession {
  return createWatchCommandSession(cwd, ['run', devScript], options, env)
}

export function createWatchCommandSession(
  cwd: string,
  args: string[],
  options: Pick<CliOptions, 'quietSass'>,
  env: Record<string, string> = {},
): WatchSession {
  assertWatchCommandActive()
  cleanupExistingWatchProcesses(cwd)
  const lines: string[] = []
  const pluginProcessSamples: PluginProcessSample[] = []
  const memoryDebugSamples: HmrMemoryDebugSample[] = []
  const memorySamples: MemoryUsageSample[] = []
  let lastCompileSuccessAt = 0
  let compileFatalError: string | undefined
  const child = spawnPnpm(args, {
    cwd,
    env: createWatchSpawnEnv(env),
    detached: process.platform !== 'win32',
    stdio: 'pipe',
  })
  const recordMemorySample = () => {
    const sample = sampleProcessTreeMemory(child.pid)
    if (!sample) {
      return
    }
    memorySamples.push(sample)
    if (memorySamples.length > 1000) {
      memorySamples.shift()
    }
  }
  const memoryTimer = setInterval(recordMemorySample, 1000)
  memoryTimer.unref?.()
  recordMemorySample()
  let exitSignal: NodeJS.Signals | null = null
  child.once('close', (_code, signal) => {
    exitSignal = signal
  })

  const killWatchProcess = (signal: NodeJS.Signals) => {
    const childPid = child.pid
    if (childPid != null && process.platform === 'win32') {
      killProcessTreeOnWindows(childPid)
      return
    }

    if (childPid != null && process.platform !== 'win32') {
      killProcessTreeOnPosix(childPid, signal)
      return
    }

    try {
      child.kill(signal)
    }
    catch {
    }
  }

  const closePipes = () => {
    try {
      child.stdin.end()
    }
    catch {
    }
    try {
      child.stdin.destroy()
    }
    catch {
    }
    try {
      child.stdout.destroy()
    }
    catch {
    }
    try {
      child.stderr.destroy()
    }
    catch {
    }
  }

  let collecting = true
  const rawCollect = createLineCollector('watch', lines, 240, {
    quietSass: options.quietSass,
  })
  const collect = (chunk: Buffer | string) => {
    if (!collecting) {
      return
    }

    const text = chunk.toString()
    for (const line of text.split(NEWLINE_SPLIT_RE)) {
      if (!line) {
        continue
      }
      if (isCompileSuccessLine(line)) {
        lastCompileSuccessAt = Date.now()
      }
      if (!compileFatalError) {
        compileFatalError = resolveCompileFatalError(line)
      }
      const pluginSample = parsePluginProcessSample(line)
      if (pluginSample) {
        const at = Date.now()
        pluginProcessSamples.push({
          at,
          ...pluginSample,
        })
        const memoryDebug = pluginSample.details?.['memoryDebug']
        if (memoryDebug && typeof memoryDebug === 'object' && !Array.isArray(memoryDebug)) {
          memoryDebugSamples.push({
            at,
            bundler: pluginSample.bundler,
            phase: pluginSample.phase,
            durationMs: pluginSample.durationMs,
            data: memoryDebug as Record<string, unknown>,
          })
          if (memoryDebugSamples.length > 1000) {
            memoryDebugSamples.shift()
          }
        }
        if (pluginProcessSamples.length > 1000) {
          pluginProcessSamples.shift()
        }
      }
    }

    rawCollect(chunk)
  }

  let stopped = false
  const cleanupSessionResources = () => {
    if (stopped) {
      return
    }
    stopped = true
    collecting = false
    clearInterval(memoryTimer)
    recordMemorySample()
    child.stdout.off('data', collect)
    child.stderr.off('data', collect)
  }

  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const ensureRunning = () => {
    assertWatchCommandActive()
    if (compileFatalError) {
      throw new Error(`watch process reported fatal error: ${compileFatalError}`)
    }
    if (child.exitCode != null) {
      throw new Error(`watch process exited unexpectedly with code ${child.exitCode}`)
    }
    if (exitSignal != null) {
      throw new Error(`watch process exited unexpectedly with signal ${exitSignal}`)
    }
    if (!isProcessAlive(child.pid)) {
      throw new Error('watch process exited unexpectedly')
    }
  }

  const stop = async () => {
    const waitForExit = async (timeoutMs: number) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        if (child.exitCode != null || exitSignal != null) {
          return true
        }
        await sleep(100)
      }
      return child.exitCode != null || exitSignal != null
    }

    if (child.exitCode != null || exitSignal != null) {
      cleanupSessionResources()
      closePipes()
      return
    }

    cleanupSessionResources()

    killWatchProcess('SIGINT')
    if (await waitForExit(3000)) {
      closePipes()
      return
    }

    killWatchProcess('SIGTERM')
    if (await waitForExit(2500)) {
      closePipes()
      return
    }

    killWatchProcess('SIGKILL')
    await waitForExit(2500)
    closePipes()
  }

  return {
    child,
    ensureRunning,
    lastCompileSuccessAt: () => lastCompileSuccessAt,
    logs: () => lines.join('\n'),
    memorySamplesSince: startedAt => memorySamples.filter(sample => sample.at >= startedAt),
    memoryDebugSamplesSince: startedAt => memoryDebugSamples.filter(sample => sample.at >= startedAt),
    pluginProcessSamplesSince: startedAt => pluginProcessSamples.filter(sample => sample.at >= startedAt),
    stop,
  }
}
