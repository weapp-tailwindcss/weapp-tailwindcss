import { writeSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Launcher } from '../scripts/wechat/automator'
import { WechatEnvironmentError } from '../scripts/wechat/errors'
import { assertWechatLogin, existingWechatService, wechatRequest } from '../scripts/wechat/service'

const { state, connect, coldLaunch, close, observer, MockMiniProgram } = vi.hoisted(() => ({
  state: { order: [] as string[] },
  connect: vi.fn(),
  coldLaunch: vi.fn(),
  close: vi.fn(),
  observer: { enable: vi.fn(), disable: vi.fn(), count: 0, max: 0, mean: Number.NaN },
  MockMiniProgram: class {
    connection = { send: vi.fn().mockResolvedValue({}), dispose: vi.fn() }
    waitForAppReady = vi.fn().mockResolvedValue(undefined)
    close = vi.fn()
    disconnect() {
      this.connection.dispose()
    }
  },
}))
vi.mock('node:fs', async original => ({ ...await original<object>(), writeSync: vi.fn() }))
vi.mock('node:perf_hooks', async original => ({ ...await original<object>(), monitorEventLoopDelay: () => observer }))
vi.mock('@weapp-vite/miniprogram-automator', () => ({
  MiniProgram: MockMiniProgram,
  Launcher: class { connect = connect; launch = coldLaunch },
}))
vi.mock('../scripts/wechat/service', () => ({
  assertWechatLogin: vi.fn(),
  existingWechatService: vi.fn(),
  wechatRequest: vi.fn(),
}))
vi.mock('../scripts/wechat-project-cleanup', () => ({ closeWechatProject: close }))

function miniProgram() {
  const mini = new MockMiniProgram()
  const send = mini.connection.send
  mini.waitForAppReady.mockImplementation(async () => {
    state.order.push('readiness')
  })
  connect.mockImplementation(async () => {
    state.order.push('connect')
    return mini
  })
  return { mini, send }
}

function report() {
  return JSON.parse(String(vi.mocked(writeSync).mock.calls.at(-1)?.[1]).slice('[wechat:launch] '.length))
}

