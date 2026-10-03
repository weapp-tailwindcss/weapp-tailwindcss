import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildDemoBaseCases,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/base'
import {
  collectWatchArtifactSnapshot,
  createWatchCaseArtifacts,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/artifacts'
import {
  buildDemoExtendedCases,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/extended'
import {
  buildUniAppHBuilderXCases,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/hbuilderx'
import {
  buildCases,
  filterCasesForPlatform,
  pickCases,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import {
  buildHexScriptRoundConfigs,
  buildIssue33HighRiskRoundConfigs,
  buildTailwindV4JsContentRoundConfigs,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/round-configs'
import {
  summarizeHmrDurations,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/hmr-durations'
import {
  resolveReportPath,
  resolveRepositoryRootLabel,
  summarizeMetrics,
  summarizeMetricsByGroup,
  summarizeMetricsByProject,
  summarizeMetricsByRound,
  summarizeMutationKindAcrossCases,
  summarizeMutationMetricsByKind,
  summarizeSamples,
  writeReport,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/summary'
import {
  buildSpeedReport,
  collectSpeedSamplesFromReport,
  renderSpeedReportMarkdown,
  summarizeSpeedSamples,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/speed-report'
import {
  assertMemoryBudget,
  assertHotUpdateBudget,
  assertPluginProcessBudget,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/runner'
import {
  summarizeMemoryDebugSamples,
  summarizeMemorySamples,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory-report'
import {
  createWindowsProcessTreeMemoryScript,
  isCompileSuccessLine,
  parsePluginProcessSample,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import {
  resolveOptions,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cli'
import {
  createStyleMutationPayload,
  expandOutputFileEntries,
  assertNoUnsupportedMiniProgramCssImport,
  createClassMutationScenario,
  collectPluginProcessMetrics,
  hasResolvedOutputFiles,
  isOutputFileCandidate,
  readJoinedOutputFiles,
  resolveCompileSettleTimeoutMs,
  waitForCompileSettled,
  waitForInitialWarmup,
  waitForOutputsReady,
  waitForOutputsUpdated,
  waitForOutputFilesUpdated,
  waitForOutputFilesUpdatedWithDiagnostics,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'
import {
  ISSUE33_ADD_CLASS_TOKENS,
  ISSUE33_MODIFY_CLASS_TOKENS,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/tokens'
import {
  runAddedClassMutation,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/added-class'
import {
  alignContentEol,
  appendTrailingSnippet,
  assertContains,
  assertContainsOneOf,
  assertNotContains,
  createStyleRuleSnippet,
  escapeRegExp,
  findCssRuleBody,
  findCssRuleBodies,
  getMtime,
  insertBeforeAnchor,
  insertBeforeClosingTag,
  insertIntoVueTemplateRoot,
  mutateScriptByDataAnchor,
  mutateSfcStyleBlock,
  mutateTsxScriptByReturnAnchor,
  mutateTsxScriptByReturnAnchorWithCommentCarrier,
  mutateVueRefStringLiteral,
  mutateVueScriptSetupObjectKeyByAnchor,
  mutateVueScriptSetupObjectKeyByAnchorWithCommentCarrier,
  mutateVueScriptSetupArrayByAnchor,
  mutateVueScriptSetupArrayByAnchorWithCommentCarrier,
  normalizeCssDeclaration,
  replaceExactSnippet,
  readFileIfExists,
  readFileWithRetry,
  waitFor,
  writeFilePreserveEol,
  writeWatchedFilePreserveEol,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import {
  createWebHmrReloadRecovery,
  isWebCompileDoneLogLine,
  isWebCompileReadyLogLine,
  resolveChromiumLaunchOptions,
  resolveWebHmrDomAttachTimeout,
  resolveWebHmrMarkerAttachTimeout,
  resolveWebHmrReloadStallMs,
  waitForWebPageReloadReady,
  waitForWebPageReady,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/web'
import {
  resolveReloadAcceptAttemptTimeout,
  resolveWebCompileSettleTimeoutMs,
  waitForWebCompileSettled,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/web-compile-settle'
import {
  buildWatchHmrArgs,
  resolveWatchCommandOptions,
} from '../../../e2e/run-hot-update'
import {
  collectSubPackageStyleOutputs,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/subpackage'
import { replaceWxml } from '../src/wxml/shared'
import type {
  CliOptions,
  MainStyleHotUpdateMetrics,
  MutationRoundMetrics,
  WatchCase,
  WatchCaseMetrics,
  WatchCaseMutationMetrics,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'

const payload = {
  marker: 'tw-watch-20260313',
  classLiteral: 'text-[#123456] bg-[#0f0f0f]',
  classVariableName: '__twWatchClass',
}

async function readContractSource(file: string, expected: string) {
  let source = ''
  await waitFor(async () => {
    source = await readFileIfExists(file) ?? ''
    return source.includes(expected)
  }, {
    timeoutMs: 5_000,
    pollMs: 40,
    message: `contract source did not stabilize: ${file}`,
  })
  return source
}

const pluginProcessSample = {
  at: 1,
  bundler: 'vite',
  phase: 'generateBundle',
  durationMs: 25,
}

function createMainStyleHotUpdateMetrics(
  sourceFile: string,
  hotUpdateEffectiveMs: number,
  rollbackEffectiveMs: number,
): MainStyleHotUpdateMetrics {
  return {
    label: 'text-[102.43rpx] to text-[103.43rpx]',
    mutationKind: 'template',
    sourceFile,
    verifyEscapedIn: ['wxml'],
    verifyClassLiteralIn: [],
    fromClassToken: 'text-[102.43rpx]',
    toClassToken: 'text-[103.43rpx]',
    fromEscapedClass: 'text-_b_102_2e43rpx_B',
    toEscapedClass: 'text-_b_103_2e43rpx_B',
    verifiedGlobalStyleEscapedClasses: ['text-_b_103_2e43rpx_B'],
    minRequiredGlobalStyleEscapedClasses: 1,
    rollbackVerifiedGlobalStyleRemovedClasses: ['text-_b_102_2e43rpx_B', 'text-_b_103_2e43rpx_B'],
    hotUpdateOutputMs: hotUpdateEffectiveMs + 10,
    hotUpdateEffectiveMs,
    hotUpdateOutputDiagnostics: {
      trigger: 'semantic',
      elapsedMs: hotUpdateEffectiveMs + 10,
      fileCount: 3,
      resolvedFileCount: 2,
      exactFileUpdated: true,
      globFileUpdated: false,
      semanticAccepted: true,
      missingExactFiles: [],
      updatedFiles: ['dist/app.wxss'],
    },
    hotUpdatePluginProcessMs: 24,
    hotUpdatePluginProcessSamples: [{ ...pluginProcessSample, durationMs: 24 }],
    rollbackOutputMs: rollbackEffectiveMs + 10,
    rollbackEffectiveMs,
    rollbackOutputDiagnostics: {
      trigger: 'semantic',
      elapsedMs: rollbackEffectiveMs + 10,
      fileCount: 3,
      resolvedFileCount: 2,
      exactFileUpdated: true,
      globFileUpdated: false,
      semanticAccepted: true,
      missingExactFiles: [],
      updatedFiles: ['dist/app.wxss'],
    },
    rollbackPluginProcessMs: 19,
    rollbackPluginProcessSamples: [{ ...pluginProcessSample, durationMs: 19 }],
  }
}

function toSlashPath(filePath: string) {
  return filePath.replace(/\\/g, '/')
}

function toRepoPath(filePath: string) {
  return toSlashPath(filePath).replace(/^[A-Z]:(?=\/)/i, '')
}

function createRound(roundName: MutationRoundMetrics['roundName'], hotUpdateEffectiveMs: number, rollbackEffectiveMs: number): MutationRoundMetrics {
  return {
    roundName,
    marker: `${roundName}-marker`,
    classLiteral: 'text-[#123456]',
    classTokens: ['text-[#123456]'],
    escapedClasses: ['text-_b_h123456_B'],
    hotUpdateOutputMs: hotUpdateEffectiveMs + 10,
    hotUpdateEffectiveMs,
    hotUpdatePluginProcessMs: 25,
    hotUpdatePluginProcessSamples: [pluginProcessSample],
    rollbackOutputMs: rollbackEffectiveMs + 10,
    rollbackEffectiveMs,
    rollbackPluginProcessMs: 20,
    rollbackPluginProcessSamples: [{ ...pluginProcessSample, durationMs: 20 }],
    totalMs: hotUpdateEffectiveMs + rollbackEffectiveMs,
  }
}

function expectTaroGeneratorTargetConfig(configSource: string, configPath: string) {
  expect(configSource, configPath).toContain('target:')
  expect(configSource, configPath).toContain('\'web\'')
  expect(configSource, configPath).toContain('\'weapp\'')

  if (configSource.includes('target: isWebLikeTarget')) {
    expect(configSource, configPath).toContain('const taroEnv = process.env.TARO_ENV')
    expect(configSource, configPath).toContain('const isWebLikeTarget =')
    expect(configSource, configPath).toContain('taroEnv === \'h5\'')
    expect(configSource, configPath).toContain('taroEnv === \'harmony\'')
    expect(configSource, configPath).toContain('taroEnv === \'harmony-hybrid\'')
    return
  }

  if (configSource.includes('resolveTaroPlatform()')) {
    expect(configSource, configPath).toContain('taroPlatform.isWeb')
  }
  else {
    expect(configSource, configPath).toContain('process.env.TARO_ENV === \'h5\'')
  }
  expect(configSource, configPath).toContain('process.env.TARO_ENV === \'harmony\'')
  expect(configSource, configPath).toContain('process.env.TARO_ENV === \'harmony-hybrid\'')
}

function createClassMutationMetrics(
  mutationKind: 'template' | 'script' | 'content',
  rounds: MutationRoundMetrics[],
): WatchCaseMutationMetrics {
  return {
    mutationKind,
    sourceFile: `${mutationKind}.ts`,
    marker: `${mutationKind}-marker`,
    classLiteral: 'text-[#123456]',
    classTokens: ['text-[#123456]'],
    escapedClasses: ['text-_b_h123456_B'],
    rounds,
    verifyEscapedIn: ['wxml'],
    verifyClassLiteralIn: ['js'],
    globalStyleOutputs: [],
    minRequiredGlobalStyleEscapedClasses: 0,
    verifiedGlobalStyleEscapedClasses: [],
    hotUpdateOutputMs: 40,
    hotUpdateEffectiveMs: 30,
    hotUpdatePluginProcessMs: 25,
    hotUpdatePluginProcessSamples: [pluginProcessSample],
    rollbackOutputMs: 50,
    rollbackEffectiveMs: 35,
    rollbackPluginProcessMs: 20,
    rollbackPluginProcessSamples: [{ ...pluginProcessSample, durationMs: 20 }],
  }
}

function createStyleMutationMetrics(): WatchCaseMutationMetrics {
  return {
    mutationKind: 'style',
    sourceFile: 'style.css',
    outputStyle: 'app.wxss',
    marker: 'style-marker',
    styleNeedle: '.watch-style-marker',
    outputNeedles: ['.watch-style-marker'],
    rollbackNeedles: ['.watch-style-marker'],
    applyUtilities: ['font-bold'],
    expectedApplyDeclarations: ['font-weight:'],
    expectedApplyDeclarationGroups: [],
    functionNeedle: '.watch-style-marker-theme',
    functionDeclarations: ['padding: theme(\'spacing.2\');'],
    expectedFunctionDeclarations: ['padding:'],
    forbiddenFunctionFragments: ['theme('],
    hotUpdateOutputMs: 45,
    hotUpdateEffectiveMs: 32,
    hotUpdatePluginProcessMs: 22,
    hotUpdatePluginProcessSamples: [{ ...pluginProcessSample, durationMs: 22 }],
    rollbackOutputMs: 55,
    rollbackEffectiveMs: 36,
    rollbackPluginProcessMs: 18,
    rollbackPluginProcessSamples: [{ ...pluginProcessSample, durationMs: 18 }],
    rollbackNeedleCleared: true,
  }
}

function createCase(
  name: WatchCaseMetrics['name'],
  projectGroup: WatchCaseMetrics['projectGroup'],
  hotUpdateEffectiveMs: number,
  rollbackEffectiveMs: number,
): WatchCaseMetrics {
  const complexRound = createRound('complex-corpus', hotUpdateEffectiveMs, rollbackEffectiveMs)
  const memorySamples = [
    { at: 1, rssMb: 100, maxProcessRssMb: 90, processCount: 2 },
    {
      at: 2,
      rssMb: 132,
      maxProcessRssMb: 118,
      processCount: 2,
      topProcesses: [
        { pid: 10, ppid: 1, rssMb: 118, command: 'node demo-watch' },
        { pid: 11, ppid: 10, rssMb: 14, command: 'worker' },
      ],
    },
  ]
  const memoryDebugSamples = [
    {
      at: 2,
      bundler: 'vite',
      phase: 'generateBundle',
      durationMs: 22,
      data: {
        bundle: {
          hasOmittedKnownFiles: true,
        },
        process: {
          heapUsedMb: 64,
          rssMb: 132,
        },
        processCache: {
          staleCacheKeys: 1,
          staleHashKeys: 2,
          pruneSkipped: true,
        },
      },
    },
  ]
  const memorySummary = summarizeMemorySamples(memorySamples)
  const memoryDebugSummary = summarizeMemoryDebugSamples(memoryDebugSamples)
  return {
    name,
    label: `${name} label`,
    project: `${projectGroup}-${name}`,
    projectGroup,
    marker: `${name}-marker`,
    classLiteral: 'text-[#123456]',
    classTokens: ['text-[#123456]'],
    escapedClasses: ['text-_b_h123456_B'],
    rounds: [
      createRound('baseline-arbitrary', hotUpdateEffectiveMs + 5, rollbackEffectiveMs + 5),
      complexRound,
      createRound('hex-arbitrary', hotUpdateEffectiveMs + 10, rollbackEffectiveMs + 10),
      createRound('issue33-arbitrary', hotUpdateEffectiveMs + 15, rollbackEffectiveMs + 15),
    ],
    verifyEscapedIn: ['wxml'],
    verifyClassLiteralIn: ['js'],
    globalStyleOutputs: [],
    mutationMetrics: [
      createClassMutationMetrics('template', [complexRound]),
      createClassMutationMetrics('script', [complexRound]),
      createClassMutationMetrics('content', [complexRound]),
      createStyleMutationMetrics(),
    ],
    mainStyleHotUpdate: createMainStyleHotUpdateMetrics('template.ts', hotUpdateEffectiveMs + 2, rollbackEffectiveMs + 2),
    subPackageMutationMetrics: [],
    summaryByMutationKind: {},
    initialReadyMs: 25,
    hotUpdateOutputMs: hotUpdateEffectiveMs + 10,
    hotUpdateEffectiveMs,
    hotUpdatePluginProcessMs: complexRound.hotUpdatePluginProcessMs,
    hotUpdatePluginProcessSamples: complexRound.hotUpdatePluginProcessSamples,
    rollbackOutputMs: rollbackEffectiveMs + 10,
    rollbackEffectiveMs,
    rollbackPluginProcessMs: complexRound.rollbackPluginProcessMs,
    rollbackPluginProcessSamples: complexRound.rollbackPluginProcessSamples,
    totalMs: hotUpdateEffectiveMs + rollbackEffectiveMs + 25,
    memorySamples,
    memoryDebugSamples,
    memorySummary,
    memoryDebugSummary,
    memoryPeakRssMb: memorySummary.peakRssMb,
    memoryRssDeltaMb: memorySummary.rssDeltaMb,
  }
}

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('watch-hmr regression text helpers', () => {
  it('rejects unsupported mini-program css imports while allowing local imports', () => {
    expect(() => assertNoUnsupportedMiniProgramCssImport(
      { label: 'unit-case' },
      [
        '@import "./local.wxss";',
        '@import "../shared.wxss";',
        '@import "/absolute.wxss";',
        '.safe{color:red}',
      ].join('\n'),
      'unit',
    )).not.toThrow()

    for (const css of [
      '@import "tailwindcss" source(none);',
      '@import "third-party-ui/dist/theme.css";',
      '@import url("https://example.com/theme.css");',
    ]) {
      expect(() => assertNoUnsupportedMiniProgramCssImport({ label: 'unit-case' }, css, 'unit')).toThrow(
        /unsupported mini-program CSS import/,
      )
    }
  })

  it('aligns EOLs to match the source file', () => {
    expect(alignContentEol('a\nb\n', 'first\r\nsecond\r\n')).toBe('a\r\nb\r\n')
    expect(alignContentEol('a\r\nb\r\n', 'first\nsecond\n')).toBe('a\nb\n')
  })

  it('reads, writes and probes file metadata', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-text-'))
    tempDirs.push(tempDir)
    const file = path.join(tempDir, 'sample.txt')

    await writeFilePreserveEol(file, 'alpha\nbeta\n', 'one\r\ntwo\r\n')

    expect(await readFileWithRetry(file)).toBe('alpha\r\nbeta\r\n')
    expect(await readFileIfExists(path.join(tempDir, 'missing.txt'))).toBeUndefined()
    expect(await getMtime(file)).toBeGreaterThan(0)
    expect(await getMtime(path.join(tempDir, 'missing.txt'))).toBe(0)
  })

  it('keeps source file mtimes moving forward for rapid watch mutations', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-mtime-'))
    tempDirs.push(tempDir)
    const file = path.join(tempDir, 'sample.txt')

    await writeFilePreserveEol(file, 'alpha\n', 'alpha\n')
    const before = await stat(file)
    await writeFilePreserveEol(file, 'beta\n', 'alpha\n')
    const after = await stat(file)

    expect(after.mtimeMs).toBeGreaterThan(before.mtimeMs)
  })

  it('preserves watched file identity across consecutive in-place mutations', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-identity-'))
    tempDirs.push(tempDir)
    const file = path.join(tempDir, 'sample.tsx')
    await writeFile(file, 'const state = "initial"\n', 'utf8')
    const before = await stat(file)
    const rename = vi.spyOn(fs, 'rename')

    try {
      await writeWatchedFilePreserveEol(file, 'const state = "updated"\n', 'const state = "initial"\n')
      const afterFirstMutation = await stat(file)
      await writeWatchedFilePreserveEol(file, 'const state = "rollback"\n', 'const state = "initial"\n')
      const afterRollback = await stat(file)

      expect(rename).not.toHaveBeenCalled()
      expect(afterFirstMutation.ino).toBe(before.ino)
      expect(afterRollback.ino).toBe(before.ino)
      expect(afterFirstMutation.mtimeMs).toBeGreaterThan(before.mtimeMs)
      expect(afterRollback.mtimeMs).toBeGreaterThan(afterFirstMutation.mtimeMs)
      expect(await readFile(file, 'utf8')).toBe('const state = "rollback"\n')
    }
    finally {
      rename.mockRestore()
    }
  })

  it('keeps the previous source readable until an atomic watch mutation is ready', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-atomic-'))
    tempDirs.push(tempDir)
    const file = path.join(tempDir, 'sample.vue')
    const originalSource = '<template>\n  <view>original</view>\n</template>\n'
    const updatedSource = '<template>\n  <view>updated</view>\n</template>\n'
    await writeFile(file, originalSource, 'utf8')

    let allowRename!: () => void
    let notifyRenameStarted!: () => void
    const renameStarted = new Promise<void>((resolve) => {
      notifyRenameStarted = resolve
    })
    const renameAllowed = new Promise<void>((resolve) => {
      allowRename = resolve
    })
    const originalRename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementationOnce(async (source, destination) => {
      notifyRenameStarted()
      await renameAllowed
      await originalRename(source, destination)
    })

    const mutation = writeFilePreserveEol(file, updatedSource, originalSource)
    await renameStarted
    expect(await readFile(file, 'utf8')).toBe(originalSource)

    allowRename()
    await mutation
    expect(await readFile(file, 'utf8')).toBe(updatedSource)
  })

  it('expands wildcard output files so hashed style assets can be re-discovered', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-glob-'))
    tempDirs.push(tempDir)
    const styleDir = path.join(tempDir, 'styles')
    await mkdir(styleDir, { recursive: true })
    await writeFilePreserveEol(path.join(styleDir, 'utilities123.wxss'), '.a{}', '.a{}')
    await writeFilePreserveEol(path.join(styleDir, 'utilities456.wxss'), '.b{}', '.b{}')

    const resolved = await expandOutputFileEntries([
      path.join(styleDir, 'utilities*.wxss'),
    ])
    const joined = await readJoinedOutputFiles([
      path.join(styleDir, 'utilities*.wxss'),
    ])

    expect(resolved).toEqual([
      path.join(styleDir, 'utilities123.wxss'),
      path.join(styleDir, 'utilities456.wxss'),
    ])
    expect(joined).toContain('.a{}')
    expect(joined).toContain('.b{}')
  })

  it('ignores virtual style module ids when resolving output files', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-virtual-output-'))
    tempDirs.push(tempDir)
    const componentFile = path.join(tempDir, 'components', 'HelloWorld.vue')
    const virtualStyleId = `${componentFile}?vue&type=style&index=0&scoped=e17ea971&lang.css`
    await mkdir(path.dirname(componentFile), { recursive: true })
    await writeFilePreserveEol(componentFile, '<style>.ignored{}</style>', '<style>.ignored{}</style>')

    expect(isOutputFileCandidate(virtualStyleId)).toBe(false)
    await expect(expandOutputFileEntries([virtualStyleId])).resolves.toEqual([])
    await expect(readJoinedOutputFiles([virtualStyleId])).resolves.toBe('')
  })

  it('re-reads wildcard output files after hashed style assets change', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-glob-refresh-'))
    tempDirs.push(tempDir)
    const styleDir = path.join(tempDir, 'styles')
    const pattern = path.join(styleDir, 'index*.wxss')
    await mkdir(styleDir, { recursive: true })
    await writeFilePreserveEol(path.join(styleDir, 'index111.wxss'), '.old{}', '.old{}')

    const before = await readJoinedOutputFiles([pattern])
    await rm(path.join(styleDir, 'index111.wxss'))
    await writeFilePreserveEol(path.join(styleDir, 'index222.wxss'), '.fresh{}', '.fresh{}')
    const after = await readJoinedOutputFiles([pattern])

    expect(before).toContain('.old{}')
    expect(after).not.toContain('.old{}')
    expect(after).toContain('.fresh{}')
  })

  it('treats empty generated style files as resolved outputs', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-empty-style-'))
    tempDirs.push(tempDir)
    const outputFile = path.join(tempDir, 'app.wxss')
    await writeFilePreserveEol(outputFile, '', '')

    await expect(hasResolvedOutputFiles([outputFile])).resolves.toBe(true)
    await expect(readJoinedOutputFiles([outputFile])).resolves.toBe('')
  })

  it('waits for predicates and reports timeout failures', async () => {
    let attempt = 0
    let tickCount = 0
    const timeoutMs = 200
    const elapsed = await waitFor(
      () => ++attempt > 2,
      {
        timeoutMs,
        pollMs: 1,
        message: 'waited too long',
        onTick: () => {
          tickCount += 1
        },
      },
    )

    expect(attempt).toBe(3)
    expect(tickCount).toBe(5)
    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(elapsed).toBeLessThan(timeoutMs)

    await expect(() => {
      return waitFor(
        () => false,
        {
          timeoutMs: 5,
          pollMs: 1,
          message: 'timeout message',
        },
      )
    }).rejects.toThrow('timeout message')
  })

  it('checks watch process state before the first predicate run', async () => {
    let predicateCalled = false

    await expect(() => {
      return waitFor(
        () => {
          predicateCalled = true
          return true
        },
        {
          timeoutMs: 50,
          pollMs: 1,
          message: 'timeout message',
          onTick: () => {
            throw new Error('watch process exited unexpectedly')
          },
        },
      )
    }).rejects.toThrow('watch process exited unexpectedly')

    expect(predicateCalled).toBe(false)
  })

  it('allows output file update waits to pass via semantic fallback when mtimes stay unchanged', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-output-update-'))
    tempDirs.push(tempDir)
    const outputFile = path.join(tempDir, 'app.wxss')
    await writeFilePreserveEol(outputFile, '.base{}', '.base{}')
    const baselineMtime = await getMtime(outputFile)
    let attempts = 0

    const elapsed = await waitForOutputFilesUpdated(
      {
        label: 'demo/fixture-project',
      } as any,
      [outputFile],
      new Map([[outputFile, baselineMtime]]),
      {
        timeoutMs: 100,
        pollMs: 1,
      } as CliOptions,
      {
        ensureRunning() {},
      } as any,
      Date.now(),
      async () => {
        attempts += 1
        return attempts >= 2
      },
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(attempts).toBeGreaterThanOrEqual(2)
  })

  it('reports output wait diagnostics for semantic fallback updates', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-output-diagnostics-'))
    tempDirs.push(tempDir)
    const outputFile = path.join(tempDir, 'app.wxss')
    await writeFilePreserveEol(outputFile, '.base{}', '.base{}')
    const baselineMtime = await getMtime(outputFile)
    let attempts = 0

    const diagnostics = await waitForOutputFilesUpdatedWithDiagnostics(
      {
        label: 'demo/mpx-tailwindcss-v4',
      } as any,
      [outputFile, path.join(tempDir, 'missing.wxss')],
      new Map([[outputFile, baselineMtime]]),
      {
        timeoutMs: 100,
        pollMs: 1,
      } as CliOptions,
      {
        ensureRunning() {},
      } as any,
      Date.now(),
      async () => {
        attempts += 1
        return attempts >= 2
      },
    )

    expect(diagnostics).toMatchObject({
      trigger: 'semantic',
      fileCount: 2,
      exactFileUpdated: false,
      semanticAccepted: true,
      missingExactFiles: [path.join(tempDir, 'missing.wxss')],
      updatedFiles: [],
    })
    expect(diagnostics.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('allows primary output update waits to pass via semantic fallback when mtimes stay unchanged', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-primary-output-update-'))
    tempDirs.push(tempDir)
    const wxmlFile = path.join(tempDir, 'index.wxml')
    const jsFile = path.join(tempDir, 'index.js')
    await writeFilePreserveEol(wxmlFile, '<view class="base"></view>', '<view />')
    await writeFilePreserveEol(jsFile, 'Page({})', 'Page({})')
    const baseline = {
      wxml: await getMtime(wxmlFile),
      js: await getMtime(jsFile),
    }
    let attempts = 0

    const elapsed = await waitForOutputsUpdated(
      {
        label: 'demo/taro-vite-vue3-tailwindcss-v4',
        outputWxml: wxmlFile,
        outputJs: jsFile,
      } as any,
      baseline,
      {
        timeoutMs: 100,
        pollMs: 1,
      } as CliOptions,
      {
        ensureRunning() {},
      } as any,
      Date.now(),
      async () => {
        attempts += 1
        return attempts >= 2
      },
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(attempts).toBeGreaterThanOrEqual(2)
  })

  it('allows output file update waits to pass via semantic fallback when optional exact files are missing', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-output-missing-'))
    tempDirs.push(tempDir)
    const outputFile = path.join(tempDir, 'custom-tab-bar.wxss')
    let attempts = 0

    const elapsed = await waitForOutputFilesUpdated(
      {
        label: 'demo/mpx-tailwindcss-v4',
      } as any,
      [outputFile],
      new Map([[outputFile, Date.now()]]),
      {
        timeoutMs: 100,
        pollMs: 1,
      } as CliOptions,
      {
        ensureRunning() {},
      } as any,
      Date.now(),
      async () => {
        attempts += 1
        return attempts >= 2
      },
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(attempts).toBeGreaterThanOrEqual(2)
  })

  it('waits for watch compile success to settle before advancing', async () => {
    let lastCompileSuccessAt = 0
    const phaseStartedAt = Date.now()
    setTimeout(() => {
      lastCompileSuccessAt = Date.now()
    }, 5)

    const elapsed = await waitForCompileSettled(
      {
        label: 'demo/taro-vite-react-tailwindcss-v4',
      } as any,
      {
        timeoutMs: 1_200,
        pollMs: 5,
      } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => lastCompileSuccessAt,
      } as any,
      phaseStartedAt,
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(lastCompileSuccessAt).toBeGreaterThan(phaseStartedAt)
  })

  it('accepts compile success recorded in the same millisecond as the mutation', async () => {
    const phaseStartedAt = Date.now() - 700

    const elapsed = await waitForCompileSettled(
      {
        label: 'demo/uni-app-vite-tailwindcss-v4',
        outputWxml: '/missing/index.wxml',
        outputJs: '/missing/index.js',
      } as any,
      {
        timeoutMs: 100,
        pollMs: 5,
      } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => phaseStartedAt,
        pluginProcessSamplesSince: () => [],
      } as any,
      phaseStartedAt,
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('scales compile settle timeout for slow CI watch cases', () => {
    expect(resolveCompileSettleTimeoutMs({ timeoutMs: 2_000 })).toBe(2_000)
    expect(resolveCompileSettleTimeoutMs({ timeoutMs: 240_000 })).toBe(60_000)
    expect(resolveCompileSettleTimeoutMs({ timeoutMs: 600_000 })).toBe(90_000)
  })

  it('recognizes gulp and DCloud build complete output as compile success lines', () => {
    expect(isCompileSuccessLine('[01:51:54] build complete')).toBe(true)
    expect(isCompileSuccessLine('DONE  Build complete.')).toBe(true)
    expect(isCompileSuccessLine('[01:51:54] src/app.css changed handled')).toBe(false)
    expect(isCompileSuccessLine('DONE  Build failed.')).toBe(false)
  })

  it('allows compile settle to fall back to stable output mtimes when success logs are missing', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-compile-settle-'))
    tempDirs.push(tempDir)
    const wxmlFile = path.join(tempDir, 'index.wxml')
    const jsFile = path.join(tempDir, 'index.js')
    await writeFilePreserveEol(wxmlFile, '<view />', '<view />')
    await writeFilePreserveEol(jsFile, 'Page({})', 'Page({})')
    const phaseStartedAt = Date.now()

    await new Promise(resolve => setTimeout(resolve, 20))
    await writeFilePreserveEol(wxmlFile, '<view>ready</view>', '<view />')
    await writeFilePreserveEol(jsFile, 'Page({ data: 1 })', 'Page({})')

    const elapsed = await waitForCompileSettled(
      {
        label: 'demo/weapp-vite-tailwindcss-v4',
        outputWxml: wxmlFile,
        outputJs: jsFile,
      } as any,
      {
        timeoutMs: 2_000,
        pollMs: 20,
      } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => 0,
      } as any,
      phaseStartedAt,
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('allows style compile settle to observe CSS output mtimes', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-style-settle-'))
    tempDirs.push(tempDir)
    const styleFile = path.join(tempDir, 'index.wxss')
    await writeFilePreserveEol(styleFile, '.anchor{}', '.anchor{}')
    const phaseStartedAt = Date.now()

    await new Promise(resolve => setTimeout(resolve, 20))
    await writeFilePreserveEol(styleFile, '.anchor{color:red}', '.anchor{}')

    const elapsed = await waitForCompileSettled(
      {
        label: 'demo/weapp-vite-tailwindcss-v4',
        outputWxml: '/missing/index.wxml',
        outputJs: '/missing/index.js',
      } as any,
      {
        timeoutMs: 2_000,
        pollMs: 20,
      } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => 0,
      } as any,
      phaseStartedAt,
      [styleFile],
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('allows style-only compile settle to use a stable plugin total sample', async () => {
    const pluginTotalAt = Date.now() - 700
    const elapsed = await waitForCompileSettled(
      {
        label: 'demo/weapp-vite-tailwindcss-v4',
        outputWxml: '/missing/index.wxml',
        outputJs: '/missing/index.js',
      } as any,
      {
        timeoutMs: 2_000,
        pollMs: 20,
      } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => 0,
        pluginProcessSamplesSince: () => [{
          at: pluginTotalAt,
          bundler: 'vite',
          durationMs: 25,
          metric: 'total',
          phase: 'total',
        }],
      } as any,
      pluginTotalAt - 1,
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('waits for CSS outputs when a compile success signal arrives first', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-css-lag-'))
    tempDirs.push(tempDir)
    const wxmlFile = path.join(tempDir, 'index.wxml')
    const jsFile = path.join(tempDir, 'index.js')
    const styleFile = path.join(tempDir, 'app.wxss')
    await Promise.all([
      writeFilePreserveEol(wxmlFile, '<view />', '<view />'),
      writeFilePreserveEol(jsFile, 'Page({})', 'Page({})'),
      writeFilePreserveEol(styleFile, '.baseline{}', '.baseline{}'),
    ])

    await new Promise(resolve => setTimeout(resolve, 40))
    const phaseStartedAt = Date.now()
    let compileSuccessAt = 0
    setTimeout(() => {
      compileSuccessAt = Date.now()
      void writeFilePreserveEol(jsFile, 'Page({ ready: true })', 'Page({})').catch(() => undefined)
    }, 20)
    setTimeout(() => {
      void rm(styleFile, { force: true }).catch(() => undefined)
    }, 100)
    setTimeout(() => {
      void writeFilePreserveEol(styleFile, '.updated{color:red}', '.baseline{}').catch(() => undefined)
    }, 900)

    await waitForCompileSettled(
      {
        label: 'demo/uni-app-vite-tailwindcss-v4',
        outputWxml: wxmlFile,
        outputJs: jsFile,
        outputStyleCandidates: [styleFile],
        globalStyleCandidates: [styleFile],
      } as any,
      {
        timeoutMs: 3_000,
        pollMs: 20,
      } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => compileSuccessAt,
        pluginProcessSamplesSince: () => [],
      } as any,
      phaseStartedAt,
    )

    expect(compileSuccessAt).toBeGreaterThan(phaseStartedAt)
    await expect(readFile(styleFile, 'utf8')).resolves.toBe('.updated{color:red}')
  })

  it('waits for added-class rollback compilation to settle before returning', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-added-class-rollback-'))
    tempDirs.push(tempDir)
    const sourceFile = path.join(tempDir, 'index.ts')
    const outputWxml = path.join(tempDir, 'index.wxml')
    const outputJs = path.join(tempDir, 'index.js')
    const outputStyle = path.join(tempDir, 'app.wxss')
    const sourceOriginal = 'Page({ data: {} })'
    await Promise.all([
      writeFile(sourceFile, sourceOriginal),
      writeFile(outputWxml, '<view />'),
      writeFile(outputJs, sourceOriginal),
      writeFile(outputStyle, '.baseline {}'),
    ])

    let compiling = false
    let lastSource = sourceOriginal
    let lastCompileSuccessAt = 0
    let rollbackObservedAt = 0
    const pendingCompileTimers = new Set<ReturnType<typeof setTimeout>>()
    const compiler = setInterval(async () => {
      if (compiling) {
        return
      }
      compiling = true
      try {
        const source = await readFile(sourceFile, 'utf8')
        if (source === lastSource) {
          return
        }
        lastSource = source
        await writeFile(outputJs, source)
        const isRollback = source.includes('tw-watch-added-class-rollback-')
        if (isRollback) {
          rollbackObservedAt = Date.now()
        }
        const timer = setTimeout(() => {
          lastCompileSuccessAt = Date.now()
          pendingCompileTimers.delete(timer)
        }, isRollback ? 80 : 10)
        pendingCompileTimers.add(timer)
      }
      finally {
        compiling = false
      }
    }, 5)

    try {
      const roundConfig = buildHexScriptRoundConfigs()[0]!
      const baselineMtime = {
        wxml: await getMtime(outputWxml),
        js: await getMtime(outputJs),
      }
      await runAddedClassMutation({
        watchCase: {
          name: 'rollback-settle',
          label: 'rollback-settle',
          outputWxml,
          outputJs,
        } as WatchCase,
        options: {
          timeoutMs: 3_000,
          pollMs: 5,
        } as CliOptions,
        session: {
          ensureRunning() {},
          lastCompileSuccessAt: () => lastCompileSuccessAt,
          pluginProcessSamplesSince: () => [],
        } as any,
        mutationKind: 'script',
        mutation: {
          sourceFile,
          verifyEscapedIn: ['js'],
          verifyClassLiteralIn: ['js'],
          roundConfigs: [roundConfig],
          mutate(source, mutationPayload) {
            return `${source}\nconst marker = ${JSON.stringify(mutationPayload.marker)};\nconst className = ${JSON.stringify(mutationPayload.classLiteral)};`
          },
        },
        sourceOriginal,
        sourcePath: sourceFile,
        classVariableName: '__twWatchClass',
        globalStyleOutputs: [outputStyle],
        minRequiredGlobalStyleEscapedClasses: 0,
        roundConfig,
        baselineMtime,
        verifyClassLiteralIn: ['js'],
      })

      expect(rollbackObservedAt).toBeGreaterThan(0)
      expect(Date.now() - rollbackObservedAt).toBeGreaterThanOrEqual(550)
    }
    finally {
      clearInterval(compiler)
      for (const timer of pendingCompileTimers) {
        clearTimeout(timer)
      }
    }
  })

  it('does not treat stale pre-start outputs as initially ready', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-stale-ready-'))
    tempDirs.push(tempDir)
    const wxmlFile = path.join(tempDir, 'index.wxml')
    const jsFile = path.join(tempDir, 'index.js')
    await writeFilePreserveEol(wxmlFile, '<view>stale</view>', '<view />')
    await writeFilePreserveEol(jsFile, 'Page({ stale: true })', 'Page({})')
    await new Promise(resolve => setTimeout(resolve, 20))
    const sessionStartedAt = Date.now()
    let compileSuccessAt = 0
    const delayedUpdate = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        void (async () => {
          await writeFilePreserveEol(wxmlFile, '<view>ready</view>', '<view />')
          await writeFilePreserveEol(jsFile, 'Page({ ready: true })', 'Page({})')
          compileSuccessAt = Date.now()
        })().then(resolve, reject)
      }, 20)
    })

    let elapsed = 0
    try {
      elapsed = await waitForOutputsReady(
        {
          label: 'demo/weapp-vite-tailwindcss-v4',
          outputWxml: wxmlFile,
          outputJs: jsFile,
        } as any,
        {
          timeoutMs: 2_000,
          pollMs: 20,
        } as CliOptions,
        {
          ensureRunning() {},
          lastCompileSuccessAt: () => compileSuccessAt,
        } as any,
        sessionStartedAt,
      )
    }
    finally {
      await delayedUpdate
    }

    expect(elapsed).toBeGreaterThanOrEqual(20)
  })

  it('allows non-strict initial output readiness to reuse prebuild outputs after a stable window', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-prebuild-ready-'))
    tempDirs.push(tempDir)
    const wxmlFile = path.join(tempDir, 'index.wxml')
    const jsFile = path.join(tempDir, 'index.js')
    await writeFilePreserveEol(wxmlFile, '<view>prebuild</view>', '<view />')
    await writeFilePreserveEol(jsFile, 'Page({ prebuild: true })', 'Page({})')
    await new Promise(resolve => setTimeout(resolve, 20))
    const sessionStartedAt = Date.now()

    const elapsed = await waitForOutputsReady(
      {
        label: 'demo/weapp-vite-tailwindcss-v4',
        requireInitialCompileSuccess: false,
        outputWxml: wxmlFile,
        outputJs: jsFile,
      } as any,
      {
        timeoutMs: 2_000,
        pollMs: 20,
      } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => 0,
      } as any,
      sessionStartedAt,
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('does not treat post-start partial outputs as ready when compile success is mandatory', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-strict-partial-ready-'))
    tempDirs.push(tempDir)
    const wxmlFile = path.join(tempDir, 'index.wxml')
    const jsFile = path.join(tempDir, 'index.js')
    await writeFilePreserveEol(wxmlFile, '<view>stale</view>', '<view />')
    await writeFilePreserveEol(jsFile, 'Page({ stale: true })', 'Page({})')
    await new Promise(resolve => setTimeout(resolve, 20))
    const sessionStartedAt = Date.now()
    let compileSuccessAt = 0
    const delayedCompile = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        void (async () => {
          await writeFilePreserveEol(wxmlFile, '<view>partial</view>', '<view />')
          await writeFilePreserveEol(jsFile, 'Page({ partial: true })', 'Page({})')
        })().then(() => {
          setTimeout(() => {
            compileSuccessAt = Date.now()
            resolve()
          }, 80)
        }, reject)
      }, 20)
    })

    let elapsed = 0
    try {
      elapsed = await waitForOutputsReady(
        {
          label: 'demo/taro-webpack-react-tailwindcss-v4',
          requireInitialCompileSuccess: true,
          outputWxml: wxmlFile,
          outputJs: jsFile,
        } as any,
        {
          timeoutMs: 2_000,
          pollMs: 20,
        } as CliOptions,
        {
          ensureRunning() {},
          lastCompileSuccessAt: () => compileSuccessAt,
        } as any,
        sessionStartedAt,
      )
    }
    finally {
      await delayedCompile
    }

    expect(elapsed).toBeGreaterThanOrEqual(100)
  })

  it('requires a stable post-start output update during warmup when compile success is mandatory', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-warmup-'))
    tempDirs.push(tempDir)
    const wxmlFile = path.join(tempDir, 'index.wxml')
    const jsFile = path.join(tempDir, 'index.js')
    await writeFilePreserveEol(wxmlFile, '<view />', '<view />')
    await writeFilePreserveEol(jsFile, 'Page({})', 'Page({})')
    const sessionStartedAt = Date.now()

    await new Promise(resolve => setTimeout(resolve, 20))
    await writeFilePreserveEol(wxmlFile, '<view>ready</view>', '<view />')
    await writeFilePreserveEol(jsFile, 'Page({ data: 1 })', 'Page({})')

    const elapsed = await waitForInitialWarmup(
      {
        label: 'demo/weapp-vite-tailwindcss-v4',
        requireInitialCompileSuccess: true,
        outputWxml: wxmlFile,
        outputJs: jsFile,
      } as any,
      {
        timeoutMs: 2_000,
        pollMs: 20,
      } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => 0,
      } as any,
      sessionStartedAt,
    )

    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('asserts text presence and absence', () => {
    expect(() => assertContains('alpha beta', 'alpha', 'contains')).not.toThrow()
    expect(() => assertNotContains('alpha beta', 'gamma', 'not contains')).not.toThrow()
    expect(() => assertContainsOneOf('alpha beta', ['beta', 'gamma'], 'one of')).not.toThrow()
    expect(() => assertContains('alpha beta', 'gamma', 'contains')).toThrow('contains')
    expect(() => assertNotContains('alpha beta', 'beta', 'not contains')).toThrow('not contains')
    expect(() => assertContainsOneOf('alpha beta', ['gamma', 'delta'], 'one of')).toThrow('one of')
  })

  it('handles CSS and anchor based text mutations', () => {
    expect(escapeRegExp('.foo[bar]?')).toBe('\\.foo\\[bar\\]\\?')
    expect(findCssRuleBody('.foo { color: red; }', '.foo')).toContain('color: red;')
    expect(findCssRuleBodies('.foo { color: red; }\n.foo { font-weight: 700; }', '.foo')).toEqual([
      ' color: red; ',
      ' font-weight: 700; ',
    ])
    expect(normalizeCssDeclaration(' Color : RGB(1, 2, 3) ; ')).toBe('color:rgb(1,2,3);')

    expect(insertBeforeClosingTag('<view>\n</view>', '</view>', '<text />')).toContain('<text />')
    expect(insertBeforeAnchor('return ()', '()', '<body>')).toBe('return <body>()')
    expect(replaceExactSnippet('const foo = 1', 'foo = 1', 'bar = 2')).toBe('const bar = 2')
    expect(appendTrailingSnippet('const a = 1', 'const b = 2')).toBe('const a = 1\nconst b = 2\n')

    const styleSnippet = createStyleRuleSnippet({
      marker: 'watch-1234567',
      styleNeedle: '.watch-style-marker',
      outputNeedles: ['.watch-style-marker'],
      rollbackNeedles: ['.watch-style-marker'],
      applyUtilities: ['font-bold', 'text-center'],
      expectedApplyDeclarations: [],
      functionNeedle: '.watch-style-marker-theme',
      functionDeclarations: ['padding: theme(\'spacing.2\');'],
      expectedFunctionDeclarations: [],
      forbiddenFunctionFragments: [],
    })

    expect(styleSnippet).toContain('@apply font-bold text-center;')
    expect(styleSnippet).toContain('.watch-style-marker-theme')
    expect(styleSnippet).toContain('padding: theme(\'spacing.2\');')
    expect(styleSnippet).toContain('color: #234567;')
  })

  it('mutates script, tsx and vue sources for watch markers', () => {
    const pageSource = `Page({
  data: {
    count: 1,
  },
})`
    const pageMutated = mutateScriptByDataAnchor(pageSource, '  data: {', payload)
    expect(pageMutated).toContain(`${payload.classVariableName}: '${payload.classLiteral}'`)
    expect(pageMutated).toContain(`__twWatchScriptMarker: '${payload.marker}'`)

    const tsxSource = `export default function Page() {
  return (
    <>
    </>
  )
}`
    expect(mutateTsxScriptByReturnAnchor(tsxSource, payload)).toContain(`<View className={${payload.classVariableName}}>${payload.marker}-script</View>`)
    expect(mutateTsxScriptByReturnAnchorWithCommentCarrier(tsxSource, payload)).toContain(`${payload.marker}-script-comment`)

    const vueSource = `<template>
  <view class="content">
    <view>demo</view>
  </view>
</template>

<script setup lang="ts">
const classArray = [
  'text-sm',
]
const title = ref('demo')
</script>

<style>
.content {}
</style>`

    const arrayMutated = mutateVueScriptSetupArrayByAnchor(vueSource, 'const classArray = [', payload)
    expect(arrayMutated).toContain(`'${payload.classLiteral}'`)
    expect(arrayMutated).toContain(`'${payload.marker}'`)

    const objectSource = `<template>
  <view class="content">
    <view>demo</view>
  </view>
</template>

<script setup lang="ts">
const bgObj = ref({
  'bg-[#999999]':true
})
</script>`
    const objectMutated = mutateVueScriptSetupObjectKeyByAnchor(objectSource, '\'bg-[#999999]\':true', payload)
    expect(objectMutated).toContain('\'text-[#123456]\':true')
    expect(objectMutated).toContain('\'bg-[#0f0f0f]\':true')
    expect(objectMutated).not.toContain('\'bg-[#999999]\':true')

    const commentCarrierMutated = mutateVueScriptSetupArrayByAnchorWithCommentCarrier(vueSource, 'const classArray = [', payload)
    expect(commentCarrierMutated).toContain(`/* ${payload.classLiteral} */`)
    expect(commentCarrierMutated).toContain('<view hidden>{{ __twWatchScriptCommentMarker }}</view>')

    const objectCommentCarrierMutated = mutateVueScriptSetupObjectKeyByAnchorWithCommentCarrier(objectSource, '\'bg-[#999999]\':true', payload)
    expect(objectCommentCarrierMutated).toContain(`/* ${payload.classLiteral} */`)
    expect(objectCommentCarrierMutated).toContain('<view hidden>{{ __twWatchScriptCommentMarker }}</view>')

    const insertedTemplate = insertIntoVueTemplateRoot(vueSource, '    <view class="tail" />')
    expect(insertedTemplate).toContain('<view class="tail" />')

    const refMutated = mutateVueRefStringLiteral(vueSource, 'title', payload)
    expect(refMutated).toContain(`const title = ref('demo ${payload.classLiteral} ${payload.marker}')`)

    const styleMutated = mutateSfcStyleBlock(vueSource, {
      marker: 'watch-123456',
      styleNeedle: '.watch-style-marker',
      outputNeedles: ['.watch-style-marker'],
      rollbackNeedles: ['.watch-style-marker'],
      applyUtilities: ['font-bold'],
      expectedApplyDeclarations: [],
    })
    expect(styleMutated).toContain('.watch-style-marker')
    expect(styleMutated).toContain('@apply font-bold;')
  })

  it('throws clear errors when anchors are missing', () => {
    expect(() => insertBeforeClosingTag('<view />', '</missing>', '<text />')).toThrow('closing tag </missing> not found')
    expect(() => insertBeforeAnchor('alpha', 'beta', 'gamma')).toThrow('anchor beta not found')
    expect(() => insertIntoVueTemplateRoot('<script setup></script>', '<view />')).toThrow('template block not found')
    expect(() => mutateVueRefStringLiteral(`const title = ref('demo')`, 'missing', payload)).toThrow('vue ref string literal not found')
  })
})

describe('watch-hmr regression cli options', () => {
  it('forwards e2e watch workflow profile flags to concrete watch runs', () => {
    const envKeys = [
      'E2E_WATCH_TIMEOUT_MS',
      'E2E_WATCH_POLL_MS',
      'E2E_WATCH_MAX_HOT_UPDATE_MS',
      'E2E_WATCH_MAX_PLUGIN_PROCESS_MS',
      'E2E_WATCH_WEB_ONLY',
      'E2E_WATCH_MAIN_STYLE_ONLY',
      'E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT',
      'E2E_WATCH_MAX_MEMORY_RSS_MB',
      'E2E_WATCH_MAX_MEMORY_RSS_DELTA_MB',
      'E2E_WATCH_MAX_MEMORY_HEAP_USED_MB',
    ] as const
    const originalEnv = new Map(envKeys.map(key => [key, process.env[key]]))
    process.env.E2E_WATCH_TIMEOUT_MS = '900000'
    process.env.E2E_WATCH_POLL_MS = '40'
    process.env.E2E_WATCH_MAX_HOT_UPDATE_MS = '420000'
    process.env.E2E_WATCH_MAX_PLUGIN_PROCESS_MS = '9000'
    process.env.E2E_WATCH_WEB_ONLY = '1'
    process.env.E2E_WATCH_MAIN_STYLE_ONLY = '0'
    process.env.E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT = ''
    process.env.E2E_WATCH_MAX_MEMORY_RSS_MB = '5632'
    process.env.E2E_WATCH_MAX_MEMORY_RSS_DELTA_MB = '4608'
    process.env.E2E_WATCH_MAX_MEMORY_HEAP_USED_MB = '4096'

    try {
      const options = resolveWatchCommandOptions('/tmp/watch-report.json')
      const args = buildWatchHmrArgs('taro-webpack-react-tailwindcss-v4', options)

      expect(args).toEqual(expect.arrayContaining([
        '--case',
        'taro-webpack-react-tailwindcss-v4',
        '--timeout',
        '900000',
        '--max-hot-update-ms',
        '420000',
        '--max-plugin-process-ms',
        '9000',
        '--web-only',
        '--max-memory-rss-mb',
        '5632',
        '--max-memory-rss-delta-mb',
        '4608',
        '--max-memory-heap-used-mb',
        '4096',
      ]))
      expect(args).not.toContain('--main-style-only')
      expect(args).not.toContain('--main-style-subpackage-limit')
    }
    finally {
      for (const key of envKeys) {
        const value = originalEnv.get(key)
        if (value == null) {
          delete process.env[key]
        }
        else {
          process.env[key] = value
        }
      }
    }
  })

  it('accepts --report-file as an alias of --report for main-style-only runs', () => {
    const originalArgv = process.argv
    process.argv = [
      'node',
      'watch-hmr-regression',
      '--case',
      'demo-uni',
      '--main-style-only',
      '--main-style-subpackage-limit',
      '1',
      '--report-file',
      'e2e/benchmark/e2e-watch-hmr/manual-demo-uni-main-style-only.json',
    ]

    try {
      expect(resolveOptions()).toMatchObject({
        caseName: 'demo-uni',
        mainStyleOnly: true,
        mainStyleSubPackageLimit: 1,
        reportFile: 'e2e/benchmark/e2e-watch-hmr/manual-demo-uni-main-style-only.json',
      })
    }
    finally {
      process.argv = originalArgv
    }
  })

  it('enables mini-program-only mode for an explicit mini-program scope', () => {
    const originalArgv = process.argv
    process.argv = [
      'node',
      'watch-hmr-regression',
      '--case',
      'taro-vite-react-tailwindcss-v4',
      '--mini-program-scope',
      'subpackages',
    ]

    try {
      expect(resolveOptions()).toMatchObject({
        caseName: 'taro-vite-react-tailwindcss-v4',
        miniProgramOnly: true,
        miniProgramScope: 'subpackages',
      })
    }
    finally {
      process.argv = originalArgv
    }
  })

  it('ignores empty numeric environment variables from workflow matrix defaults', () => {
    const originalArgv = process.argv
    const originalLimit = process.env.E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT
    process.argv = [
      'node',
      'watch-hmr-regression',
      '--case',
      'mpx-tailwindcss-v4',
      '--main-style-only',
    ]
    process.env.E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT = ''

    try {
      expect(resolveOptions()).toMatchObject({
        caseName: 'mpx-tailwindcss-v4',
        mainStyleOnly: true,
        mainStyleSubPackageLimit: undefined,
      })
    }
    finally {
      process.argv = originalArgv
      if (originalLimit == null) {
        delete process.env.E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT
      }
      else {
        process.env.E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT = originalLimit
      }
    }
  })
})

describe('watch-hmr web compile settle helpers', () => {
  it('accepts a successful browser reload check without waiting for a quiet compile window', async () => {
    const startedAt = Date.now()
    let acceptChecks = 0
    const elapsed = await waitForWebCompileSettled({
      ensureRunning() {},
      getLastCompileSignalAt: () => Date.now(),
      label: 'demo/web',
      phase: 'hot-update',
      phaseStartedAt: startedAt,
      pollMs: 1,
      timeoutMs: 100,
      async acceptWhen() {
        acceptChecks += 1
        return true
      },
    })

    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(acceptChecks).toBe(1)
  })

  it('caps individual reload accept attempts so repeated compiling can be retried', () => {
    expect(resolveReloadAcceptAttemptTimeout(120_000, 40)).toBe(5000)
    expect(resolveReloadAcceptAttemptTimeout(120_000, 500)).toBe(15_000)
    expect(resolveReloadAcceptAttemptTimeout(3000, 40)).toBe(3000)
  })

  it('accepts a stable compile signal recorded in the same millisecond as the mutation', async () => {
    const phaseStartedAt = Date.now() - 700
    const elapsed = await waitForWebCompileSettled({
      ensureRunning() {},
      getLastCompileSignalAt: () => phaseStartedAt,
      label: 'demo/web',
      phase: 'hot-update acceptance',
      phaseStartedAt,
      pollMs: 1,
      timeoutMs: 1_000,
    })

    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it('scales web compile settle timeout for slow dependency optimization reloads', () => {
    expect(resolveWebCompileSettleTimeoutMs(20_000)).toBe(20_000)
    expect(resolveWebCompileSettleTimeoutMs(240_000)).toBe(60_000)
    expect(resolveWebCompileSettleTimeoutMs(600_000)).toBe(90_000)
    expect(resolveWebCompileSettleTimeoutMs(240_000, 45_000)).toBe(45_000)
    expect(resolveWebCompileSettleTimeoutMs(30_000, 45_000)).toBe(30_000)
  })
})

describe('watch-hmr regression session helpers', () => {
  it('parses prefixed plugin timing lines with top-level memory debug payloads', () => {
    const sample = parsePluginProcessSample('[web-watch] [weapp-tailwindcss:hmr] {"bundler":"webpack","phase":"processAssets","durationMs":18.6,"memoryDebug":{"process":{"heapUsedMb":406,"rssMb":1094},"processCache":{"instance":0,"hashMap":8}}}')

    expect(sample).toMatchObject({
      bundler: 'webpack',
      phase: 'processAssets',
      durationMs: 19,
      details: {
        memoryDebug: {
          process: {
            heapUsedMb: 406,
            rssMb: 1094,
          },
          processCache: {
            instance: 0,
            hashMap: 8,
          },
        },
      },
    })
  })
})

describe('watch-hmr regression summary helpers', () => {
  it('summarizes samples and cases', () => {
    expect(summarizeSamples([])).toEqual({
      count: 0,
      hotUpdateAvgMs: 0,
      hotUpdateMaxMs: 0,
      hotUpdateMinMs: 0,
      rollbackAvgMs: 0,
      rollbackMaxMs: 0,
      rollbackMinMs: 0,
    })

    const cases = [
      createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40),
      createCase('weapp-vite-tailwindcss-v4', 'demo', 50, 70),
    ]

    expect(summarizeMetrics(cases)).toEqual({
      count: 2,
      hotUpdateAvgMs: 40,
      hotUpdateMaxMs: 50,
      hotUpdateMinMs: 30,
      rollbackAvgMs: 55,
      rollbackMaxMs: 70,
      rollbackMinMs: 40,
    })

    expect(summarizeMetricsByRound(cases)['complex-corpus']).toMatchObject({
      count: 2,
      hotUpdateAvgMs: 40,
      rollbackAvgMs: 55,
    })
    expect(summarizeMetricsByGroup(cases).demo).toMatchObject({ count: 2, hotUpdateAvgMs: 40 })
    expect(summarizeMetricsByProject(cases)['demo-weapp-vite-tailwindcss-v4']).toMatchObject({ count: 2, rollbackAvgMs: 55 })
  })

  it('summarizes mutation kinds using preferred rounds', () => {
    const cases = [createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)]
    const byCase = summarizeMutationKindAcrossCases(cases)
    const byMutation = summarizeMutationMetricsByKind(cases[0].mutationMetrics)

    expect(byCase.template).toMatchObject({ count: 1, hotUpdateAvgMs: 30, rollbackAvgMs: 40 })
    expect(byMutation.script).toMatchObject({ count: 1, hotUpdateAvgMs: 30, rollbackAvgMs: 40 })
    expect(byMutation.style).toMatchObject({ count: 1, hotUpdateAvgMs: 32, rollbackAvgMs: 36 })
    expect(byMutation.content).toMatchObject({ count: 1, hotUpdateAvgMs: 30, rollbackAvgMs: 40 })
  })

  it('summarizes HMR durations by demo project and surface', () => {
    const metrics = createCase('taro-vite-vue3-tailwindcss-v4', 'demo', 30, 40)
    metrics.webHmr = {
      devScript: 'build:h5',
      sourceFile: 'src/app.css',
      url: 'http://localhost:10086/',
      marker: 'web-marker',
      classLiteral: 'bg-[#123456]',
      computedStyle: {
        backgroundColor: 'rgb(18, 52, 86)',
        width: '88px',
        height: '44px',
      },
      initialReadyMs: 20,
      hotUpdateEffectiveMs: 18,
      rollbackEffectiveMs: 12,
      totalMs: 30,
    }
    metrics.subPackageMutationMetrics = [{
      root: 'sub-normal',
      independent: false,
      outputWxml: 'dist/sub-normal/pages/index.wxml',
      outputJs: 'dist/sub-normal/pages/index.js',
      globalStyleOutputs: ['dist/app.wxss'],
      mainStyleHotUpdate: createMainStyleHotUpdateMetrics('src/sub-normal/pages/index.vue', 44, 45),
      template: createClassMutationMetrics('template', [createRound('complex-corpus', 42, 43)]) as any,
      style: createStyleMutationMetrics() as any,
    }, {
      root: 'sub-independent',
      independent: true,
      outputWxml: 'dist/sub-independent/pages/index.wxml',
      outputJs: 'dist/sub-independent/pages/index.js',
      globalStyleOutputs: ['dist/sub-independent/pages/index.wxss'],
      mainStyleHotUpdate: createMainStyleHotUpdateMetrics('src/sub-independent/pages/index.vue', 46, 47),
      template: createClassMutationMetrics('template', [createRound('complex-corpus', 48, 49)]) as any,
      style: createStyleMutationMetrics() as any,
    }]

    const durations = summarizeHmrDurations([metrics])
    const projectDurations = durations.byProject[metrics.project]

    expect(projectDurations.timings.map(item => item.surface)).toEqual(expect.arrayContaining([
      'template:preferred-round',
      'template:complex-corpus',
      'script:complex-corpus',
      'style',
      'content:complex-corpus',
      'web',
      'subpackage:sub-normal:main-style:text-[102.43rpx] to text-[103.43rpx]',
      'subpackage:sub-normal:template',
      'subpackage:sub-normal:style',
      'subpackage:sub-independent:main-style:text-[102.43rpx] to text-[103.43rpx]',
      'subpackage:sub-independent:template',
      'subpackage:sub-independent:style',
    ]))
    expect(projectDurations.timings.find(item => item.surface === 'main-style:text-[102.43rpx] to text-[103.43rpx]')?.hotUpdateOutputDiagnostics).toMatchObject({
      trigger: 'semantic',
      semanticAccepted: true,
    })
    expect(durations.summaryBySurface.web).toMatchObject({ count: 1, hotUpdateAvgMs: 18, rollbackAvgMs: 12 })
    expect(durations.summaryBySurface['subpackage:sub-normal:main-style:text-[102.43rpx] to text-[103.43rpx]']).toMatchObject({ count: 1, hotUpdateAvgMs: 44, rollbackAvgMs: 45 })
    expect(durations.summaryBySurface['subpackage:sub-independent:main-style:text-[102.43rpx] to text-[103.43rpx]']).toMatchObject({ count: 1, hotUpdateAvgMs: 46, rollbackAvgMs: 47 })
    expect(durations.summaryBySurface['subpackage:sub-normal:template']).toMatchObject({ count: 1, hotUpdateAvgMs: 30, rollbackAvgMs: 35 })
  })

  it('summarizes main-style-only HMR durations for normal and independent subpackages', () => {
    const metrics = createCase('uni-app-vite-tailwindcss-v4', 'demo', 30, 40)
    metrics.rounds = []
    metrics.mutationMetrics = []
    metrics.subPackageMutationMetrics = []
    metrics.subPackageMainStyleHotUpdates = [{
      root: 'sub-normal',
      independent: false,
      outputWxml: 'dist/dev/mp-weixin/sub-normal/pages/index.wxml',
      outputJs: 'dist/dev/mp-weixin/sub-normal/pages/index.js',
      globalStyleOutputs: ['dist/dev/mp-weixin/app.wxss'],
      mainStyleHotUpdate: createMainStyleHotUpdateMetrics('src/sub-normal/pages/index.vue', 41, 42),
    }, {
      root: 'sub-independent',
      independent: true,
      outputWxml: 'dist/dev/mp-weixin/sub-independent/pages/index.wxml',
      outputJs: 'dist/dev/mp-weixin/sub-independent/pages/index.js',
      globalStyleOutputs: ['dist/dev/mp-weixin/sub-independent/pages/index.wxss'],
      mainStyleHotUpdate: createMainStyleHotUpdateMetrics('src/sub-independent/pages/index.vue', 43, 44),
    }]

    const durations = summarizeHmrDurations([metrics])
    const projectDurations = durations.byProject[metrics.project]

    expect(projectDurations.timings.map(item => item.surface)).toEqual(expect.arrayContaining([
      'main-style:text-[102.43rpx] to text-[103.43rpx]',
      'subpackage:sub-normal:main-style:text-[102.43rpx] to text-[103.43rpx]',
      'subpackage:sub-independent:main-style:text-[102.43rpx] to text-[103.43rpx]',
    ]))
    expect(durations.summaryBySurface['subpackage:sub-normal:main-style:text-[102.43rpx] to text-[103.43rpx]']).toMatchObject({ count: 1, hotUpdateAvgMs: 41, rollbackAvgMs: 42 })
    expect(durations.summaryBySurface['subpackage:sub-independent:main-style:text-[102.43rpx] to text-[103.43rpx]']).toMatchObject({ count: 1, hotUpdateAvgMs: 43, rollbackAvgMs: 44 })
  })

  it('keeps mpx subpackage main-style checks on generated CSS loader carriers', () => {
    const mpxCase = buildCases('/repo', { includeLocalOnly: true }).find(item => item.name === 'mpx-tailwindcss-v4')
    const subNormal = mpxCase?.subPackageMutations?.find(item => item.root === 'sub-normal')
    const styleOutputs = subNormal ? collectSubPackageStyleOutputs(subNormal).map(toRepoPath) : []

    expect(subNormal?.mainStyleMutation?.sourceFile ? toRepoPath(subNormal.mainStyleMutation.sourceFile) : undefined).toBe('/repo/demo/mpx-tailwindcss-v4/src/sub-normal/index.css')
    expect(subNormal?.outputStyleCandidates.map(toRepoPath)).toContain(
      '/repo/demo/mpx-tailwindcss-v4/dist/wx/sub-normal/pages/index.js',
    )
    expect(subNormal?.globalStyleCandidates.map(toRepoPath)).not.toContain(
      '/repo/demo/mpx-tailwindcss-v4/dist/wx/sub-normal/pages/index.js',
    )
    expect(styleOutputs).toContain(
      '/repo/demo/mpx-tailwindcss-v4/dist/wx/sub-normal/pages/index.js',
    )
    expect(styleOutputs).toContain(
      '/repo/demo/mpx-tailwindcss-v4/dist/wx/styles/*.wxss',
    )
  })

  it('collects dev and hmr artifact snapshots with a diff for static gateway reports', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-artifacts-'))
    tempDirs.push(tempDir)
    const distDir = path.join(tempDir, 'dist')
    await mkdir(distDir, { recursive: true })
    const outputWxml = path.join(distDir, 'index.wxml')
    const outputJs = path.join(distDir, 'index.js')
    const outputStyle = path.join(distDir, 'index.wxss')
    const globalStyle = path.join(distDir, 'app.wxss')
    await writeFile(outputWxml, '<view class="text-red-500"></view>\n', 'utf8')
    await writeFile(outputJs, 'Page({})\n', 'utf8')
    await writeFile(outputStyle, '.text-red-500{color:red}\n', 'utf8')
    await writeFile(globalStyle, '@import "./index.wxss";\n', 'utf8')

    const watchCase: WatchCase = {
      name: 'weapp-vite-tailwindcss-v4',
      label: 'demo/weapp-vite-tailwindcss-v4',
      project: 'demo/weapp-vite-tailwindcss-v4',
      group: 'demo',
      cwd: tempDir,
      devScript: 'dev:e2e-watch',
      outputWxml,
      outputJs,
      outputStyleCandidates: [outputStyle],
      globalStyleCandidates: [globalStyle],
      templateMutation: {
        sourceFile: path.join(tempDir, 'src/index.wxml'),
        verifyEscapedIn: ['wxml'],
        mutate: source => source,
      },
      scriptMutation: {
        sourceFile: path.join(tempDir, 'src/index.js'),
        verifyEscapedIn: ['js'],
        mutate: source => source,
      },
      styleMutation: {
        sourceFile: path.join(tempDir, 'src/index.wxss'),
        mutate: source => source,
      },
    }

    const dev = await collectWatchArtifactSnapshot(watchCase, 'dev')
    await writeFile(outputStyle, '.text-red-500{color:red}\n.bg-blue-500{background-color:blue}\n', 'utf8')
    const hmr = await collectWatchArtifactSnapshot(watchCase, 'hmr', {
      requestedHmrCount: 5,
      capturedAfterHmrCount: 5,
    })
    const artifacts = await createWatchCaseArtifacts(dev, hmr, 5)

    expect(dev.files.map(file => file.file).sort()).toEqual([
      'dist/app.wxss',
      'dist/index.js',
      'dist/index.wxml',
      'dist/index.wxss',
    ])
    expect(hmr.capturedAfterHmrCount).toBe(5)
    expect(artifacts.diff.changedFileCount).toBe(1)
    expect(artifacts.diff.files[0]).toMatchObject({
      file: 'dist/index.wxss',
      status: 'changed',
    })
    expect(artifacts.diff.text).toContain('+.bg-blue-500{background-color:blue}')
  })

  it('resolves report paths and writes report files', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-summary-'))
    tempDirs.push(tempDir)
    const reportFile = 'artifacts/watch-report.json'
    const cases = [createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)]
    const options: CliOptions = {
      caseName: 'demo',
      timeoutMs: 2_000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      miniProgramScope: 'main-package',
      styleOnly: false,
      mainStyleOnly: false,
      reportFile,
      maxHotUpdateMs: 100,
    }

    expect(resolveReportPath(tempDir, reportFile)).toBe(path.join(tempDir, reportFile))
    expect(resolveReportPath(tempDir, path.join(tempDir, reportFile))).toBe(path.join(tempDir, reportFile))
    expect(resolveRepositoryRootLabel(tempDir)).toBe(path.basename(tempDir))

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      await writeReport(tempDir, options, cases)
    }
    finally {
      stdoutSpy.mockRestore()
    }

    const reportPath = path.join(tempDir, reportFile)
    const report = JSON.parse(await readFile(reportPath, 'utf8'))

    expect(report.repositoryRoot).toBe(path.basename(tempDir))
    expect(report.options.caseName).toBe('demo')
    expect(report.options.webOnly).toBe(false)
    expect(report.options.miniProgramScope).toBe('main-package')
    expect(report.options.mainStyleOnly).toBe(false)
    expect(report.summary).toMatchObject({ count: 1, hotUpdateAvgMs: 30, rollbackAvgMs: 40 })
    expect(report.summaryByMutationKind.template).toMatchObject({ count: 1, hotUpdateAvgMs: 30 })
    expect(report.hmrDurations.byProject['demo-weapp-vite-tailwindcss-v4'].timings.map((item: any) => item.surface)).toEqual(expect.arrayContaining([
      'template:preferred-round',
      'template:complex-corpus',
      'script:complex-corpus',
      'style',
      'content:complex-corpus',
    ]))
    expect(report.hmrDurations.summaryBySurface.style).toMatchObject({ count: 1, hotUpdateAvgMs: 32, rollbackAvgMs: 36 })
    expect(report.memoryReport.summary).toMatchObject({
      projectCount: 1,
      sampleCount: 2,
      peakRssMb: 132,
      peakSteadyRssMb: 132,
      maxSteadyGrowthPct: 0,
      maxRssDeltaMb: 0,
    })
    expect(report.memoryReport.byProject['demo-weapp-vite-tailwindcss-v4']).toMatchObject({
      peakRssMb: 132,
      steadyRssMb: 132,
      steadyGrowthPct: 0,
      rssDeltaMb: 0,
      peakProcessCount: 2,
      uniqueProcessCount: 2,
      peakSample: {
        rssMb: 132,
      },
    })
    expect(report.memoryReport.byProject['demo-weapp-vite-tailwindcss-v4'].peakSample.topProcesses[0]).toMatchObject({
      rssMb: 118,
      command: 'node demo-watch',
    })
  })

  it('uses plugin debug RSS when process tree sampling under-reports detached Windows watchers', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-debug-rss-'))
    tempDirs.push(tempDir)
    const reportFile = 'watch-report.json'
    const cases = [createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)]
    cases[0]!.memoryDebugSamples = [
      {
        at: 2,
        bundler: 'vite',
        phase: 'generateBundle',
        durationMs: 22,
        data: {
          process: {
            heapUsedMb: 512,
            rssMb: 2048,
          },
          processCache: {
            staleCacheKeys: 0,
            staleHashKeys: 0,
          },
        },
      },
    ]
    cases[0]!.memoryDebugSummary = summarizeMemoryDebugSamples(cases[0]!.memoryDebugSamples)
    const options: CliOptions = {
      caseName: 'demo',
      timeoutMs: 2_000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      reportFile,
    }

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      await writeReport(tempDir, options, cases)
    }
    finally {
      stdoutSpy.mockRestore()
    }

    const report = JSON.parse(await readFile(path.join(tempDir, reportFile), 'utf8'))
    expect(report.memoryReport.summary).toMatchObject({
      peakRssMb: 2048,
      maxRssDeltaMb: 1916,
      peakHeapUsedMb: 512,
    })
    expect(report.memoryReport.byProject['demo-weapp-vite-tailwindcss-v4']).toMatchObject({
      baselineRssMb: 132,
      peakRssMb: 2048,
      peakMaxProcessRssMb: 2048,
      rssDeltaMb: 1916,
      peakDebugRssMb: 2048,
      peakHeapUsedMb: 512,
    })
  })

  it('samples repository-scoped detached Windows watcher processes in HMR reports', () => {
    const script = createWindowsProcessTreeMemoryScript(42, String.raw`C:\repo\weapp-tailwindcss`)

    expect(script).toContain(String.raw`$repositoryRoot = 'C:\repo\weapp-tailwindcss'`)
    expect(script).toContain('CommandLine')
    expect(script).toContain('uni\\.js[\\s\\S]+-p\\s+mp-weixin')
    expect(script).toContain('taro-build-runner\\.mjs\\s+build\\s+--type\\s+h5\\s+--watch')
    expect(script).toContain('taro-build-runner\\.mjs\\s+build\\s+--type\\s+\\S+\\s+--watch')
    expect(script).toContain('$command.Contains($repositoryRoot)')
    expect(script).not.toContain('@(;')
  })

  it('builds a CI-facing HMR speed report from watch JSON metrics', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-watch-speed-'))
    tempDirs.push(tempDir)
    const reportFile = 'artifacts/watch-report.json'
    const cases = [createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)]
    const options: CliOptions = {
      caseName: 'demo',
      timeoutMs: 2_000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      reportFile,
      maxHotUpdateMs: 100,
    }

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    try {
      await writeReport(tempDir, options, cases)
    }
    finally {
      stdoutSpy.mockRestore()
    }

    const reportPath = path.join(tempDir, reportFile)
    const watchReport = JSON.parse(await readFile(reportPath, 'utf8'))
    const samples = collectSpeedSamplesFromReport(watchReport, 'watch-report.json')
    const speedReport = buildSpeedReport([{ file: reportPath, report: watchReport }], '2026-05-14T00:00:00.000Z')
    const markdown = renderSpeedReportMarkdown(speedReport)

    expect(samples.map(item => item.surface)).toEqual(expect.arrayContaining([
      'template:preferred-round',
      'template:complex-corpus',
      'script:complex-corpus',
      'style',
      'content:complex-corpus',
    ]))
    expect(summarizeSpeedSamples(samples)).toMatchObject({
      count: samples.length,
      minMs: 30,
      p50Ms: 30,
      maxMs: 32,
    })
    expect(speedReport.byProject['demo-weapp-vite-tailwindcss-v4']).toMatchObject({ count: samples.length })
    expect(speedReport.bySurface.style).toMatchObject({ count: 1, avgMs: 32 })
    expect(speedReport.slowest[0]).toMatchObject({ surface: 'style', hotUpdateMs: 32 })
    expect(speedReport.maxHotUpdateBudgetMs).toBe(1000)
    expect(speedReport.maxPluginProcessBudgetMs).toBe(500)
    expect(speedReport.preferredHotUpdateTargetMs).toBe(1000)
    expect(speedReport.withinBudgetCount).toBe(samples.length)
    expect(speedReport.withinPluginProcessBudgetCount).toBe(samples.length)
    expect(speedReport.withinPreferredTargetCount).toBe(samples.length)
    expect(markdown).toContain('# e2e-watch HMR 速度报告')
    expect(markdown).toContain('- budget: <=1000ms')
    expect(markdown).toContain('- plugin process budget: <=500ms')
    expect(markdown).toContain('- preferred target: <=1000ms')
    expect(markdown).toContain('output=semantic')
    expect(markdown).toContain('| template:preferred-round | 1 | 30ms | 30ms | 30ms | 30ms | 30ms |')
    expect(markdown).toContain('Tailwind v4/v4 官方 Vite/Webpack 插件')
  })

  it('applies hot-update budget checks to nested HMR samples', () => {
    const metrics = createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)
    const scriptMetric = metrics.mutationMetrics.find(
      mutation => mutation.mutationKind === 'script',
    )
    if (!scriptMetric || scriptMetric.mutationKind === 'style') {
      throw new Error('missing script metric')
    }

    scriptMetric.addedClassHmr = {
      markerBefore: 'before',
      markerAfter: 'after',
      classLiteralBefore: 'text-[#123456]',
      classLiteralAfter: 'text-[#123456] bg-[#654321]',
      addedClassLiteral: 'bg-[#654321]',
      addedClassTokens: ['bg-[#654321]'],
      addedEscapedClasses: ['bg-_b_h654321_B'],
      verifiedAddedEscapedClasses: ['bg-_b_h654321_B'],
      minRequiredEscapedClasses: 1,
      hotUpdateOutputMs: 2600,
      hotUpdateEffectiveMs: 2500,
      hotUpdatePluginProcessMs: 25,
      hotUpdatePluginProcessSamples: [pluginProcessSample],
      rollbackOutputMs: 35,
      rollbackEffectiveMs: 30,
      rollbackPluginProcessMs: 20,
      rollbackPluginProcessSamples: [{ ...pluginProcessSample, durationMs: 20 }],
    }

    expect(() => assertHotUpdateBudget(metrics, {
      caseName: 'demo',
      timeoutMs: 2000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      maxHotUpdateMs: 1000,
    })).toThrow('script:added-class hot update exceeded budget: 2500ms > 1000ms')
  })

  it('applies weapp-tailwindcss processing budget checks to nested HMR samples', () => {
    const metrics = createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)
    const scriptMetric = metrics.mutationMetrics.find(
      mutation => mutation.mutationKind === 'script',
    )
    if (!scriptMetric || scriptMetric.mutationKind === 'style') {
      throw new Error('missing script metric')
    }
    scriptMetric.rounds[0].hotUpdatePluginProcessMs = 520

    expect(() => assertPluginProcessBudget(metrics, {
      caseName: 'demo',
      timeoutMs: 2000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      maxPluginProcessMs: 500,
    })).toThrow('template:complex-corpus:hot-update weapp-tailwindcss processing exceeded budget: 520ms > 500ms')
  })

  it('summarizes and guards watch process memory growth', () => {
    const metrics = createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)
    metrics.memorySamples = [
      { at: 1, rssMb: 640, maxProcessRssMb: 620, processCount: 2 },
      { at: 2, rssMb: 702, maxProcessRssMb: 680, processCount: 2 },
      { at: 3, rssMb: 690, maxProcessRssMb: 668, processCount: 2 },
    ]
    const summary = summarizeMemorySamples(metrics.memorySamples)
    metrics.memoryPeakRssMb = summary.peakRssMb
    metrics.memoryRssDeltaMb = summary.rssDeltaMb

    expect(summary).toMatchObject({ baselineRssMb: 640, peakRssMb: 702, steadyRssMb: 690, rssDeltaMb: 62, peakProcessCount: 2, uniqueProcessCount: 0 })
    metrics.memorySummary = summary
    metrics.memoryPeakRssMb = summary.peakRssMb
    metrics.memoryRssDeltaMb = summary.rssDeltaMb
    expect(() => assertMemoryBudget(metrics, {
      caseName: 'demo',
      timeoutMs: 2000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      maxMemoryRssDeltaMb: 50,
    })).toThrow('memory RSS delta exceeded budget: 62MB > 50MB')
  })

  it('guards absolute process tree RSS peak', () => {
    const metrics = createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)
    metrics.memorySamples = [
      { at: 1, rssMb: 640, maxProcessRssMb: 620, processCount: 2 },
      { at: 2, rssMb: 702, maxProcessRssMb: 680, processCount: 2 },
    ]
    metrics.memorySummary = summarizeMemorySamples(metrics.memorySamples)
    metrics.memoryPeakRssMb = metrics.memorySummary.peakRssMb
    metrics.memoryRssDeltaMb = metrics.memorySummary.rssDeltaMb

    expect(() => assertMemoryBudget(metrics, {
      caseName: 'demo',
      timeoutMs: 2000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      maxMemoryRssMb: 700,
    })).toThrow('memory RSS peak exceeded budget: 702MB > 700MB')
  })

  it('guards plugin process heap usage when memory debug samples are available', () => {
    const metrics = createCase('weapp-vite-tailwindcss-v4', 'demo', 30, 40)
    metrics.memoryDebugSamples = [
      {
        at: 1,
        bundler: 'vite',
        phase: 'generateBundle',
        durationMs: 100,
        data: {
          bundle: {
            hasOmittedKnownFiles: true,
          },
          process: {
            heapUsedMb: 640,
            rssMb: 720,
          },
          processCache: {
            staleCacheKeys: 3,
            staleHashKeys: 11,
            pruneSkipped: true,
          },
        },
      },
    ]
    metrics.memoryDebugSummary = summarizeMemoryDebugSamples(metrics.memoryDebugSamples)

    expect(metrics.memoryDebugSummary.topHeapPhases).toEqual([
      {
        phase: 'vite:generateBundle',
        count: 1,
        peakHeapUsedMb: 640,
        peakRssMb: 720,
        peakStaleCacheKeys: 3,
        peakStaleHashKeys: 11,
        pruneSkippedCount: 1,
        omittedKnownFilesCount: 1,
      },
    ])
    expect(metrics.memoryDebugSummary.topStaleCachePhases).toEqual([
      {
        phase: 'vite:generateBundle',
        count: 1,
        peakStaleCacheKeys: 3,
        peakStaleHashKeys: 11,
        pruneSkippedCount: 1,
        omittedKnownFilesCount: 1,
      },
    ])
    expect(metrics.memoryDebugSummary.topDurationPhases).toEqual([
      {
        phase: 'vite:generateBundle',
        count: 1,
        peakDurationMs: 100,
        peakDurationActiveCss: 0,
        peakDurationStaleCacheKeys: 3,
        peakDurationStaleHashKeys: 11,
        peakDurationPruneSkipped: true,
        peakDurationOmittedKnownFiles: true,
      },
    ])

    expect(() => assertMemoryBudget(metrics, {
      caseName: 'demo',
      timeoutMs: 2000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      maxMemoryHeapUsedMb: 512,
    })).toThrow('vite:generateBundle heap used exceeded budget: 640MB > 512MB')
  })

  it('uses the first active process tree sample as memory growth baseline', () => {
    const summary = summarizeMemorySamples([
      { at: 1, rssMb: 1, maxProcessRssMb: 1, processCount: 1 },
      { at: 2, rssMb: 684, maxProcessRssMb: 640, processCount: 3 },
      { at: 3, rssMb: 742, maxProcessRssMb: 698, processCount: 3 },
    ])

    expect(summary).toMatchObject({ baselineRssMb: 684, peakRssMb: 742, steadyRssMb: 742, rssDeltaMb: 58, peakProcessCount: 3, uniqueProcessCount: 0 })
  })

  it('prefers total timing samples when collecting plugin processing metrics', () => {
    const metrics = collectPluginProcessMetrics({
      pluginProcessSamplesSince: () => [
        { ...pluginProcessSample, durationMs: 1200 },
        { ...pluginProcessSample, phase: 'total', durationMs: 85, metric: 'total' },
      ],
    } as never, 1)

    expect(metrics.totalMs).toBe(85)
    expect(metrics.samples).toHaveLength(2)
  })

  it('lets Taro polling-build cases use a full-build plugin processing budget', () => {
    const metrics = createCase('taro-vite-react-tailwindcss-v4', 'demo', 30, 40)
    metrics.maxPluginProcessMs = 3000
    const templateMetric = metrics.mutationMetrics.find(
      mutation => mutation.mutationKind === 'template',
    )
    if (!templateMetric || templateMetric.mutationKind === 'style') {
      throw new Error('missing template metric')
    }
    templateMetric.rounds[0].hotUpdatePluginProcessMs = 1500

    expect(() => assertPluginProcessBudget(metrics, {
      caseName: 'demo',
      timeoutMs: 2000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      maxPluginProcessMs: 500,
    })).not.toThrow()
  })

  it('lets CLI budget override slower case-specific plugin processing budgets', () => {
    const metrics = createCase('uni-app-vite-tailwindcss-v4', 'demo', 30, 40)
    metrics.maxPluginProcessMs = 5000
    const templateMetric = metrics.mutationMetrics.find(
      mutation => mutation.mutationKind === 'template',
    )
    if (!templateMetric || templateMetric.mutationKind === 'style') {
      throw new Error('missing template metric')
    }
    templateMetric.rounds[0].hotUpdatePluginProcessMs = 5010

    expect(() => assertPluginProcessBudget(metrics, {
      caseName: 'demo',
      timeoutMs: 2000,
      pollMs: 20,
      skipBuild: true,
      quietSass: true,
      webOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      maxPluginProcessMs: 9000,
    })).not.toThrow()
  })
})

