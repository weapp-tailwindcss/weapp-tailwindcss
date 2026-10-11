import type { WatchHmrPartialMetricsError } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/runner'
import type {
  CliOptions,
  MutationRoundMetrics,
  WatchCase,
  WatchSession,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCase, runMainStyleOnlyCase, runSubPackagesOnlyCase } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/runner'

const createWatchSessionMock = vi.fn<() => Promise<WatchSession>>()
const runClassMutationMock = vi.fn()
const runStyleMutationMock = vi.fn()
const runMainStyleHotUpdateMock = vi.fn()
const runSubPackageMutationMock = vi.fn()

vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session', () => ({
  createWatchSession: () => createWatchSessionMock(),
  runPnpmCommand: vi.fn(),
  sleep: vi.fn(async () => {}),
}))

vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations', () => ({
  createSubPackageWatchCase: (_watchCase: WatchCase, mutation: WatchCase['subPackageMutations'] extends Array<infer T> ? T : never) => ({
    name: 'mpx-tailwindcss-v4',
    label: `demo/mpx-tailwindcss-v4/${mutation.root}`,
    project: 'demo/mpx-tailwindcss-v4',
    group: 'demo',
    cwd: '',
    devScript: 'dev:e2e-watch',
    outputWxml: mutation.outputWxml,
    outputJs: mutation.outputJs,
    outputStyleCandidates: mutation.outputStyleCandidates,
    globalStyleCandidates: mutation.globalStyleCandidates,
    templateMutation: mutation.templateMutation,
    scriptMutation: mutation.templateMutation,
    styleMutation: mutation.styleMutation,
  }),
  runClassMutation: (...args: unknown[]) => runClassMutationMock(...args),
  runMainStyleHotUpdate: (...args: unknown[]) => runMainStyleHotUpdateMock(...args),
  runStyleMutation: (...args: unknown[]) => runStyleMutationMock(...args),
  runSubPackageMutation: (...args: unknown[]) => runSubPackageMutationMock(...args),
  waitForInitialWarmup: vi.fn(async () => 3),
  waitForOutputsReady: vi.fn(async () => 2),
}))

function createOptions(): CliOptions {
  return {
    caseName: 'all',
    timeoutMs: 1000,
    pollMs: 10,
    skipBuild: true,
    quietSass: true,
    webOnly: false,
    miniProgramOnly: false,
    styleOnly: false,
    mainStyleOnly: false,
  }
}

function createMainStyleMetric(sourceFile: string, hotUpdateEffectiveMs = 12) {
  return {
    label: 'text-[102.43rpx] to text-[103.43rpx]',
    mutationKind: 'template',
    sourceFile,
    verifyEscapedIn: ['js'],
    verifyClassLiteralIn: ['js'],
    fromClassToken: 'text-[102.43rpx]',
    toClassToken: 'text-[103.43rpx]',
    fromEscapedClass: 'text-_b_102_2e43rpx_B',
    toEscapedClass: 'text-_b_103_2e43rpx_B',
    verifiedGlobalStyleEscapedClasses: ['text-_b_103_2e43rpx_B'],
    minRequiredGlobalStyleEscapedClasses: 1,
    rollbackVerifiedGlobalStyleRemovedClasses: ['text-_b_103_2e43rpx_B'],
    hotUpdateOutputMs: 10,
    hotUpdateEffectiveMs,
    hotUpdatePluginProcessMs: 2,
    hotUpdatePluginProcessSamples: [],
    rollbackOutputMs: 8,
    rollbackEffectiveMs: 9,
    rollbackPluginProcessMs: 1,
    rollbackPluginProcessSamples: [],
  }
}

function createRound(mutationKind: 'template' | 'script' | 'content'): MutationRoundMetrics {
  return {
    roundName: 'issue33-arbitrary',
    marker: `${mutationKind}-marker`,
    classLiteral: `${mutationKind}-class`,
    classTokens: [`${mutationKind}-class`],
    escapedClasses: [`${mutationKind}-class`],
    hotUpdateOutputMs: 10,
    hotUpdateEffectiveMs: 12,
    rollbackOutputMs: 8,
    rollbackEffectiveMs: 9,
    totalMs: 30,
  }
}

