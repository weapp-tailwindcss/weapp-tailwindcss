import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { runProcessCommand } from './demo-e2e-workflow/process-command'

export interface DemoE2eMemorySample {
  at: number
  rssMb: number
  maxProcessRssMb: number
  processCount: number
  topProcesses?: Array<{
    pid: number
    ppid: number
    rssMb: number
    command?: string
  }>
}

export interface DemoE2eMemorySummary {
  count: number
  baselineRssMb: number
  peakRssMb: number
  rssDeltaMb: number
  peakMaxProcessRssMb: number
  peakProcessCount: number
  uniqueProcessCount: number
  firstAt?: number
  lastAt?: number
  durationMs: number
  peakSample?: DemoE2eMemorySample
}

export interface DemoE2eMemoryStepReport {
  cancelled?: 'SIGINT' | 'SIGTERM'
  cleanupScope?: string
  sourceRestoration?: 'unverified'
  error?: string
  name: string
  command: string[]
  exitCode: number
  startedAt: string
  endedAt: string
  local: boolean
  summary: DemoE2eMemorySummary
  samples: DemoE2eMemorySample[]
}

export interface DemoE2eMemoryReport {
  error?: string
  generatedAt: string
  repositoryRoot: string
  includeLocal: boolean
  exitCode: number
  summary: DemoE2eMemorySummary & {
    stepCount: number
    failedStepCount: number
  }
  steps: DemoE2eMemoryStepReport[]
}

interface ProcessRow {
  pid: number
  ppid: number
  rssKb: number
  command?: string
}

interface WriteReportResult {
  jsonFile: string
  markdownFile: string
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

function parseProcessRowLine(value: string): ProcessRow | undefined {
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

function listDescendantRowsOnPosix(rootPid: number): ProcessRow[] {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid=,rss=,command='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return []
  }
  return parseDescendantRows(result.stdout, rootPid)
}

function parseDescendantRows(output: string, rootPid: number): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const line of output.split(/\r?\n/)) {
    const normalized = line.trim()
    if (!normalized) {
      continue
    }
    const row = parseProcessRowLine(normalized)
    if (row) {
      rows.push(row)
    }
  }

  const childrenByParent = new Map<number, ProcessRow[]>()
  const byPid = new Map<number, ProcessRow>()
  for (const row of rows) {
    byPid.set(row.pid, row)
    const children = childrenByParent.get(row.ppid) ?? []
    children.push(row)
    childrenByParent.set(row.ppid, children)
  }

  const tracked = new Map<number, ProcessRow>()
  const root = byPid.get(rootPid)
  if (root) {
    tracked.set(root.pid, root)
  }
  const stack = [...(childrenByParent.get(rootPid) ?? [])]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || tracked.has(current.pid)) {
      continue
    }
    tracked.set(current.pid, current)
    stack.push(...(childrenByParent.get(current.pid) ?? []))
  }
  return [...tracked.values()]
}

function samplePosix(rootPid: number): DemoE2eMemorySample | undefined {
  return sampleRows(listDescendantRowsOnPosix(rootPid))
}

