import type { MemoryProcessSample, MemoryUsageSample } from '../types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { runMemoryProbe } from './probe'

interface ProcessTreeRow {
  pid: number
  ppid: number
  rssKb: number
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

function parseProcessTreeMemoryOnPosix(rootPid: number, stdout: string): Omit<MemoryUsageSample, 'at'> | undefined {
  const rows: ProcessTreeRow[] = []
  for (const line of stdout.split(/\r?\n/)) {
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
    '$ErrorActionPreference = "Stop"',
    '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    `$root = [int]${escapedRootPid}`,
    `$repositoryRoot = '${cwd.replaceAll('\'', '\'\'')}'`,
    '$watchCommandPatterns = @("weapp-vite(?:\\.js)?\\s+dev", "taro-build-guard\\.mjs\\s+--watch", "taro-build-runner\\.mjs\\s+build\\s+--type\\s+h5\\s+--watch", "taro-build-runner\\.mjs\\s+build\\s+--type\\s+\\S+\\s+--watch", "run-mpx-cli-service\\.js\\s+serve", "webpack(?:\\.js)?\\s+--watch", "gulp[\\s\\S]+gulpfile\\.ts", "\\bpnpm\\b[\\s\\S]+build:weapp[\\s\\S]+--watch", "hbuilderx[\\s\\S]+launch[\\s\\S]+mp-weixin", "uni\\.js[\\s\\S]+-p\\s+mp-weixin")',
    '$processes = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,CommandLine | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine)',
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
    '  $processId = [int]$current.ProcessId',
    '  if ($tracked.ContainsKey($processId)) { continue }',
    '  $tracked[$processId] = $current',
    '  if ($children.ContainsKey($processId)) { foreach ($child in $children[$processId]) { [void]$stack.Add($child) } }',
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

function parseProcessTreeMemoryOnWindows(stdout: string): Omit<MemoryUsageSample, 'at'> | undefined {
  try {
    const parsed = JSON.parse(stdout.trim()) as Partial<Omit<MemoryUsageSample, 'at'>>
    if (
      typeof parsed.rssMb !== 'number' || !Number.isFinite(parsed.rssMb) || parsed.rssMb < 0
      || typeof parsed.maxProcessRssMb !== 'number' || !Number.isFinite(parsed.maxProcessRssMb) || parsed.maxProcessRssMb < 0
      || typeof parsed.processCount !== 'number' || !Number.isInteger(parsed.processCount) || parsed.processCount <= 0
    ) {
      return undefined
    }
    const topProcesses = normalizeWindowsTopProcesses(parsed.topProcesses)
    return {
      rssMb: parsed.rssMb,
      maxProcessRssMb: parsed.maxProcessRssMb,
      processCount: parsed.processCount,
      ...(topProcesses.length > 0 ? { topProcesses } : {}),
    }
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
      const item = row as Partial<MemoryProcessSample>
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

/** 异步采集进程树内存；探针数据不能作为进程归属或清理依据。 */
export async function sampleProcessTreeMemory(rootPid: number | undefined, signal: AbortSignal, cwd = process.cwd()): Promise<MemoryUsageSample> {
  if (rootPid == null) {
    throw new Error('memory probe root process is unavailable')
  }
  const windows = process.platform === 'win32'
  const timeoutMs = windows ? 5000 : 1000
  const expiresAt = Date.now() + timeoutMs
  const command = windows ? 'powershell' : 'ps'
  const args = windows
    ? ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(createWindowsProcessTreeMemoryScript(rootPid, cwd), 'utf16le').toString('base64')]
    : ['-Ao', 'pid=,ppid=,rss=,command=']
  const stdout = await runMemoryProbe(command, args, { signal, timeoutMs })
  const sample = windows ? parseProcessTreeMemoryOnWindows(stdout) : parseProcessTreeMemoryOnPosix(rootPid, stdout)
  if (Date.now() >= expiresAt) {
    throw new Error(`memory probe exceeded ${timeoutMs}ms deadline before sample acceptance`)
  }
  if (!sample || sample.processCount === 0) {
    throw new Error('memory probe did not return a valid process tree sample')
  }
  return { at: Date.now(), ...sample }
}
