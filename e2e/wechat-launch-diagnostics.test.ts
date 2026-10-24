import { writeSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withWechatLaunchDiagnostics } from '../scripts/wechat/launch-diagnostics'

const { clock, observer } = vi.hoisted(() => ({
  clock: { now: 0 },
  observer: { enable: vi.fn(), disable: vi.fn(), count: 3, max: 25_000_000, mean: 21_000_000 },
}))
vi.mock('node:fs', async original => ({ ...await original<object>(), writeSync: vi.fn() }))
vi.mock('node:perf_hooks', async original => ({
  ...await original<object>(),
  performance: { now: () => clock.now },
  monitorEventLoopDelay: vi.fn(() => observer),
}))

function report() {
  const line = String(vi.mocked(writeSync).mock.calls.at(-1)?.[1])
  expect(line.startsWith('[wechat:launch] ')).toBe(true)
  return JSON.parse(line.slice('[wechat:launch] '.length))
}

beforeEach(() => {
  clock.now = 0
  observer.count = 3
  observer.max = 25_000_000
  observer.mean = 21_000_000
  vi.mocked(monitorEventLoopDelay).mockReturnValue(observer as never)
  vi.spyOn(Date, 'now').mockImplementation(() => clock.now)
})
afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('微信启动的被动阶段诊断', () => {
  it('按单调时钟记录阶段耗时与剩余预算，结束观察后才写一次日志', async () => {
    const value = {}
    await expect(withWechatLaunchDiagnostics(100, async ({ stage }) => {
      await stage('discovery', async () => {
        clock.now = 20
        return 'service'
      })
      clock.now = 25
      return stage('readiness', async () => {
        clock.now = 50
        return value
      })
    })).resolves.toBe(value)
    expect(observer.enable).toHaveBeenCalledOnce()
    expect(observer.disable).toHaveBeenCalledOnce()
    expect(writeSync).toHaveBeenCalledOnce()
    expect(observer.disable.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(writeSync).mock.invocationCallOrder[0]!)
    expect(report()).toMatchObject({
      outcome: 'succeeded',
      durationMs: 50,
      remainingMs: 50,
      stageCount: 2,
      omittedStages: 0,
      stages: [
        { phase: 'discovery', startedAtMs: 0, durationMs: 20, remainingAtStartMs: 100, remainingAtEndMs: 80, outcome: 'succeeded' },
        { phase: 'readiness', startedAtMs: 25, durationMs: 25, remainingAtStartMs: 75, remainingAtEndMs: 50, outcome: 'succeeded' },
      ],
      eventLoop: { available: true, sampleCount: 3, maxDelayMs: 25, meanDelayMs: 21 },
    })
  })

  it('保留阶段与整体异常的身份，只输出白名单错误标识', async () => {
    const primary = Object.assign(new Error('ticket=secret'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'payload-secret' })
    await expect(withWechatLaunchDiagnostics(100, ({ stage }) => stage('readiness', async () => {
      throw primary
    }))).rejects.toBe(primary)
    expect(observer.disable).toHaveBeenCalledOnce()
    expect(report()).toMatchObject({
      outcome: 'failed',
      error: { name: 'Error', code: 'DEVTOOLS_PROTOCOL_TIMEOUT' },
      stages: [{ phase: 'readiness', outcome: 'failed', error: { name: 'Error', code: 'DEVTOOLS_PROTOCOL_TIMEOUT' } }],
    })
    expect(String(vi.mocked(writeSync).mock.calls[0]?.[1])).not.toContain('secret')
  })

  it('任意异常属性及读取失败不进入日志，也不替换原异常', async () => {
    const primary = Object.assign(new Error('secret'), { name: 'secret-name', code: 'secret-code' })
    await expect(withWechatLaunchDiagnostics(100, ({ stage }) => stage('auto', async () => {
      throw primary
    }))).rejects.toBe(primary)
    expect(report().stages[0].error).toEqual({ name: 'OtherError' })
    expect(String(vi.mocked(writeSync).mock.calls[0]?.[1])).not.toContain('secret')
    const unreadable = new Error('secret')
    Object.defineProperty(unreadable, 'name', {
      get() {
        throw new Error('secret')
      },
    })
    await expect(withWechatLaunchDiagnostics(100, ({ stage }) => stage('auto', async () => {
      throw unreadable
    }))).rejects.toBe(unreadable)
    expect(report().error).toEqual({ name: 'UnreadableError' })
  })

  it('没有事件循环样本时明确缺证，不把 NaN 当成有效延迟', async () => {
    observer.count = 0
    observer.mean = Number.NaN
    await withWechatLaunchDiagnostics(100, async () => undefined)
    expect(report().eventLoop).toMatchObject({ sampleCount: 0, meanDelayMs: null, maxDelayMs: null })
  })

  it('日志有界且保留首次阶段与最后结果，不截断任何连接操作', async () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    await withWechatLaunchDiagnostics(100, async ({ stage }) => {
      await stage('discovery', async () => undefined)
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await stage('connect', connect)
      }
      await stage('readiness', async () => undefined)
    })
    expect(connect).toHaveBeenCalledTimes(80)
    expect(report()).toMatchObject({ stageCount: 82, omittedStages: 18 })
    expect(report().stages).toHaveLength(64)
    expect(report().stages[0].phase).toBe('discovery')
    expect(report().stages.at(-1).phase).toBe('readiness')
  })

  it('观察器不可用仍执行原操作，并标记统计不可用', async () => {
    vi.mocked(monitorEventLoopDelay).mockImplementation(() => {
      throw new Error('observer failed')
    })
    const value = {}
    await expect(withWechatLaunchDiagnostics(100, async () => value)).resolves.toBe(value)
    expect(report().eventLoop).toMatchObject({ available: false, sampleCount: 0, meanDelayMs: null })
  })

  it('日志写入或观察器停用失败不改变原操作结果和原异常', async () => {
    vi.mocked(writeSync).mockImplementation(() => {
      throw new Error('output failed')
    })
    observer.disable.mockImplementation(() => {
      throw new Error('observer failed')
    })
    const value = {}
    await expect(withWechatLaunchDiagnostics(100, async () => value)).resolves.toBe(value)
    const primary = new Error('primary')
    await expect(withWechatLaunchDiagnostics(100, async () => {
      throw primary
    })).rejects.toBe(primary)
    expect(observer.disable).toHaveBeenCalledTimes(2)
  })
})
