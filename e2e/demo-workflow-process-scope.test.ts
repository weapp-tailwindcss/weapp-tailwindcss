import type { ProcessScope, ProcessScopeSource, ProcessTopology } from '../scripts/demo-e2e-workflow/process-scope'
import type { ProcessIdentity } from '../scripts/demo-e2e-workflow/process-table'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as commands from '../scripts/demo-e2e-workflow/process-command'
import { createProcessScanScope, parsePosixTopology, readPosixProcessScope, readStableProcessScope } from '../scripts/demo-e2e-workflow/process-scope'
import { collectOwnedProcesses } from '../scripts/demo-e2e-workflow/process-table'
import * as processTable from '../scripts/demo-e2e-workflow/process-table'

const row = (pid: number, parent: number, group: number, second = 10): ProcessIdentity => ({ pid, parent, group, started: `2026-10-04T12:00:${second}Z` })
const root = row(100, 1, 100)
const child = row(200, 100, 200, 11)
function topology(rows: ProcessIdentity[]): ProcessTopology[] {
  return rows.map(({ pid, parent, group }) => ({ pid, parent, group }))
}
const scope: ProcessScope = { rootPid: 100, knownPids: [100], group: 100 }
function deadline() {
  const at = Date.now() + 5000
  return () => at
}
function source(rows: ProcessIdentity[]) {
  return {
    topology: vi.fn<ProcessScopeSource['topology']>().mockResolvedValue(topology(rows)),
    identities: vi.fn<ProcessScopeSource['identities']>().mockImplementation(async pids => rows.filter(row => pids.includes(row.pid))),
  }
}
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('任务子树只读取候选身份并复核发现边界', () => {
  it('无关进程只出现在轻拓扑，不读取其出生身份', async () => {
    const probe = source([root, row(500, 1, 500)])
    expect(await readStableProcessScope(scope, probe, deadline())).toEqual([root])
    expect(probe.identities.mock.calls[0]?.[0]).toEqual([100])
    expect(probe.topology).toHaveBeenCalledTimes(2)
  })

  it('身份查询期间出生的新独立组后代在同一截止内加入候选闭包', async () => {
    const probe = source([root, child])
    probe.topology.mockResolvedValueOnce(topology([root]))
    probe.identities.mockResolvedValueOnce([root])
    expect(await readStableProcessScope(scope, probe, deadline())).toEqual([root, child])
    expect(probe.identities).toHaveBeenCalledTimes(2)
    expect(probe.identities.mock.calls[1]?.[0]).toEqual([100, 200])
  })

  it('根退出后从已登记独立组活锚发现它新建的另一独立组后代', async () => {
    const anchor = { ...child, parent: 1 }
    const descendant = row(300, 200, 300, 12)
    const rows = await readStableProcessScope({ ...scope, knownPids: [200] }, source([anchor, descendant]), deadline())
    expect([...collectOwnedProcesses(rows, new Map([[200, child]]), 100).keys()]).toEqual([200, 300])
  })

  it('已登记进程合法 reparent 和切组后仍可按原出生身份保留', async () => {
    const current = { ...child, parent: 1, group: 300 }
    const probe = source([current])
    probe.topology.mockResolvedValueOnce(topology([child]))
    probe.identities.mockResolvedValueOnce([child])
    const rows = await readStableProcessScope({ ...scope, knownPids: [200] }, probe, deadline())
    expect([...collectOwnedProcesses(rows, new Map([[200, child]])).keys()]).toEqual([200])
    expect(probe.identities).toHaveBeenCalledTimes(2)
  })

  it('本轮新见独立组后代仍在却失去活锚时拒绝，不能重采成空归属', async () => {
    const probe = source([root, child])
    probe.topology.mockResolvedValueOnce(topology([root, child])).mockResolvedValue(topology([{ ...child, parent: 1 }]))
    await expect(readStableProcessScope(scope, probe, deadline())).rejects.toThrow('失去全部发现锚')
    expect(probe.identities).toHaveBeenCalledOnce()
  })

  it('旧 root PID 复用只扩大只读候选，不凭历史父关系领取新进程', async () => {
    const reused = { ...root, started: '2026-10-04T12:00:20Z' }
    const unrelated = row(300, 100, 300, 21)
    const rows = await readStableProcessScope(scope, source([reused, unrelated]), deadline())
    expect(rows.map(row => row.pid)).toEqual([100, 300])
    expect(collectOwnedProcesses(rows, new Map([[100, root]]), 100).size).toBe(0)
  })

  it('仍存在但已无匹配出生锚的原 PGID 行保留给 tracker 拒绝重新认领', async () => {
    const reused = { ...root, started: '2026-10-04T12:00:20Z' }
    const groupMember = row(300, 1, 100, 21)
    const rows = await readStableProcessScope(scope, source([reused, groupMember]), deadline())
    expect(rows.filter(row => row.group === 100)).toHaveLength(2)
    expect(collectOwnedProcesses(rows, new Map([[100, root]]), 100).size).toBe(0)
  })

  it('详情与关系表的 PPID 不一致必须重采，不能过滤成干净结果', async () => {
    const probe = source([root, child])
    probe.identities.mockResolvedValueOnce([root, { ...child, parent: 1 }])
    expect(await readStableProcessScope(scope, probe, deadline())).toEqual([root, child])
    expect(probe.identities).toHaveBeenCalledTimes(2)
  })

  it('候选仍在拓扑中却缺少详情时拒绝，不宣称进程已经退出', async () => {
    const probe = source([root, child])
    probe.identities.mockResolvedValue([root])
    await expect(readStableProcessScope(scope, probe, deadline())).rejects.toThrow('缺少出生身份')
  })

  it('详情缺行且复核拓扑确认退出后才接受消失', async () => {
    const probe = source([root])
    probe.topology.mockResolvedValueOnce(topology([root, child]))
    expect(await readStableProcessScope(scope, probe, deadline())).toEqual([root])
    expect(probe.identities).toHaveBeenCalledTimes(2)
  })

  it('僵尸状态仍交给出生身份收集器判定，不把关系表当作存活依据', async () => {
    const zombie = { ...child, zombie: true }
    const rows = await readStableProcessScope(scope, source([root, zombie]), deadline())
    expect(collectOwnedProcesses(rows, new Map([[100, root]]), 100).has(200)).toBe(false)
  })

  it('拓扑首阶段耗尽原截止后不再启动详情查询', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const probe = source([root])
    probe.topology.mockImplementation(async () => {
      vi.setSystemTime(5000)
      return topology([root])
    })
    await expect(readStableProcessScope(scope, probe, () => 5000)).rejects.toThrow('预算已耗尽')
    expect(probe.identities).not.toHaveBeenCalled()
    expect(probe.topology).toHaveBeenCalledOnce()
  })

  it('拓扑、详情及复核均使用同一个固定截止的剩余预算', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const probe = source([root])
    probe.topology.mockImplementationOnce(async () => {
      vi.setSystemTime(1000)
      return topology([root])
    })
    probe.identities.mockImplementationOnce(async () => {
      vi.setSystemTime(4000)
      return [root]
    })
    expect(await readStableProcessScope(scope, probe, () => 5000)).toEqual([root])
    expect(probe.topology.mock.calls.map(call => call[0])).toEqual([5000, 1000])
    expect(probe.identities.mock.calls[0]?.[1]).toBe(4000)
  })

  it.each([100, 200])('分批详情期间父身份 %i 更替不能拼接早批旧锚与晚批新子代', async (anchorPid) => {
    const middle = row(200, 100, 200, 11)
    const rows = [root, middle, ...Array.from({ length: 255 }, (_, index) => row(201 + index, 200, 300, 30))]
    const probe = source(rows)
    let calls = 0
    probe.identities.mockImplementation(async (pids) => {
      calls += 1
      return rows.filter(row => pids.includes(row.pid)).map(row => calls > 2 && row.pid === anchorPid ? { ...row, started: '2026-10-04T12:00:20Z' } : row)
    })
    await expect(readStableProcessScope(scope, probe, deadline())).rejects.toThrow('出生身份锚改变')
    expect(probe.identities).toHaveBeenCalledTimes(3)
    expect(probe.identities.mock.calls[2]?.[0]).toEqual([100, 200])
  })

  it('取消在阶段间到达时不派下一条探针', async () => {
    const controller = new AbortController()
    const probe = source([root])
    probe.topology.mockImplementationOnce(async () => {
      controller.abort(new Error('本轮取消'))
      return topology([root])
    })
    await expect(readStableProcessScope(scope, probe, deadline(), controller.signal)).rejects.toThrow('本轮取消')
    expect(probe.identities).not.toHaveBeenCalled()
  })

  it('实际查询只全局读取关系字段，候选详情及拓扑共享传入归属域', async () => {
    const command = vi.spyOn(commands, 'runProcessCommand').mockResolvedValue('100 1 100\n500 1 500\n')
    const subset = vi.spyOn(processTable, 'readProcessSubset').mockResolvedValue([root])
    const owner = commands.createProcessCommandOwner()
    expect(await readPosixProcessScope(scope, deadline(), undefined, owner)).toEqual([root])
    expect(command.mock.calls.every(call => JSON.stringify(call[1]) === JSON.stringify(['-A', '-o', 'pid=,ppid=,pgid=']))).toBe(true)
    expect(command.mock.calls.every(call => call[4]?.owner === owner)).toBe(true)
    expect(subset).toHaveBeenCalledWith(undefined, [100], expect.any(Number), undefined, undefined, owner)
    await owner.close()
  })

  it('普通扫描失败已确认回收后允许清理轮次，各轮 owner 独立排空', async () => {
    const original = commands.createProcessCommandOwner
    const owners: ReturnType<typeof original>[] = []
    const create = vi.spyOn(commands, 'createProcessCommandOwner').mockImplementation(() => {
      const owner = original()
      owners.push(owner)
      return owner
    })
    const run = createProcessScanScope()
    const failure = new Error('普通查询已退出，但结果失败')
    await expect(run(async () => {
      throw failure
    })).rejects.toBe(failure)
    await expect(run(async () => 'cleanup')).resolves.toBe('cleanup')
    expect(create).toHaveBeenCalledTimes(2)
    expect(owners[0]).not.toBe(owners[1])
    expect(owners.every(owner => owner.diagnostics().closed)).toBe(true)
  })

  it('某轮未确认回收后锁存首错，后续轮次在新建 owner/探针前拒绝', async () => {
    const owner = commands.createProcessCommandOwner()
    const terminal = new Error('探针 close 未确认')
    vi.spyOn(owner, 'close').mockRejectedValue(terminal)
    const create = vi.spyOn(commands, 'createProcessCommandOwner').mockReturnValue(owner)
    const operation = vi.fn(async () => 'unexpected')
    const run = createProcessScanScope()
    await expect(run(async () => 'first')).rejects.toBe(terminal)
    await expect(run(operation)).rejects.toBe(terminal)
    expect(create).toHaveBeenCalledOnce()
    expect(operation).not.toHaveBeenCalled()
  })

  it.each(['100 1\n', '100 1 100\n100 1 100\n', '0 1 0\n'])('坏拓扑拒绝而非缩为空结果：%j', (output) => {
    expect(() => parsePosixTopology(output)).toThrow('关系表无效')
  })
})
