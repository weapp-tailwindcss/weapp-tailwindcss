import process from 'node:process'
import { runProcessCommand } from './process-command'

export interface ProcessIdentity {
  pid: number
  parent: number
  group: number
  started: string
  zombie?: boolean
}

export function parsePosixProcesses(output: string): ProcessIdentity[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const normalized = line.trim()
    if (!normalized) {
      return []
    }
    const columns = normalized.split(/\s+/)
    const [pid, parent, group] = columns.slice(0, 3).map(Number)
    const started = columns.slice(3, 8).join(' ')
    if (columns.length !== 9 || !Number.isInteger(pid) || !Number.isInteger(parent) || !Number.isInteger(group) || !Number.isFinite(Date.parse(started))) {
      throw new Error('POSIX 进程身份表无效，不能确认子树已结束。')
    }
    return [{ pid: pid!, parent: parent!, group: group!, started, zombie: columns[8]!.startsWith('Z') }]
  })
}

export async function readProcessTable(timeoutMs = 5000, signal?: AbortSignal): Promise<ProcessIdentity[]> {
  const windows = process.platform === 'win32'
  let output: string
  try {
    output = await runProcessCommand(windows ? 'powershell' : 'ps', windows
      ? ['-NoProfile', '-Command', '$rows = @(Get-CimInstance Win32_Process | Where-Object { $null -ne $_.CreationDate } | ForEach-Object { @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; group = 0; started = $_.CreationDate.ToUniversalTime().ToString("o") } }); ConvertTo-Json -InputObject $rows -Compress']
      : ['-A', '-o', 'pid=,ppid=,pgid=,lstart=,stat='], timeoutMs, signal)
  }
  catch (error) {
    throw new Error(`无法确认本轮子进程归属：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  if (!windows) {
    return parsePosixProcesses(output)
  }
  const rows: unknown = JSON.parse(output.trim())
  if (!Array.isArray(rows) || rows.some(row => !Number.isInteger(row.pid) || !Number.isInteger(row.parent) || typeof row.started !== 'string' || !Number.isFinite(Date.parse(row.started)))) {
    throw new Error('Windows 进程身份表无效，不能确认子树已结束。')
  }
  return rows
}

/**
 * 子进程已经退出后只读取本轮已确认的进程组和身份锚，避免高负载下再次扫描整张系统进程表。
 * 独立进程组中的已登记后代通过 pids 保留身份校验；未登记的独立后代仍不在清理范围内。
 */
export async function readProcessSubset(group: number | undefined, pids: readonly number[], timeoutMs = 5000, signal?: AbortSignal): Promise<ProcessIdentity[]> {
  if (process.platform === 'win32') {
    const values = [...new Set(pids)].filter(Number.isInteger)
    if (!values.length) {
      return []
    }
    let output: string
    try {
      output = await runProcessCommand('powershell', [
        '-NoProfile',
        '-Command',
        `$ids = @(${values.join(',')}); $filter = [string]::Join(' OR ', ($ids | ForEach-Object { "ProcessId = $_" })); $rows = @(Get-CimInstance Win32_Process -Filter $filter | Where-Object { $null -ne $_.CreationDate } | ForEach-Object { @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; group = 0; started = $_.CreationDate.ToUniversalTime().ToString("o") } }); ConvertTo-Json -InputObject @($rows) -Compress`,
      ], timeoutMs, signal)
    }
    catch (error) {
      throw new Error(`无法确认本轮子进程身份：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    const parsed: unknown = JSON.parse(output.trim() || '[]')
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    if (rows.some(row => !Number.isInteger(row.pid) || !Number.isInteger(row.parent) || typeof row.started !== 'string' || !Number.isFinite(Date.parse(row.started)))) {
      throw new Error('Windows 进程身份子集无效，不能确认子树已结束。')
    }
    return rows
  }
  const filters: string[] = []
  if (group !== undefined) {
    filters.push('-g', String(group))
  }
  const values = [...new Set(pids)].filter(Number.isInteger)
  if (values.length) {
    filters.push('-p', values.join(','))
  }
  if (!filters.length) {
    return []
  }
  let output: string
  try {
    output = await runProcessCommand('ps', [...filters, '-o', 'pid=,ppid=,pgid=,lstart=,stat='], timeoutMs, signal)
  }
  catch (error) {
    throw new Error(`无法确认本轮子进程身份：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  return parsePosixProcesses(output)
}

/** 仅从本轮仍匹配的身份和独立组扩展后代，不按命令名或工作目录猜测。 */
export function collectOwnedProcesses(rows: ProcessIdentity[], owned: Map<number, ProcessIdentity>, group?: number) {
  const live = new Map(rows.filter(row => !row.zombie).map(row => [row.pid, row]))
  const selected = new Map<number, ProcessIdentity>()
  for (const [pid, previous] of owned) {
    const current = live.get(pid)
    if (current?.started === previous.started) {
      selected.set(pid, current)
    }
  }
  const anchor = group ? [...selected.values()].find(row => row.group === group) : undefined
  if (anchor) {
    for (const row of live.values()) {
      if (row.group === group && Date.parse(row.started) >= Date.parse(anchor.started)) {
        selected.set(row.pid, row)
      }
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const row of live.values()) {
      const parent = selected.get(row.parent)
      if (parent && Date.parse(row.started) >= Date.parse(parent.started) && !selected.has(row.pid)) {
        selected.set(row.pid, row)
        changed = true
      }
    }
  }
  return selected
}
