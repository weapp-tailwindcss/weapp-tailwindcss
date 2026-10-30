import type { runMemoryProbe } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/probe'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { samplePosixProcessTreeMemory } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/posix'

const start = 'Thu Jan 1 00:00:00 2026'
const topology = [
  `1 0 1 ${start} S`,
  `20 1 20 ${start} S`,
  `21 20 20 ${start} S`,
  `22 21 20 ${start} S`,
  `23 20 20 ${start} Z`,
  `99 1 99 ${start} S`,
].join('\n')
const memory = [
  `20 1 102400 ${start} S node project  --watch`,
  `21 20 51200 ${start} S node child`,
  `22 21 25600 ${start} S node grandchild`,
].join('\n')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => vi.useRealTimers())

function fixture() {
  return vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockResolvedValueOnce(memory)
}

it('只读取全表轻量身份，仅向目标树查询 RSS 和命令，不查询无关进程或僵尸', async () => {
  const probe = fixture()
  const sample = await samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)
  expect(probe.mock.calls.map(call => call[1])).toEqual([
    ['-Ao', 'pid=,ppid=,pgid=,lstart=,stat='],
    ['-p', '20,21,22', '-o', 'pid=,ppid=,rss=,lstart=,stat=,command='],
  ])
  expect(probe.mock.calls.every(call => call[2].launchOptions?.env?.LC_ALL === 'C')).toBe(true)
  expect(probe.mock.calls.map(call => call[2].diagnosticContext)).toEqual([
    { query: 'posix-topology', rootPid: 20 },
    { query: 'posix-memory', rootPid: 20 },
  ])
  expect(sample).toEqual({
    rssMb: 175,
    maxProcessRssMb: 100,
    processCount: 3,
    collection: { method: 'posix-tree-two-pass-v1', topologyStartedAt: 0, topologyCompletedAt: 0, memoryStartedAt: 0, memoryCompletedAt: 0 },
    topProcesses: [
      { pid: 20, ppid: 1, rssMb: 100, command: 'node project  --watch' },
      { pid: 21, ppid: 20, rssMb: 50, command: 'node child' },
      { pid: 22, ppid: 21, rssMb: 25, command: 'node grandchild' },
    ],
  })
})

it('两次查询共用原绝对预算，不为第二次查询续借一秒', async () => {
  const probe = vi.fn<typeof runMemoryProbe>()
    .mockImplementationOnce(async () => {
      vi.setSystemTime(600)
      return topology
    })
    .mockResolvedValueOnce(memory)
  const sample = await samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)
  expect(probe.mock.calls.map(call => call[2].timeoutMs)).toEqual([1000, 400])
  expect(sample.collection).toEqual({ method: 'posix-tree-two-pass-v1', topologyStartedAt: 0, topologyCompletedAt: 600, memoryStartedAt: 600, memoryCompletedAt: 600 })
})

it('拓扑已耗尽预算时不再启动内存查询', async () => {
  const probe = vi.fn<typeof runMemoryProbe>().mockImplementationOnce(async () => {
    vi.setSystemTime(1000)
    return topology
  })
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('absolute deadline')
  expect(probe).toHaveBeenCalledOnce()
})

it('统计迟到时仍拒绝样本，不返回零值或部分成功', async () => {
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockImplementationOnce(async () => {
    vi.setSystemTime(1000)
    return memory
  })
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('absolute deadline')
})

it('拓扑查询失败或未确认回收时不再启动第二个探针', async () => {
  const error = new Error('close not confirmed')
  const probe = vi.fn<typeof runMemoryProbe>().mockRejectedValueOnce(error)
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toBe(error)
  expect(probe).toHaveBeenCalledOnce()
})

it('拓扑完成后的取消阻断内存查询', async () => {
  const controller = new AbortController()
  const error = new Error('stop')
  const probe = vi.fn<typeof runMemoryProbe>().mockImplementationOnce(async () => {
    controller.abort(error)
    return topology
  })
  await expect(samplePosixProcessTreeMemory(20, controller.signal, 1000, probe)).rejects.toBe(error)
  expect(probe).toHaveBeenCalledOnce()
})

it('根进程缺失时不查询内存，不能把无关进程当作目标树', async () => {
  const probe = fixture()
  await expect(samplePosixProcessTreeMemory(100, new AbortController().signal, 1000, probe)).rejects.toThrow('root process is unavailable')
  expect(probe).toHaveBeenCalledOnce()
})

it.each([
  memory.replace('20 1 102400', '20 9 102400'),
  memory.replace(`20 1 102400 ${start}`, '20 1 102400 Thu Jan 1 00:00:01 2026'),
  `${memory}\n${memory.split('\n')[0]}`,
  `${memory}\n99 1 999999 ${start} S unrelated`,
])('两次查询间父身份改变、PID 复用、重复或额外行均拒绝', async (output) => {
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockResolvedValueOnce(output)
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('identity changed')
})

it('根进程在两次查询间退出时拒绝样本', async () => {
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockResolvedValueOnce(memory.split('\n').slice(1).join('\n'))
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('root process disappeared')
})

it('已退出后代的缺行不伪造零值，仍只统计实际匹配的进程', async () => {
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockResolvedValueOnce(memory.split('\n')[0]!)
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).resolves.toMatchObject({ processCount: 1, rssMb: 100 })
})

it('第二次读取仍须保留到根的完整活父链，不能计入已断开的孙进程', async () => {
  const output = memory.split('\n').filter((_, index) => index !== 1).join('\n')
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockResolvedValueOnce(output)
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('live parent chain')
})

it('根进程在统计时变成僵尸也必须拒绝', async () => {
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockResolvedValueOnce(memory.replace(`${start} S node project`, `${start} Z node project`))
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('root process became a zombie')
})

it('僵尸后代不计入内存，仍有活后代时不能接受断链树', async () => {
  const output = memory.replace(`${start} S node child`, `${start} Z node child`)
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockResolvedValueOnce(output)
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('live parent chain')
  const leaf = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(topology).mockResolvedValueOnce(memory.replace(`${start} S node grandchild`, `${start} Z node grandchild`))
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, leaf)).resolves.toMatchObject({ processCount: 2, rssMb: 150 })
})

it('拓扑中的重复 PID 不得静默覆盖成另一个身份', async () => {
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(`${topology}\n20 9 20 ${start} S`)
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('duplicate topology identities')
  expect(probe).toHaveBeenCalledOnce()
})

it('父进程出生晚于其后代的拓扑不能被静默裁剪后接受', async () => {
  const changed = topology.replace(`20 1 20 ${start}`, '20 1 20 Thu Jan 1 00:00:01 2026')
  const probe = vi.fn<typeof runMemoryProbe>().mockResolvedValueOnce(changed)
  await expect(samplePosixProcessTreeMemory(20, new AbortController().signal, 1000, probe)).rejects.toThrow('child older than its parent')
  expect(probe).toHaveBeenCalledOnce()
})
