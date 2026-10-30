import type { ProcessCommandOwner } from './process-command'
import type { ProcessIdentity } from './process-table'
import { runWithCleanup } from '../e2e-preflight/cleanup'
import { createProcessCommandOwner, runProcessCommand } from './process-command'
import { readProcessSubset } from './process-table'

export interface ProcessTopology {
  pid: number
  parent: number
  group: number
}

export interface ProcessScope {
  rootPid: number
  knownPids: readonly number[]
  group?: number
}

export interface ProcessScopeSource {
  topology: (timeoutMs: number, signal?: AbortSignal) => Promise<ProcessTopology[]>
  identities: (pids: readonly number[], timeoutMs: number, signal?: AbortSignal) => Promise<ProcessIdentity[]>
}

/** 全局发现只读取关系字段，出生身份和状态仅从候选子树读取。 */
export function parsePosixTopology(output: string): ProcessTopology[] {
  const seen = new Set<number>()
  return output.split(/\r?\n/).flatMap((line) => {
    const normalized = line.trim()
    if (!normalized) {
      return []
    }
    const columns = normalized.split(/\s+/)
    const [pid, parent, group] = columns.map(Number)
    if (columns.length !== 3 || !Number.isInteger(pid) || pid! <= 0 || !Number.isInteger(parent) || parent! < 0 || !Number.isInteger(group) || group! < 0 || seen.has(pid!)) {
      throw new Error('POSIX 进程关系表无效，不能确认本轮子树。')
    }
    seen.add(pid!)
    return [{ pid: pid!, parent: parent!, group: group! }]
  })
}

function candidates(rows: ProcessTopology[], scope: ProcessScope) {
  // 旧身份只是发现入口；领取归属仍由后续出生身份核验决定。
  const pids = new Set([scope.rootPid, ...scope.knownPids])
  for (const row of rows) {
    if (scope.group !== undefined && row.group === scope.group) {
      pids.add(row.pid)
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (pids.has(row.parent) && !pids.has(row.pid)) {
        pids.add(row.pid)
        changed = true
      }
    }
  }
  return pids
}

function frontier(rows: ProcessTopology[], pids: ReadonlySet<number>) {
  return new Map(rows.filter(row => pids.has(row.pid)).map(row => [row.pid, row]))
}

function sameTopology(before: Map<number, ProcessTopology>, after: Map<number, ProcessTopology>) {
  return before.size === after.size && [...before].every(([pid, row]) => {
    const current = after.get(pid)
    return current?.parent === row.parent && current.group === row.group
  })
}

/**
 * 同一截止内复核候选闭包；关系变化只要求重采，不把 reparent 或切组当作 PID 复用。
 * PID 只是保守的发现入口，可能包含复用后的无关分支；归属必须另经原出生身份匹配。
 * 任意两个观测点之间出生且失去全部活锚的未登记 double-fork 仍不在确认范围。
 */
