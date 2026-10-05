import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeMiniProgramAndCleanup, launchMiniProgramInCleanDevTools } from '../scripts/demo-visual-e2e-report/ide'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { assertWechatLogin, existingWechatService, ownedWechatPort, wechatRequest } from '../scripts/wechat/service'

vi.mock('../scripts/wechat/service', () => ({ assertWechatLogin: vi.fn(), existingWechatService: vi.fn(), ownedWechatPort: vi.fn(), wechatRequest: vi.fn() }))
const { launch } = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('../scripts/wechat/automator', () => ({ Launcher: class { launch = launch } }))

describe('IDE project ownership', () => {
  beforeEach(() => {
    vi.mocked(ownedWechatPort).mockReturnValue('12345')
    vi.mocked(existingWechatService).mockResolvedValue({ command: 'cli-metadata-only', version: 'test', metadata: 'test', httpPort: '12345' })
    vi.mocked(wechatRequest).mockResolvedValue({ success: true })
    vi.mocked(assertWechatLogin).mockResolvedValue(undefined)
  })
  afterEach(() => vi.resetAllMocks())

  it.each(['/owned/project with spaces', 'C:\\owned\\project with spaces', 'C:\\', './owned-project'])('closes only the supplied project: %s', async (project) => {
    const disconnect = vi.fn()
    await closeWechatProject(project, { disconnect }, 1234)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(wechatRequest).toHaveBeenCalledExactlyOnceWith('12345', { kind: 'close', project }, 1234)
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(wechatRequest).mock.invocationCallOrder[0]!)
    expect(assertWechatLogin).toHaveBeenCalledTimes(2)
  })

  it('uses the original bound service during cleanup', async () => {
    await closeWechatProject('/owned/project', undefined, 100, '23456')
    expect(existingWechatService).not.toHaveBeenCalled()
    expect(wechatRequest).toHaveBeenCalledExactlyOnceWith('23456', { kind: 'close', project: '/owned/project' }, 100)
  })

  it('attempts owned project closure even if disconnect fails', async () => {
    const error = new Error('disconnect failed')
    await expect(closeWechatProject('/owned/project', {
      disconnect: () => { throw error },
    })).rejects.toBe(error)
    expect(wechatRequest).toHaveBeenCalledOnce()
  })

  it('preserves the IDE on authentication failure and makes no project request', async () => {
    vi.mocked(assertWechatLogin).mockRejectedValue(new Error('登录未确认'))
    const disconnect = vi.fn()
    await expect(closeWechatProject('/owned/project', { disconnect })).rejects.toThrow('登录未确认')
    expect(disconnect).toHaveBeenCalledOnce()
    expect(wechatRequest).not.toHaveBeenCalled()
  })

  it.each(['login', 'close'])('断开连接与 %s 清理同时失败时保留两个错误', async (stage) => {
    const primary = new Error('disconnect failed')
    const cleanup = new Error(`${stage} failed`)
    if (stage === 'login') {
      vi.mocked(assertWechatLogin).mockRejectedValue(cleanup)
    }
    else {
      vi.mocked(wechatRequest).mockRejectedValue(cleanup)
    }
    const disconnect = vi.fn(() => {
      throw primary
    })
    const error = await closeWechatProject('/owned/project', { disconnect }).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.cause).toBe(primary)
    expect(error.errors).toEqual([primary, cleanup])
    expect(disconnect).toHaveBeenCalledOnce()
    expect(wechatRequest).toHaveBeenCalledTimes(stage === 'login' ? 0 : 1)
  })

  it('等待异步断开失败后仍执行清理，避免未处理的拒绝', async () => {
    const primary = new Error('async disconnect failed')
    const cleanup = new Error('close failed')
    vi.mocked(wechatRequest).mockRejectedValue(cleanup)
    const disconnect = vi.fn().mockRejectedValue(primary)
    const error = await closeWechatProject('/owned/project', { disconnect }).catch(error => error)
    expect(error.errors).toEqual([primary, cleanup])
    expect(disconnect).toHaveBeenCalledOnce()
    expect(wechatRequest).toHaveBeenCalledOnce()
  })

  it('does not retry a failed project close', async () => {
    vi.mocked(wechatRequest).mockRejectedValue(new Error('close failed'))
    await expect(closeWechatProject('/owned/project')).rejects.toThrow('close failed')
    expect(wechatRequest).toHaveBeenCalledOnce()
  })

  it('rejects an unspecified project before touching the IDE', async () => {
    await expect(closeWechatProject(' ')).rejects.toThrow('项目路径')
    expect(existingWechatService).not.toHaveBeenCalled()
    expect(wechatRequest).not.toHaveBeenCalled()
  })

  it('视觉用例的页面启动失败不重复清理 Launcher 已收尾的项目', async () => {
    const failure = new Error('page readiness failed')
    launch.mockRejectedValue(failure)
    const run = async () => {
      try {
        await launchMiniProgramInCleanDevTools('test', '/owned/project', 45678, 100)
      }
      finally {
        await closeMiniProgramAndCleanup(undefined, '/owned/project')
      }
    }
    await expect(run()).rejects.toBe(failure)
    expect(launch).toHaveBeenCalledOnce()
    expect(wechatRequest).not.toHaveBeenCalled()
  })
})