function sampleRows(rows: ProcessRow[]): DemoE2eMemorySample | undefined {
  if (rows.length === 0) {
    return undefined
  }
  const totalRssKb = rows.reduce((total, row) => total + row.rssKb, 0)
  const maxProcessRssKb = Math.max(...rows.map(row => row.rssKb))
  return {
    at: Date.now(),
    rssMb: Math.round(totalRssKb / 1024),
    maxProcessRssMb: Math.round(maxProcessRssKb / 1024),
    processCount: rows.length,
    topProcesses: rows
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
  return [
    `$root = [int]${JSON.stringify(rootPid)}`,
    `$repositoryRoot = '${cwd.replaceAll('\'', '\'\'')}'`,
    '$watchCommandPatterns = @("weapp-vite(?:\\.js)?\\s+dev", "taro-build-guard\\.mjs\\s+--watch", "taro-build-runner\\.mjs\\s+build\\s+--type\\s+h5\\s+--watch", "run-mpx-cli-service\\.js\\s+serve", "webpack(?:\\.js)?\\s+--watch", "gulp[\\s\\S]+gulpfile\\.ts", "\\bpnpm\\b[\\s\\S]+build:weapp[\\s\\S]+--watch", "hbuilderx[\\s\\S]+launch[\\s\\S]+mp-weixin", "uni\\.js[\\s\\S]+-p\\s+mp-weixin")',
    '$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine)',
    '$children = @{}',
    'foreach ($process in $processes) { $parent = [int]$process.ParentProcessId; if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }; $children[$parent] += $process }',
    '$tracked = @{}',
    '$stack = New-Object System.Collections.ArrayList',
    '$rootProcess = $processes | Where-Object { [int]$_.ProcessId -eq $root } | Select-Object -First 1',
    'if ($null -ne $rootProcess) { $tracked[[int]$rootProcess.ProcessId] = $rootProcess }',
    'if ($children.ContainsKey($root)) { foreach ($child in $children[$root]) { [void]$stack.Add($child) } }',
    'while ($stack.Count -gt 0) { $current = $stack[$stack.Count - 1]; $stack.RemoveAt($stack.Count - 1); $pid = [int]$current.ProcessId; if ($tracked.ContainsKey($pid)) { continue }; $tracked[$pid] = $current; if ($children.ContainsKey($pid)) { foreach ($child in $children[$pid]) { [void]$stack.Add($child) } } }',
    'foreach ($process in $processes) {',
    '  $command = if ($null -eq $process.CommandLine) { "" } else { [string]$process.CommandLine }',
    '  if ($command.Length -eq 0 -or -not $command.Contains($repositoryRoot)) { continue }',
    '  foreach ($pattern in $watchCommandPatterns) {',
    '    if ($command -match $pattern) { $tracked[[int]$process.ProcessId] = $process; break }',
    '  }',
    '}',
    '$total = 0; $max = 0',
    'foreach ($process in $tracked.Values) { $workingSet = if ($null -eq $process.WorkingSetSize) { 0 } else { [double]$process.WorkingSetSize }; $total += $workingSet; if ($workingSet -gt $max) { $max = $workingSet } }',
    '$top = @($tracked.Values | Sort-Object -Property WorkingSetSize -Descending | Select-Object -First 8 | ForEach-Object { $workingSet = if ($null -eq $_.WorkingSetSize) { 0 } else { [double]$_.WorkingSetSize }; $command = if ($null -eq $_.CommandLine) { "" } else { [string]$_.CommandLine }; @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; rssMb = [int][Math]::Round($workingSet / 1MB); command = $command.Substring(0, [Math]::Min(240, $command.Length)) } })',
    '[Console]::Out.WriteLine((@{ rssMb = [int][Math]::Round($total / 1MB); maxProcessRssMb = [int][Math]::Round($max / 1MB); processCount = [int]$tracked.Count; topProcesses = $top } | ConvertTo-Json -Compress -Depth 4))',
  ].join('; ')
}

function sampleWindows(rootPid: number): DemoE2eMemorySample | undefined {
  const script = createWindowsProcessTreeMemoryScript(rootPid)
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  })
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return undefined
  }
  try {
    const parsed = JSON.parse(result.stdout.trim()) as Partial<DemoE2eMemorySample>
    if (typeof parsed.rssMb !== 'number') {
      return undefined
    }
    return { at: Date.now(), ...parsed } as DemoE2eMemorySample
  }
  catch {
    return undefined
  }
}

export function sampleProcessTree(pid?: number): DemoE2eMemorySample | undefined {
  if (!pid) {
    return undefined
  }
  return process.platform === 'win32' ? sampleWindows(pid) : samplePosix(pid)
}

/** 全面工作流使用异步有界采样，不阻塞子进程 close 与取消处理。 */
export async function sampleProcessTreeAsync(pid?: number): Promise<DemoE2eMemorySample | undefined> {
  if (!pid) {
    return undefined
  }
  if (process.platform !== 'win32') {
    const output = await runProcessCommand('ps', ['-Ao', 'pid=,ppid=,rss=,command='], 5000)
    return sampleRows(parseDescendantRows(output, pid))
  }
  const output = await runProcessCommand('powershell', ['-NoProfile', '-Command', createWindowsProcessTreeMemoryScript(pid)], 5000)
  const parsed = JSON.parse(output.trim()) as Partial<DemoE2eMemorySample>
  if (typeof parsed.rssMb !== 'number') {
    throw new TypeError('Windows 内存探针响应无效。')
  }
  return { at: Date.now(), ...parsed } as DemoE2eMemorySample
}

export function summarizeMemorySamples(samples: DemoE2eMemorySample[]): DemoE2eMemorySummary {
  if (samples.length === 0) {
    return {
      count: 0,
      baselineRssMb: 0,
      peakRssMb: 0,
      rssDeltaMb: 0,
      peakMaxProcessRssMb: 0,
      peakProcessCount: 0,
      uniqueProcessCount: 0,
      durationMs: 0,
    }
  }
  const first = samples.find(sample => sample.processCount > 1 && sample.rssMb >= 128) ?? samples[0]!
  const firstAt = samples[0]!.at
  const lastAt = samples[samples.length - 1]!.at
  const peakSample = samples.reduce((current, sample) => {
    if (sample.rssMb > current.rssMb) {
      return sample
    }
    if (sample.rssMb === current.rssMb && sample.processCount > current.processCount) {
      return sample
    }
    return current
  }, samples[0]!)
  const peakRssMb = peakSample.rssMb
  return {
    count: samples.length,
    baselineRssMb: first.rssMb,
    peakRssMb,
    rssDeltaMb: Math.max(0, peakRssMb - first.rssMb),
    peakMaxProcessRssMb: Math.max(...samples.map(sample => sample.maxProcessRssMb)),
    peakProcessCount: Math.max(...samples.map(sample => sample.processCount)),
    uniqueProcessCount: new Set(samples.flatMap(sample => sample.topProcesses?.map(processSample => processSample.pid) ?? [])).size,
    firstAt,
    lastAt,
    durationMs: Math.max(0, lastAt - firstAt),
    peakSample,
  }
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  return minutes === 0 ? `${restSeconds}s` : `${minutes}m${String(restSeconds).padStart(2, '0')}s`
}

