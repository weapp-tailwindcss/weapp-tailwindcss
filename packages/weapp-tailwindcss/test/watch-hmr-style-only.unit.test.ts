import type { CliOptions, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createWatchSessionMock = vi.fn<() => Promise<WatchSession>>()
const runStyleMutationMock = vi.fn()
const sleepMock = vi.fn<(ms: number) => Promise<void>>()

vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session', () => ({
  createWatchSession: () => createWatchSessionMock(),
  sleep: (ms: number) => sleepMock(ms),
}))

vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/style', () => ({
  runStyleMutation: (...args: unknown[]) => runStyleMutationMock(...args),
}))

let tempDir: string

function createOptions(): CliOptions {
  return {
    caseName: 'all',
    timeoutMs: 6000,
    pollMs: 10,
    skipBuild: true,
    quietSass: true,
    webOnly: false,
    styleOnly: true,
    mainStyleOnly: false,
  }
}

function createWatchCase(sourceFile: string): WatchCase {
  return {
    name: 'taro-webpack-react-tailwindcss-v4',
    label: 'demo/taro-webpack-react-tailwindcss-v4',
    project: 'demo/taro-webpack-react-tailwindcss-v4',
    group: 'demo',
    cwd: '/repo/demo/taro-webpack-react-tailwindcss-v4',
    devScript: 'dev:weapp2',
    outputWxml: '/repo/dist/pages/index/index.wxml',
    outputJs: '/repo/dist/pages/index/index.js',
    outputStyleCandidates: ['/repo/dist/pages/index/index.wxss'],
    globalStyleCandidates: ['/repo/dist/app.wxss'],
    templateMutation: {
      sourceFile,
      verifyEscapedIn: [],
      mutate: source => source,
    },
    scriptMutation: {
      sourceFile,
      verifyEscapedIn: [],
      mutate: source => source,
    },
    styleMutation: {
      sourceFile,
      mutate: source => `${source}\n.tw-watch-style-case { color: red; }`,
    },
  }
}

describe('watch-hmr style-only helpers', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-style-only-'))
    let now = 100_000
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 2_000
      return now
    })
    createWatchSessionMock.mockReset()
    runStyleMutationMock.mockReset()
    sleepMock.mockReset().mockResolvedValue()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('runs style-only case and restores the source file', async () => {
    const sourceFile = path.join(tempDir, 'index.css')
    await writeFile(sourceFile, '.anchor {\n  color: inherit;\n}\n', 'utf8')
    const watchCase = createWatchCase(sourceFile)
    const session: WatchSession = {
      startedAt: 104_000,
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: vi.fn(() => 106_000),
      logs: vi.fn(() => 'watch logs'),
      memorySamplesSince: vi.fn(() => [
        { at: 1, rssMb: 200, maxProcessRssMb: 180, processCount: 2 },
        { at: 2, rssMb: 218, maxProcessRssMb: 196, processCount: 2 },
      ]),
      memoryDebugSamplesSince: vi.fn(() => [
        {
          at: 2,
          bundler: 'vite',
          phase: 'generateBundle',
          durationMs: 10,
          data: {
            process: {
              heapUsedMb: 72,
              rssMb: 218,
            },
          },
        },
      ]),
      pluginProcessSamplesSince: vi.fn(() => []),
      stop: vi.fn(async () => {}),
    }
    createWatchSessionMock.mockResolvedValue(session)
    runStyleMutationMock.mockResolvedValue({
      mutationKind: 'style',
      sourceFile,
      outputStyle: '/repo/dist/pages/index/index.wxss',
      marker: 'style-marker',
      styleNeedle: '.style-marker',
      applyUtilities: [],
      expectedApplyDeclarations: [],
      expectedApplyDeclarationGroups: [],
      functionDeclarations: [],
      expectedFunctionDeclarations: [],
      forbiddenFunctionFragments: [],
      hotUpdateOutputMs: 12,
      hotUpdateEffectiveMs: 10,
      hotUpdatePluginProcessMs: 0,
      hotUpdatePluginProcessSamples: [],
      rollbackOutputMs: 15,
      rollbackEffectiveMs: 11,
      rollbackPluginProcessMs: 0,
      rollbackPluginProcessSamples: [],
      rollbackNeedleCleared: true,
    })

    const { runStyleOnlyCase } = await import('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/style-only')
    const result = await runStyleOnlyCase(watchCase, createOptions())

    expect(result).toMatchObject({
      name: 'taro-webpack-react-tailwindcss-v4',
      hotUpdateMs: 10,
      rollbackMs: 11,
      rollbackNeedleCleared: true,
      outputStyle: '/repo/dist/pages/index/index.wxss',
    })
    expect(result.watchCaseMetrics).toMatchObject({
      name: 'taro-webpack-react-tailwindcss-v4',
      hotUpdateEffectiveMs: 10,
      rollbackEffectiveMs: 11,
      memoryDebugSamples: [
        {
          data: {
            process: {
              heapUsedMb: 72,
              rssMb: 218,
            },
          },
        },
      ],
    })
    expect(session.ensureRunning).toHaveBeenCalled()
    expect(session.stop).toHaveBeenCalledTimes(1)
    expect(await readFile(sourceFile, 'utf8')).toBe('.anchor {\n  color: inherit;\n}\n')
  })

  it('still restores the source file and stops the session on failure', async () => {
    const sourceFile = path.join(tempDir, 'index.css')
    await writeFile(sourceFile, '.anchor {\n  color: inherit;\n}\n', 'utf8')
    const watchCase = createWatchCase(sourceFile)
    const session: WatchSession = {
      startedAt: 104_000,
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: vi.fn(() => 106_000),
      logs: vi.fn(() => 'captured watch logs'),
      memorySamplesSince: vi.fn(() => []),
      memoryDebugSamplesSince: vi.fn(() => []),
      pluginProcessSamplesSince: vi.fn(() => []),
      stop: vi.fn(async () => {}),
    }
    createWatchSessionMock.mockResolvedValue(session)
    runStyleMutationMock.mockRejectedValue(new Error('style hot update failed'))

    const { runStyleOnlyCase } = await import('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/style-only')

    await expect(runStyleOnlyCase(watchCase, createOptions())).rejects.toThrow(
      'style hot update failed\n[demo/taro-webpack-react-tailwindcss-v4] recent watch logs:\ncaptured watch logs',
    )
    expect(session.stop).toHaveBeenCalledTimes(1)
    expect(await readFile(sourceFile, 'utf8')).toBe('.anchor {\n  color: inherit;\n}\n')
  })
})
