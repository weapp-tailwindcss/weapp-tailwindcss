import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { withFrameworkIdeHotUpdateProbe } from './frameworkIdeHotUpdate'
import { FRAMEWORK_SUPPORT_CASES } from './frameworkSupportMatrix'

const state = vi.hoisted(() => ({
  events: [] as string[],
  watchRoots: [] as Array<string | undefined>,
  failWarmup: false,
  restoreError: undefined as Error | undefined,
  stopError: undefined as Error | undefined,
  mutate: undefined as ((signal?: AbortSignal) => Promise<void>) | undefined,
}))
vi.mock('node:fs/promises', () => ({ default: { readFile: vi.fn(async () => 'original') } }))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases', () => ({
  buildCases: () => [{
    name: 'weapp-vite-tailwindcss-v4',
    label: 'fixture',
    cwd: 'fixture',
    devScript: 'dev',
    initialBuildScript: 'build',
    outputWxml: 'page.wxml',
    outputJs: 'page.js',
    skipStyleMutation: true,
    templateMutation: { sourceFile: 'page.wxml' },
    scriptMutation: { sourceFile: 'page.js' },
  }],
}))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session', () => ({
  runPnpmCommand: async () => { state.events.push('build') },
  createWatchSession: () => {
    state.events.push('watch:start')
    return {
      logs: () => '',
      ensureRunning: vi.fn(),
      stop: async () => {
        state.events.push('watch:stop')
        if (state.stopError) {
          throw state.stopError
        }
      },
    }
  },
  sleep: vi.fn(),
}))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations', () => ({
  waitForOutputsReady: vi.fn(),
  waitForInitialWarmup: async () => {
    state.events.push('watch:ready')
    if (state.failWarmup) {
      throw new Error('compile failed')
    }
  },
}))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text', () => ({
  readFileIfExists: async () => 'output',
  getMtime: vi.fn(),
  waitFor: vi.fn(),
  writeFilePreserveEol: async () => {
    state.events.push('restore')
    if (state.restoreError) {
      throw state.restoreError
    }
  },
}))
vi.mock('./frameworkIdeClassHotUpdate', () => ({
  runIdeClassHotUpdate: async (_options: unknown, watchCase: { miniprogramRoot?: string }, _session: unknown, kind: string, _source: string, _mini: unknown, _page: unknown, _url: string, _project: string, signal?: AbortSignal) => {
    state.events.push(kind)
    state.watchRoots.push(watchCase.miniprogramRoot)
    await state.mutate?.(signal)
  },
}))
vi.mock('./frameworkIdeStyleHotUpdate', () => ({ runIdeStyleHotUpdate: vi.fn() }))

const entry = FRAMEWORK_SUPPORT_CASES.find(item => item.name === 'weapp-vite-tailwindcss-v4')!

beforeEach(() => {
  state.events = []
  state.watchRoots = []
  state.failWarmup = false
  state.restoreError = undefined
  state.stopError = undefined
  state.mutate = undefined
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

it('首轮构建和 watch 就绪后才打开 IDE，所有增量操作共用该 watcher', async () => {
  await withFrameworkIdeHotUpdateProbe(entry, async (probe) => {
    state.events.push('ide:open')
    await probe({}, {}, '/page', 'fixture')
    state.events.push('ide:close')
  })
  expect(state.events).toEqual(['build', 'watch:start', 'watch:ready', 'ide:open', 'template', 'script', 'ide:close', 'restore', 'restore', 'watch:stop'])
  const miniprogramRoot = path.resolve(import.meta.dirname, '..', 'demo', 'weapp-vite-tailwindcss-v4', 'dist')
  expect(state.watchRoots.map(root => root && path.normalize(root))).toEqual([miniprogramRoot, miniprogramRoot])
})

it('首轮编译失败时不打开 IDE，仍回收 watcher', async () => {
  state.failWarmup = true
  const open = vi.fn()
  await expect(withFrameworkIdeHotUpdateProbe(entry, open)).rejects.toThrow('compile failed')
  expect(open).not.toHaveBeenCalled()
  expect(state.events.at(-1)).toBe('watch:stop')
})

it('运行时错误不会被清空或忽略，失败后恢复源码并关闭 watcher', async () => {
  const runtimeErrors = {
    assertNoErrors: async () => { throw new Error('component missing') },
  }
  await expect(withFrameworkIdeHotUpdateProbe(entry, async (probe) => {
    await probe({}, {}, '/page', 'fixture', runtimeErrors)
  })).rejects.toThrow('component missing')
  expect(state.events.slice(-3)).toEqual(['restore', 'restore', 'watch:stop'])
})

it('恢复失败必须失败，并继续尝试所有源码和 watcher 清理', async () => {
  state.restoreError = new Error('restore denied')
  await expect(withFrameworkIdeHotUpdateProbe(entry, async () => 'passed')).rejects.toThrow('restore denied')
  expect(state.events.slice(-3)).toEqual(['restore', 'restore', 'watch:stop'])
})

it('探针、源码恢复和 watcher 清理错误都保留', async () => {
  state.restoreError = new Error('restore denied')
  state.stopError = new Error('watcher stuck')
  const error = await withFrameworkIdeHotUpdateProbe(entry, async () => {
    throw new Error('runtime first failure')
  }).catch(error => error)
  expect(error.message).toContain('runtime first failure')
  expect(error.message).toContain('restore denied')
  expect(error.message).toContain('watcher stuck')
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toHaveLength(4)
})

it('总超时先取消并等待已开始的任务退出，再恢复；迟到任务不得写源码或进入后续阶段', async () => {
  vi.useFakeTimers()
  vi.stubEnv('E2E_IDE_HOT_UPDATE_TOTAL_TIMEOUT_MS', '10')
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let signal: AbortSignal | undefined
  state.mutate = async (currentSignal) => {
    signal = currentSignal
    await pending
    currentSignal?.throwIfAborted()
    state.events.push('late:write')
  }
  const result = withFrameworkIdeHotUpdateProbe(entry, async probe => probe({}, {}, '/page', 'fixture')).catch(error => error)
  await vi.advanceTimersByTimeAsync(10)
  const eventsAtDeadline = [...state.events]
  release()
  const error = await result
  expect(eventsAtDeadline).not.toContain('restore')
  expect(signal?.aborted).toBe(true)
  expect(error.message).toContain('timed out after 10ms')
  expect(state.events).not.toContain('late:write')
  expect(state.events).not.toContain('script')
  expect(state.events.slice(-3)).toEqual(['restore', 'restore', 'watch:stop'])
})