function createClassMetric(mutationKind: 'template' | 'script' | 'content', sourceFile: string) {
  const round = createRound(mutationKind)
  return {
    mutationKind,
    sourceFile,
    marker: round.marker,
    classLiteral: round.classLiteral,
    classTokens: round.classTokens,
    escapedClasses: round.escapedClasses,
    rounds: [round],
    verifyEscapedIn: ['js'],
    verifyClassLiteralIn: ['js'],
    globalStyleOutputs: [],
    minRequiredGlobalStyleEscapedClasses: 1,
    verifiedGlobalStyleEscapedClasses: [`${mutationKind}-class`],
    hotUpdateOutputMs: round.hotUpdateOutputMs,
    hotUpdateEffectiveMs: round.hotUpdateEffectiveMs,
    rollbackOutputMs: round.rollbackOutputMs,
    rollbackEffectiveMs: round.rollbackEffectiveMs,
  }
}

function createStyleMetric(sourceFile: string) {
  return {
    mutationKind: 'style',
    sourceFile,
    outputStyle: 'dist/app.wxss',
    marker: 'style-marker',
    styleNeedle: '.style-marker',
    outputNeedles: ['.style-marker'],
    rollbackNeedles: ['.style-marker'],
    applyUtilities: [],
    expectedApplyDeclarations: [],
    expectedApplyDeclarationGroups: [],
    functionDeclarations: [],
    expectedFunctionDeclarations: [],
    forbiddenFunctionFragments: [],
    hotUpdateOutputMs: 10,
    hotUpdateEffectiveMs: 12,
    hotUpdatePluginProcessMs: 0,
    hotUpdatePluginProcessSamples: [],
    rollbackOutputMs: 8,
    rollbackEffectiveMs: 9,
    rollbackPluginProcessMs: 0,
    rollbackPluginProcessSamples: [],
    rollbackNeedleCleared: true,
  }
}

