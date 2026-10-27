import { spawnSync } from 'node:child_process'
import process from 'node:process'

const POSIX_ROW_RE = /^\s*(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S.*))?$/
const POSIX_METADATA_RE = /^(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(\S.*)$/

export function parsePosixRows(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = POSIX_ROW_RE.exec(line.trim())
    if (!match) {
      return []
    }
    const pid = Number(match[1])
    const ppid = Number(match[2])
    const rssKb = Number(match[3])
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !Number.isFinite(rssKb)) {
      return []
    }
    const metadata = POSIX_METADATA_RE.exec(match[4] ?? '')
    return [{ pid, ppid, rssKb, startedAt: metadata?.[1] ?? 'unknown', command: metadata?.[2] ?? 'unknown' }]
  })
}

export function selectDescendantRows(rows, rootPid) {
  const childrenByParent = new Map()
  const byPid = new Map()
  for (const row of rows) {
    byPid.set(row.pid, row)
    const children = childrenByParent.get(row.ppid) ?? []
    children.push(row)
    childrenByParent.set(row.ppid, children)
  }
  const tracked = new Map()
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

function samplePosix(rootPid) {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid=,rss=,lstart=,comm='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, LC_ALL: 'C' },
  })
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return undefined
  }
  const rows = selectDescendantRows(parsePosixRows(result.stdout), rootPid)
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
    rows,
  }
}

export function parseWindowsSample(output, at = Date.now()) {
  const parsed = JSON.parse(output.trim())
  if (typeof parsed.rssMb !== 'number') {
    return undefined
  }
  return { ...parsed, at, rows: [].concat(parsed.rows ?? []) }
}

function sampleWindows(rootPid) {
  const script = [
    `$root = ${rootPid}`,
    '$processes = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,Name,CreationDate',
    '$children = @{}',
    'foreach ($process in $processes) { $parent = [int]$process.ParentProcessId; if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }; $children[$parent] += $process }',
    '$tracked = @{}',
    '$stack = New-Object System.Collections.ArrayList',
    '$rootProcess = $processes | Where-Object { [int]$_.ProcessId -eq $root } | Select-Object -First 1',
    'if ($null -ne $rootProcess) { $tracked[[int]$rootProcess.ProcessId] = $rootProcess }',
    'if ($children.ContainsKey($root)) { foreach ($child in $children[$root]) { [void]$stack.Add($child) } }',
    'while ($stack.Count -gt 0) { $current = $stack[$stack.Count - 1]; $stack.RemoveAt($stack.Count - 1); $processId = [int]$current.ProcessId; if ($tracked.ContainsKey($processId)) { continue }; $tracked[$processId] = $current; if ($children.ContainsKey($processId)) { foreach ($child in $children[$processId]) { [void]$stack.Add($child) } } }',
    '$total = 0; $max = 0; $rows = @()',
    'foreach ($process in $tracked.Values) { $workingSet = if ($null -eq $process.WorkingSetSize) { 0 } else { [double]$process.WorkingSetSize }; $total += $workingSet; if ($workingSet -gt $max) { $max = $workingSet }; $startedAt = if ($null -eq $process.CreationDate) { "unknown" } else { $process.CreationDate.ToUniversalTime().ToString("o") }; $rows += @{ pid = [int]$process.ProcessId; ppid = [int]$process.ParentProcessId; rssKb = $workingSet / 1KB; startedAt = $startedAt; command = [string]$process.Name } }',
    '[Console]::Out.WriteLine((@{ rssMb = [int][Math]::Round($total / 1MB); maxProcessRssMb = [int][Math]::Round($max / 1MB); processCount = [int]$tracked.Count; rows = @($rows) } | ConvertTo-Json -Depth 4 -Compress))',
  ].join('; ')
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  })
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return undefined
  }
  try {
    return parseWindowsSample(result.stdout)
  }
  catch {
    return undefined
  }
}

export function sampleProcessTree(pid, platform = process.platform) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return undefined
  }
  return platform === 'win32' ? sampleWindows(pid) : samplePosix(pid)
}

export function createPeakSnapshot(sample) {
  const rows = [...sample.rows].sort((a, b) => b.rssKb - a.rssKb || a.pid - b.pid).slice(0, 20).map(row => ({
    pid: row.pid,
    ppid: row.ppid,
    rssMb: Math.round(row.rssKb / 1024),
    startedAt: String(row.startedAt).slice(0, 64),
    command: String(row.command).replaceAll(/[\r\n\t]/g, ' ').slice(0, 160),
  }))
  return { at: sample.at, omittedProcessCount: Math.max(0, sample.processCount - rows.length), rows }
}