export async function readStableProcessScope(scope: ProcessScope, source: ProcessScopeSource, deadline: () => number, signal?: AbortSignal): Promise<ProcessIdentity[]> {
  const remaining = () => {
    signal?.throwIfAborted()
    const budget = deadline() - Date.now()
    if (!Number.isFinite(budget) || budget <= 1) {
      throw new Error('进程归属扫描预算已耗尽，禁止继续调度。')
    }
    return budget
  }
  const assertCurrent = () => {
    signal?.throwIfAborted()
    if (Date.now() > deadline()) {
      throw new Error('进程归属扫描结果超过截止时间，不能更新身份。')
    }
  }
  let topology = await source.topology(remaining(), signal)
  assertCurrent()
  while (true) {
    const pids = candidates(topology, scope)
    const ids = [...pids]
    const rows: ProcessIdentity[] = []
    // 有界参数长度；每批都重新领取同一截止的剩余时间。
    for (let offset = 0; offset < ids.length; offset += 256) {
      rows.push(...await source.identities(ids.slice(offset, offset + 256), remaining(), signal))
      assertCurrent()
    }
    if (ids.length > 256) {
      // 分批详情不能把早批旧父身份与晚批新子代拼为可信亲缘帧。
      const byPid = new Map(rows.map(row => [row.pid, row]))
      const anchors = [...new Set([scope.rootPid, ...scope.knownPids, ...rows.map(row => row.parent)])].filter(pid => byPid.has(pid))
      const checked = new Map<number, ProcessIdentity>()
      for (let offset = 0; offset < anchors.length; offset += 256) {
        const part = anchors.slice(offset, offset + 256)
        for (const row of await source.identities(part, remaining(), signal)) {
          if (!part.includes(row.pid) || checked.has(row.pid)) {
            throw new Error('分批身份复核越界或重复，不能确认本轮亲缘。')
          }
          checked.set(row.pid, row)
        }
        assertCurrent()
      }
      if (anchors.some(pid => checked.get(pid)?.started !== byPid.get(pid)!.started || checked.get(pid)?.zombie)) {
        throw new Error('分批详情期间出生身份锚改变或退出，不能合并本轮亲缘。')
      }
    }
    const next = await source.topology(remaining(), signal)
    assertCurrent()
    const nextPids = candidates(next, scope)
    const nextByPid = new Map(next.map(row => [row.pid, row]))
    if ([...pids].some(pid => nextByPid.has(pid) && !nextPids.has(pid))) {
      // 已见新后代仍存活却失去发现锚时，重采不能把它静默丢成空归属。
      throw new Error('已观察候选仍存在却失去全部发现锚，不能确认子树已结束。')
    }
    const before = frontier(topology, pids)
    const after = frontier(next, nextPids)
    if (!sameTopology(before, after)) {
      topology = next
      continue
    }
    const seen = new Set<number>()
    let changed = false
    for (const row of rows) {
      if (!pids.has(row.pid) || seen.has(row.pid)) {
        throw new Error('候选身份结果越界或重复，不能确认本轮子树。')
      }
      seen.add(row.pid)
      const current = after.get(row.pid)
      if (!current || current.parent !== row.parent || current.group !== row.group) {
        changed = true
      }
    }
    if (changed) {
      topology = next
      continue
    }
    if ([...after.keys()].some(pid => !seen.has(pid))) {
      // 拓扑仍存在的候选不能因为详情少行而被误判为已经退出。
      throw new Error('候选进程仍在关系表中却缺少出生身份，不能确认子树已结束。')
    }
    assertCurrent()
    return rows
  }
}

/** 每轮独占并排空探针回执；未确认回收只锁存首错，不累积已结束轮次的历史。 */
export function createProcessScanScope() {
  let terminal: unknown
  return async <T>(operation: (owner: ProcessCommandOwner) => Promise<T>): Promise<T> => {
    if (terminal !== undefined) {
      throw terminal
    }
    const owner = createProcessCommandOwner()
    return await runWithCleanup(() => operation(owner), async () => {
      try {
        await owner.close()
      }
      catch (error) {
        terminal ??= error
        throw error
      }
    })
  }
}

/** 保留原查询预算；不读取无关进程的出生、状态、RSS 或命令行。 */
export async function readPosixProcessScope(scope: ProcessScope, deadline: () => number, signal?: AbortSignal, suppliedOwner?: ProcessCommandOwner) {
  const read = (owner: ProcessCommandOwner) => readStableProcessScope(scope, {
    topology: async (timeoutMs, requestSignal) => parsePosixTopology(await runProcessCommand('ps', ['-A', '-o', 'pid=,ppid=,pgid='], timeoutMs, requestSignal, { owner })),
    identities: (pids, timeoutMs, requestSignal) => readProcessSubset(undefined, pids, timeoutMs, requestSignal, undefined, owner),
  }, deadline, signal)
  return suppliedOwner ? await read(suppliedOwner) : await createProcessScanScope()(read)
}
