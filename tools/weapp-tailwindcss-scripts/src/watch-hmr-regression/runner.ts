import type {
  ClassMutationMetrics,
  CliOptions,
  MutationKind,
  MutationRoundName,
  StyleMutationMetrics,
  WatchCase,
  WatchCaseMetrics,
  WatchCaseMutationMetrics,
  WatchProjectGroup,
  WatchSession,
  WatchSummary,
} from './types'
import { promises as fs } from 'node:fs'
import process from 'node:process'
import {
  collectWatchArtifactSnapshot,
  countClassMutationHmr,
  countIconifyHmr,
  countMainStyleHmr,
  countStyleMutationHmr,
  countSubPackageMutationHmr,
  countUserReportedHmr,
  createWatchCaseArtifacts,
  HMR_ARTIFACT_COUNT,
} from './artifacts'
import { createWatchCaseCleanup, WatchHmrPartialMetricsError } from './cleanup'
import { summarizeMemoryDebugSamples, summarizeMemorySamples } from './memory-report'
import {
  createSubPackageWatchCase,
  runClassMutation,
  runIconifyHotUpdate,
  runMainStyleHotUpdate,
  runStyleMutation,
  runSubPackageMutation,
  runUserReportedHotUpdate,
  waitForInitialWarmup,
  waitForOutputsReady,
} from './mutations'
import { resolvePreferredRound } from './mutations/shared'
import { createOutputIntegrityMonitor } from './output-integrity'
import { createWatchSession, runPnpmCommand, sleep } from './session'
import { summarizeMutationMetricsByKind } from './summary'
import { runWebHmr } from './web'

export { WatchHmrPartialMetricsError } from './cleanup'
export { summarizeMemorySamples } from './memory-report'

interface HotUpdateBudgetSample {
  label: string
  hotUpdateEffectiveMs: number
}

interface PluginProcessBudgetSample {
  label: string
  pluginProcessMs: number
}

interface MemoryBudgetSample {
  label: string
  memoryRssMb?: number
  memoryRssDeltaMb: number
}

interface HeapBudgetSample {
  label: string
  heapUsedMb: number
}

interface SubPackageMutationRunResult {
  metric: WatchCaseMetrics['subPackageMutationMetrics'][number]
  initialReadyMs: number
  memorySamples: ReturnType<WatchSession['memorySamplesSince']>
  memoryDebugSamples: ReturnType<WatchSession['memoryDebugSamplesSince']>
}

function resolveCaseSourceFiles(watchCase: WatchCase) {
  return [...new Set([
    watchCase.contentMutation?.sourceFile,
    watchCase.iconifyHmr?.sourceFile,
    watchCase.userReportedHotUpdate?.sourceFile,
    watchCase.templateMutation.sourceFile,
    watchCase.scriptMutation.sourceFile,
    watchCase.skipStyleMutation ? undefined : watchCase.styleMutation.sourceFile,
    ...(watchCase.subPackageMutations ?? []).flatMap(mutation => [
      mutation.templateMutation.sourceFile,
      mutation.skipStyleMutation ? undefined : mutation.styleMutation.sourceFile,
    ]),
    watchCase.webHmr?.sourceFile,
    watchCase.webHmr?.cssEntryFile,
  ].filter((item): item is string => Boolean(item)))]
}

