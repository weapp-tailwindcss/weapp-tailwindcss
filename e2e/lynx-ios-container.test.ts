import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveIosAppContainer } from './lynx/ios-container'
import { command } from './lynx/native-command'

vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))

const run = vi.mocked(command)
const cwd = path.resolve('host')
const container = path.resolve('simulator', 'Application Data')
const query = ['simctl', 'get_app_container', 'selected-device', 'test.app', 'data']
const timedOut = () => Object.assign(new Error('simctl query timed out'), { timedOut: true })

describe('iOS 安装后的数据容器查询', () => {
  beforeEach(() => vi.resetAllMocks())

  it('查询成功时不恢复或重跑安装', async () => {
    run.mockResolvedValue(`${container}\n`)
    const record = vi.fn()
    await expect(resolveIosAppContainer('selected-device', 'test.app', cwd, record)).resolves.toBe(container)
    expect(run.mock.calls).toEqual([['xcrun', query, cwd, 30_000]])
    expect(record).not.toHaveBeenCalled()
  })

  it('查询超时后保留证据，等待同一设备就绪，再查询一次', async () => {
    const first = timedOut()
    run.mockRejectedValueOnce(first).mockResolvedValueOnce('Booted').mockResolvedValueOnce(container)
    const record = vi.fn(async () => {
      expect(run).toHaveBeenCalledTimes(1)
    })
    await expect(resolveIosAppContainer('selected-device', 'test.app', cwd, record)).resolves.toBe(container)
    expect(record).toHaveBeenCalledWith(first)
    expect(run.mock.calls).toEqual([
      ['xcrun', query, cwd, 30_000],
      ['xcrun', ['simctl', 'bootstatus', 'selected-device', '-b'], cwd, 120_000],
      ['xcrun', query, cwd, 30_000],
    ])
  })

  it('应用不存在等非超时错误立即传播', async () => {
    const failure = Object.assign(new Error('Application not installed'), { timedOut: false, exitCode: 2 })
    run.mockRejectedValue(failure)
    const record = vi.fn()
    await expect(resolveIosAppContainer('selected-device', 'test.app', cwd, record)).rejects.toBe(failure)
    expect(run).toHaveBeenCalledTimes(1)
    expect(record).not.toHaveBeenCalled()
  })

  it.each(['readiness', 'query'])('恢复中的 %s 再失败时保留两次错误且停止', async (phase) => {
    const first = timedOut()
    const last = timedOut()
    run.mockRejectedValueOnce(first)
    if (phase === 'query') {
      run.mockResolvedValueOnce('Booted')
    }
    run.mockRejectedValueOnce(last)
    await expect(resolveIosAppContainer('selected-device', 'test.app', cwd, vi.fn())).rejects.toMatchObject({ errors: [first, last] })
    expect(run).toHaveBeenCalledTimes(phase === 'query' ? 3 : 2)
  })

  it.each(['', 'relative-container', `${container}\nwarning`])('不把无效输出 %j 当作容器路径', async (output) => {
    run.mockResolvedValue(output)
    await expect(resolveIosAppContainer('selected-device', 'test.app', cwd, vi.fn())).rejects.toThrow('容器路径')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
