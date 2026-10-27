import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { renderStdoutSummary } from '../../../../scripts/ci-memory/diagnostics.mjs'
import { createPeakSnapshot, parsePosixRows, parseWindowsSample, selectDescendantRows } from '../../../../scripts/ci-memory/process-sampling.mjs'

describe('CI 内存采样诊断边界', () => {
  it('解析 macOS/Linux 的启动时间与含空格的可执行文件，同时保持 RSS 单位', () => {
    const rows = parsePosixRows([
      ' 10 1 1024 Wed Jan  7 10:20:30 2026 /Applications/Node Runtime/node',
      ' 11 10 2048 Sun Oct 25 10:20:30 2026 /usr/bin/node',
      'invalid output',
    ].join('\n'))
    expect(rows).toEqual([
      { pid: 10, ppid: 1, rssKb: 1024, startedAt: 'Wed Jan  7 10:20:30 2026', command: '/Applications/Node Runtime/node' },
      { pid: 11, ppid: 10, rssKb: 2048, startedAt: 'Sun Oct 25 10:20:30 2026', command: '/usr/bin/node' },
    ])
  })

  it('只跟踪根进程的全部后代，处理乱序和重复关系', () => {
    const rows = [
      { pid: 12, ppid: 11, rssKb: 300 },
      { pid: 10, ppid: 1, rssKb: 100 },
      { pid: 11, ppid: 10, rssKb: 200 },
      { pid: 13, ppid: 1, rssKb: 900 },
      { pid: 12, ppid: 11, rssKb: 300 },
    ]
    const tracked = selectDescendantRows(rows, 10)
    expect(tracked.map(row => row.pid).sort()).toEqual([10, 11, 12])
    expect(tracked.reduce((sum, row) => sum + row.rssKb, 0)).toBe(600)
  })

  it('缺失或异常的诊断字段不丢弃有效 RSS，也不断开后代关系', () => {
    const rows = parsePosixRows([
      ' 10 1 1024   ',
      '11 10 2048 unknown metadata',
      '12 11 3072 Sun Oct 25 10:20:30 2026 /usr/bin/node',
      'not-a-pid 10 9000',
    ].join('\n'))
    expect(rows.slice(0, 2)).toEqual([
      { pid: 10, ppid: 1, rssKb: 1024, startedAt: 'unknown', command: 'unknown' },
      { pid: 11, ppid: 10, rssKb: 2048, startedAt: 'unknown', command: 'unknown' },
    ])
    expect(selectDescendantRows(rows, 10).reduce((sum, row) => sum + row.rssKb, 0)).toBe(6144)
  })

  it.each([
    { rows: [], count: 0 },
    { rows: { pid: 42, ppid: 1, rssKb: 2048, startedAt: '2026-10-25T00:00:00Z', command: 'node.exe' }, count: 1 },
  ])('规范化 Windows JSON 单项或空数组，不重算原始指标 $count', ({ rows, count }) => {
    const parsed = parseWindowsSample(JSON.stringify({ rssMb: 2, maxProcessRssMb: 2, processCount: count, rows }), 1234)
    expect(parsed).toMatchObject({ at: 1234, rssMb: 2, maxProcessRssMb: 2, processCount: count })
    expect(parsed.rows).toHaveLength(count)
    if (count) {
      expect(createPeakSnapshot(parsed).rows[0]).toMatchObject({ pid: 42, startedAt: '2026-10-25T00:00:00Z', command: 'node.exe' })
    }
  })

  it('仅保留 RSS 最高的 20 项及有限的身份信息，不改写原始采样', () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ pid: index + 1, ppid: 0, rssKb: 1024 * index, startedAt: 'x'.repeat(100), command: `node\n${'x'.repeat(1000)}` }))
    const sample = { at: 1234, processCount: rows.length, rows }
    const snapshot = createPeakSnapshot(sample)
    expect(snapshot.rows).toHaveLength(20)
    expect(snapshot.omittedProcessCount).toBe(10)
    expect(snapshot.rows[0]).toMatchObject({ pid: 30, rssMb: 29 })
    expect(snapshot.rows.every(row => row.command.length <= 160 && row.startedAt.length <= 64 && !row.command.includes('\n'))).toBe(true)
    expect(sample.rows).toHaveLength(30)
    expect(sample.rows[0].command.length).toBeGreaterThan(160)
  })

  it('命令和标签含控制字符时 stdout 仍为单行且小于 4KiB', () => {
    const stdout = renderStdoutSummary({ label: '\u0000'.repeat(10000), command: ['\u0000'.repeat(10000)], runtime: { node: 'v24.0.0', platform: 'win32', arch: 'x64' }, exitCode: 7, summary: { count: 1, peakRssMb: 2 } })
    expect(stdout.trim().split('\n')).toHaveLength(1)
    expect(Buffer.byteLength(stdout)).toBeLessThan(4096)
    expect(JSON.parse(stdout.slice('[ci-memory] summary: '.length)).exitCode).toBe(7)
  })
})