async function runSubPackageMutationInNewSession(
  watchCase: WatchCase,
  options: CliOptions,
  subPackageMutation: NonNullable<WatchCase['subPackageMutations']>[number],
  sourceOriginals: Map<string, string>,
): Promise<SubPackageMutationRunResult> {
  const subWatchCase = createSubPackageWatchCase(watchCase, subPackageMutation)
  const sessionStartedAt = Date.now()
  const session = createWatchSession(watchCase.cwd, watchCase.devScript, {
    quietSass: options.quietSass,
  }, watchCase.env)
  const cleanup = createWatchCaseCleanup(subWatchCase.label)

  try {
    const outputsReadyMs = await waitForOutputsReady(subWatchCase, options, session, sessionStartedAt)
    const warmupMs = await waitForInitialWarmup(subWatchCase, options, session, sessionStartedAt)
    if ((watchCase.initialMutationDelayMs ?? 0) > 0) {
      process.stdout.write(
        `[watch-hmr] ${subWatchCase.label} split subpackage settle ${watchCase.initialMutationDelayMs}ms\n`,
      )
      await sleep(watchCase.initialMutationDelayMs!)
      session.ensureRunning()
    }

    const metric = await runSubPackageMutation(
      watchCase,
      options,
      session,
      subPackageMutation,
      sourceOriginals,
    )

    return {
      metric,
      initialReadyMs: Math.max(outputsReadyMs, warmupMs),
      memorySamples: session.memorySamplesSince(sessionStartedAt),
      memoryDebugSamples: session.memoryDebugSamplesSince(sessionStartedAt),
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw cleanup.recordFailure(new Error(`${message}\n[${subWatchCase.label}] recent split subpackage watch logs:\n${session.logs()}`, { cause: error }))
  }
  finally {
    await cleanup.finish({ stopSession: () => session.stop() })
  }
}

export async function runSubPackagesOnlyCase(watchCase: WatchCase, options: CliOptions): Promise<WatchCaseMetrics> {
  const caseStartedAt = Date.now()
  const subPackageMutations = watchCase.subPackageMutations ?? []
  if (subPackageMutations.length === 0) {
    throw new Error(`[${watchCase.label}] subpackages scope requires subPackageMutations`)
  }

  const sourceFiles = resolveCaseSourceFiles(watchCase)
  const sourceOriginals = new Map<string, string>()
  for (const sourceFile of sourceFiles) {
    sourceOriginals.set(sourceFile, await fs.readFile(sourceFile, 'utf8'))
  }

  if (watchCase.initialBuildScript) {
    process.stdout.write(`[watch-hmr] ${watchCase.label} prepare initial build (${watchCase.initialBuildScript})\n`)
    await runPnpmCommand(watchCase.cwd, ['run', watchCase.initialBuildScript], 'prebuild')
  }

  const cleanup = createWatchCaseCleanup(watchCase.label, sourceOriginals)
  try {
    const results = []
    for (const subPackageMutation of subPackageMutations) {
      results.push(await runSubPackageMutationInNewSession(
        watchCase,
        options,
        subPackageMutation,
        sourceOriginals,
      ))
    }

    const subPackageMutationMetrics = results.map(result => result.metric)
    const mutationMetrics = subPackageMutationMetrics.flatMap(metric => [
      metric.template,
      ...(metric.style ? [metric.style] : []),
    ])
    const rounds = subPackageMutationMetrics.flatMap(metric => metric.template.rounds)
    const preferredRound = resolvePreferredRound(subPackageMutationMetrics[0]!.template.rounds)
    if (!preferredRound) {
      throw new Error(`[${watchCase.label}] no preferred subpackage round produced`)
    }
    const memorySamples = results.flatMap(result => result.memorySamples)
    const memoryDebugSamples = results.flatMap(result => result.memoryDebugSamples)
    const memorySummary = summarizeMemorySamples(memorySamples)
    const memoryDebugSummary = summarizeMemoryDebugSamples(memoryDebugSamples)
    const globalStyleOutputs = [...new Set(subPackageMutationMetrics.flatMap(metric => metric.globalStyleOutputs))]

    const metrics: WatchCaseMetrics = {
      name: watchCase.name,
      label: watchCase.label,
      project: watchCase.project,
      projectGroup: watchCase.group,
      marker: preferredRound.marker,
      classLiteral: preferredRound.classLiteral,
      classTokens: preferredRound.classTokens,
      escapedClasses: preferredRound.escapedClasses,
      rounds,
      verifyEscapedIn: subPackageMutationMetrics[0]!.template.verifyEscapedIn,
      verifyClassLiteralIn: subPackageMutationMetrics[0]!.template.verifyClassLiteralIn,
      globalStyleOutputs,
      mutationMetrics,
      subPackageMutationMetrics,
      summaryByMutationKind: summarizeMutationMetricsByKind(mutationMetrics),
      initialReadyMs: Math.max(...results.map(result => result.initialReadyMs)),
      ...(watchCase.maxPluginProcessMs == null ? {} : { maxPluginProcessMs: watchCase.maxPluginProcessMs }),
      hotUpdateOutputMs: preferredRound.hotUpdateOutputMs,
      hotUpdateEffectiveMs: preferredRound.hotUpdateEffectiveMs,
      hotUpdatePluginProcessMs: preferredRound.hotUpdatePluginProcessMs,
      hotUpdatePluginProcessSamples: preferredRound.hotUpdatePluginProcessSamples,
      rollbackOutputMs: preferredRound.rollbackOutputMs,
      rollbackEffectiveMs: preferredRound.rollbackEffectiveMs,
      rollbackPluginProcessMs: preferredRound.rollbackPluginProcessMs,
      rollbackPluginProcessSamples: preferredRound.rollbackPluginProcessSamples,
      totalMs: Date.now() - caseStartedAt,
      memorySamples,
      ...(memoryDebugSamples.length > 0 ? { memoryDebugSamples } : {}),
      memorySummary,
      memoryDebugSummary,
      memoryPeakRssMb: memorySummary.peakRssMb,
      memoryRssDeltaMb: memorySummary.rssDeltaMb,
    }

    cleanup.recordSuccess(
      `[watch-hmr] ${watchCase.label} subpackages-only passed (subpackages=${subPackageMutationMetrics.length})\n`,
    )
    return metrics
  }
  catch (error) {
    throw cleanup.recordFailure(error)
  }
  finally {
    await cleanup.finish()
  }
}

export async function runCase(watchCase: WatchCase, options: CliOptions): Promise<WatchCaseMetrics> {
  const caseStartedAt = Date.now()
  const sourceFiles = resolveCaseSourceFiles(watchCase)
  const sourceOriginals = new Map<string, string>()

  for (const sourceFile of sourceFiles) {
    sourceOriginals.set(sourceFile, await fs.readFile(sourceFile, 'utf8'))
  }

  if (watchCase.initialBuildScript) {
    process.stdout.write(`[watch-hmr] ${watchCase.label} prepare initial build (${watchCase.initialBuildScript})\n`)
    await runPnpmCommand(watchCase.cwd, ['run', watchCase.initialBuildScript], 'prebuild')
  }

  const sessionStartedAt = Date.now()
  let outputIntegrityMonitor: ReturnType<typeof createOutputIntegrityMonitor>
  const session = createWatchSession(watchCase.cwd, watchCase.devScript, {
    quietSass: options.quietSass,
  }, watchCase.env)
  let sessionStopped = false
  const cleanup = createWatchCaseCleanup(watchCase.label, sourceOriginals)

  try {
    const outputsReadyMs = await waitForOutputsReady(watchCase, options, session, sessionStartedAt)
    const warmupMs = await waitForInitialWarmup(watchCase, options, session, sessionStartedAt)
    const initialReadyMs = Math.max(outputsReadyMs, warmupMs)
    outputIntegrityMonitor = createOutputIntegrityMonitor(watchCase.outputIntegrityGuards)
    await outputIntegrityMonitor?.assertClean('initial compile')

    if ((watchCase.initialMutationDelayMs ?? 0) > 0) {
      process.stdout.write(
        `[watch-hmr] ${watchCase.label} extra startup settle ${watchCase.initialMutationDelayMs}ms\n`,
      )
      await sleep(watchCase.initialMutationDelayMs!)
      session.ensureRunning()
    }

    const globalStyleOutputs = watchCase.globalStyleCandidates
    const devArtifactSnapshot = await collectWatchArtifactSnapshot(watchCase, 'dev')
    let hmrArtifactSnapshot: typeof devArtifactSnapshot | undefined
    let completedHmrCount = 0
    const recordCompletedHmr = async (count: number) => {
      completedHmrCount += count
      await outputIntegrityMonitor?.assertClean(`after ${completedHmrCount} HMR updates`)
      if (hmrArtifactSnapshot || completedHmrCount < HMR_ARTIFACT_COUNT) {
        return
      }
      hmrArtifactSnapshot = await collectWatchArtifactSnapshot(watchCase, 'hmr', {
        requestedHmrCount: HMR_ARTIFACT_COUNT,
        capturedAfterHmrCount: completedHmrCount,
      })
    }

    const templateSourceOriginal = sourceOriginals.get(watchCase.templateMutation.sourceFile)
    if (templateSourceOriginal == null) {
      throw new Error(`[${watchCase.label}] missing template mutation source original`)
    }

    const scriptSourceOriginal = sourceOriginals.get(watchCase.scriptMutation.sourceFile)
    if (scriptSourceOriginal == null) {
      throw new Error(`[${watchCase.label}] missing script mutation source original`)
    }

    const styleSourceOriginal = watchCase.skipStyleMutation
      ? undefined
      : sourceOriginals.get(watchCase.styleMutation.sourceFile)
    if (!watchCase.skipStyleMutation && styleSourceOriginal == null) {
      throw new Error(`[${watchCase.label}] missing style mutation source original`)
    }

    const templateMetrics = await runClassMutation(
      watchCase,
      options,
      session,
      'template',
      watchCase.templateMutation,
      templateSourceOriginal,
      globalStyleOutputs,
    )
    await recordCompletedHmr(countClassMutationHmr(templateMetrics))

    const scriptMetrics = await runClassMutation(
      watchCase,
      options,
      session,
      'script',
      watchCase.scriptMutation,
      scriptSourceOriginal,
      globalStyleOutputs,
    )
    await recordCompletedHmr(countClassMutationHmr(scriptMetrics))

    const styleMetrics = watchCase.skipStyleMutation
      ? undefined
      : await runStyleMutation(
          watchCase,
          options,
          session,
          watchCase.styleMutation,
          styleSourceOriginal!,
          watchCase.outputStyleCandidates,
        )
    await recordCompletedHmr(countStyleMutationHmr(styleMetrics))

    let contentMetrics: WatchCaseMutationMetrics | undefined
    if (watchCase.contentMutation) {
      const contentSourceOriginal = sourceOriginals.get(watchCase.contentMutation.sourceFile)
      if (contentSourceOriginal == null) {
        throw new Error(`[${watchCase.label}] missing content mutation source original`)
      }

      // content mutation 替换既有字面量，依赖构建器 watch 与 runtime class set 已经稳定。
      contentMetrics = await runClassMutation(
        watchCase,
        options,
        session,
        'content',
        watchCase.contentMutation,
        contentSourceOriginal,
        globalStyleOutputs,
      )
      await recordCompletedHmr(countClassMutationHmr(contentMetrics))
    }

    let userReportedHotUpdateMetrics
    if (watchCase.userReportedHotUpdate) {
      const userReportedSourceOriginal = sourceOriginals.get(watchCase.userReportedHotUpdate.sourceFile)
      if (userReportedSourceOriginal == null) {
        throw new Error(`[${watchCase.label}] missing user reported hot-update source original`)
      }

      userReportedHotUpdateMetrics = await runUserReportedHotUpdate(
        watchCase,
        options,
        session,
        watchCase.userReportedHotUpdate,
        userReportedSourceOriginal,
        globalStyleOutputs,
      )
      await recordCompletedHmr(countUserReportedHmr(userReportedHotUpdateMetrics))
    }

    let iconifyHmrMetrics
    if (watchCase.iconifyHmr) {
      const iconifySourceOriginal = sourceOriginals.get(watchCase.iconifyHmr.sourceFile)
      if (iconifySourceOriginal == null) {
        throw new Error(`[${watchCase.label}] missing iconify HMR source original`)
      }

      iconifyHmrMetrics = await runIconifyHotUpdate(
        watchCase,
        options,
        session,
        watchCase.iconifyHmr,
        iconifySourceOriginal,
        globalStyleOutputs,
      )
      await recordCompletedHmr(countIconifyHmr(iconifyHmrMetrics))
    }

    const mainStyleHotUpdateMetrics = await runMainStyleHotUpdate(
      watchCase,
      options,
      session,
      'template',
      watchCase.templateMutation,
      templateSourceOriginal,
      globalStyleOutputs,
    )
    await recordCompletedHmr(countMainStyleHmr(mainStyleHotUpdateMetrics))

    const splitSubPackageMemorySamples = []
    const splitSubPackageMemoryDebugSamples = []
    const subPackageMutationMetrics = []
    if (watchCase.splitSubPackageWatchSessions && (watchCase.subPackageMutations?.length ?? 0) > 0) {
      await session.stop()
      sessionStopped = true
      for (const subPackageMutation of watchCase.subPackageMutations ?? []) {
        const result = await runSubPackageMutationInNewSession(
          watchCase,
          options,
          subPackageMutation,
          sourceOriginals,
        )
        subPackageMutationMetrics.push(result.metric)
        await recordCompletedHmr(countSubPackageMutationHmr(result.metric))
        splitSubPackageMemorySamples.push(...result.memorySamples)
        splitSubPackageMemoryDebugSamples.push(...result.memoryDebugSamples)
      }
    }
    else {
      for (const subPackageMutation of watchCase.subPackageMutations ?? []) {
        const metric = await runSubPackageMutation(
          watchCase,
          options,
          session,
          subPackageMutation,
          sourceOriginals,
        )
        subPackageMutationMetrics.push(metric)
        await recordCompletedHmr(countSubPackageMutationHmr(metric))
      }
    }

    const shouldRunWebHmr = watchCase.webHmr && !watchCase.skipWebHmrInFullRun && !options.miniProgramOnly
    if (shouldRunWebHmr) {
      await session.stop()
      sessionStopped = true
    }
    const webHmrMetrics = shouldRunWebHmr ? await runWebHmr(watchCase, options, sourceOriginals) : undefined

    const preferredRound = resolvePreferredRound(templateMetrics.rounds)
    if (!preferredRound) {
      throw new Error(`[${watchCase.label}] no preferred round produced for template mutation`)
    }
    hmrArtifactSnapshot ??= await collectWatchArtifactSnapshot(watchCase, 'hmr', {
      requestedHmrCount: HMR_ARTIFACT_COUNT,
      capturedAfterHmrCount: completedHmrCount,
    })
    const artifacts = await createWatchCaseArtifacts(
      devArtifactSnapshot,
      hmrArtifactSnapshot,
      completedHmrCount,
      HMR_ARTIFACT_COUNT,
    )
    await outputIntegrityMonitor?.assertClean('watch/HMR updates')

    const mutationMetrics: WatchCaseMutationMetrics[] = [
      templateMetrics,
      scriptMetrics,
      ...(styleMetrics ? [styleMetrics] : []),
      ...(contentMetrics ? [contentMetrics] : []),
    ]
    const memorySamples = [
      ...session.memorySamplesSince(sessionStartedAt),
      ...splitSubPackageMemorySamples,
      ...(webHmrMetrics?.memorySamples ?? []),
    ]
    const memoryDebugSamples = [
      ...session.memoryDebugSamplesSince(sessionStartedAt),
      ...splitSubPackageMemoryDebugSamples,
      ...(webHmrMetrics?.memoryDebugSamples ?? []),
    ]
    const memorySummary = summarizeMemorySamples(memorySamples)
    const memoryDebugSummary = summarizeMemoryDebugSamples(memoryDebugSamples)

    const metrics: WatchCaseMetrics = {
      name: watchCase.name,
      label: watchCase.label,
      project: watchCase.project,
      projectGroup: watchCase.group,
      marker: preferredRound.marker,
      classLiteral: preferredRound.classLiteral,
      classTokens: preferredRound.classTokens,
      escapedClasses: preferredRound.escapedClasses,
      rounds: templateMetrics.rounds,
      ...(templateMetrics.roundComparison ? { roundComparison: templateMetrics.roundComparison } : {}),
      verifyEscapedIn: templateMetrics.verifyEscapedIn,
      verifyClassLiteralIn: templateMetrics.verifyClassLiteralIn,
      globalStyleOutputs,
      mutationMetrics,
      mainStyleHotUpdate: mainStyleHotUpdateMetrics,
      ...(userReportedHotUpdateMetrics ? { userReportedHotUpdate: userReportedHotUpdateMetrics } : {}),
      ...(iconifyHmrMetrics ? { iconifyHmr: iconifyHmrMetrics } : {}),
      ...(webHmrMetrics ? { webHmr: webHmrMetrics } : {}),
      subPackageMutationMetrics,
      summaryByMutationKind: summarizeMutationMetricsByKind(mutationMetrics),
      initialReadyMs,
      ...(watchCase.maxPluginProcessMs == null ? {} : { maxPluginProcessMs: watchCase.maxPluginProcessMs }),
      hotUpdateOutputMs: preferredRound.hotUpdateOutputMs,
      hotUpdateEffectiveMs: preferredRound.hotUpdateEffectiveMs,
      hotUpdatePluginProcessMs: preferredRound.hotUpdatePluginProcessMs,
      hotUpdatePluginProcessSamples: preferredRound.hotUpdatePluginProcessSamples,
      rollbackOutputMs: preferredRound.rollbackOutputMs,
      rollbackEffectiveMs: preferredRound.rollbackEffectiveMs,
      rollbackPluginProcessMs: preferredRound.rollbackPluginProcessMs,
      rollbackPluginProcessSamples: preferredRound.rollbackPluginProcessSamples,
      totalMs: Date.now() - caseStartedAt,
      memorySamples,
      ...(memoryDebugSamples.length > 0 ? { memoryDebugSamples } : {}),
      memorySummary,
      memoryDebugSummary,
      memoryPeakRssMb: memorySummary.peakRssMb,
      memoryRssDeltaMb: memorySummary.rssDeltaMb,
      artifacts,
    }

    cleanup.recordSuccess(
      `[watch-hmr] ${watchCase.label} passed (${contentMetrics ? `content=${contentMetrics.hotUpdateEffectiveMs}ms, ` : ''}template=${templateMetrics.hotUpdateEffectiveMs}ms, script=${scriptMetrics.hotUpdateEffectiveMs}ms${styleMetrics ? `, style=${styleMetrics.hotUpdateEffectiveMs}ms` : ''}${webHmrMetrics ? `, web=${webHmrMetrics.hotUpdateEffectiveMs}ms` : ''}, subpackage=${subPackageMutationMetrics.length})\n`,
    )

    return metrics
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    let integrityMessage = ''
    try {
      await outputIntegrityMonitor?.assertClean('watch/HMR updates')
    }
    catch (integrityError) {
      const nextIntegrityMessage = integrityError instanceof Error ? integrityError.message : String(integrityError)
      if (!message.includes(nextIntegrityMessage)) {
        integrityMessage = `${nextIntegrityMessage}\n`
      }
    }
    const logs = session.logs()
    throw cleanup.recordFailure(new Error(`${integrityMessage}${message}\n[${watchCase.label}] recent watch logs:\n${logs}`, { cause: error }))
  }
  finally {
    await cleanup.finish({
      stopMonitor: async () => { await outputIntegrityMonitor?.stop() },
      stopSession: async () => {
        if (!sessionStopped) {
          await session.stop()
        }
      },
    })
  }
}

export async function runWebOnlyCase(watchCase: WatchCase, options: CliOptions): Promise<WatchCaseMetrics> {
  const caseStartedAt = Date.now()
  if (!watchCase.webHmr) {
    throw new Error(`[${watchCase.label}] web-only mode requires webHmr config`)
  }

  const sourceFiles = [...new Set([
    watchCase.webHmr.sourceFile,
    watchCase.webHmr.cssEntryFile,
  ].filter((item): item is string => Boolean(item)))]
  const sourceOriginals = new Map<string, string>()

  for (const sourceFile of sourceFiles) {
    sourceOriginals.set(sourceFile, await fs.readFile(sourceFile, 'utf8'))
  }

  const cleanup = createWatchCaseCleanup(watchCase.label, sourceOriginals)
  try {
    const webHmrMetrics = await runWebHmr(watchCase, options, sourceOriginals)
    if (!webHmrMetrics) {
      throw new Error(`[${watchCase.label}] web-only mode did not collect web HMR metrics`)
    }

    const classTokens = webHmrMetrics.classLiteral.split(/\s+/).filter(Boolean)
    const memorySamples = webHmrMetrics.memorySamples
    const memoryDebugSamples = webHmrMetrics.memoryDebugSamples ?? []
    const memorySummary = summarizeMemorySamples(memorySamples)
    const memoryDebugSummary = summarizeMemoryDebugSamples(memoryDebugSamples)
    const metrics: WatchCaseMetrics = {
      name: watchCase.name,
      label: watchCase.label,
      project: watchCase.project,
      projectGroup: watchCase.group,
      marker: webHmrMetrics.marker,
      classLiteral: webHmrMetrics.classLiteral,
      classTokens,
      escapedClasses: classTokens,
      rounds: [],
      verifyEscapedIn: [],
      verifyClassLiteralIn: [],
      globalStyleOutputs: [],
      mutationMetrics: [],
      webHmr: webHmrMetrics,
      subPackageMutationMetrics: [],
      summaryByMutationKind: summarizeMutationMetricsByKind([]),
      initialReadyMs: webHmrMetrics.initialReadyMs,
      ...(watchCase.maxPluginProcessMs == null ? {} : { maxPluginProcessMs: watchCase.maxPluginProcessMs }),
      hotUpdateOutputMs: webHmrMetrics.hotUpdateEffectiveMs,
      hotUpdateEffectiveMs: webHmrMetrics.hotUpdateEffectiveMs,
      hotUpdatePluginProcessMs: webHmrMetrics.hotUpdatePluginProcessMs,
      hotUpdatePluginProcessSamples: webHmrMetrics.hotUpdatePluginProcessSamples,
      rollbackOutputMs: webHmrMetrics.rollbackEffectiveMs,
      rollbackEffectiveMs: webHmrMetrics.rollbackEffectiveMs,
      rollbackPluginProcessMs: webHmrMetrics.rollbackPluginProcessMs,
      rollbackPluginProcessSamples: webHmrMetrics.rollbackPluginProcessSamples,
      totalMs: Date.now() - caseStartedAt,
      memorySamples,
      ...(memoryDebugSamples.length > 0 ? { memoryDebugSamples } : {}),
      memorySummary,
      memoryDebugSummary,
      memoryPeakRssMb: memorySummary.peakRssMb,
      memoryRssDeltaMb: memorySummary.rssDeltaMb,
    }

    cleanup.recordSuccess(
      `[watch-hmr] ${watchCase.label} web-only passed (web=${webHmrMetrics.hotUpdateEffectiveMs}ms)\n`,
    )

    return metrics
  }
  catch (error) {
    throw cleanup.recordFailure(error)
  }
  finally {
    await cleanup.finish()
  }
}

function normalizeMainStyleSubPackageLimit(limit: number | undefined, total: number) {
  if (limit == null || !Number.isFinite(limit)) {
    return total
  }
  return Math.max(0, Math.min(total, Math.trunc(limit)))
}

function createMainStyleOnlyMetrics(params: {
  watchCase: WatchCase
  caseStartedAt: number
  sessionStartedAt: number
  session: ReturnType<typeof createWatchSession>
  initialReadyMs: number
  mainStyleHotUpdate: NonNullable<WatchCaseMetrics['mainStyleHotUpdate']>
  subPackageMainStyleHotUpdates: NonNullable<WatchCaseMetrics['subPackageMainStyleHotUpdates']>
}) {
  const {
    watchCase,
    caseStartedAt,
    sessionStartedAt,
    session,
    initialReadyMs,
    mainStyleHotUpdate,
    subPackageMainStyleHotUpdates,
  } = params
  const classTokens = [mainStyleHotUpdate.toClassToken]
  const memorySamples = session.memorySamplesSince(sessionStartedAt)
  const memoryDebugSamples = session.memoryDebugSamplesSince(sessionStartedAt)
  const memorySummary = summarizeMemorySamples(memorySamples)
  const memoryDebugSummary = summarizeMemoryDebugSamples(memoryDebugSamples)
  const metrics: WatchCaseMetrics = {
    name: watchCase.name,
    label: watchCase.label,
    project: watchCase.project,
    projectGroup: watchCase.group,
    marker: `main-style:${watchCase.name}`,
    classLiteral: classTokens.join(' '),
    classTokens,
    escapedClasses: [mainStyleHotUpdate.toEscapedClass],
    rounds: [],
    verifyEscapedIn: watchCase.templateMutation.verifyEscapedIn,
    verifyClassLiteralIn: watchCase.templateMutation.verifyClassLiteralIn ?? [],
    globalStyleOutputs: watchCase.globalStyleCandidates,
    mutationMetrics: [],
    mainStyleHotUpdate,
    subPackageMainStyleHotUpdates,
    subPackageMutationMetrics: [],
    summaryByMutationKind: summarizeMutationMetricsByKind([]),
    initialReadyMs,
    ...(watchCase.maxPluginProcessMs == null ? {} : { maxPluginProcessMs: watchCase.maxPluginProcessMs }),
    hotUpdateOutputMs: mainStyleHotUpdate.hotUpdateOutputMs,
    hotUpdateEffectiveMs: mainStyleHotUpdate.hotUpdateEffectiveMs,
    hotUpdatePluginProcessMs: mainStyleHotUpdate.hotUpdatePluginProcessMs,
    hotUpdatePluginProcessSamples: mainStyleHotUpdate.hotUpdatePluginProcessSamples,
    rollbackOutputMs: mainStyleHotUpdate.rollbackOutputMs,
    rollbackEffectiveMs: mainStyleHotUpdate.rollbackEffectiveMs,
    rollbackPluginProcessMs: mainStyleHotUpdate.rollbackPluginProcessMs,
    rollbackPluginProcessSamples: mainStyleHotUpdate.rollbackPluginProcessSamples,
    totalMs: Date.now() - caseStartedAt,
    memorySamples,
    ...(memoryDebugSamples.length > 0 ? { memoryDebugSamples } : {}),
    memorySummary,
    memoryDebugSummary,
    memoryPeakRssMb: memorySummary.peakRssMb,
    memoryRssDeltaMb: memorySummary.rssDeltaMb,
  }

  return metrics
}

export async function runMainStyleOnlyCase(watchCase: WatchCase, options: CliOptions): Promise<WatchCaseMetrics> {
  const caseStartedAt = Date.now()
  const sourcePath = watchCase.templateMutation.sourceFile
  const sourceOriginals = new Map<string, string>()
  const sourceOriginal = await fs.readFile(sourcePath, 'utf8')
  sourceOriginals.set(sourcePath, sourceOriginal)

  const sessionStartedAt = Date.now()
  const session = createWatchSession(watchCase.cwd, watchCase.devScript, {
    quietSass: options.quietSass,
  }, watchCase.env)
  let initialReadyMs = 0
  let mainStyleHotUpdate: WatchCaseMetrics['mainStyleHotUpdate'] | undefined
  const subPackageMainStyleHotUpdates: NonNullable<WatchCaseMetrics['subPackageMainStyleHotUpdates']> = []
  const cleanup = createWatchCaseCleanup(watchCase.label, sourceOriginals)

  try {
    const outputsReadyMs = await waitForOutputsReady(watchCase, options, session, sessionStartedAt)
    const warmupMs = await waitForInitialWarmup(watchCase, options, session, sessionStartedAt)
    initialReadyMs = Math.max(outputsReadyMs, warmupMs)
    mainStyleHotUpdate = await runMainStyleHotUpdate(
      watchCase,
      options,
      session,
      'template',
      watchCase.templateMutation,
      sourceOriginal,
      watchCase.globalStyleCandidates,
    )

    const subPackageMutations = watchCase.subPackageMutations ?? []
    const subPackageLimit = normalizeMainStyleSubPackageLimit(
      options.mainStyleSubPackageLimit,
      subPackageMutations.length,
    )
    if (subPackageLimit < subPackageMutations.length) {
      process.stdout.write(
        `[watch-hmr] ${watchCase.label} main-style-only subpackage limit ${subPackageLimit}/${subPackageMutations.length}\n`,
      )
    }
    for (const mutation of subPackageMutations.slice(0, subPackageLimit)) {
      const subWatchCase = createSubPackageWatchCase(watchCase, mutation)
      const mainStyleMutation = mutation.mainStyleMutation ?? mutation.templateMutation
      const subSourcePath = mainStyleMutation.sourceFile
      const subPackageMainStyleOutputs = [...new Set([
        ...mutation.outputStyleCandidates,
        ...mutation.globalStyleCandidates,
      ])]
      const subSourceOriginal = sourceOriginals.get(subSourcePath)
        ?? await fs.readFile(subSourcePath, 'utf8')
      sourceOriginals.set(subSourcePath, subSourceOriginal)
      subPackageMainStyleHotUpdates.push({
        root: mutation.root,
        independent: mutation.independent,
        outputWxml: mutation.outputWxml,
        outputJs: mutation.outputJs,
        globalStyleOutputs: subPackageMainStyleOutputs,
        mainStyleHotUpdate: await runMainStyleHotUpdate(
          subWatchCase,
          options,
          session,
          'template',
          mainStyleMutation,
          subSourceOriginal,
          subPackageMainStyleOutputs,
        ),
      })
    }

    const metrics = createMainStyleOnlyMetrics({
      watchCase,
      caseStartedAt,
      sessionStartedAt,
      session,
      initialReadyMs,
      mainStyleHotUpdate,
      subPackageMainStyleHotUpdates,
    })

    cleanup.recordSuccess(
      `[watch-hmr] ${watchCase.label} main-style-only passed (main-style=${mainStyleHotUpdate.hotUpdateEffectiveMs}ms)\n`,
    )

    return metrics
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const logs = session.logs()
    if (mainStyleHotUpdate) {
      const metrics = createMainStyleOnlyMetrics({
        watchCase,
        caseStartedAt,
        sessionStartedAt,
        session,
        initialReadyMs,
        mainStyleHotUpdate,
        subPackageMainStyleHotUpdates,
      })
      throw cleanup.recordFailure(new WatchHmrPartialMetricsError(`${message}\n[${watchCase.label}] recent watch logs:\n${logs}`, metrics, { cause: error }))
    }
    throw cleanup.recordFailure(new Error(`${message}\n[${watchCase.label}] recent watch logs:\n${logs}`, { cause: error }))
  }
  finally {
    await cleanup.finish({ stopSession: () => session.stop() })
  }
}

export function assertHotUpdateBudget(metrics: WatchCaseMetrics, options: CliOptions) {
  if (options.maxHotUpdateMs == null) {
    return
  }

  for (const sample of collectHotUpdateBudgetSamples(metrics)) {
    if (sample.hotUpdateEffectiveMs > options.maxHotUpdateMs) {
      throw new Error(
        `[${metrics.label}] ${sample.label} hot update exceeded budget: ${sample.hotUpdateEffectiveMs}ms > ${options.maxHotUpdateMs}ms`,
      )
    }
  }
}

export function assertPluginProcessBudget(metrics: WatchCaseMetrics, options: CliOptions) {
  if (options.webOnly) {
    return
  }

  const configuredBudgets = [metrics.maxPluginProcessMs, options.maxPluginProcessMs].filter(
    (budget): budget is number => budget != null,
  )
  if (configuredBudgets.length === 0) {
    return
  }
  const maxPluginProcessMs = Math.max(...configuredBudgets)

  const samples = collectPluginProcessBudgetSamples(metrics)
  if (samples.length === 0) {
    throw new Error(`[${metrics.label}] no weapp-tailwindcss processing samples were collected`)
  }

  for (const sample of samples) {
    if (sample.pluginProcessMs > maxPluginProcessMs) {
      throw new Error(
        `[${metrics.label}] ${sample.label} weapp-tailwindcss processing exceeded budget: ${sample.pluginProcessMs}ms > ${maxPluginProcessMs}ms`,
      )
    }
  }
}

export function assertMemoryBudget(metrics: WatchCaseMetrics, options: CliOptions) {
  const maxMemoryRssMb = options.maxMemoryRssMb
  if (maxMemoryRssMb != null && maxMemoryRssMb > 0) {
    const samples: MemoryBudgetSample[] = [{
      label: 'case',
      memoryRssMb: metrics.memorySummary.peakRssMb,
      memoryRssDeltaMb: metrics.memorySummary.rssDeltaMb,
    }]

    for (const sample of samples) {
      if ((sample.memoryRssMb ?? 0) > maxMemoryRssMb) {
        throw new Error(
          `[${metrics.label}] ${sample.label} memory RSS peak exceeded budget: ${sample.memoryRssMb}MB > ${maxMemoryRssMb}MB`,
        )
      }
    }
  }

  const maxMemoryRssDeltaMb = options.maxMemoryRssDeltaMb
  if (maxMemoryRssDeltaMb != null && maxMemoryRssDeltaMb > 0) {
    const samples: MemoryBudgetSample[] = [{
      label: 'case',
      memoryRssMb: metrics.memorySummary.peakRssMb,
      memoryRssDeltaMb: metrics.memorySummary.rssDeltaMb,
    }]

    for (const sample of samples) {
      if (sample.memoryRssDeltaMb > maxMemoryRssDeltaMb) {
        throw new Error(
          `[${metrics.label}] ${sample.label} memory RSS delta exceeded budget: ${sample.memoryRssDeltaMb}MB > ${maxMemoryRssDeltaMb}MB`,
        )
      }
    }
  }

  const maxMemoryHeapUsedMb = options.maxMemoryHeapUsedMb
  if (maxMemoryHeapUsedMb == null || maxMemoryHeapUsedMb <= 0) {
    return
  }

  const heapSamples: HeapBudgetSample[] = Object
    .entries(metrics.memoryDebugSummary.byBundlerPhase)
    .map(([label, summary]) => ({
      label,
      heapUsedMb: summary.peakHeapUsedMb,
    }))

  for (const sample of heapSamples) {
    if (sample.heapUsedMb > maxMemoryHeapUsedMb) {
      throw new Error(
        `[${metrics.label}] ${sample.label} heap used exceeded budget: ${sample.heapUsedMb}MB > ${maxMemoryHeapUsedMb}MB`,
      )
    }
  }
}

function collectClassMutationBudgetSamples(
  mutation: ClassMutationMetrics,
): HotUpdateBudgetSample[] {
  const samples: HotUpdateBudgetSample[] = mutation.rounds.map(round => ({
    label: `${mutation.mutationKind}:${round.roundName}`,
    hotUpdateEffectiveMs: round.hotUpdateEffectiveMs,
  }))

  if (mutation.addedClassHmr) {
    samples.push({
      label: `${mutation.mutationKind}:added-class`,
      hotUpdateEffectiveMs: mutation.addedClassHmr.hotUpdateEffectiveMs,
    })
  }
  if (mutation.sameClassLiteralHmr) {
    samples.push({
      label: `${mutation.mutationKind}:same-class-literal`,
      hotUpdateEffectiveMs: mutation.sameClassLiteralHmr.hotUpdateEffectiveMs,
    })
  }
  if (mutation.commentCarrierHmr) {
    samples.push({
      label: `${mutation.mutationKind}:comment-carrier`,
      hotUpdateEffectiveMs: mutation.commentCarrierHmr.hotUpdateEffectiveMs,
    })
  }

  return samples
}

function collectClassMutationPluginProcessBudgetSamples(
  mutation: ClassMutationMetrics,
): PluginProcessBudgetSample[] {
  const samples: PluginProcessBudgetSample[] = mutation.rounds.flatMap(round => [
    {
      label: `${mutation.mutationKind}:${round.roundName}:hot-update`,
      pluginProcessMs: round.hotUpdatePluginProcessMs,
    },
    {
      label: `${mutation.mutationKind}:${round.roundName}:rollback`,
      pluginProcessMs: round.rollbackPluginProcessMs,
    },
  ])

  if (mutation.addedClassHmr) {
    samples.push(
      {
        label: `${mutation.mutationKind}:added-class:hot-update`,
        pluginProcessMs: mutation.addedClassHmr.hotUpdatePluginProcessMs,
      },
      {
        label: `${mutation.mutationKind}:added-class:rollback`,
        pluginProcessMs: mutation.addedClassHmr.rollbackPluginProcessMs,
      },
    )
  }
  if (mutation.sameClassLiteralHmr) {
    samples.push(
      {
        label: `${mutation.mutationKind}:same-class-literal:hot-update`,
        pluginProcessMs: mutation.sameClassLiteralHmr.hotUpdatePluginProcessMs,
      },
      {
        label: `${mutation.mutationKind}:same-class-literal:rollback`,
        pluginProcessMs: mutation.sameClassLiteralHmr.rollbackPluginProcessMs,
      },
    )
  }
  if (mutation.commentCarrierHmr) {
    samples.push(
      {
        label: `${mutation.mutationKind}:comment-carrier:hot-update`,
        pluginProcessMs: mutation.commentCarrierHmr.hotUpdatePluginProcessMs,
      },
      {
        label: `${mutation.mutationKind}:comment-carrier:rollback`,
        pluginProcessMs: mutation.commentCarrierHmr.rollbackPluginProcessMs,
      },
    )
  }

  return samples
}

function collectStyleMutationPluginProcessBudgetSamples(
  mutation: StyleMutationMetrics,
): PluginProcessBudgetSample[] {
  return [
    {
      label: `${mutation.mutationKind}:hot-update`,
      pluginProcessMs: mutation.hotUpdatePluginProcessMs,
    },
    {
      label: `${mutation.mutationKind}:rollback`,
      pluginProcessMs: mutation.rollbackPluginProcessMs,
    },
  ]
}

function collectPluginProcessBudgetSamples(metrics: WatchCaseMetrics): PluginProcessBudgetSample[] {
  const samples: PluginProcessBudgetSample[] = [{
    label: 'case-template-preferred:hot-update',
    pluginProcessMs: metrics.hotUpdatePluginProcessMs,
  }]

  for (const mutation of metrics.mutationMetrics) {
    if (mutation.mutationKind === 'style') {
      samples.push(...collectStyleMutationPluginProcessBudgetSamples(mutation))
      continue
    }
    samples.push(...collectClassMutationPluginProcessBudgetSamples(mutation))
  }

  if (metrics.userReportedHotUpdate) {
    samples.push(
      {
        label: `user-reported:${metrics.userReportedHotUpdate.label}:hot-update`,
        pluginProcessMs: metrics.userReportedHotUpdate.hotUpdatePluginProcessMs,
      },
      {
        label: `user-reported:${metrics.userReportedHotUpdate.label}:rollback`,
        pluginProcessMs: metrics.userReportedHotUpdate.rollbackPluginProcessMs,
      },
    )
  }

  if (metrics.mainStyleHotUpdate) {
    samples.push(
      {
        label: `main-style:${metrics.mainStyleHotUpdate.label}:hot-update`,
        pluginProcessMs: metrics.mainStyleHotUpdate.hotUpdatePluginProcessMs,
      },
      {
        label: `main-style:${metrics.mainStyleHotUpdate.label}:rollback`,
        pluginProcessMs: metrics.mainStyleHotUpdate.rollbackPluginProcessMs,
      },
    )
  }

  for (const subPackage of metrics.subPackageMainStyleHotUpdates ?? []) {
    samples.push(
      {
        label: `subpackage:${subPackage.root}:main-style:${subPackage.mainStyleHotUpdate.label}:hot-update`,
        pluginProcessMs: subPackage.mainStyleHotUpdate.hotUpdatePluginProcessMs,
      },
      {
        label: `subpackage:${subPackage.root}:main-style:${subPackage.mainStyleHotUpdate.label}:rollback`,
        pluginProcessMs: subPackage.mainStyleHotUpdate.rollbackPluginProcessMs,
      },
    )
  }

  for (const subPackage of metrics.subPackageMutationMetrics) {
    if (subPackage.mainStyleHotUpdate) {
      samples.push(
        {
          label: `subpackage:${subPackage.root}:main-style:${subPackage.mainStyleHotUpdate.label}:hot-update`,
          pluginProcessMs: subPackage.mainStyleHotUpdate.hotUpdatePluginProcessMs,
        },
        {
          label: `subpackage:${subPackage.root}:main-style:${subPackage.mainStyleHotUpdate.label}:rollback`,
          pluginProcessMs: subPackage.mainStyleHotUpdate.rollbackPluginProcessMs,
        },
      )
    }
    samples.push(
      ...collectClassMutationPluginProcessBudgetSamples(subPackage.template).map(sample => ({
        ...sample,
        label: `subpackage:${subPackage.root}:${sample.label}`,
      })),
    )
    if (subPackage.style) {
      samples.push(
        ...collectStyleMutationPluginProcessBudgetSamples(subPackage.style).map(sample => ({
          ...sample,
          label: `subpackage:${subPackage.root}:${sample.label}`,
        })),
      )
    }
  }

  return samples
}

function collectStyleMutationBudgetSample(
  mutation: StyleMutationMetrics,
): HotUpdateBudgetSample {
  return {
    label: mutation.mutationKind,
    hotUpdateEffectiveMs: mutation.hotUpdateEffectiveMs,
  }
}

function collectHotUpdateBudgetSamples(metrics: WatchCaseMetrics): HotUpdateBudgetSample[] {
  const samples: HotUpdateBudgetSample[] = [{
    label: 'case-template-preferred',
    hotUpdateEffectiveMs: metrics.hotUpdateEffectiveMs,
  }]

  if (metrics.webHmr) {
    samples.push({
      label: 'web-hmr',
      hotUpdateEffectiveMs: metrics.webHmr.hotUpdateEffectiveMs,
    })
  }

  for (const mutation of metrics.mutationMetrics) {
    if (mutation.mutationKind === 'style') {
      samples.push(collectStyleMutationBudgetSample(mutation))
      continue
    }
    samples.push(...collectClassMutationBudgetSamples(mutation))
  }

  if (metrics.userReportedHotUpdate) {
    samples.push({
      label: `user-reported:${metrics.userReportedHotUpdate.label}`,
      hotUpdateEffectiveMs: metrics.userReportedHotUpdate.hotUpdateEffectiveMs,
    })
  }

  if (metrics.mainStyleHotUpdate) {
    samples.push({
      label: `main-style:${metrics.mainStyleHotUpdate.label}`,
      hotUpdateEffectiveMs: metrics.mainStyleHotUpdate.hotUpdateEffectiveMs,
    })
  }

  for (const subPackage of metrics.subPackageMainStyleHotUpdates ?? []) {
    samples.push({
      label: `subpackage:${subPackage.root}:main-style:${subPackage.mainStyleHotUpdate.label}`,
      hotUpdateEffectiveMs: subPackage.mainStyleHotUpdate.hotUpdateEffectiveMs,
    })
  }

  for (const metric of metrics.webHmr?.sourceClassReplacementSequence ?? []) {
    samples.push({
      label: `web-source-replacement:${metric.label}`,
      hotUpdateEffectiveMs: metric.hotUpdateEffectiveMs,
    })
  }

  for (const subPackage of metrics.subPackageMutationMetrics) {
    if (subPackage.mainStyleHotUpdate) {
      samples.push({
        label: `subpackage:${subPackage.root}:main-style:${subPackage.mainStyleHotUpdate.label}`,
        hotUpdateEffectiveMs: subPackage.mainStyleHotUpdate.hotUpdateEffectiveMs,
      })
    }
    samples.push(
      ...collectClassMutationBudgetSamples(subPackage.template).map(sample => ({
        ...sample,
        label: `subpackage:${subPackage.root}:${sample.label}`,
      })),
    )
    if (subPackage.style) {
      const sample = collectStyleMutationBudgetSample(subPackage.style)
      samples.push({
        ...sample,
        label: `subpackage:${subPackage.root}:${sample.label}`,
      })
    }
  }

  return samples
}

export function logSummary(
  summary: WatchSummary,
  summaryByRound: Partial<Record<MutationRoundName, WatchSummary>>,
  summaryByGroup: Partial<Record<WatchProjectGroup, WatchSummary>>,
  summaryByMutationKind: Partial<Record<MutationKind, WatchSummary>>,
) {
  process.stdout.write(
    `[watch-hmr] summary: cases=${summary.count}, hotUpdate(avg/min/max)=${summary.hotUpdateAvgMs}/${summary.hotUpdateMinMs}/${summary.hotUpdateMaxMs}ms, rollback(avg/min/max)=${summary.rollbackAvgMs}/${summary.rollbackMinMs}/${summary.rollbackMaxMs}ms\n`,
  )

  for (const [roundName, roundSummary] of Object.entries(summaryByRound)) {
    if (!roundSummary) {
      continue
    }
    process.stdout.write(
      `[watch-hmr] round ${roundName}: cases=${roundSummary.count}, hotUpdate(avg/min/max)=${roundSummary.hotUpdateAvgMs}/${roundSummary.hotUpdateMinMs}/${roundSummary.hotUpdateMaxMs}ms, rollback(avg/min/max)=${roundSummary.rollbackAvgMs}/${roundSummary.rollbackMinMs}/${roundSummary.rollbackMaxMs}ms\n`,
    )
  }

  for (const [groupName, groupSummary] of Object.entries(summaryByGroup)) {
    if (!groupSummary) {
      continue
    }
    process.stdout.write(
      `[watch-hmr] group ${groupName}: cases=${groupSummary.count}, hotUpdate(avg/min/max)=${groupSummary.hotUpdateAvgMs}/${groupSummary.hotUpdateMinMs}/${groupSummary.hotUpdateMaxMs}ms, rollback(avg/min/max)=${groupSummary.rollbackAvgMs}/${groupSummary.rollbackMinMs}/${groupSummary.rollbackMaxMs}ms\n`,
    )
  }

  for (const [kindName, kindSummary] of Object.entries(summaryByMutationKind)) {
    if (!kindSummary) {
      continue
    }
    process.stdout.write(
      `[watch-hmr] mutation ${kindName}: cases=${kindSummary.count}, hotUpdate(avg/min/max)=${kindSummary.hotUpdateAvgMs}/${kindSummary.hotUpdateMinMs}/${kindSummary.hotUpdateMaxMs}ms, rollback(avg/min/max)=${kindSummary.rollbackAvgMs}/${kindSummary.rollbackMinMs}/${kindSummary.rollbackMaxMs}ms\n`,
    )
  }
}