describe('watch-hmr regression cases', () => {
  it('runs Web/H5 browser checks in headless Chromium mode', () => {
    expect(resolveChromiumLaunchOptions()).toMatchObject({ headless: true })
  })

  it('uses the native-watch plugin budget for Taro Vite cases', () => {
    const cases = buildDemoExtendedCases('/repo')
    for (const caseName of [
      'taro-vite-react-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
    ]) {
      const watchCase = cases.find(item => item.name === caseName)
      expect(watchCase?.env).toHaveProperty('TARO_E2E_WATCH_NATIVE', '1')
      expect(watchCase?.maxPluginProcessMs).toBe(10000)
    }
  })

  it('uses the full-build plugin budget for Taro Webpack polling-build cases', () => {
    const cases = buildDemoExtendedCases('/repo')
    for (const caseName of [
      'taro-webpack-react-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4',
    ]) {
      const watchCase = cases.find(item => item.name === caseName)
      expect(watchCase?.env).toHaveProperty('TARO_E2E_WATCH_NATIVE', '0')
      expect(watchCase?.maxPluginProcessMs).toBe(18000)
    }
  })

  it('keeps Web/H5 HMR marker attach checks above a single poll tick', () => {
    expect(resolveWebHmrMarkerAttachTimeout(40)).toBe(1000)
    expect(resolveWebHmrMarkerAttachTimeout(1500)).toBe(1500)
  })

  it('keeps Web/H5 source DOM replacement attach checks above a single poll tick', () => {
    expect(resolveWebHmrDomAttachTimeout(40)).toBe(1000)
    expect(resolveWebHmrDomAttachTimeout(1500)).toBe(1500)
  })

  it('reloads a stalled Web/H5 page and re-runs the runtime assertion', async () => {
    const waitForReadySelector = vi.fn().mockResolvedValue(undefined)
    const page = {
      reload: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(() => ({
        waitFor: waitForReadySelector,
      })),
    }
    const acceptWhen = vi.fn().mockResolvedValue(true)
    const recover = createWebHmrReloadRecovery(page as any, '#app', {
      enabled: true,
      stallMs: 0,
      timeoutMs: 500,
      pollMs: 1,
    })

    await expect(recover(Date.now() - 1, acceptWhen)).resolves.toBe(true)
    expect(page.reload).toHaveBeenCalledWith({
      waitUntil: 'domcontentloaded',
      timeout: 500,
    })
    expect(page.locator).toHaveBeenCalledWith('#app')
    expect(acceptWhen).toHaveBeenCalledTimes(1)
  })

  it('keeps Web/H5 reload recovery disabled before the stall window', async () => {
    const page = {
      reload: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(),
    }
    const recover = createWebHmrReloadRecovery(page as any, '#app', {
      enabled: true,
      stallMs: 5_000,
      timeoutMs: 120_000,
      pollMs: 40,
    })

    expect(resolveWebHmrReloadStallMs(120_000, 40, 5_000)).toBe(5_000)
    await expect(recover(Date.now(), vi.fn())).resolves.toBe(false)
    expect(page.reload).not.toHaveBeenCalled()
  })

  it('does not treat webpack-dev-server URL output as Web/H5 compile readiness', () => {
    expect(isWebCompileReadyLogLine('<i> [webpack-dev-server] Loopback: http://localhost:10086/')).toBe(false)
    expect(isWebCompileReadyLogLine('<i> [webpack-dev-middleware] wait until bundle finished: /')).toBe(false)
    expect(isWebCompileReadyLogLine('  ➜  Local:   http://localhost:10086/')).toBe(true)
    expect(isWebCompileReadyLogLine('webpack 5.102.1 compiled successfully in 389888 ms')).toBe(true)
    expect(isWebCompileReadyLogLine('compiled with some warnings')).toBe(true)
    expect(isWebCompileReadyLogLine('webpack 5.107.2 compiled with 1 warning in 369825 ms')).toBe(true)
    expect(isWebCompileDoneLogLine('  ➜  Local:   http://localhost:10086/')).toBe(false)
    expect(isWebCompileDoneLogLine('1:32:43 PM [vite] hmr update /src/main.css')).toBe(true)
    expect(isWebCompileDoneLogLine('[weapp-tailwindcss:hmr] {"bundler":"vite","phase":"generateCss.serve","durationMs":40}')).toBe(true)
    expect(isWebCompileDoneLogLine('webpack 5.107.2 compiled with 1 warning in 369825 ms')).toBe(true)
  })

  it('retries Web/H5 page readiness when the first navigation races the dev middleware', async () => {
    const waitForReadySelector = vi.fn().mockResolvedValue(undefined)
    const page = {
      goto: vi.fn()
        .mockRejectedValueOnce(new Error('wait until bundle finished'))
        .mockResolvedValueOnce(undefined),
      locator: vi.fn(() => ({
        waitFor: waitForReadySelector,
      })),
    }

    await expect(waitForWebPageReady(page as any, 'http://127.0.0.1:42000/', '#app', {
      timeoutMs: 500,
      pollMs: 1,
    })).resolves.toBeGreaterThanOrEqual(0)

    expect(page.goto).toHaveBeenCalledTimes(2)
    expect(page.locator).toHaveBeenCalledWith('#app')
    expect(waitForReadySelector).toHaveBeenCalledWith({
      state: 'attached',
      timeout: 500,
    })
  })

  it('gives slow Web/H5 dev middleware enough time for initial page readiness', async () => {
    const waitForReadySelector = vi.fn().mockResolvedValue(undefined)
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(() => ({
        waitFor: waitForReadySelector,
      })),
    }

    await expect(waitForWebPageReady(page as any, 'http://127.0.0.1:10086/', '#app', {
      timeoutMs: 240_000,
      pollMs: 40,
    })).resolves.toBeGreaterThanOrEqual(0)

    expect(page.goto).toHaveBeenCalledWith('http://127.0.0.1:10086/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    expect(waitForReadySelector).toHaveBeenCalledWith({
      state: 'attached',
      timeout: 60_000,
    })
  })

  it('caps initial Web/H5 page readiness attempts below the whole case timeout', async () => {
    const waitForReadySelector = vi.fn().mockResolvedValue(undefined)
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(() => ({
        waitFor: waitForReadySelector,
      })),
    }

    await expect(waitForWebPageReady(page as any, 'http://127.0.0.1:10086/', '#app', {
      timeoutMs: 420_000,
      pollMs: 1_000,
    })).resolves.toBeGreaterThanOrEqual(0)

    expect(page.goto).toHaveBeenCalledWith('http://127.0.0.1:10086/', {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })
    expect(waitForReadySelector).toHaveBeenCalledWith({
      state: 'attached',
      timeout: 180_000,
    })
  })

  it('retries Web/H5 reload readiness when webpack aborts an in-flight navigation', async () => {
    const waitForReadySelector = vi.fn().mockResolvedValue(undefined)
    const page = {
      reload: vi.fn()
        .mockRejectedValueOnce(new Error('page.reload: net::ERR_ABORTED; maybe frame was detached?'))
        .mockResolvedValueOnce(undefined),
      locator: vi.fn(() => ({
        waitFor: waitForReadySelector,
      })),
    }

    await expect(waitForWebPageReloadReady(page as any, '#app', {
      timeoutMs: 500,
      pollMs: 1,
    })).resolves.toBeGreaterThanOrEqual(0)

    expect(page.reload).toHaveBeenCalledTimes(2)
    expect(page.locator).toHaveBeenCalledWith('#app')
    expect(waitForReadySelector).toHaveBeenCalledWith({
      state: 'attached',
      timeout: 500,
    })
  })

  it('defines issue33 high-risk arbitrary CRUD rounds for js literal hot updates', () => {
    const [roundConfig] = buildIssue33HighRiskRoundConfigs()

    expect(roundConfig).toBeDefined()
    expect(roundConfig?.name).toBe('issue33-arbitrary')
    expect(roundConfig?.buildClassTokens('seed')).toEqual([...ISSUE33_ADD_CLASS_TOKENS])
    expect(roundConfig?.buildModifyClassTokens?.('seed')).toEqual([...ISSUE33_MODIFY_CLASS_TOKENS])
  })

  it('keeps the uni-app Vite v4 content mutation anchored to the page class ref', () => {
    const uniAppCase = buildDemoExtendedCases('/repo').find(watchCase => watchCase.name === 'uni-app-vite-tailwindcss-v4')
    const contentMutation = uniAppCase?.contentMutation

    expect(contentMutation).toBeDefined()
    expect(contentMutation?.mutate(
      'const className = ref(\'bg-[#0000ff] text-[45rpx] text-white\')',
      payload,
    )).toContain(`const className = ref('${payload.classLiteral}')`)
  })

  it('keeps uni-app x Options API script and in-place class replacement HMR coverage', () => {
    const uniAppXCase = buildUniAppHBuilderXCases('/repo').find(watchCase => watchCase.name === 'uni-app-x-vdom-tailwindcss-v4')
    const source = [
      '<script lang="uts">',
      'export default {',
      '  data() {',
      '    return {',
      '      globalNum: 0,',
      '    }',
      '  },',
      '}',
      '</script>',
      '<template>',
      '  <BindClass />',
      '  <text class="text-xs text-white">issue-1002 text-xs</text>',
      '</template>',
    ].join('\n')

    expect(uniAppXCase).toBeDefined()
    expect(uniAppXCase?.scriptMutation.mutate(source, payload)).toContain(`${payload.classVariableName}: '${payload.classLiteral}'`)
    expect(uniAppXCase?.scriptMutation.mutate(source, payload)).toContain(`:class="${payload.classVariableName}"`)
    expect(uniAppXCase?.userReportedHotUpdate).toMatchObject({
      before: 'class="text-xs text-white">issue-1002 text-xs',
      after: 'class="text-[29px] text-white">issue-1002 text-[29px]',
      beforeClassTokens: ['text-xs'],
      afterClassTokens: ['text-[29px]'],
      verifyEscapedIn: ['wxml'],
    })
  })

  it('uses the development H5 watch script for Taro webpack React v4 web HMR', () => {
    const taroWebpackCase = buildDemoExtendedCases('/repo').find(watchCase => watchCase.name === 'taro-webpack-react-tailwindcss-v4')

    expect(taroWebpackCase?.webHmr).toMatchObject({
      devScript: 'dev:h5',
    })
    expect(taroWebpackCase?.webHmr).not.toHaveProperty('devArgs')
  })

  it('keeps Taro webpack demos on real NutUI and html plugin integration', async () => {
    const configSource = await readContractSource(path.resolve(
      __dirname,
      '../../../demo/taro-webpack-react-tailwindcss-v4/config/index.ts',
    ), '@tarojs/plugin-html')
    const reactPackageJson = await readContractSource(path.resolve(
      __dirname,
      '../../../demo/taro-webpack-react-tailwindcss-v4/package.json',
    ), '@nutui/nutui-react-taro')
    const reactPageSource = await readContractSource(path.resolve(
      __dirname,
      '../../../demo/taro-webpack-react-tailwindcss-v4/src/pages/index/index.tsx',
    ), '@nutui/nutui-react-taro')
    const vueAppSource = await readContractSource(path.resolve(
      __dirname,
      '../../../demo/taro-webpack-vue3-tailwindcss-v4/src/app.ts',
    ), 'app.use(NutButton)')

    expect(configSource).toContain('@tarojs/plugin-html')
    expect(reactPackageJson).toContain('@nutui/nutui-react-taro')
    expect(reactPageSource).toContain('@nutui/nutui-react-taro')
    expect(vueAppSource).toContain('@nutui/nutui-taro')
    expect(vueAppSource).toContain('app.use(NutButton)')
  })

  it('keeps the uni-app Vite v4 style mutation on the Vite style entry', () => {
    const uniAppCase = buildDemoExtendedCases('/repo').find(watchCase => watchCase.name === 'uni-app-vite-tailwindcss-v4')
    const styleMutation = uniAppCase?.styleMutation
    const source = [
      '<template><view /></template>',
      '<style lang="scss">',
      '@import "./tailwind.scss";',
      '</style>',
    ].join('\n')
    const payload = createStyleMutationPayload({
      name: 'uni-app-vite-tailwindcss-v4',
    } as WatchCase)
    const mutated = styleMutation?.mutate(source, payload)

    expect(styleMutation?.sourceFile).toBe(path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/src/main.css'))
    expect(styleMutation?.importerFiles).toEqual([
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/src/main.ts'),
    ])
    expect(styleMutation?.outputStyleNeedle?.(payload)).toBeUndefined()
    expect(styleMutation?.outputNeedles?.(payload)).toBeUndefined()
    expect(styleMutation?.rollbackNeedles?.(payload)).toBeUndefined()
    expect(styleMutation?.validateApply).toBeUndefined()
    expect(mutated).toContain(payload.styleNeedle)
    expect(mutated).toMatch(new RegExp(`${payload.styleNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{ color: #[0-9a-f]{6}; \\}`))
  })

  it('keeps enough fresh class candidates after watch mode accumulates earlier classes', () => {
    const [roundConfig] = buildHexScriptRoundConfigs()
    if (!roundConfig) {
      throw new Error('missing hex script round config')
    }

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    try {
      const staleEscapedClasses: string[] = []
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const seed = `${attempt.toString().padStart(2, '0')}${((attempt * 7) % 100).toString().padStart(2, '0')}90`
        staleEscapedClasses.push(...roundConfig.buildClassTokens(seed).map(token => replaceWxml(token)))
      }

      const scenario = createClassMutationScenario(
        {
          name: 'taro-webpack-react-tailwindcss-v4',
          label: 'demo/taro-webpack-react-tailwindcss-v4',
        } as WatchCase,
        'script',
        {
          sourceFile: 'index.tsx',
          verifyEscapedIn: ['js'],
          mutate(source, payload) {
            return `${source}\nconst ${payload.classVariableName} = '${payload.classLiteral}'\n`
          },
        },
        'export default function Page() {}',
        '',
        '',
        staleEscapedClasses.join('\n'),
        '__twWatchClass',
        roundConfig,
      )

      expect(scenario.classTokens).toEqual(roundConfig.buildClassTokens('246890'))
    }
    finally {
      nowSpy.mockRestore()
    }
  })

  it('uses complex script round tokens for realistic dynamic class hot updates', () => {
    const [baselineRound, complexRound, hexRound] = buildHexScriptRoundConfigs()

    expect(baselineRound?.buildClassTokens('123456').length).toBeGreaterThan(6)
    expect(complexRound?.buildClassTokens('123456')).toEqual(expect.arrayContaining([
      '!mt-2',
      '-translate-y-1',
      'data-[state=open]:opacity-100',
      'supports-[display:grid]:grid',
      '[mask-type:luminance]',
    ]))
    expect(complexRound?.buildClassTokens('123456').some(token => token.startsWith('w-[calc(100%_-_'))).toBe(true)
    expect(complexRound?.buildClassTokens('123456').some(token => token.startsWith('grid-cols-[200rpx_minmax(900rpx,_1fr)_'))).toBe(true)
    expect(hexRound?.buildClassTokens('12345678').some(token => token.startsWith('shadow-[0_'))).toBe(true)
    expect(hexRound?.buildClassTokens('000029')).not.toEqual(hexRound?.buildClassTokens('000049'))
  })

  it('keeps tailwind v4 js content rounds to tokens that produce css from script scanning', () => {
    const [, complexRound] = buildTailwindV4JsContentRoundConfigs()
    const tokens = complexRound?.buildClassTokens('123456') ?? []

    expect(tokens).toEqual(expect.arrayContaining([
      '!mt-2',
      '-translate-y-1',
      'data-[state=open]:opacity-100',
      '[mask-type:luminance]',
    ]))
    expect(tokens).not.toEqual(expect.arrayContaining([
      '[@supports(display:grid)]:grid',
      'supports-[backdrop-filter:blur(2px)]:backdrop-blur-[2px]',
      '[@media(any-hover:hover){&:hover}]:opacity-100',
      'supports-[display:grid]:grid',
    ]))
  })

  it('uses tailwind v4 js content rounds for gulp v4 script mutations', () => {
    const gulpV4Case = buildDemoBaseCases('/repo').find(watchCase => watchCase.name === 'gulp-tailwindcss-v4')
    const [, complexRound] = gulpV4Case?.scriptMutation.roundConfigs ?? []

    expect(complexRound?.name).toBe('complex-corpus')
    expect(complexRound?.buildClassTokens('123456')).not.toContain('[@media(any-hover:hover){&:hover}]:opacity-100')
  })

  it('uses tailwind v4 js content rounds for mpx v4 script mutations', () => {
    const mpxV4Case = buildDemoExtendedCases('/repo').find(watchCase => watchCase.name === 'mpx-tailwindcss-v4')
    const [, complexRound] = mpxV4Case?.scriptMutation.roundConfigs ?? []

    expect(complexRound?.name).toBe('complex-corpus')
    expect(complexRound?.buildClassTokens('123456')).not.toContain('[@media(any-hover:hover){&:hover}]:opacity-100')
    expect(complexRound?.buildClassTokens('123456')).not.toContain('[@supports(display:grid)]:grid')
  })

  it('tracks taro webpack v4 style outputs in both page and app wxss candidates', () => {
    const taroWebpackCase = buildDemoExtendedCases('/repo').find(item => item.name === 'taro-webpack-react-tailwindcss-v4')

    expect(taroWebpackCase?.name).toBe('taro-webpack-react-tailwindcss-v4')
    expect(taroWebpackCase?.outputStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/taro-webpack-react-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve('/repo', 'demo/taro-webpack-react-tailwindcss-v4/dist/app.wxss'),
    ])
    expect(taroWebpackCase?.globalStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/taro-webpack-react-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve('/repo', 'demo/taro-webpack-react-tailwindcss-v4/dist/app.wxss'),
    ])
  })

  it('registers the new tailwindcss v4 watch cases with expected outputs', () => {
    const extendedCases = buildDemoExtendedCases('/repo')
    const baseCases = buildDemoBaseCases('/repo')
    const uniViteCase = extendedCases.find(item => item.name === 'uni-app-vite-tailwindcss-v4')
    const mpxV4Case = extendedCases.find(item => item.name === 'mpx-tailwindcss-v4')
    const viteNativeCase = baseCases.find(item => item.name === 'weapp-vite-tailwindcss-v4')

    expect(uniViteCase?.outputWxml).toBe(
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/pages/index/index.wxml'),
    )
    expect(uniViteCase?.globalStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/main.wxss'),
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/app.wxss'),
    ])
    expect(uniViteCase?.outputStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/main.wxss'),
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/src/main.wxss'),
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/app.wxss'),
    ])
    expect(uniViteCase?.globalStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/main.wxss'),
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/app.wxss'),
    ])
    expect(uniViteCase?.subPackageMutations?.[0]?.globalStyleCandidates).not.toContain(
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/dev/mp-weixin/src/main.wxss'),
    )

    expect(mpxV4Case?.outputWxml).toBe(
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/custom-tab-bar/index.wxml'),
    )
    expect(mpxV4Case?.devScript).toBe('dev:e2e-watch')
    expect(mpxV4Case?.env).toMatchObject({
      CHOKIDAR_INTERVAL: '50',
      CHOKIDAR_USEPOLLING: '1',
      WATCHPACK_POLLING: '50',
    })
    expect(mpxV4Case?.initialMutationDelayMs).toBe(15_000)
    expect(mpxV4Case?.splitSubPackageWatchSessions).toBe(true)
    expect(mpxV4Case?.styleMutation.sourceFile).toBe(
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/src/pages/component/index.mpx'),
    )
    expect(mpxV4Case?.styleMutation.verifyOutputCandidates).toEqual([
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/pages/component/index.wxss'),
    ])
    expect(mpxV4Case?.styleMutation.validateApply).toBe(false)
    const mpxV4SubPackage = mpxV4Case?.subPackageMutations?.find(item => item.root === 'sub-normal')
    expect(mpxV4SubPackage?.styleMutation.validateApply).toBe(false)
    expect(mpxV4SubPackage?.styleMutation.validateFunction).toBe(false)
    expect(mpxV4SubPackage?.styleMutation.sourceFile).toBe(
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/src/sub-normal/index.css'),
    )
    expect(mpxV4SubPackage?.templateMutation.roundConfigs?.map(round => round.name)).toEqual(['baseline-arbitrary'])
    expect(mpxV4SubPackage?.templateMutation.skipExtendedHmr).toBe(true)
    expect(mpxV4SubPackage?.outputStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/sub-normal/pages/index.js'),
    ])
    expect(mpxV4SubPackage?.globalStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/sub-normal/pages/index.wxss'),
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/sub-normal/styles/*.wxss'),
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/styles/*.wxss'),
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/app.wxss'),
    ])

    expect(mpxV4Case?.outputStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/app.wxss'),
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/custom-tab-bar/index.wxss'),
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/styles/app*.wxss'),
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/styles/index*.wxss'),
    ])
    expect(mpxV4Case?.globalStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/app.wxss'),
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/styles/app*.wxss'),
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/styles/index*.wxss'),
    ])

    expect(viteNativeCase?.outputJs).toBe(
      path.resolve('/repo', 'demo/weapp-vite-tailwindcss-v4/dist/pages/index/index.js'),
    )
    expect(viteNativeCase?.outputStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/weapp-vite-tailwindcss-v4/dist/pages/index/index.wxss'),
      path.resolve('/repo', 'demo/weapp-vite-tailwindcss-v4/dist/app.wxss'),
    ])
    expect(viteNativeCase?.globalStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/weapp-vite-tailwindcss-v4/dist/tailwind.wxss'),
      path.resolve('/repo', 'demo/weapp-vite-tailwindcss-v4/dist/app.wxss'),
    ])
    expect(viteNativeCase?.subPackageMutations?.[0]?.globalStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/weapp-vite-tailwindcss-v4/dist/tailwind.wxss'),
      path.resolve('/repo', 'demo/weapp-vite-tailwindcss-v4/dist/sub-normal/pages/index.wxss'),
      path.resolve('/repo', 'demo/weapp-vite-tailwindcss-v4/dist/app.wxss'),
    ])
  })

  it('pins taro-based watch cases to strict taro build mode', () => {
    const cases = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ].filter(watchCase => watchCase.name.includes('taro'))

    expect(cases.length).toBeGreaterThan(0)

    for (const watchCase of cases) {
      expect(watchCase.env?.TARO_BUILD_STRICT).toBe('1')
    }
  })

  it('keeps Taro Vite watch cases on independent-subpackage compatible budgets', () => {
    const cases = buildDemoExtendedCases('/repo').filter(watchCase => watchCase.name.startsWith('taro-vite-'))

    expect(cases.map(watchCase => watchCase.name).sort()).toEqual([
      'taro-vite-react-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4:alipay',
      'taro-vite-react-tailwindcss-v4:tt',
      'taro-vite-react-tailwindcss-v4:weapp',
      'taro-vite-vue3-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4:alipay',
      'taro-vite-vue3-tailwindcss-v4:tt',
      'taro-vite-vue3-tailwindcss-v4:weapp',
    ])

    for (const watchCase of cases) {
      expect(watchCase.env).toHaveProperty('TARO_E2E_WATCH_NATIVE', '1')
      expect(watchCase.maxPluginProcessMs).toBe(10000)
      expect(watchCase.initialMutationDelayMs).toBe(15_000)
    }
  })

  it('keeps uni-app Vite watch case on the independent-subpackage CSS aggregation budget', () => {
    const uniAppCase = buildDemoExtendedCases('/repo').find(watchCase => watchCase.name === 'uni-app-vite-tailwindcss-v4')

    expect(uniAppCase?.maxPluginProcessMs).toBe(4000)
  })

  it('keeps Mpx watch case on the full main and subpackage processAssets budget', () => {
    const mpxCase = buildDemoExtendedCases('/repo').find(watchCase => watchCase.name === 'mpx-tailwindcss-v4')

    expect(mpxCase?.maxPluginProcessMs).toBe(8000)
  })

  it('covers literal refresh content mutations for every demo case', () => {
    const cases = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ]
    const contentMutationOptionalCases = new Set(['gulp-tailwindcss-v4'])

    expect(cases.length).toBeGreaterThan(0)

    for (const watchCase of cases) {
      if (contentMutationOptionalCases.has(watchCase.name)) {
        expect(watchCase.contentMutation, `${watchCase.name} keeps template/script/style hot-update coverage`).toBeUndefined()
        continue
      }

      expect(
        watchCase.contentMutation,
        `${watchCase.name} should define content mutation for existing js class literal refresh`,
      ).toBeDefined()

      const contentMutation = watchCase.contentMutation
      if (!contentMutation) {
        continue
      }

      const expectedCarrier = contentMutation.sourceFile.endsWith('.wxml') ? 'wxml' : 'js'
      expect(contentMutation.verifyClassLiteralIn).toContain(expectedCarrier)
      expect(contentMutation.forbidBgHexTruncationIn).toContain(expectedCarrier)
      expect(contentMutation.roundConfigs?.length).toBe(1)
      expect(contentMutation.roundConfigs?.[0]?.name).toBe('issue33-arbitrary')
      expect(contentMutation.roundConfigs?.[0]?.buildClassTokens('seed')).toEqual([...ISSUE33_ADD_CLASS_TOKENS])
      expect(contentMutation.roundConfigs?.[0]?.buildModifyClassTokens?.('seed')).toEqual([...ISSUE33_MODIFY_CLASS_TOKENS])
      expect(contentMutation.sourceFile).not.toMatch(/index\.html$/)
      expect(contentMutation.sourceFile).toMatch(/\.(?:js|ts|tsx|vue|mpx|wxml)$/)
    }
  })

  it('registers watch hot-update cases for every demo project including Vue3 variants', () => {
    const cases = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ]

    expect(cases.map(watchCase => watchCase.name)).toEqual([
      'gulp-tailwindcss-v4',
      'weapp-vite-tailwindcss-v4',
      'uni-app-vite-tailwindcss-v4',
      'mpx-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4:weapp',
      'taro-vite-react-tailwindcss-v4:alipay',
      'taro-vite-react-tailwindcss-v4:tt',
      'taro-webpack-react-tailwindcss-v4',
      'taro-webpack-react-tailwindcss-v4:weapp',
      'taro-vite-vue3-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4:weapp',
      'taro-vite-vue3-tailwindcss-v4:alipay',
      'taro-vite-vue3-tailwindcss-v4:tt',
      'taro-webpack-vue3-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4:weapp',
      'uni-app-vite-tailwindcss-v4:mp-weixin',
      'uni-app-vite-tailwindcss-v4:mp-alipay',
      'uni-app-vite-tailwindcss-v4:mp-qq',
      'uni-app-vite-tailwindcss-v4:mp-toutiao',
    ])
  })

  it('derives mini-program platform watch cases with platform-specific scripts and output paths', () => {
    const cases = buildDemoExtendedCases('/repo')
    const caseMap = new Map(cases.map(watchCase => [watchCase.name, watchCase]))

    expect(caseMap.get('taro-vite-react-tailwindcss-v4')?.requireInitialCompileSuccess).toBe(true)
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:weapp')?.requireInitialCompileSuccess).toBe(true)
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:alipay')?.requireInitialCompileSuccess).toBe(true)
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:tt')?.requireInitialCompileSuccess).toBe(true)
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:weapp')?.devScript).toBe('dev:e2e-watch')
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:alipay')?.devScript).toBe('dev:e2e-watch')
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:alipay')?.env).toMatchObject({
      TARO_E2E_WATCH_PLATFORM: 'alipay',
    })
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:tt')?.devScript).toBe('dev:e2e-watch')
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:tt')?.env).toMatchObject({
      TARO_E2E_WATCH_PLATFORM: 'tt',
    })
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:alipay')?.outputWxml).toBe(
      path.resolve('/repo', 'demo/taro-vite-react-tailwindcss-v4/dist/pages/index/index.axml'),
    )
    expect(caseMap.get('taro-vite-react-tailwindcss-v4:alipay')?.globalStyleCandidates).toContain(
      path.resolve('/repo', 'demo/taro-vite-react-tailwindcss-v4/dist/app.acss'),
    )
    expect(caseMap.get('taro-vite-vue3-tailwindcss-v4:tt')?.subPackageMutations?.[0]?.outputWxml).toBe(
      path.resolve('/repo', 'demo/taro-vite-vue3-tailwindcss-v4/dist/sub-normal/pages/index.ttml'),
    )
    expect(caseMap.get('taro-vite-vue3-tailwindcss-v4:tt')?.subPackageMutations?.[0]?.globalStyleCandidates).toContain(
      path.resolve('/repo', 'demo/taro-vite-vue3-tailwindcss-v4/dist/sub-normal/pages/index.ttss'),
    )

    expect(caseMap.get('uni-app-vite-tailwindcss-v4')?.devScript).toBe('dev:mp-weixin')
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-weixin')?.devScript).toBe('dev:e2e-watch')
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-weixin')?.env).toMatchObject({
      UNI_E2E_WATCH_PLATFORM: 'mp-weixin',
    })
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-alipay')?.devScript).toBe('dev:e2e-watch')
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-alipay')?.env).toMatchObject({
      UNI_E2E_WATCH_PLATFORM: 'mp-alipay',
    })
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-qq')?.devScript).toBe('dev:e2e-watch')
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-toutiao')?.devScript).toBe('dev:e2e-watch')
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-alipay')?.outputWxml).toBe(
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/build/mp-alipay/pages/index/index.axml'),
    )
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-alipay')?.globalStyleCandidates).toEqual([
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/build/mp-alipay/main.acss'),
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/build/mp-alipay/common.acss'),
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/build/mp-alipay/app.acss'),
    ])
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-toutiao')?.subPackageMutations?.[0]?.globalStyleCandidates).toContain(
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/build/mp-toutiao/sub-normal/pages/index.ttss'),
    )
    expect(caseMap.get('uni-app-vite-tailwindcss-v4:mp-toutiao')?.subPackageMutations?.[0]?.globalStyleCandidates).toEqual(expect.arrayContaining([
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/build/mp-toutiao/main.ttss'),
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/build/mp-toutiao/common.ttss'),
      path.resolve('/repo', 'demo/uni-app-vite-tailwindcss-v4/dist/build/mp-toutiao/app.ttss'),
    ]))
  })

  it('covers every Taro and uni-app Web/H5 hot-update case in watch config and PR CI', async () => {
    const cases = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ]
    const webCaseNames = [
      'taro-webpack-react-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
      'uni-app-vite-tailwindcss-v4',
    ]
    const caseMap = new Map(cases.map(watchCase => [watchCase.name, watchCase]))
    for (const name of webCaseNames) {
      const watchCase = caseMap.get(name)
      const sourceFile = toSlashPath(watchCase?.webHmr?.sourceFile ?? '')
      const cssEntryFile = toSlashPath(watchCase?.webHmr?.cssEntryFile ?? '')

      expect(watchCase?.webHmr, `${name} should define Web/H5 HMR coverage`).toBeDefined()
      expect(sourceFile).toMatch(/src\/pages\/index\/index\.(?:tsx|vue)$/)
      expect(cssEntryFile).toMatch(/src\/(?:app|main|tailwind)\.(?:css|less|scss)$/)
      const expectedDevScript = name === 'taro-webpack-react-tailwindcss-v4'
        ? 'dev:h5'
        : name.startsWith('taro-') ? 'build:h5' : 'dev:h5'
      expect(watchCase?.webHmr?.devScript).toBe(expectedDevScript)
    }

    expect(toSlashPath(caseMap.get('taro-webpack-react-tailwindcss-v4')?.webHmr?.cssEntryFile ?? '')).toMatch(/demo\/taro-webpack-react-tailwindcss-v4\/src\/app\.css$/)
    expect(toSlashPath(caseMap.get('taro-webpack-vue3-tailwindcss-v4')?.webHmr?.cssEntryFile ?? '')).toMatch(/demo\/taro-webpack-vue3-tailwindcss-v4\/src\/app\.css$/)

    const taroWebpackPostcssConfigs = [
      'demo/taro-webpack-react-tailwindcss-v4/postcss.config.mjs',
      'demo/taro-webpack-vue3-tailwindcss-v4/postcss.config.mjs',
    ]
    for (const configPath of taroWebpackPostcssConfigs) {
      const configSource = await readFile(path.resolve(__dirname, '../../..', configPath), 'utf8')
      expect(configSource, configPath).not.toContain('weapp-tailwindcss/postcss')
      expect(configSource, configPath).not.toContain('@tailwindcss/postcss')
      expect(configSource, configPath).not.toMatch(/['"]tailwindcss['"]\s*:/)
    }

    const taroConfigs = [
      'demo/taro-vite-react-tailwindcss-v4/config/index.ts',
      'demo/taro-vite-vue3-tailwindcss-v4/config/index.ts',
      'demo/taro-webpack-react-tailwindcss-v4/config/index.ts',
      'demo/taro-webpack-vue3-tailwindcss-v4/config/index.ts',
    ]
    for (const configPath of taroConfigs) {
      const configSource = await readFile(path.resolve(__dirname, '../../..', configPath), 'utf8')
      expect(configSource, configPath).toContain('@tarojs/plugin-html')
      expect(configSource, configPath).toContain('WEAPP_TW_TARO_PLUGIN_HTML')
      expect(configSource, configPath).toContain('=== \'0\'')
      expect(configSource, configPath).toContain('WeappTailwindcss')
      expectTaroGeneratorTargetConfig(configSource, configPath)
      if (configPath.includes('taro-webpack-')) {
        expect(configSource, configPath).toContain('disableWebpackDevServerClientOverlay(chain)')
        expect(configSource, configPath).toMatch(/chain\.devServer\.set\(['"]client['"],\s*\{[\s\S]*?overlay:\s*false/)
        expect(configSource, configPath).not.toContain('chain.watchOptions({')
        expect(configSource, configPath).not.toContain('ignored: [distDir]')
      }
    }

    const taroAppStyleEntries = [
      ['demo/taro-vite-react-tailwindcss-v4/src/app.ts', 'app.css'],
      ['demo/taro-vite-vue3-tailwindcss-v4/src/app.ts', 'app.css'],
      ['demo/taro-webpack-react-tailwindcss-v4/src/app.ts', 'app.css'],
      ['demo/taro-webpack-vue3-tailwindcss-v4/src/app.ts', 'app.css'],
    ]
    for (const [entryPath, styleFile] of taroAppStyleEntries) {
      const entrySource = await readFile(path.resolve(__dirname, '../../..', entryPath), 'utf8')
      expect(entrySource, entryPath).toContain(`import './${styleFile}'`)
    }

    const webpackV5PluginSource = await readFile(
      path.resolve(__dirname, '../src/bundlers/webpack/BaseUnifiedPlugin/v5.ts'),
      'utf8',
    )
    expect(webpackV5PluginSource).toContain('createWebpackFrameworkPlugin')
    const webpackFrameworkPluginSource = await readFile(
      path.resolve(__dirname, '../src/bundlers/webpack/shared/create-framework-plugin.ts'),
      'utf8',
    )
    expect(webpackFrameworkPluginSource).toContain('setupWebpackWatchOutputIgnore')
    expect(webpackFrameworkPluginSource).toContain('compiler.outputPath || compiler.options?.output?.path')

    const taroWebpackStyles = [
      'demo/taro-webpack-react-tailwindcss-v4/src/app.css',
      'demo/taro-webpack-vue3-tailwindcss-v4/src/app.css',
    ]
    for (const stylePath of taroWebpackStyles) {
      const styleSource = await readFile(path.resolve(__dirname, '../../..', stylePath), 'utf8')
      expect(styleSource, stylePath).toContain('@import "tailwindcss"')
      if (styleSource.includes('@config')) {
        expect(styleSource, stylePath).toContain('tailwind.config')
      }
    }

    const workflowSource = await readFile(
      path.resolve(__dirname, '../../../.github/workflows/e2e-watch.yml'),
      'utf8',
    )
    const workflow = parse(workflowSource) as {
      jobs?: Record<string, {
        strategy?: {
          matrix?: {
            include?: Array<Record<string, unknown>>
          }
        }
      }>
    }
    const prMatrixEntries = workflow.jobs?.['pr-quick-gate']?.strategy?.matrix?.include ?? []

    const prWebCases = [
      ['taro-vite-react-tailwindcss-v4', 'web-only'],
      ['taro-vite-vue3-tailwindcss-v4', 'web-only'],
      ['uni-app-vite-tailwindcss-v4', 'default'],
    ] as const

    for (const [name, roundProfile] of prWebCases) {
      expect(
        prMatrixEntries,
        `${name} should run in PR quick gate on macOS`,
      ).toContainEqual(expect.objectContaining({
        os: 'macos-latest',
        runner_label: 'macos',
        watch_case: name,
        round_profile: roundProfile,
        watch_web_only: '1',
      }))
    }
  })

  it('covers normal and independent subpackage hot updates for every demo watch case', () => {
    const cases = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ]

    for (const watchCase of cases) {
      expect(watchCase.subPackageMutations?.map(item => item.root).sort(), watchCase.name).toEqual(['sub-independent', 'sub-normal'])
      for (const subPackageMutation of watchCase.subPackageMutations ?? []) {
        expect(subPackageMutation.templateMutation.sourceFile, watchCase.name).toContain(subPackageMutation.root)
        expect(subPackageMutation.styleMutation.sourceFile, watchCase.name).toContain(subPackageMutation.root)
        expect(subPackageMutation.outputWxml, watchCase.name).toContain(subPackageMutation.root)
        expect(subPackageMutation.outputJs, watchCase.name).toContain(subPackageMutation.root)
        expect(subPackageMutation.globalStyleCandidates.length, watchCase.name).toBeGreaterThan(0)
        if (watchCase.splitSubPackageWatchSessions) {
          expect(subPackageMutation.templateMutation.roundConfigs?.map(item => item.name), watchCase.name).toEqual([
            'baseline-arbitrary',
          ])
          expect(subPackageMutation.mainStyleMutation, watchCase.name).toBeDefined()
        }
        else {
          expect(subPackageMutation.templateMutation.roundConfigs?.map(item => item.name), watchCase.name).toEqual([
            'baseline-arbitrary',
            'complex-corpus',
            'hex-arbitrary',
          ])
        }
      }
      expect(watchCase.subPackageMutations?.find(item => item.root === 'sub-independent')?.independent, watchCase.name).toBe(true)
      expect(watchCase.subPackageMutations?.find(item => item.root === 'sub-normal')?.independent, watchCase.name).toBe(false)
    }
  })

  it('keeps main-style hot-update guards on final global style outputs for every demo case', () => {
    const cases = buildCases('/repo', { includeLocalOnly: true }).filter(watchCase => watchCase.group === 'demo')

    expect(cases.length).toBeGreaterThan(0)

    for (const watchCase of cases) {
      expect(watchCase.globalStyleCandidates.length, watchCase.name).toBeGreaterThan(0)
      expect(watchCase.templateMutation.verifyEscapedIn.length, watchCase.name).toBeGreaterThan(0)
      expect(typeof watchCase.templateMutation.mutate, watchCase.name).toBe('function')

      const normalizedCandidates = watchCase.globalStyleCandidates.map(candidate => candidate.replace(/\\/g, '/').replace(/^[A-Z]:(?=\/)/i, ''))
      if (watchCase.name.startsWith('uni-app-vite-tailwindcss-')) {
        const platform = watchCase.name.includes(':') ? watchCase.name.split(':')[1] : 'mp-weixin'
        const styleExt = {
          'mp-weixin': 'wxss',
          'mp-alipay': 'acss',
          'mp-qq': 'qss',
          'mp-toutiao': 'ttss',
        }[platform] ?? 'wxss'
        if (watchCase.name.includes(':')) {
          expect(normalizedCandidates, watchCase.name).toEqual([
            `/repo/demo/uni-app-vite-tailwindcss-v4/dist/build/${platform}/main.${styleExt}`,
            `/repo/demo/uni-app-vite-tailwindcss-v4/dist/build/${platform}/common.${styleExt}`,
            `/repo/demo/uni-app-vite-tailwindcss-v4/dist/build/${platform}/app.${styleExt}`,
          ])
        }
        else {
          expect(normalizedCandidates, watchCase.name).toEqual([
            `/repo/demo/uni-app-vite-tailwindcss-v4/dist/dev/${platform}/main.wxss`,
            `/repo/demo/uni-app-vite-tailwindcss-v4/dist/dev/${platform}/app.wxss`,
          ])
        }
      }
      if (watchCase.name.startsWith('uni-app-vite-vue3-hbuilderx-tailwindcss-')) {
        expect(normalizedCandidates, watchCase.name).toEqual([
          `/repo/demo/${watchCase.name}/unpackage/dist/dev/mp-weixin/app.wxss`,
        ])
      }
      for (const candidate of normalizedCandidates) {
        expect(candidate, watchCase.name).not.toMatch(/\/src\/(?:main|tailwind)\.wxss$/)
        expect(candidate, watchCase.name).not.toMatch(/\/main\.css$/)
      }

      const subPackageMutations = watchCase.subPackageMutations ?? []
      if (subPackageMutations.length > 0) {
        expect(subPackageMutations.map(item => item.root).sort(), watchCase.name).toEqual(['sub-independent', 'sub-normal'])
      }
      for (const subPackageMutation of subPackageMutations) {
        expect(subPackageMutation.templateMutation.verifyEscapedIn.length, `${watchCase.name}:${subPackageMutation.root}`).toBeGreaterThan(0)
        expect(typeof subPackageMutation.templateMutation.mutate, `${watchCase.name}:${subPackageMutation.root}`).toBe('function')
        const normalizedSubPackageCandidates = subPackageMutation.globalStyleCandidates.map(candidate => candidate.replace(/\\/g, '/'))
        expect(normalizedSubPackageCandidates.length, `${watchCase.name}:${subPackageMutation.root}`).toBeGreaterThan(0)
        for (const candidate of normalizedSubPackageCandidates) {
          expect(candidate, `${watchCase.name}:${subPackageMutation.root}`).not.toMatch(/\/src\/(?:main|tailwind)\.wxss$/)
          expect(candidate, `${watchCase.name}:${subPackageMutation.root}`).not.toMatch(/\/main\.css$/)
        }
        if (subPackageMutation.root === 'sub-independent') {
          expect(subPackageMutation.independent, watchCase.name).toBe(true)
        }
        else {
          expect(subPackageMutation.independent, watchCase.name).toBe(false)
        }
      }
    }
  })

  it('guards DCloud mini-program watch outputs against raw CSS selector escapes', () => {
    const cases = buildCases('/repo', { includeLocalOnly: true })
    const guardedCases = [
      'uni-app-vite-tailwindcss-v4',
      'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
      'uni-app-x-vdom-tailwindcss-v4',
    ]

    for (const caseName of guardedCases) {
      const watchCase = cases.find(item => item.name === caseName)
      expect(watchCase?.outputIntegrityGuards?.length, caseName).toBeGreaterThan(0)
      const selectorGuards = watchCase?.outputIntegrityGuards?.filter(guard => guard.forbiddenFragments?.length) ?? []
      expect(selectorGuards.length, caseName).toBeGreaterThan(0)
      for (const guard of selectorGuards) {
        expect(guard.forbiddenFragments, guard.file).toContain('.i-\\[')
        expect(guard.forbiddenFragments, guard.file).toContain('.before\\:')
      }
    }
  })

  it('guards every final mini-program watch style directory against empty block at-rules', () => {
    const baseCwd = '/repo'
    const cases = buildCases(baseCwd, { includeLocalOnly: true })

    for (const watchCase of cases) {
      const guardedDirectories = watchCase.outputIntegrityGuards
        ?.filter(guard => guard.forbidEmptyBlockAtRules && guard.directory)
        .map(guard => guard.directory!.replace(/\\/g, '/')) ?? []
      const expectedDirectories = new Set(
        watchCase.globalStyleCandidates.map(candidate => path.dirname(candidate).replace(/\\/g, '/')),
      )

      expect(guardedDirectories.length, watchCase.name).toBeGreaterThan(0)
      expect(new Set(guardedDirectories).size, watchCase.name).toBe(guardedDirectories.length)
      for (const directory of expectedDirectories) {
        expect(guardedDirectories, watchCase.name).toContain(directory)
      }
    }
  })

  it('keeps script read-path HMR checks available for every demo case', () => {
    const cases = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ]

    expect(cases.length).toBeGreaterThan(0)

    for (const watchCase of cases) {
      expect(
        watchCase.scriptMutation,
        `${watchCase.name} should define script mutation for same-class read checks`,
      ).toBeDefined()
      expect(typeof watchCase.scriptMutation.mutate).toBe('function')
    }
  })

  it('uses wildcard style candidates for mpx utility outputs', () => {
    const mpxCase = buildDemoExtendedCases('/repo').find(watchCase => watchCase.name === 'mpx-tailwindcss-v4')
    expect(mpxCase?.globalStyleCandidates).toContain(
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/styles/app*.wxss'),
    )
    expect(mpxCase?.globalStyleCandidates).toContain(
      path.resolve('/repo', 'demo/mpx-tailwindcss-v4/dist/wx/styles/index*.wxss'),
    )
    expect(mpxCase?.env).toMatchObject({
      CHOKIDAR_INTERVAL: '50',
      CHOKIDAR_USEPOLLING: '1',
      WATCHPACK_POLLING: '50',
    })
  })

  it('uses page style mutation for mpx v4 without unsupported @apply or theme checks', () => {
    const mpxV4Case = buildDemoExtendedCases('/repo').find(watchCase => watchCase.name === 'mpx-tailwindcss-v4')
    expect(mpxV4Case).toBeDefined()

    const payload = createStyleMutationPayload(mpxV4Case!)
    expect(mpxV4Case?.styleMutation.sourceFile).toBe(path.resolve('/repo', 'demo/mpx-tailwindcss-v4/src/pages/component/index.mpx'))
    expect(mpxV4Case?.styleMutation.mutate('<style>\n</style>\n', payload)).toContain(payload.styleNeedle)
    expect(payload.applyUtilities).toEqual([])
    expect(payload.expectedApplyDeclarations).toEqual([])
    expect(payload.functionNeedle).toBeUndefined()
    expect(payload.functionDeclarations).toEqual([])
    expect(payload.expectedFunctionDeclarations).toEqual([])
    expect(payload.forbiddenFunctionFragments).toEqual([])
    expect(payload.referenceDirective).toBe('@reference "tailwindcss";')
  })

  it('keeps style mutation validation policy explicit for every demo watch case', () => {
    const applyUnsupportedCases = new Set([
      'mpx-tailwindcss-v4',
      'uni-app-vite-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4',
      'taro-webpack-react-tailwindcss-v4',
      'weapp-vite-tailwindcss-v4',
    ])
    const functionUnsupportedCases = new Set([
      'mpx-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4',
      'taro-webpack-react-tailwindcss-v4',
      'weapp-vite-tailwindcss-v4',
    ])
    const referenceRequiredCases = new Set([
      'gulp-tailwindcss-v4',
      'mpx-tailwindcss-v4',
      'uni-app-vite-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
      'taro-webpack-react-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4',
      'weapp-vite-tailwindcss-v4',
    ])
    const cases = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ]

    for (const watchCase of cases) {
      const payload = createStyleMutationPayload(watchCase)

      const baseWatchCaseName = watchCase.name.split(':', 1)[0]
      if (applyUnsupportedCases.has(baseWatchCaseName)) {
        expect(payload.applyUtilities, `${watchCase.name} should skip unsupported @apply validation`).toEqual([])
        expect(payload.expectedApplyDeclarations, `${watchCase.name} should skip unsupported @apply declarations`).toEqual([])
      }
      else {
        expect(payload.applyUtilities.length, `${watchCase.name} should validate @apply utilities`).toBeGreaterThan(0)
        expect(payload.expectedApplyDeclarations.length, `${watchCase.name} should validate expanded @apply declarations`).toBeGreaterThan(0)
      }

      if (functionUnsupportedCases.has(baseWatchCaseName)) {
        expect(payload.functionNeedle, `${watchCase.name} should skip unsupported Tailwind function validation`).toBeUndefined()
        expect(payload.functionDeclarations, `${watchCase.name} should not inject unsupported Tailwind functions`).toEqual([])
        expect(payload.expectedFunctionDeclarations, `${watchCase.name} should not expect unsupported Tailwind function declarations`).toEqual([])
        expect(payload.forbiddenFunctionFragments, `${watchCase.name} should not assert unsupported Tailwind function fragments`).toEqual([])
      }
      else {
        expect(payload.functionNeedle, `${watchCase.name} should validate Tailwind function HMR`).toContain('.tw-watch-style-')
        expect(payload.functionDeclarations.length, `${watchCase.name} should inject Tailwind function declarations`).toBeGreaterThan(0)
        expect(payload.expectedFunctionDeclarations.length, `${watchCase.name} should validate resolved Tailwind function declarations`).toBeGreaterThan(0)
        expect(payload.forbiddenFunctionFragments, `${watchCase.name} should forbid unresolved Tailwind functions`).toContain('theme(')
      }

      if (referenceRequiredCases.has(baseWatchCaseName)) {
        expect(payload.referenceDirective, `${watchCase.name} should include Tailwind v4 @reference`).toBe('@reference "tailwindcss";')
      }
      else {
        expect(payload.referenceDirective, `${watchCase.name} should not need Tailwind v4 @reference`).toBeUndefined()
      }
    }
  })

  it('keeps user-authored style files in automated dev HMR coverage', () => {
    const cases = [
      ...buildDemoBaseCases('/repo'),
      ...buildDemoExtendedCases('/repo'),
    ]

    const styleSources = new Map(cases.map(watchCase => [
      watchCase.name,
      toRepoPath(watchCase.styleMutation.sourceFile),
    ]))

    expect(styleSources.get('uni-app-vite-tailwindcss-v4')).toBe('/repo/demo/uni-app-vite-tailwindcss-v4/src/main.css')
    expect(styleSources.get('mpx-tailwindcss-v4')).toBe('/repo/demo/mpx-tailwindcss-v4/src/pages/component/index.mpx')
    expect(styleSources.get('taro-webpack-react-tailwindcss-v4')).toBe('/repo/demo/taro-webpack-react-tailwindcss-v4/src/pages/index/index.css')

    for (const watchCase of cases) {
      const source = toRepoPath(watchCase.styleMutation.sourceFile)
      expect(
        source,
        `${watchCase.name} should mutate a source style file during dev HMR`,
      ).toMatch(/\/demo\/[^/]+\/(?:src|copy-miniprogram|fixture-miniprogram|miniprogram|pages)\/.+\.(?:css|scss|less|mpx|vue)$/)
      expect(
        source,
        `${watchCase.name} should not mutate generated style output during dev HMR`,
      ).not.toMatch(/\/(?:dist|unpackage)\//)
      expect(
        watchCase.styleMutation.verifyOutputCandidates ?? watchCase.outputStyleCandidates,
        `${watchCase.name} should verify style HMR output candidates`,
      ).not.toEqual([])
    }
  })

  it('keeps same-class global-style stability enabled for uni-app watch cases', () => {
    const demoBaseCases = buildDemoBaseCases('/repo')
    const demoExtendedCases = buildDemoExtendedCases('/repo')
    const weappViteCase = demoBaseCases.find(watchCase => watchCase.name === 'weapp-vite-tailwindcss-v4')
    const uniAppVue3ViteCase = demoExtendedCases.find(watchCase => watchCase.name === 'uni-app-vite-tailwindcss-v4')

    expect(weappViteCase?.requireStableGlobalStyleOnSameClassLiteral).toBe(false)
    expect(uniAppVue3ViteCase?.requireStableGlobalStyleOnSameClassLiteral).toBeUndefined()
  })

  it('does not require initial compile success for weapp-vite powered watch cases with unstable ready logs', () => {
    const demoBaseCases = buildDemoBaseCases('/repo')

    expect(demoBaseCases.find(watchCase => watchCase.name === 'weapp-vite-tailwindcss-v4')?.requireInitialCompileSuccess).toBe(false)
    expect(demoBaseCases.find(watchCase => watchCase.name === 'weapp-vite-tailwindcss-v4')?.requireInitialCompileSuccess).toBe(false)
  })

  it('requires initial compile success for Taro webpack v4 watch cases before HMR mutation', () => {
    const demoExtendedCases = buildDemoExtendedCases('/repo')

    expect(demoExtendedCases.find(watchCase => watchCase.name === 'taro-webpack-react-tailwindcss-v4')?.requireInitialCompileSuccess).toBe(true)
    expect(demoExtendedCases.find(watchCase => watchCase.name === 'taro-webpack-vue3-tailwindcss-v4')?.requireInitialCompileSuccess).toBe(true)
  })

  it('keeps Taro webpack Vue3 subpackage added-class HMR focused on transformed JS output', () => {
    const demoExtendedCases = buildDemoExtendedCases('/repo')
    const taroWebpackVue3V4Case = demoExtendedCases.find(watchCase => watchCase.name === 'taro-webpack-vue3-tailwindcss-v4')
    const taroViteVue3V4Case = demoExtendedCases.find(watchCase => watchCase.name === 'taro-vite-vue3-tailwindcss-v4')

    expect(taroWebpackVue3V4Case?.subPackageMutations).toHaveLength(2)
    for (const subPackageMutation of taroWebpackVue3V4Case?.subPackageMutations ?? []) {
      expect(subPackageMutation.templateMutation.skipExtendedHmr).toBeUndefined()
      expect(subPackageMutation.templateMutation.verifyEscapedIn).toEqual(['js'])
      expect(subPackageMutation.templateMutation.verifyClassLiteralIn).toEqual(['js'])
      expect(subPackageMutation.templateMutation.verifyAllClassLiterals).toBe(false)
    }

    for (const subPackageMutation of taroViteVue3V4Case?.subPackageMutations ?? []) {
      expect(subPackageMutation.templateMutation.verifyAllClassLiterals).toBeUndefined()
    }
  })

  it('prebuilds the weapp-vite demo before watch so dev hot updates start from complete outputs', () => {
    const demoBaseCases = buildDemoBaseCases('/repo')

    expect(demoBaseCases.find(watchCase => watchCase.name === 'weapp-vite-tailwindcss-v4')?.initialBuildScript).toBe('build')
  })

  it('keeps slow Taro webpack H5 web rollback settle timeouts explicit', () => {
    const demoExtendedCases = buildDemoExtendedCases('/repo')
    const taroWebpackReactV4Case = demoExtendedCases.find(watchCase => watchCase.name === 'taro-webpack-react-tailwindcss-v4')
    const taroWebpackVue3V4Case = demoExtendedCases.find(watchCase => watchCase.name === 'taro-webpack-vue3-tailwindcss-v4')

    expect(taroWebpackReactV4Case?.webHmr?.devScript).toBe('dev:h5')
    expect(taroWebpackReactV4Case?.webHmr?.waitForInitialCompileSettled).toBe(true)
    expect(taroWebpackReactV4Case?.webHmr?.initialCompileSettleTimeoutMs).toBeGreaterThanOrEqual(900_000)
    expect(taroWebpackReactV4Case?.webHmr?.injectMarkerElement).toBe(true)
    expect(taroWebpackReactV4Case?.webHmr?.readySelector).toBe('#tw-watch-dom')
    expect(toSlashPath(taroWebpackReactV4Case?.webHmr?.cssEntryFile ?? '')).toMatch(/demo\/taro-webpack-react-tailwindcss-v4\/src\/app\.css$/)
    expect(taroWebpackReactV4Case?.webHmr?.reloadAfterCssMutation).toBeUndefined()
    expect(taroWebpackReactV4Case?.webHmr?.compileSettleTimeoutMs).toBeGreaterThanOrEqual(180_000)
    expect(taroWebpackVue3V4Case?.webHmr?.devScript).toBe('build:h5')
    expect(taroWebpackVue3V4Case?.webHmr?.waitForInitialCompileSettled).toBe(true)
    expect(taroWebpackVue3V4Case?.webHmr?.initialCompileSettleTimeoutMs).toBeGreaterThanOrEqual(900_000)
    expect(taroWebpackVue3V4Case?.webHmr?.reloadAfterCssMutation).toBeUndefined()
    expect(taroWebpackVue3V4Case?.webHmr?.compileSettleTimeoutMs).toBeGreaterThanOrEqual(120_000)
  })

  it('disables Taro webpack React v4 prebundle through compiler options for H5 watch', async () => {
    const configSource = await readFile(
      path.resolve(__dirname, '../../../demo/taro-webpack-react-tailwindcss-v4/config/index.ts'),
      'utf8',
    )

    expect(configSource).toMatch(/compiler:\s*{\s*type:\s*'webpack5',\s*prebundle:\s*{\s*enable:\s*false,/)
    expect(configSource).not.toMatch(/h5:\s*{[\s\S]*?prebundle:\s*{\s*enable:\s*false,/)
  })

  it('waits for existing Web/H5 DOM nodes before source DOM replacement', () => {
    const demoExtendedCases = buildDemoExtendedCases('/repo')
    const uniAppCase = demoExtendedCases.find(watchCase => watchCase.name === 'uni-app-vite-tailwindcss-v4')

    expect(uniAppCase?.webHmr?.sourceDomReplacementSequence?.[0]?.beforeSelector).toBe('.text-\\[\\#00f285\\]')
    expect(uniAppCase?.webHmr?.sourceDomReplacementSequence?.[0]?.expectedStyle?.color).toBe('rgb(18, 52, 86)')
    expect(uniAppCase?.webHmr?.reloadOnHmrStall).toBe(true)
    expect(uniAppCase?.webHmr?.hmrReloadStallMs).toBe(5_000)
    expect(uniAppCase?.webHmr?.touchCssEntryOnSourceMutation).toBe(false)
  })

  it('reloads stalled Taro Vite Web/H5 clients without replaying the full watch case', () => {
    const demoExtendedCases = buildDemoExtendedCases('/repo')

    for (const caseName of [
      'taro-vite-react-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
    ]) {
      const watchCase = demoExtendedCases.find(item => item.name === caseName)
      expect(watchCase?.webHmr?.reloadOnHmrStall, caseName).toBe(true)
      expect(watchCase?.webHmr?.hmrReloadStallMs, caseName).toBe(5_000)
      expect(watchCase?.webHmr?.touchCssEntryOnSourceMutation, caseName).toBe(false)
    }
  })

  it('keeps Taro Vite Vue3 Web HMR marker and utility class in one template mutation', () => {
    const demoExtendedCases = buildDemoExtendedCases('/repo')
    const taroVue3Case = demoExtendedCases.find(watchCase => watchCase.name === 'taro-vite-vue3-tailwindcss-v4')
    const webHmr = taroVue3Case?.webHmr

    expect(webHmr?.injectMarkerElement).toBe(false)
    expect(webHmr?.touchCssEntryOnSourceMutation).toBe(false)
    expect(webHmr).toBeDefined()

    const mutated = webHmr?.mutate(
      '<template>\n  <view class="h-[300px] text-[#c31d6b] bg-[#123456]">Taro Vite Vue3 Tailwind CSS v4</view>\n</template>\n',
      {
        marker: 'watch-marker',
        classLiteral: 'bg-[#123456] w-[88px] h-[44px]',
        classVariableName: '__twWatchWebClass',
      },
    )

    expect(mutated).toContain('<view data-tw-watch-web="watch-marker" class="bg-[#123456] w-[88px] h-[44px]">watch-marker-web</view>')
    expect(mutated).toMatch(/<template>[\s\S]*data-tw-watch-web="watch-marker"[\s\S]*<\/template>/)
  })

  it('filters platform-specific unstable watch cases from grouped runs', () => {
    const cases = buildCases('/repo')

    const darwinCases = filterCasesForPlatform(cases, 'darwin')
    expect(darwinCases).toEqual(cases)

    const win32Cases = filterCasesForPlatform(cases, 'win32')
    expect(win32Cases).toEqual(cases)

    const win32DemoCases = pickCases(win32Cases, 'demo')
    expect(win32DemoCases.every(watchCase => watchCase.group === 'demo')).toBe(true)
    expect(win32DemoCases.find(watchCase => watchCase.name === 'uni-app-vite-tailwindcss-v4')).toBeDefined()
  })

  it('keeps issue33 and Vue3 watch cases across PR smoke and nightly CI matrices', async () => {
    const workflowSource = await readFile(
      path.resolve(__dirname, '../../../.github/workflows/e2e-watch.yml'),
      'utf8',
    )
    const workflow = parse(workflowSource) as {
      jobs?: Record<string, {
        strategy?: {
          matrix?: {
            include?: Array<Record<string, unknown>>
          }
        }
      }>
    }

    const prMatrixEntries = workflow.jobs?.['pr-quick-gate']?.strategy?.matrix?.include ?? []
    const nightlyMatrixEntries = workflow.jobs?.['nightly-full-regression']?.strategy?.matrix?.include ?? []
    const matrixEntries = [
      ...prMatrixEntries,
      ...nightlyMatrixEntries,
    ]

    const requiredMatrixEntries = [
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'uni-app-vite-tailwindcss-v4', round_profile: 'issue33' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'weapp-vite-tailwindcss-v4', round_profile: 'issue33' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-vite-react-tailwindcss-v4', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-vite-vue3-tailwindcss-v4', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-vite-react-tailwindcss-v4:alipay', artifact_case: 'taro-vite-react-tailwindcss-v4-alipay', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-vite-react-tailwindcss-v4:tt', artifact_case: 'taro-vite-react-tailwindcss-v4-tt', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-vite-vue3-tailwindcss-v4:alipay', artifact_case: 'taro-vite-vue3-tailwindcss-v4-alipay', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-vite-vue3-tailwindcss-v4:tt', artifact_case: 'taro-vite-vue3-tailwindcss-v4-tt', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-webpack-react-tailwindcss-v4:weapp', artifact_case: 'taro-webpack-react-tailwindcss-v4-weapp', round_profile: 'mini-program-main' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-webpack-react-tailwindcss-v4:weapp', artifact_case: 'taro-webpack-react-tailwindcss-v4-weapp', round_profile: 'mini-program-subpackages' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-webpack-react-tailwindcss-v4', artifact_case: 'taro-webpack-react-tailwindcss-v4-web', round_profile: 'web-only' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-webpack-vue3-tailwindcss-v4:weapp', artifact_case: 'taro-webpack-vue3-tailwindcss-v4-weapp', round_profile: 'mini-program-main' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-webpack-vue3-tailwindcss-v4:weapp', artifact_case: 'taro-webpack-vue3-tailwindcss-v4-weapp', round_profile: 'mini-program-subpackages' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'taro-webpack-vue3-tailwindcss-v4', artifact_case: 'taro-webpack-vue3-tailwindcss-v4-web', round_profile: 'web-only' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'uni-app-vite-tailwindcss-v4:mp-weixin', artifact_case: 'uni-app-vite-tailwindcss-v4-mp-weixin', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'uni-app-vite-tailwindcss-v4:mp-alipay', artifact_case: 'uni-app-vite-tailwindcss-v4-mp-alipay', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'uni-app-vite-tailwindcss-v4:mp-qq', artifact_case: 'uni-app-vite-tailwindcss-v4-mp-qq', round_profile: 'default' },
      { os: 'macos-latest', runner_label: 'macos', watch_case: 'uni-app-vite-tailwindcss-v4:mp-toutiao', artifact_case: 'uni-app-vite-tailwindcss-v4-mp-toutiao', round_profile: 'default' },
      { os: 'windows-latest', runner_label: 'windows', watch_case: 'uni-app-vite-tailwindcss-v4', round_profile: 'issue33' },
      { os: 'windows-latest', runner_label: 'windows', watch_case: 'weapp-vite-tailwindcss-v4', round_profile: 'issue33' },
      { os: 'windows-latest', runner_label: 'windows', watch_case: 'taro-vite-vue3-tailwindcss-v4', round_profile: 'main-style' },
    ]

    for (const entry of requiredMatrixEntries) {
      expect(matrixEntries).toContainEqual(expect.objectContaining(entry))
    }
    expect(prMatrixEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        os: 'windows-latest',
        runner_label: 'windows',
        watch_case: 'taro-vite-vue3-tailwindcss-v4',
        round_profile: 'main-style',
        watch_main_style_only: '1',
        watch_main_style_subpackage_limit: '2',
        watch_max_attempts: '1',
      }),
      expect.objectContaining({
        os: 'windows-latest',
        runner_label: 'windows',
        watch_case: 'taro-vite-vue3-tailwindcss-v4',
        round_profile: 'web-only',
        watch_web_only: '1',
        watch_max_attempts: '1',
      }),
      ...[
        'taro-vite-react-tailwindcss-v4',
        'taro-webpack-react-tailwindcss-v4',
        'taro-webpack-vue3-tailwindcss-v4',
      ].flatMap(watchCase => [
        expect.objectContaining({
          os: 'windows-latest',
          runner_label: 'windows',
          watch_case: watchCase,
          round_profile: 'main-style',
          watch_main_style_only: '1',
          watch_main_style_subpackage_limit: '2',
          watch_max_attempts: '1',
        }),
        expect.objectContaining({
          os: 'windows-latest',
          runner_label: 'windows',
          watch_case: watchCase,
          round_profile: 'web-only',
          watch_web_only: '1',
          watch_max_attempts: '1',
        }),
      ]),
      expect.objectContaining({
        os: 'windows-latest',
        runner_label: 'windows',
        watch_case: 'taro-vite-react-tailwindcss-v4:tt',
        round_profile: 'main-style',
        watch_main_style_only: '1',
        watch_main_style_subpackage_limit: '2',
        watch_max_attempts: '1',
      }),
      expect.objectContaining({
        os: 'windows-latest',
        runner_label: 'windows',
        watch_case: 'taro-vite-vue3-tailwindcss-v4:tt',
        round_profile: 'main-style',
        watch_main_style_only: '1',
        watch_main_style_subpackage_limit: '2',
        watch_max_attempts: '1',
      }),
    ]))
    expect(String(workflowSource)).toContain('${{ matrix.artifact_case || matrix.watch_case }}')
    expect(prMatrixEntries.filter(entry => String(entry.watch_case).startsWith('weapp-vite-tailwindcss-'))).toEqual([
      expect.objectContaining({
        os: 'windows-latest',
        runner_label: 'windows',
        watch_case: 'weapp-vite-tailwindcss-v4',
        round_profile: 'default',
      }),
    ])
  })

  it('keeps watch plugin processing budget strict while retry settings stay explicit', async () => {
    const workflowSource = await readFile(
      path.resolve(__dirname, '../../../.github/workflows/e2e-watch.yml'),
      'utf8',
    )
    const workflow = parse(workflowSource) as {
      jobs?: Record<string, {
        steps?: Array<Record<string, unknown>>
      }>
    }

    const runSteps = [
      ...(workflow.jobs?.['pr-quick-gate']?.steps ?? []),
      ...(workflow.jobs?.['nightly-full-regression']?.steps ?? []),
    ].filter(step => typeof step.name === 'string' && step.name.startsWith('Run e2e watch suite'))

    expect(runSteps.length).toBe(2)
    for (const step of runSteps) {
      const env = step.env as Record<string, string> | undefined
      expect(env?.E2E_WATCH_MAX_HOT_UPDATE_MS).toBe('${{ matrix.watch_max_hot_update_ms || matrix.watch_timeout_ms }}')
      expect(env?.E2E_WATCH_MAX_PLUGIN_PROCESS_MS).toBe("${{ matrix.watch_max_plugin_process_ms || '6000' }}")
      expect(env?.E2E_WATCH_MAX_ATTEMPTS).toBe("${{ matrix.watch_max_attempts || '2' }}")
      expect(env?.NODE_OPTIONS).toBe('--max-old-space-size=6144')
    }
  })
})
