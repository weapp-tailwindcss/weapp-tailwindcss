import type { CliOptions, StyleMutationMetrics, WatchCase, WatchCaseMetrics, WatchProjectGroup } from './types'
import { promises as fs } from 'node:fs'
import process from 'node:process'
import { summarizeMemoryDebugSamples, summarizeMemorySamples } from './memory-report'
import { waitForInitialWarmup } from './mutations/shared'
import { runStyleMutation } from './mutations/style'
import { createOutputIntegrityMonitor } from './output-integrity'
import { createWatchSession } from './session'
import { summarizeMutationMetricsByKind } from './summary'
import { writeFilePreserveEol } from './text'

export interface StyleOnlyCaseMetrics {
  name: string
  label: string
  project: string
  projectGroup: WatchProjectGroup
  initialReadyMs: number
  hotUpdateMs: number
  rollbackMs: number
  rollbackNeedleCleared: boolean
  outputStyle: string
}

function toStyleOnlyWatchCaseMetrics(
  watchCase: WatchCase,
  initialReadyMs: number,
  totalMs: number,
  styleMetrics: StyleMutationMetrics,
  memorySamples = [] as WatchCaseMetrics['memorySamples'],
  memoryDebugSamples = [] as NonNullable<WatchCaseMetrics['memoryDebugSamples']>,
): WatchCaseMetrics {
  const memorySummary = summarizeMemorySamples(memorySamples)
  const memoryDebugSummary = summarizeMemoryDebugSamples(memoryDebugSamples)
  return {
    name: watchCase.name,
    label: watchCase.label,
    project: watchCase.project,
    projectGroup: watchCase.group,
    marker: `style:${styleMetrics.marker}`,
    classLiteral: styleMetrics.styleNeedle,
    classTokens: [styleMetrics.styleNeedle],
    escapedClasses: styleMetrics.outputNeedles,
    rounds: [],
    verifyEscapedIn: [],
    verifyClassLiteralIn: [],
    globalStyleOutputs: watchCase.globalStyleCandidates,
    mutationMetrics: [styleMetrics],
    subPackageMutationMetrics: [],
    summaryByMutationKind: summarizeMutationMetricsByKind([styleMetrics]),
    initialReadyMs,
    ...(watchCase.maxPluginProcessMs == null ? {} : { maxPluginProcessMs: watchCase.maxPluginProcessMs }),
    hotUpdateOutputMs: styleMetrics.hotUpdateOutputMs,
    hotUpdateEffectiveMs: styleMetrics.hotUpdateEffectiveMs,
    hotUpdatePluginProcessMs: styleMetrics.hotUpdatePluginProcessMs,
    hotUpdatePluginProcessSamples: styleMetrics.hotUpdatePluginProcessSamples,
    rollbackOutputMs: styleMetrics.rollbackOutputMs,
    rollbackEffectiveMs: styleMetrics.rollbackEffectiveMs,
    rollbackPluginProcessMs: styleMetrics.rollbackPluginProcessMs,
    rollbackPluginProcessSamples: styleMetrics.rollbackPluginProcessSamples,
    totalMs,
    memorySamples,
    ...(memoryDebugSamples.length > 0 ? { memoryDebugSamples } : {}),
    memorySummary,
    memoryDebugSummary,
    memoryPeakRssMb: memorySummary.peakRssMb,
    memoryRssDeltaMb: memorySummary.rssDeltaMb,
  }
}

/**
 * 仅运行 style 变更链路，供调试 HMR 时复用现有 watch harness。
 */
export async function runStyleOnlyCase(
  watchCase: WatchCase,
  options: CliOptions,
): Promise<StyleOnlyCaseMetrics & { watchCaseMetrics: WatchCaseMetrics }> {
  const caseStartedAt = Date.now()
  const styleSourceOriginal = await fs.readFile(watchCase.styleMutation.sourceFile, 'utf8')
  let outputIntegrityMonitor: ReturnType<typeof createOutputIntegrityMonitor>
  const session = await createWatchSession(
    watchCase.cwd,
    watchCase.devScript,
    { quietSass: options.quietSass },
    watchCase.env,
  )
  const sessionStartedAt = session.startedAt ?? Date.now()

  try {
    await waitForInitialWarmup(watchCase, options, session, sessionStartedAt)
    outputIntegrityMonitor = createOutputIntegrityMonitor(watchCase.outputIntegrityGuards)
    await outputIntegrityMonitor?.assertClean('initial compile')
    const initialReadyMs = Date.now() - sessionStartedAt
    const styleMetrics = await runStyleMutation(
      watchCase,
      options,
      session,
      watchCase.styleMutation,
      styleSourceOriginal,
      watchCase.outputStyleCandidates,
    )
    await outputIntegrityMonitor?.assertClean('style mutation')

    process.stdout.write(
      `[watch-hmr:style] ${watchCase.label} passed (hotUpdate=${styleMetrics.hotUpdateEffectiveMs}ms, rollback=${styleMetrics.rollbackEffectiveMs}ms)\n`,
    )

    const totalMs = Date.now() - caseStartedAt
    const watchCaseMetrics = toStyleOnlyWatchCaseMetrics(
      watchCase,
      initialReadyMs,
      totalMs,
      styleMetrics,
      session.memorySamplesSince(sessionStartedAt),
      session.memoryDebugSamplesSince(sessionStartedAt),
    )

    return {
      name: watchCase.name,
      label: watchCase.label,
      project: watchCase.project,
      projectGroup: watchCase.group,
      initialReadyMs,
      hotUpdateMs: styleMetrics.hotUpdateEffectiveMs,
      rollbackMs: styleMetrics.rollbackEffectiveMs,
      rollbackNeedleCleared: styleMetrics.rollbackNeedleCleared,
      outputStyle: styleMetrics.outputStyle,
      watchCaseMetrics,
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    let integrityMessage = ''
    try {
      await outputIntegrityMonitor?.assertClean('style mutation')
    }
    catch (integrityError) {
      const nextIntegrityMessage = integrityError instanceof Error ? integrityError.message : String(integrityError)
      if (!message.includes(nextIntegrityMessage)) {
        integrityMessage = `${nextIntegrityMessage}\n`
      }
    }
    const logs = session.logs()
    throw new Error(`${integrityMessage}${message}\n[${watchCase.label}] recent watch logs:\n${logs}`)
  }
  finally {
    try {
      const current = await fs.readFile(watchCase.styleMutation.sourceFile, 'utf8')
      if (current !== styleSourceOriginal) {
        await writeFilePreserveEol(
          watchCase.styleMutation.sourceFile,
          styleSourceOriginal,
          styleSourceOriginal,
        )
      }
    }
    catch {
    }
    await outputIntegrityMonitor?.stop()
    await session.stop()
  }
}

export async function runStyleOnlyCases(
  watchCases: WatchCase[],
  options: CliOptions,
) {
  const metrics: StyleOnlyCaseMetrics[] = []
  for (const watchCase of watchCases) {
    metrics.push(await runStyleOnlyCase(watchCase, options))
  }
  return metrics
}