beforeEach(() => {
  state.order = []
  vi.mocked(existingWechatService).mockImplementation(async () => {
    state.order.push('discovery')
    return { command: 'unused', metadata: 'secret', version: 'test', httpPort: '12345' }
  })
  vi.mocked(assertWechatLogin).mockImplementation(async () => {
    state.order.push('login')
  })
  vi.mocked(wechatRequest).mockImplementation(async () => {
    state.order.push('auto')
    return { autoPort: 45678 }
  })
  close.mockResolvedValue(undefined)
})
afterEach(() => {
  expect(coldLaunch).not.toHaveBeenCalled()
  expect(observer.disable).toHaveBeenCalledOnce()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('微信 launch 阶段诊断与原合同', () => {
  it('只观察原有调用顺序和预算，不新增任何 IDE 请求', async () => {
    const { mini, send } = miniProgram()
    await expect(new Launcher().launch({ projectPath: '/private-project-secret', port: 45678, timeout: 1000 })).resolves.toBe(mini)
    expect(state.order).toEqual(['discovery', 'login', 'auto', 'login', 'connect', 'readiness'])
    expect(assertWechatLogin).toHaveBeenCalledTimes(2)
    expect(wechatRequest).toHaveBeenCalledExactlyOnceWith('12345', { kind: 'auto', project: '/private-project-secret', port: 45678 }, expect.any(Number))
    expect(connect).toHaveBeenCalledExactlyOnceWith({ wsEndpoint: 'ws://127.0.0.1:45678', timeout: expect.any(Number) })
    expect(mini.waitForAppReady).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(report().stages.map((entry: { phase: string }) => entry.phase)).toEqual(['discovery', 'login-before-auto', 'auto', 'login-after-auto', 'connect', 'readiness'])
    expect(report().outcome).toBe('succeeded')
    expect(String(vi.mocked(writeSync).mock.calls[0]?.[1])).not.toContain('secret')
    mini.disconnect()
  })

  it.each(['discovery', 'login-before-auto', 'auto', 'login-after-auto', 'connect', 'readiness'] as const)('记录 %s 失败，保留原错误与关闭责任', async (phase) => {
    const { mini, send } = miniProgram()
    const primary = phase === 'connect'
      ? new AggregateError([new Error('handshake-secret'), new Error('cleanup-secret')], 'secret')
      : new WechatEnvironmentError('secret')
    if (phase === 'discovery') {
      vi.mocked(existingWechatService).mockRejectedValueOnce(primary)
    }
    else if (phase === 'login-before-auto') {
      vi.mocked(assertWechatLogin).mockRejectedValueOnce(primary)
    }
    else if (phase === 'auto') {
      vi.mocked(wechatRequest).mockRejectedValueOnce(primary)
    }
    else if (phase === 'login-after-auto') {
      vi.mocked(assertWechatLogin).mockResolvedValueOnce(undefined).mockRejectedValueOnce(primary)
    }
    else if (phase === 'connect') {
      connect.mockRejectedValueOnce(primary)
    }
    else {
      vi.mocked(mini.waitForAppReady).mockRejectedValueOnce(primary)
    }
    const error = await new Launcher().launch({ projectPath: '/secret', port: 45678, timeout: 1000 }).catch(error => error)
    if (phase === 'connect') {
      expect(error).toBeInstanceOf(WechatEnvironmentError)
      expect(error.cause).toBe(primary)
    }
    else {
      expect(error).toBe(primary)
    }
    expect(report().stages.at(-1)).toMatchObject({ phase, outcome: 'failed' })
    expect(report().outcome).toBe('failed')
    expect(String(vi.mocked(writeSync).mock.calls[0]?.[1])).not.toContain('secret')
    expect(send).not.toHaveBeenCalled()
    const expectsCleanup = ['login-after-auto', 'connect', 'readiness'].includes(phase)
    expect(close).toHaveBeenCalledTimes(expectsCleanup ? 1 : 0)
    expect(wechatRequest).toHaveBeenCalledTimes(['discovery', 'login-before-auto'].includes(phase) ? 0 : 1)
    mini.disconnect()
  })

  it('保留原连接重试，只为每次既有握手记录结果', async () => {
    const { mini, send } = miniProgram()
    connect.mockRejectedValueOnce(Object.assign(new Error('secret'), { code: 'ECONNREFUSED' }))
    await expect(new Launcher().launch({ projectPath: '/secret', port: 45678, timeout: 1000 })).resolves.toBe(mini)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(wechatRequest).toHaveBeenCalledOnce()
    expect(mini.waitForAppReady).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
    expect(report().stages.filter((entry: { phase: string }) => entry.phase === 'connect')).toMatchObject([
      { outcome: 'failed', error: { name: 'Error', code: 'ECONNREFUSED' } },
      { outcome: 'succeeded' },
    ])
    mini.disconnect()
  })

  it('原清理排空后才结束观察，诊断输出失败也保留两个原异常', async () => {
    const { mini } = miniProgram()
    const primary = new WechatEnvironmentError('primary')
    const cleanup = new Error('cleanup')
    vi.mocked(mini.waitForAppReady).mockRejectedValueOnce(primary)
    let rejectClose!: (error: unknown) => void
    close.mockReturnValue(new Promise((_resolve, reject) => {
      rejectClose = reject
    }))
    const result = new Launcher().launch({ projectPath: '/secret', port: 45678, timeout: 1000 }).catch(error => error)
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(observer.disable).not.toHaveBeenCalled()
    expect(writeSync).not.toHaveBeenCalled()
    vi.mocked(writeSync).mockImplementation(() => {
      throw new Error('diagnostics output failed')
    })
    rejectClose(cleanup)
    const error = await result
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1]).toBe(cleanup)
    expect(error.cause).toBe(primary)
    mini.disconnect()
  })
})
