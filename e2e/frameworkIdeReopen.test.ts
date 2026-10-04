import type { CliOptions } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFreshDevToolsPageContent } from './frameworkIdeReopen'

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }))

vi.mock('../scripts/wechat/automator', () => ({
  Launcher: class {
    launch = launch
  },
}))

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

function createPage(content: string) {
  return {
    $: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(content) }),
    $$: vi.fn().mockResolvedValue([]),
    data: vi.fn().mockResolvedValue({}),
  }
}

const options = { timeoutMs: 100, pollMs: 1 } as CliOptions

describe('framework IDE reopened page content', () => {
  it('页面读取成功但连接释放失败时，仍判定失败', async () => {
    const miniProgram = {
      reLaunch: vi.fn().mockResolvedValue(createPage('marker')),
      disconnect: vi.fn().mockRejectedValue(new Error('disconnect denied')),
    }
    launch.mockResolvedValue(miniProgram)
    await expect(readFreshDevToolsPageContent('project', options, '/page', 'marker'))
      .rejects
      .toThrow('[e2e:ide:cleanup] Failed to disconnect temporary IDE client for project: Error: disconnect denied')
  })

  it('取消与释放失败同时发生时保留两个错误', async () => {
    const controller = new AbortController()
    const miniProgram = {
      reLaunch: vi.fn(() => new Promise(() => {})),
      disconnect: vi.fn(() => { throw new Error('disconnect denied') }),
    }
    launch.mockResolvedValue(miniProgram)
    const result = readFreshDevToolsPageContent('project', options, '/page', 'marker', controller.signal).catch(error => error)
    await vi.waitFor(() => expect(miniProgram.reLaunch).toHaveBeenCalledOnce())
    controller.abort(new Error('cancelled'))
    const error = await result
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toContain('cancelled')
    expect(error.message).toContain('disconnect denied')
    expect(error.errors).toHaveLength(2)
  })

  it('连接获取期间取消时，等待迟到连接并释放，不再重新加载页面', async () => {
    const controller = new AbortController()
    const miniProgram = { reLaunch: vi.fn(), disconnect: vi.fn(), close: vi.fn() }
    let release!: (client: typeof miniProgram) => void
    launch.mockImplementation(() => new Promise((resolve) => {
      release = resolve
    }))
    let settled = false
    const result = readFreshDevToolsPageContent('project', options, '/page', 'marker', controller.signal)
      .catch(error => error)
      .finally(() => { settled = true })
    controller.abort(new Error('cancelled'))
    await Promise.resolve()
    expect(settled).toBe(false)
    release(miniProgram)
    await expect(result).resolves.toMatchObject({ message: 'cancelled' })
    expect(miniProgram.reLaunch).not.toHaveBeenCalled()
    expect(miniProgram.disconnect).toHaveBeenCalledOnce()
    expect(miniProgram.close).not.toHaveBeenCalled()
    expect(launch).toHaveBeenCalledTimes(1)
  })

  it('returns the live page text rather than the polling elapsed time', async () => {
    let projectOpen = true
    const miniProgram = {
      reLaunch: vi.fn().mockResolvedValue(createPage('new HMR marker')),
      close: vi.fn(async () => { projectOpen = false }),
      disconnect: vi.fn(),
    }
    const nextStage = vi.fn(async () => {
      if (!projectOpen) {
        throw new Error('IDE project was closed before the script/style stages')
      }
      return 'next HMR stage'
    })
    launch.mockResolvedValue(miniProgram)

    const content = await readFreshDevToolsPageContent('project', options, '/pages/index/index', 'new HMR marker')

    expect(content).toBe('[page:0:text] new HMR marker\n[page:data] {}')
    await expect(nextStage()).resolves.toBe('next HMR stage')
    expect(miniProgram.disconnect).toHaveBeenCalledOnce()
    expect(miniProgram.close).not.toHaveBeenCalled()
  })

  it('waits past readable stale content until the real page contains the current marker', async () => {
    const miniProgram = {
      reLaunch: vi.fn()
        .mockResolvedValueOnce(createPage('previous HMR marker'))
        .mockResolvedValueOnce(createPage('new HMR marker')),
      close: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    }
    launch.mockResolvedValue(miniProgram)
    vi.stubEnv('E2E_PREFLIGHT_WECHAT_CLI', 'selected-wechat-cli')

    const content = await readFreshDevToolsPageContent('project', options, '/pages/index/index', 'new HMR marker')

    expect(content).toBe('[page:0:text] new HMR marker\n[page:data] {}')
    expect(miniProgram.reLaunch).toHaveBeenCalledTimes(2)
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      cliPath: 'selected-wechat-cli',
      projectPath: 'project',
      timeout: options.timeoutMs,
    })
    expect(miniProgram.disconnect).toHaveBeenCalledOnce()
    expect(miniProgram.close).not.toHaveBeenCalled()
  })

  it('recovers from a transient launch error and an unavailable page without losing content', async () => {
    const miniProgram = {
      reLaunch: vi.fn()
        .mockRejectedValueOnce(new Error('page is reloading'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(createPage('new HMR marker')),
      close: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    }
    launch
      .mockRejectedValueOnce(new Error('DevTools connection is starting'))
      .mockResolvedValue(miniProgram)

    await expect(readFreshDevToolsPageContent('project', options, '/pages/index/index', 'new HMR marker'))
      .resolves
      .toBe('[page:0:text] new HMR marker\n[page:data] {}')
    expect(launch).toHaveBeenCalledTimes(2)
    expect(miniProgram.disconnect).toHaveBeenCalledOnce()
    expect(miniProgram.close).not.toHaveBeenCalled()
  })

  it('rejects readable content that never shows the current marker and disconnects the temporary client', async () => {
    const miniProgram = {
      reLaunch: vi.fn().mockResolvedValue(createPage('previous HMR marker')),
      close: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    }
    launch.mockResolvedValue(miniProgram)

    await expect(readFreshDevToolsPageContent('project', options, '/pages/index/index', 'new HMR marker'))
      .rejects
      .toThrow('DevTools page did not show HMR marker after reopening project: new HMR marker')
    expect(miniProgram.disconnect).toHaveBeenCalledOnce()
    expect(miniProgram.close).not.toHaveBeenCalled()
  })

  it('keeps the visibility failure when cleanup also fails', async () => {
    const miniProgram = {
      reLaunch: vi.fn().mockRejectedValue(new Error('page unavailable')),
      close: vi.fn(),
      disconnect: vi.fn(() => { throw new Error('cleanup transport unavailable') }),
    }
    launch.mockResolvedValue(miniProgram)

    const error = await readFreshDevToolsPageContent('project', options, '/pages/index/index', 'new HMR marker').catch(error => error)
    expect(error.message).toContain('DevTools page did not show HMR marker')
    expect(error.message).toContain('cleanup transport unavailable')
    expect(error).toBeInstanceOf(AggregateError)
    expect(miniProgram.disconnect).toHaveBeenCalledOnce()
    expect(miniProgram.close).not.toHaveBeenCalled()
  })
})
