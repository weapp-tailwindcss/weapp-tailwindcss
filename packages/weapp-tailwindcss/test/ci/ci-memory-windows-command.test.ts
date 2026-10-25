import { spawnSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleProcessTree } from '../../../../scripts/ci-memory/process-sampling.mjs'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))

describe('CI 内存 Windows 命令边界', () => {
  beforeEach(() => vi.mocked(spawnSync).mockReset())

  it('数字 PID 直接绑定在脚本内，不依赖 -Command 字符串后的参数', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ rssMb: 2, maxProcessRssMb: 2, processCount: 1, rows: [{ pid: 42, ppid: 1, rssKb: 2048, startedAt: '2026-10-25T00:00:00Z', command: 'node.exe' }] }),
    } as ReturnType<typeof spawnSync>)
    const sample = sampleProcessTree(42, 'win32')
    expect(sample).toMatchObject({ rssMb: 2, maxProcessRssMb: 2, processCount: 1 })
    const [command, args] = vi.mocked(spawnSync).mock.calls[0]!
    expect(command).toBe('powershell')
    expect(args).toHaveLength(3)
    expect(args?.slice(0, 2)).toEqual(['-NoProfile', '-Command'])
    expect(args?.[2]).toMatch(/^\$root = 42;/)
    expect(args?.[2]).not.toContain('$args[0]')
    expect(args?.[2]).toContain('[Math]::Round($total / 1MB)')
    expect(args?.[2].match(/Get-CimInstance/g)).toHaveLength(1)
  })

  it.each([0, -1, Number.NaN, 1.5, '42; exit 7'])('非法 PID %s 不进入命令字符串', (pid) => {
    expect(sampleProcessTree(pid, 'win32')).toBeUndefined()
    expect(spawnSync).not.toHaveBeenCalled()
  })
})
