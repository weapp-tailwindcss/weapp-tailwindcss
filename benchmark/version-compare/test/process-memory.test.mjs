import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { parsePosixProcessRows, sampleProcessTree, selectProcessTreeRows, summarizeProcessMemory } from '../scripts/process-memory.mjs'

describe('进程树内存证据', () => {
  it('保留 macOS 空格路径和 Linux 命令名，拒绝空行与无效 RSS', () => {
    expect(parsePosixProcessRows(' 12 1 1024 /Applications/Node App/node\n13 12 2048 node\n\n14 1 bad node')).toEqual([
      { pid: 12, ppid: 1, rssKb: 1024, command: '/Applications/Node App/node' },
      { pid: 13, ppid: 12, rssKb: 2048, command: 'node' },
    ])
  })

  it('包含根、子与孙进程，排除无关进程且不重复计数', () => {
    const rows = parsePosixProcessRows('1 0 100 root\n2 1 200 pnpm\n3 2 300 node\n4 3 400 worker\n5 1 500 unrelated')
    expect(selectProcessTreeRows(rows, 2).map(row => row.pid)).toEqual([2, 3, 4])
    expect(selectProcessTreeRows(rows, 99)).toEqual([])
  })

  it('缺失根进程时仍保留尚未退出的子进程', () => {
    const rows = parsePosixProcessRows('3 2 300 node\n4 3 400 worker')
    expect(selectProcessTreeRows(rows, 2).map(row => row.pid)).toEqual([3, 4])
  })

  it('保留时序与进程明细，汇总口径不因记录证据变化', () => {
    const samples = [10, 20, 30, 40, 50, 60].map((rssMb, i) => ({
      at: i,
      rssMb,
      processCount: 1,
      processes: [{ pid: 3, ppid: 2, rssMb, command: 'C:\\Program Files\\nodejs\\node.exe' }],
    }))
    const result = summarizeProcessMemory(samples)
    expect(result).toMatchObject({ count: 6, baselineRssMb: 10, peakRssMb: 60, steadyRssMb: 55, steadyGrowthPct: 450 })
    expect(result.samples).toEqual(samples)
    expect(JSON.parse(JSON.stringify(result)).samples).toEqual(samples)
  })

  it('真实采集的明细之和等于进程树 RSS，且包含当前进程', () => {
    const sample = sampleProcessTree(process.pid)
    expect(sample.processes.some(item => item.pid === process.pid)).toBe(true)
    expect(sample.processes.every(item => typeof item.command === 'string')).toBe(true)
    expect(sample.processes.reduce((sum, item) => sum + item.rssMb, 0)).toBeCloseTo(sample.rssMb, 6)
    expect(sample.processCount).toBe(sample.processes.length)
  })

  it('未采集到进程时保留空证据，不生成虚构进程明细', () => {
    expect(summarizeProcessMemory([{ rssMb: 0, processCount: 0 }])).toMatchObject({ count: 0, samples: [] })
  })
})