function commandText(command: string[]) {
  return command.map(part => part.includes(' ') ? JSON.stringify(part) : part).join(' ')
}

function buildOverallSummary(steps: DemoE2eMemoryStepReport[]): DemoE2eMemoryReport['summary'] {
  const samples = steps.flatMap(step => step.samples)
  const summary = summarizeMemorySamples(samples)
  return {
    ...summary,
    stepCount: steps.length,
    failedStepCount: steps.filter(step => step.exitCode !== 0).length,
  }
}

export function createDemoE2eMemoryReport(options: {
  repositoryRoot: string
  includeLocal: boolean
  exitCode: number
  generatedAt?: string
  error?: string
  steps: DemoE2eMemoryStepReport[]
}): DemoE2eMemoryReport {
  return {
    ...(options.error ? { error: options.error } : {}),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    repositoryRoot: options.repositoryRoot,
    includeLocal: options.includeLocal,
    exitCode: options.exitCode,
    summary: buildOverallSummary(options.steps),
    steps: options.steps,
  }
}

export function renderDemoE2eMemoryMarkdown(report: DemoE2eMemoryReport) {
  const lines = [
    '# Demo E2E 内存占用报告',
    '',
    `- generated_at: ${report.generatedAt}`,
    `- repository_root: \`${report.repositoryRoot}\``,
    `- include_local: ${report.includeLocal}`,
    `- exit_code: ${report.exitCode}`,
    `- steps: ${report.summary.stepCount}`,
    `- failed_steps: ${report.summary.failedStepCount}`,
    `- samples: ${report.summary.count}`,
    `- RSS baseline: ${report.summary.baselineRssMb}MB`,
    `- RSS peak: ${report.summary.peakRssMb}MB`,
    `- RSS delta: ${report.summary.rssDeltaMb}MB`,
    `- max single process RSS: ${report.summary.peakMaxProcessRssMb}MB`,
    `- peak process count: ${report.summary.peakProcessCount}`,
    `- seen process count: ${report.summary.uniqueProcessCount}`,
    `- duration: ${formatDuration(report.summary.durationMs)}`,
    '',
    '## 分阶段汇总',
    '',
    '| step | exit | samples | baseline RSS | peak RSS | RSS delta | max process RSS | peak processes | seen processes | duration | command |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ]

  for (const step of report.steps) {
    lines.push([
      step.local ? `${step.name} (local)` : step.name,
      String(step.exitCode),
      String(step.summary.count),
      `${step.summary.baselineRssMb}MB`,
      `${step.summary.peakRssMb}MB`,
      `${step.summary.rssDeltaMb}MB`,
      `${step.summary.peakMaxProcessRssMb}MB`,
      String(step.summary.peakProcessCount),
      String(step.summary.uniqueProcessCount),
      formatDuration(step.summary.durationMs),
      `\`${commandText(step.command)}\``,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }

  if (report.error) {
    lines.push('', '## 失败与取消', '', '```text', report.error, '```')
  }
  lines.push('')
  lines.push('## 峰值进程')
  lines.push('')
  lines.push('| step | peak RSS | peak processes | seen processes | top process RSS | command |')
  lines.push('| --- | ---: | ---: | ---: | ---: | --- |')
  for (const step of report.steps) {
    const topProcesses = step.summary.peakSample?.topProcesses ?? []
    if (topProcesses.length === 0) {
      lines.push(`| ${step.name} | ${step.summary.peakRssMb}MB | ${step.summary.peakProcessCount} | ${step.summary.uniqueProcessCount} | - | - |`)
      continue
    }
    for (const processSample of topProcesses.slice(0, 3)) {
      lines.push([
        step.name,
        `${step.summary.peakRssMb}MB`,
        String(step.summary.peakProcessCount),
        String(step.summary.uniqueProcessCount),
        `${processSample.rssMb}MB`,
        processSample.command ? `\`${processSample.command.replaceAll('|', '\\|')}\`` : `pid=${processSample.pid}`,
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push('')
  return lines.join('\n')
}

export async function writeDemoE2eMemoryReport(options: {
  report: DemoE2eMemoryReport
  outDir?: string
}): Promise<WriteReportResult> {
  const outDir = options.outDir
    ? path.resolve(options.outDir)
    : path.resolve(options.report.repositoryRoot, 'e2e', '.artifacts', 'demo-e2e-memory')
  await mkdir(outDir, { recursive: true })
  const jsonFile = path.join(outDir, 'demo-e2e-memory-report.json')
  const markdownFile = path.join(outDir, 'demo-e2e-memory-report.md')
  await writeFile(jsonFile, `${JSON.stringify(options.report, null, 2)}\n`, 'utf8')
  await writeFile(markdownFile, renderDemoE2eMemoryMarkdown(options.report), 'utf8')
  return { jsonFile, markdownFile }
}
