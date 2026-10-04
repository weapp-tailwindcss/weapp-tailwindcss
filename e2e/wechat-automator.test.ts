import { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Launcher } from '../scripts/wechat/automator'
import { assertWechatLogin, existingWechatService, ownedWechatPort, wechatRequest } from '../scripts/wechat/service'

const { connect, coldLaunch } = vi.hoisted(() => ({ connect: vi.fn(), coldLaunch: vi.fn() }))
vi.mock('@weapp-vite/miniprogram-automator', async original => ({
  ...await original<object>(),
  Launcher: class { connect = connect; launch = coldLaunch },
}))
vi.mock('../scripts/wechat/service', () => ({ assertWechatLogin: vi.fn(), existingWechatService: vi.fn(), ownedWechatPort: vi.fn(), wechatRequest: vi.fn() }))

function miniProgram() {
  const send = vi.fn().mockResolvedValue({})
  const connection = { send, dispose: vi.fn(), on: vi.fn() }
  const mini = new MiniProgram(connection as never)
  vi.spyOn(mini, 'waitForAppReady').mockResolvedValue(undefined)
  return { mini, connection, send }
}

beforeEach(() => {
  vi.mocked(ownedWechatPort).mockReturnValue('12345')
  vi.mocked(existingWechatService).mockResolvedValue({ command: 'not-executed', metadata: 'test', version: 'test', httpPort: '12345' })
  vi.mocked(assertWechatLogin).mockResolvedValue(undefined)
  vi.mocked(wechatRequest).mockResolvedValue({ autoPort: 45678 })
})
afterEach(() => {
  expect(coldLaunch).not.toHaveBeenCalled()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('微信会话保护', () => {
  it('仅在已有服务打开绑定项目与端口，保留登录态', async () => {
    const { mini } = miniProgram()
    connect.mockResolvedValue(mini)
    await expect(new Launcher().launch({ projectPath: '/owned', port: 45678, timeout: 1000 })).resolves.toBe(mini)
    expect(wechatRequest).toHaveBeenCalledExactlyOnceWith('12345', { kind: 'auto', project: '/owned', port: 45678 }, expect.any(Number))
    expect(connect).toHaveBeenCalledExactlyOnceWith({ wsEndpoint: 'ws://127.0.0.1:45678', timeout: expect.any(Number) })
    expect(assertWechatLogin).toHaveBeenCalledTimes(2)
    mini.disconnect()
  })

  it.each(['close', 'setTicket', 'refreshTicket', 'getTicket', 'native', 'enableRemoteDebug'])('通过 tool(%s) 也不能绕过共享协议边界', async (method) => {
    const { mini, connection, send } = miniProgram()
    connect.mockResolvedValue(mini)
    await new Launcher().connect({ wsEndpoint: 'ws://127.0.0.1:45678' })
    await expect(mini.tool(method, {})).rejects.toThrow('禁止改变')
    await expect(connection.send(`Tool.${method}`)).rejects.toThrow('禁止改变')
    expect(send).not.toHaveBeenCalled()
    mini.disconnect()
  })

  it('关闭账号与清会话缓存均被拒绝；截图及编译缓存仍遵循原协议', async () => {
    const { mini, connection, send } = miniProgram()
    connect.mockResolvedValue(mini)
    await new Launcher().connect({ wsEndpoint: 'ws://127.0.0.1:45678' })
    await expect(mini.close()).rejects.toThrow('closeWechatProject')
    await expect(mini.clearCache({ clean: 'all' })).rejects.toThrow('禁止改变')
    await expect(mini.clearCache({ clean: 'session' })).rejects.toThrow('禁止改变')
    await expect(connection.send('App.exit')).rejects.toThrow('禁止改变')
    expect(send).not.toHaveBeenCalled()
    await connection.send('App.captureScreenshot', {})
    await mini.clearCache({ clean: 'compile' })
    expect(send.mock.calls.map(call => call[0])).toEqual(['App.captureScreenshot', 'Tool.clearCache'])
    mini.disconnect()
  })

  it.each([{ ticket: 'secret' }, { account: 'other' }, { args: ['logout'] }, { runtimeProvider: 'headless' }])('拒绝额外启动能力 %j', async (extra) => {
    await expect(new Launcher().launch({ projectPath: '/owned', ...extra } as never)).rejects.toThrow('不接受')
    expect(existingWechatService).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('服务未开启时不执行 CLI 或连接', async () => {
    vi.mocked(existingWechatService).mockRejectedValue(new Error('HTTP 服务未开启'))
    await expect(new Launcher().launch({ projectPath: '/owned' })).rejects.toThrow('服务未开启')
    expect(connect).not.toHaveBeenCalled()
    expect(wechatRequest).not.toHaveBeenCalled()
  })

  it('认证失败立即停止，不尝试连接或重新启动', async () => {
    vi.mocked(wechatRequest).mockRejectedValue(new Error('HTTP 401'))
    await expect(new Launcher().launch({ projectPath: '/owned', port: 45678 })).rejects.toThrow('401')
    expect(connect).not.toHaveBeenCalled()
    expect(wechatRequest).toHaveBeenCalledOnce()
  })

  it('自动化端口不符时拒绝旧会话', async () => {
    vi.mocked(wechatRequest).mockResolvedValue({ autoPort: 56789 })
    await expect(new Launcher().launch({ projectPath: '/owned', port: 45678 })).rejects.toThrow('不一致')
    expect(connect).not.toHaveBeenCalled()
    expect(wechatRequest).toHaveBeenCalledTimes(2)
    expect(wechatRequest).toHaveBeenLastCalledWith('12345', { kind: 'close', project: '/owned' }, expect.any(Number))
  })

  it('页面就绪失败只断开自己的连接', async () => {
    const { mini, connection } = miniProgram()
    vi.mocked(mini.waitForAppReady).mockRejectedValue(new Error('page failed'))
    connect.mockResolvedValue(mini)
    await expect(new Launcher().launch({ projectPath: '/owned', port: 45678 })).rejects.toThrow('page failed')
    expect(connection.dispose).toHaveBeenCalledOnce()
    expect(wechatRequest).toHaveBeenCalledTimes(2)
    expect(wechatRequest).toHaveBeenLastCalledWith('12345', { kind: 'close', project: '/owned' }, expect.any(Number))
  })

  it('页面就绪和断开连接同时失败时保留首次失败，不重新连接', async () => {
    const { mini, connection } = miniProgram()
    const primary = new Error('page readiness failed')
    const cleanup = new Error('disconnect failed')
    vi.mocked(mini.waitForAppReady).mockRejectedValue(primary)
    connection.dispose.mockImplementation(() => {
      throw cleanup
    })
    connect.mockResolvedValue(mini)
    const error = await new Launcher().launch({ projectPath: '/owned', port: 45678 }).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.cause).toBe(primary)
    expect(error.errors).toEqual([primary, cleanup])
    expect(connection.dispose).toHaveBeenCalledOnce()
    expect(connect).toHaveBeenCalledOnce()
    expect(wechatRequest).toHaveBeenCalledTimes(2)
  })

  it('超过截止时间才返回的连接会断开，不返回迟到成功或旁路重连', async () => {
    const { mini, connection } = miniProgram()
    connect.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return mini
    })
    await expect(new Launcher().launch({ projectPath: '/owned', port: 45678, timeout: 10 })).rejects.toThrow('超时')
    expect(connection.dispose).toHaveBeenCalledOnce()
    expect(connect).toHaveBeenCalledOnce()
    expect(wechatRequest).toHaveBeenCalledTimes(2)
  })
})
