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

    await expect(readFreshDevToolsPageContent('project', options, '/pages/index/index', 'new HMR marker'))
      .rejects
      .toThrow('DevTools page did not show HMR marker')
    expect(miniProgram.disconnect).toHaveBeenCalledOnce()
    expect(miniProgram.close).not.toHaveBeenCalled()
  })
})
