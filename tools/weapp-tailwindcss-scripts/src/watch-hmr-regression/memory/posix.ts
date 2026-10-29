import type { ProcessIdentity } from '../../../../../scripts/demo-e2e-workflow/process-table'
import type { MemoryUsageSample } from '../types'
import process from 'node:process'
import { parsePosixProcesses } from '../../../../../scripts/demo-e2e-workflow/process-table'
import { runMemoryProbe } from './probe'

type Probe = typeof runMemoryProbe

function selectTree(rows: ProcessIdentity[], rootPid: number) {
  if (new Set(rows.map(row => row.pid)).size !== rows.length) {
    throw new Error('memory probe returned duplicate topology identities')
  }
  const live = rows.filter(row => !row.zombie)
  const root = live.find(row => row.pid === rootPid)
  if (!root) {
    throw new Error('memory probe root process is unavailable')
  }
  const children = new Map<number, ProcessIdentity[]>()
  for (const row of live) {
    const siblings = children.get(row.parent) ?? []
    siblings.push(row)
    children.set(row.parent, siblings)
  }
  const selected = new Map<number, ProcessIdentity>([[rootPid, root]])
  const pending = [root]
  while (pending.length) {
    const parent = pending.pop()!
    for (const child of children.get(parent.pid) ?? []) {
      if (Date.parse(child.started) < Date.parse(parent.started)) {
        throw new Error('memory probe topology contains a child older than its parent')
      }
      if (!selected.has(child.pid)) {
        selected.set(child.pid, child)
        pending.push(child)
      }
    }
  }
  return selected
}

function parseMemoryRows(output: string, identities: Map<number, ProcessIdentity>, rootPid: number) {
  const measured = new Map<number, { pid: number, ppid: number, rssKb: number, command?: string }>()
  const seen = new Set<number>()
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }
    // 前九列是三个数字、五段 C locale 出生时间与状态；不扫描命令余部。
    const tokens: RegExpMatchArray[] = []
    for (const token of line.matchAll(/\S+/g)) {
      tokens.push(token)
      if (tokens.length === 9) {
        break
      }
    }
    const [pid, ppid, rssKb] = tokens.slice(0, 3).map(token => Number(token[0]))
    if (tokens.length !== 9 || !Number.isInteger(pid) || pid! <= 0 || !Number.isInteger(ppid) || ppid! < 0 || !Number.isFinite(rssKb) || rssKb! < 0) {
      throw new Error('memory probe returned an invalid process row')
    }
    const identity = identities.get(pid!)
    const started = tokens.slice(3, 8).map(token => token[0]).join(' ')
    if (!identity || seen.has(pid!) || identity.parent !== ppid || identity.started !== started) {
      throw new Error('memory probe process identity changed between topology and memory reads')
    }
    seen.add(pid!)
    if (tokens[8]![0].startsWith('Z')) {
      if (pid === rootPid) {
        throw new Error('memory probe root process became a zombie before memory acceptance')
      }
      continue
    }
    const last = tokens.at(-1)!
    const command = line.slice(last.index! + last[0].length).trim().slice(0, 240)
    measured.set(pid!, { pid: pid!, ppid: ppid!, rssKb: rssKb!, ...(command ? { command } : {}) })
  }
  if (!measured.has(rootPid)) {
    throw new Error('memory probe root process disappeared before memory acceptance')
  }
  for (const row of measured.values()) {
    const visited = new Set<number>()
    let current = row
    while (current.pid !== rootPid) {
      if (visited.has(current.pid) || !measured.has(current.ppid)) {
        throw new Error('memory probe measured process tree lost its live parent chain')
      }
      visited.add(current.pid)
      current = measured.get(current.ppid)!
    }
  }
  const rows = [...measured.values()]
  return {
    rssMb: Math.round(rows.reduce((total, row) => total + row.rssKb, 0) / 1024),
    maxProcessRssMb: Math.round(Math.max(...rows.map(row => row.rssKb)) / 1024),
    processCount: rows.length,
    topProcesses: rows.sort((a, b) => b.rssKb - a.rssKb).slice(0, 8).map(({ rssKb, ...row }) => ({ ...row, rssMb: Math.round(rssKb / 1024) })),
  }
}

/**
 * 先读取轻量拓扑，再仅查询该树的内存；两次查询共用原截止，身份或活父链不匹配即拒绝。
 * 出生时间使用 ps 的秒级精度；拓扑读取后新生的后代不属于本次查询集合。
 */
export async function samplePosixProcessTreeMemory(rootPid: number, signal: AbortSignal, expiresAt: number, probe: Probe = runMemoryProbe): Promise<Omit<MemoryUsageSample, 'at'>> {
  const read = (args: string[]) => {
    signal.throwIfAborted()
    const remaining = expiresAt - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) {
      throw new Error('memory probe exceeded its absolute deadline before query dispatch')
    }
    return probe('ps', args, { signal, timeoutMs: remaining, launchOptions: { env: { ...process.env, LC_ALL: 'C' } } })
  }
  const topologyStartedAt = Date.now()
  const topology = await read(['-Ao', 'pid=,ppid=,pgid=,lstart=,stat='])
  const topologyCompletedAt = Date.now()
  const identities = selectTree(parsePosixProcesses(topology), rootPid)
  const memoryStartedAt = Date.now()
  const output = await read(['-p', [...identities.keys()].join(','), '-o', 'pid=,ppid=,rss=,lstart=,stat=,command='])
  const memoryCompletedAt = Date.now()
  const result = parseMemoryRows(output, identities, rootPid)
  signal.throwIfAborted()
  if (Date.now() >= expiresAt) {
    throw new Error('memory probe exceeded its absolute deadline before sample acceptance')
  }
  return {
    ...result,
    collection: { method: 'posix-tree-two-pass-v1', topologyStartedAt, topologyCompletedAt, memoryStartedAt, memoryCompletedAt },
  }
}
