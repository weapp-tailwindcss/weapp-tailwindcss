import type {
  ClassMutationConfig,
  CliOptions,
  OutputMtime,
  SameClassLiteralHmrMetrics,
  WatchCase,
  WatchSession,
} from '../../types'
import process from 'node:process'
import { formatPath } from '../../cli'
import { getMtime, readFileIfExists, writeFilePreserveEol } from '../../text'
import {
  collectPluginProcessMetrics,
  readJoinedOutputFiles,
  waitForCompileSettled,
  waitForMarkerState,
  waitForOutputFilesUpdated,
  waitForOutputsUpdated,
} from '../shared'
import { assertClassTokensInOutput, assertPreviousClassEvidenceRemoved } from './evidence'

interface RunSameClassLiteralMutationOptions {
  watchCase: WatchCase
  options: CliOptions
  session: WatchSession
  mutation: ClassMutationConfig
  sourceOriginal: string
  sourcePath: string
  classVariableName: string
  globalStyleOutputs: string[]
  minRequiredGlobalStyleEscapedClasses: number
  preferredRound: {
    classLiteral: string
    escapedClasses: string[]
  }
  baselineMtime: OutputMtime
}

export async function runSameClassLiteralMutation(
  options: RunSameClassLiteralMutationOptions,
): Promise<{
  baselineMtime: OutputMtime
  sameClassLiteralHmr: SameClassLiteralHmrMetrics
}> {
  const {
    watchCase,
    options: cliOptions,
    session,
    mutation,
    sourceOriginal,
    sourcePath,
    classVariableName,
    globalStyleOutputs,
    minRequiredGlobalStyleEscapedClasses,
    preferredRound,
    baselineMtime,
  } = options
  const baselineOutputs = {
    wxml: await readFileIfExists(watchCase.outputWxml) ?? '',
    js: await readFileIfExists(watchCase.outputJs) ?? '',
    globalStyle: await readJoinedOutputFiles(globalStyleOutputs),
  }

  const seed = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
  const markerBefore = `tw-watch-${watchCase.name}-script-same-before-${seed}`
  const markerAfter = `tw-watch-${watchCase.name}-script-same-after-${seed}`
  const sourceWithMarkerBefore = mutation.mutate(sourceOriginal, {
    marker: markerBefore,
    classLiteral: preferredRound.classLiteral,
    classVariableName,
  })
  const sourceWithMarkerAfter = mutation.mutate(sourceOriginal, {
    marker: markerAfter,
    classLiteral: preferredRound.classLiteral,
    classVariableName,
  })

  if (
    sourceWithMarkerBefore === sourceOriginal
    || sourceWithMarkerAfter === sourceOriginal
    || sourceWithMarkerBefore === sourceWithMarkerAfter
  ) {
    throw new Error(`[${watchCase.label}] failed to build same-class literal mutation source for script`)
  }

  const hotUpdateBeforeStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=script same-class-literal phase=setup dirty=${formatPath(sourcePath)}\n`,
  )
  await writeFilePreserveEol(sourcePath, sourceWithMarkerBefore, sourceOriginal)
  await waitForOutputsUpdated(
    watchCase,
    baselineMtime,
    cliOptions,
    session,
    hotUpdateBeforeStartedAt,
    async () => {
      const [wxml, js] = await Promise.all([
        readFileIfExists(watchCase.outputWxml),
        readFileIfExists(watchCase.outputJs),
      ])
      return Boolean(wxml?.includes(markerBefore) || js?.includes(markerBefore))
    },
  )
  await waitForMarkerState(
    watchCase,
    markerBefore,
    'present',
    cliOptions,
    session,
    hotUpdateBeforeStartedAt,
  )
  await waitForCompileSettled(watchCase, cliOptions, session, hotUpdateBeforeStartedAt)

  const mtimeAfterBefore = {
    wxml: await getMtime(watchCase.outputWxml),
    js: await getMtime(watchCase.outputJs),
  }

  const globalStyleBeforeSameClassMutationByFile = new Map<string, string>()
  for (const file of globalStyleOutputs) {
    globalStyleBeforeSameClassMutationByFile.set(file, await readFileIfExists(file) ?? '')
  }

  const hotUpdateAfterStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=script same-class-literal phase=add dirty=${formatPath(sourcePath)}\n`,
  )
  await writeFilePreserveEol(sourcePath, sourceWithMarkerAfter, sourceOriginal)
  const hotUpdateOutputMs = await waitForOutputsUpdated(
    watchCase,
    mtimeAfterBefore,
    cliOptions,
    session,
    hotUpdateAfterStartedAt,
    async () => {
      const [wxml, js] = await Promise.all([
        readFileIfExists(watchCase.outputWxml),
        readFileIfExists(watchCase.outputJs),
      ])
      return Boolean(wxml?.includes(markerAfter) || js?.includes(markerAfter))
    },
  )
  const hotUpdateEffectiveMs = await waitForMarkerState(
    watchCase,
    markerAfter,
    'present',
    cliOptions,
    session,
    hotUpdateAfterStartedAt,
  )
  const updatedGlobalStyleAfterSameClassMutation = await readJoinedOutputFiles(globalStyleOutputs)
  const classEvidence = assertClassTokensInOutput({
    wxml: await readFileIfExists(watchCase.outputWxml) ?? '',
    js: await readFileIfExists(watchCase.outputJs) ?? '',
    globalStyle: updatedGlobalStyleAfterSameClassMutation,
  }, preferredRound.classLiteral.split(/\s+/), preferredRound.escapedClasses, [...new Set([
    ...(mutation.verifyAllEscapedClasses !== false ? mutation.verifyEscapedIn : []),
    ...(mutation.verifyAllClassLiterals !== false ? mutation.verifyClassLiteralIn ?? [] : []),
  ])], `[${watchCase.label}] same-class-literal`, true, minRequiredGlobalStyleEscapedClasses > 0, mutation.expectedRemovedCssUtilities)
  const changedGlobalStyleOutputs: string[] = []
  const stableGlobalStyleOutputs: string[] = []
  for (const file of globalStyleOutputs) {
    const before = globalStyleBeforeSameClassMutationByFile.get(file) ?? ''
    const after = await readFileIfExists(file) ?? ''
    if (before === after) {
      stableGlobalStyleOutputs.push(file)
    }
    else {
      changedGlobalStyleOutputs.push(file)
    }
  }

  const stableGlobalStyleRequired = watchCase.requireStableGlobalStyleOnSameClassLiteral
    ?? minRequiredGlobalStyleEscapedClasses > 0
  if (stableGlobalStyleRequired && stableGlobalStyleOutputs.length === 0) {
    throw new Error(
      `[${watchCase.label}] same-class-literal mutation unexpectedly changed all global style outputs: ${changedGlobalStyleOutputs.map(formatPath).join(', ')}`,
    )
  }

  // same-class-literal 复现用于覆盖“源码变更但 CSS 原文不变”的 HMR 场景。
  // 这里沿用 case 级别的全局样式命中策略：若 case 配置为 0（如 mpx），
  // 只校验热更新生效与回滚，不强制要求 global style 命中 escaped class。
  const minRequiredEscapedClasses = !stableGlobalStyleRequired || minRequiredGlobalStyleEscapedClasses === 0
    ? 0
    : Math.max(
        1,
        Math.min(minRequiredGlobalStyleEscapedClasses, preferredRound.escapedClasses.length),
      )
  const verifiedEscapedClasses = preferredRound.escapedClasses.filter(escaped =>
    updatedGlobalStyleAfterSameClassMutation.includes(escaped),
  )
  if (verifiedEscapedClasses.length < minRequiredEscapedClasses) {
    throw new Error(
      `[${watchCase.label}] same-class-literal mutation lost transformed global style classes: required=${minRequiredEscapedClasses}, actual=${verifiedEscapedClasses.length}, source=${formatPath(sourcePath)}`,
    )
  }

  const mtimeAfterAfter = {
    wxml: await getMtime(watchCase.outputWxml),
    js: await getMtime(watchCase.outputJs),
  }
  await waitForCompileSettled(watchCase, cliOptions, session, hotUpdateAfterStartedAt)
  const hotUpdatePluginMetrics = collectPluginProcessMetrics(session, hotUpdateAfterStartedAt)

  const rollbackStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=script same-class-literal phase=delete dirty=${formatPath(sourcePath)}\n`,
  )
  await writeFilePreserveEol(sourcePath, sourceOriginal, sourceOriginal)
  const rollbackOutputMs = await waitForOutputFilesUpdated(
    watchCase,
    [watchCase.outputWxml, watchCase.outputJs],
    new Map([[watchCase.outputWxml, mtimeAfterAfter.wxml], [watchCase.outputJs, mtimeAfterAfter.js]]),
    cliOptions,
    session,
    rollbackStartedAt,
    async () => {
      const [wxml, js] = await Promise.all([
        readFileIfExists(watchCase.outputWxml),
        readFileIfExists(watchCase.outputJs),
      ])
      assertPreviousClassEvidenceRemoved({ wxml: wxml ?? '', js: js ?? '', globalStyle: '' }, classEvidence, [], `[${watchCase.label}] same-class-literal rollback`, baselineOutputs)
      return !wxml?.includes(markerAfter) && !js?.includes(markerAfter)
    },
  )
  const rollbackEffectiveMs = await waitForMarkerState(
    watchCase,
    markerAfter,
    'absent',
    cliOptions,
    session,
    rollbackStartedAt,
  )
  const rollbackPluginMetrics = collectPluginProcessMetrics(session, rollbackStartedAt)

  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=script same-class-literal passed (hotUpdate=${hotUpdateEffectiveMs}ms, rollback=${rollbackEffectiveMs}ms)\n`,
  )

  return {
    baselineMtime: {
      wxml: await getMtime(watchCase.outputWxml),
      js: await getMtime(watchCase.outputJs),
    },
    sameClassLiteralHmr: {
      markerBefore,
      markerAfter,
      classLiteral: preferredRound.classLiteral,
      escapedClasses: preferredRound.escapedClasses,
      verifiedEscapedClasses,
      minRequiredEscapedClasses,
      stableGlobalStyleRequired,
      stableGlobalStyleOutputs,
      changedGlobalStyleOutputs,
      hotUpdateOutputMs,
      hotUpdateEffectiveMs,
      hotUpdatePluginProcessMs: hotUpdatePluginMetrics.totalMs,
      hotUpdatePluginProcessSamples: hotUpdatePluginMetrics.samples,
      rollbackOutputMs,
      rollbackEffectiveMs,
      rollbackPluginProcessMs: rollbackPluginMetrics.totalMs,
      rollbackPluginProcessSamples: rollbackPluginMetrics.samples,
    },
  }
}