describe('watch-hmr runner', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-runner-'))
    createWatchSessionMock.mockReset()
    runClassMutationMock.mockReset()
    runMainStyleHotUpdateMock.mockReset()
    runSubPackageMutationMock.mockReset()
    runStyleMutationMock.mockReset()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('runs content mutation after the primary HMR surfaces are warmed', async () => {
    const sourceFile = path.join(tempDir, 'index.tsx')
    const styleFile = path.join(tempDir, 'index.css')
    await writeFile(sourceFile, 'export default "anchor"\n', 'utf8')
    await writeFile(styleFile, '.anchor {}\n', 'utf8')
    const session: WatchSession = {
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: vi.fn(() => 0),
      logs: vi.fn(() => 'watch logs'),
      memorySamplesSince: vi.fn(() => [
        { at: 1, rssMb: 100, maxProcessRssMb: 90, processCount: 2 },
        { at: 2, rssMb: 125, maxProcessRssMb: 110, processCount: 2 },
      ]),
      memoryDebugSamplesSince: vi.fn(() => [
        {
          at: 2,
          bundler: 'vite',
          phase: 'generateBundle',
          durationMs: 10,
          data: {
            process: {
              heapUsedMb: 64,
              rssMb: 125,
            },
          },
        },
      ]),
      stop: vi.fn(async () => {}),
      pluginProcessSamplesSince: vi.fn(() => []),
    }
    createWatchSessionMock.mockResolvedValue(session)
    runClassMutationMock.mockImplementation((...args: unknown[]) => {
      const mutationKind = args[3] as 'template' | 'script' | 'content'
      return Promise.resolve(createClassMetric(mutationKind, sourceFile))
    })
    runStyleMutationMock.mockResolvedValue(createStyleMetric(styleFile))
    runMainStyleHotUpdateMock.mockResolvedValue(createMainStyleMetric(sourceFile))

    const watchCase: WatchCase = {
      name: 'taro-webpack-react-tailwindcss-v4',
      label: 'demo/taro-webpack-react-tailwindcss-v4',
      project: 'demo/taro-webpack-react-tailwindcss-v4',
      group: 'demo',
      cwd: tempDir,
      devScript: 'dev:e2e-watch',
      outputWxml: path.join(tempDir, 'dist/index.wxml'),
      outputJs: path.join(tempDir, 'dist/index.js'),
      outputStyleCandidates: [path.join(tempDir, 'dist/index.wxss')],
      globalStyleCandidates: [path.join(tempDir, 'dist/app.wxss')],
      contentMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => source,
      },
      templateMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => source,
      },
      scriptMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => source,
      },
      styleMutation: {
        sourceFile: styleFile,
        mutate: source => source,
      },
    }

    const result = await runCase(watchCase, createOptions())

    expect(runClassMutationMock.mock.calls.map(call => call[3])).toEqual([
      'template',
      'script',
      'content',
    ])
    expect(runStyleMutationMock).toHaveBeenCalledTimes(1)
    expect(runClassMutationMock.mock.invocationCallOrder[2]).toBeGreaterThan(
      runStyleMutationMock.mock.invocationCallOrder[0]!,
    )
    expect(result.mutationMetrics.map(metric => metric.mutationKind)).toEqual([
      'template',
      'script',
      'style',
      'content',
    ])
    expect(result.memoryDebugSamples?.[0]?.data).toMatchObject({
      process: {
        heapUsedMb: 64,
        rssMb: 125,
      },
    })
    expect(session.stop).toHaveBeenCalledTimes(1)
  })

  it('limits main-style-only subpackage checks for slow PR smoke runs', async () => {
    const sourceFile = path.join(tempDir, 'index.mpx')
    const normalSubSource = path.join(tempDir, 'sub-normal.mpx')
    const independentSubSource = path.join(tempDir, 'sub-independent.mpx')
    await writeFile(sourceFile, '<template></template>\n', 'utf8')
    await writeFile(normalSubSource, '<template></template>\n', 'utf8')
    await writeFile(independentSubSource, '<template></template>\n', 'utf8')
    const session: WatchSession = {
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: vi.fn(() => 0),
      logs: vi.fn(() => 'watch logs'),
      memorySamplesSince: vi.fn(() => []),
      memoryDebugSamplesSince: vi.fn(() => []),
      stop: vi.fn(async () => {}),
      pluginProcessSamplesSince: vi.fn(() => []),
    }
    createWatchSessionMock.mockResolvedValue(session)
    runMainStyleHotUpdateMock.mockImplementation((watchCase: WatchCase) => {
      return Promise.resolve(createMainStyleMetric(watchCase.templateMutation.sourceFile, watchCase.label.includes('sub-normal') ? 24 : 12))
    })

    const watchCase: WatchCase = {
      name: 'mpx-tailwindcss-v4',
      label: 'demo/mpx-tailwindcss-v4',
      project: 'demo/mpx-tailwindcss-v4',
      group: 'demo',
      cwd: tempDir,
      devScript: 'dev:e2e-watch',
      outputWxml: path.join(tempDir, 'dist/index.wxml'),
      outputJs: path.join(tempDir, 'dist/index.js'),
      outputStyleCandidates: [path.join(tempDir, 'dist/index.wxss')],
      globalStyleCandidates: [path.join(tempDir, 'dist/app.wxss')],
      templateMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => `${source}\n<!-- root -->`,
      },
      scriptMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => source,
      },
      styleMutation: {
        sourceFile,
        mutate: source => source,
      },
      subPackageMutations: [
        {
          root: 'sub-normal',
          independent: false,
          outputWxml: path.join(tempDir, 'dist/sub-normal/index.wxml'),
          outputJs: path.join(tempDir, 'dist/sub-normal/index.js'),
          outputStyleCandidates: [path.join(tempDir, 'dist/sub-normal/index.wxss')],
          globalStyleCandidates: [path.join(tempDir, 'dist/sub-normal/app.wxss')],
          templateMutation: {
            sourceFile: normalSubSource,
            verifyEscapedIn: ['js'],
            mutate: source => `${source}\n<!-- normal -->`,
          },
          styleMutation: {
            sourceFile: normalSubSource,
            mutate: source => source,
          },
        },
        {
          root: 'sub-independent',
          independent: true,
          outputWxml: path.join(tempDir, 'dist/sub-independent/index.wxml'),
          outputJs: path.join(tempDir, 'dist/sub-independent/index.js'),
          outputStyleCandidates: [path.join(tempDir, 'dist/sub-independent/index.wxss')],
          globalStyleCandidates: [path.join(tempDir, 'dist/sub-independent/app.wxss')],
          templateMutation: {
            sourceFile: independentSubSource,
            verifyEscapedIn: ['js'],
            mutate: source => `${source}\n<!-- independent -->`,
          },
          styleMutation: {
            sourceFile: independentSubSource,
            mutate: source => source,
          },
        },
      ],
    }

    const result = await runMainStyleOnlyCase(watchCase, {
      ...createOptions(),
      mainStyleOnly: true,
      mainStyleSubPackageLimit: 1,
    })

    expect(runMainStyleHotUpdateMock).toHaveBeenCalledTimes(2)
    expect(result.subPackageMainStyleHotUpdates).toHaveLength(1)
    expect(result.subPackageMainStyleHotUpdates?.[0]).toMatchObject({
      root: 'sub-normal',
      independent: false,
    })
    expect(session.stop).toHaveBeenCalledTimes(1)
  })

  it('runs normal and independent subpackages without repeating main-package mutations', async () => {
    const sourceFile = path.join(tempDir, 'index.tsx')
    const styleFile = path.join(tempDir, 'index.css')
    const normalSubSource = path.join(tempDir, 'sub-normal.tsx')
    const independentSubSource = path.join(tempDir, 'sub-independent.tsx')
    for (const file of [sourceFile, styleFile, normalSubSource, independentSubSource]) {
      await writeFile(file, 'export default "anchor"\n', 'utf8')
    }
    const session: WatchSession = {
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: vi.fn(() => 0),
      logs: vi.fn(() => 'watch logs'),
      memorySamplesSince: vi.fn(() => [
        { at: 1, rssMb: 100, maxProcessRssMb: 90, processCount: 2 },
      ]),
      memoryDebugSamplesSince: vi.fn(() => []),
      stop: vi.fn(async () => {}),
      pluginProcessSamplesSince: vi.fn(() => []),
    }
    createWatchSessionMock.mockResolvedValue(session)
    runSubPackageMutationMock.mockImplementation((_watchCase: WatchCase, _options: CliOptions, _session: WatchSession, mutation: NonNullable<WatchCase['subPackageMutations']>[number]) => {
      return Promise.resolve({
        root: mutation.root,
        independent: mutation.independent,
        outputWxml: mutation.outputWxml,
        outputJs: mutation.outputJs,
        globalStyleOutputs: mutation.globalStyleCandidates,
        template: createClassMetric('template', mutation.templateMutation.sourceFile),
        style: createStyleMetric(mutation.styleMutation.sourceFile),
      })
    })

    const createSubPackageMutation = (root: 'sub-normal' | 'sub-independent', sourcePath: string) => ({
      root,
      independent: root === 'sub-independent',
      outputWxml: path.join(tempDir, `dist/${root}/index.wxml`),
      outputJs: path.join(tempDir, `dist/${root}/index.js`),
      outputStyleCandidates: [path.join(tempDir, `dist/${root}/index.wxss`)],
      globalStyleCandidates: [path.join(tempDir, `dist/${root}/app.wxss`)],
      templateMutation: {
        sourceFile: sourcePath,
        verifyEscapedIn: ['js'] as const,
        mutate: (source: string) => source,
      },
      styleMutation: {
        sourceFile: sourcePath,
        mutate: (source: string) => source,
      },
    })
    const watchCase: WatchCase = {
      name: 'taro-vite-react-tailwindcss-v4',
      label: 'demo/taro-vite-react-tailwindcss-v4',
      project: 'demo/taro-vite-react-tailwindcss-v4',
      group: 'demo',
      cwd: tempDir,
      devScript: 'dev:e2e-watch',
      outputWxml: path.join(tempDir, 'dist/index.wxml'),
      outputJs: path.join(tempDir, 'dist/index.js'),
      outputStyleCandidates: [path.join(tempDir, 'dist/index.wxss')],
      globalStyleCandidates: [path.join(tempDir, 'dist/app.wxss')],
      templateMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => source,
      },
      scriptMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => source,
      },
      styleMutation: {
        sourceFile: styleFile,
        mutate: source => source,
      },
      subPackageMutations: [
        createSubPackageMutation('sub-normal', normalSubSource),
        createSubPackageMutation('sub-independent', independentSubSource),
      ],
    }

    const result = await runSubPackagesOnlyCase(watchCase, {
      ...createOptions(),
      miniProgramOnly: true,
      miniProgramScope: 'subpackages',
    })

    expect(runClassMutationMock).not.toHaveBeenCalled()
    expect(runSubPackageMutationMock).toHaveBeenCalledTimes(2)
    expect(result.subPackageMutationMetrics.map(metric => metric.root).sort()).toEqual([
      'sub-independent',
      'sub-normal',
    ])
    expect(result.mutationMetrics.map(metric => metric.mutationKind)).toEqual([
      'template',
      'style',
      'template',
      'style',
    ])
    expect(session.stop).toHaveBeenCalledTimes(2)
  })

  it('throws partial metrics when main-style-only fails after root metrics are collected', async () => {
    const sourceFile = path.join(tempDir, 'index.mpx')
    const subSource = path.join(tempDir, 'sub-normal.mpx')
    await writeFile(sourceFile, '<template></template>\n', 'utf8')
    await writeFile(subSource, '<template></template>\n', 'utf8')
    const session: WatchSession = {
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: vi.fn(() => 0),
      logs: vi.fn(() => 'watch logs'),
      memorySamplesSince: vi.fn(() => [
        { at: 1, rssMb: 100, maxProcessRssMb: 80, processCount: 1 },
      ]),
      memoryDebugSamplesSince: vi.fn(() => []),
      stop: vi.fn(async () => {}),
      pluginProcessSamplesSince: vi.fn(() => []),
    }
    createWatchSessionMock.mockResolvedValue(session)
    runMainStyleHotUpdateMock
      .mockResolvedValueOnce(createMainStyleMetric(sourceFile))
      .mockRejectedValueOnce(new Error('subpackage timeout'))

    const watchCase: WatchCase = {
      name: 'mpx-tailwindcss-v4',
      label: 'demo/mpx-tailwindcss-v4',
      project: 'demo/mpx-tailwindcss-v4',
      group: 'demo',
      cwd: tempDir,
      devScript: 'dev:e2e-watch',
      outputWxml: path.join(tempDir, 'dist/index.wxml'),
      outputJs: path.join(tempDir, 'dist/index.js'),
      outputStyleCandidates: [path.join(tempDir, 'dist/index.wxss')],
      globalStyleCandidates: [path.join(tempDir, 'dist/app.wxss')],
      templateMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => `${source}\n<!-- root -->`,
      },
      scriptMutation: {
        sourceFile,
        verifyEscapedIn: ['js'],
        mutate: source => source,
      },
      styleMutation: {
        sourceFile,
        mutate: source => source,
      },
      subPackageMutations: [{
        root: 'sub-normal',
        independent: false,
        outputWxml: path.join(tempDir, 'dist/sub-normal/index.wxml'),
        outputJs: path.join(tempDir, 'dist/sub-normal/index.js'),
        outputStyleCandidates: [path.join(tempDir, 'dist/sub-normal/index.wxss')],
        globalStyleCandidates: [path.join(tempDir, 'dist/sub-normal/app.wxss')],
        templateMutation: {
          sourceFile: subSource,
          verifyEscapedIn: ['js'],
          mutate: source => `${source}\n<!-- normal -->`,
        },
        styleMutation: {
          sourceFile: subSource,
          mutate: source => source,
        },
      }],
    }

    await expect(runMainStyleOnlyCase(watchCase, {
      ...createOptions(),
      mainStyleOnly: true,
    })).rejects.toMatchObject({
      name: 'WatchHmrPartialMetricsError',
      metrics: {
        name: 'mpx-tailwindcss-v4',
        memoryPeakRssMb: 100,
        subPackageMainStyleHotUpdates: [],
      },
    } satisfies Partial<WatchHmrPartialMetricsError>)
    expect(session.stop).toHaveBeenCalledTimes(1)
  })
})
