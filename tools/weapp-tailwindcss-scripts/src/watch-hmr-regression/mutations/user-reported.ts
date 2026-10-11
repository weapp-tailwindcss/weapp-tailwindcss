import type {
  CliOptions,
  PluginProcessSample,
  UserReportedHotUpdateConfig,
  UserReportedHotUpdateMetrics,
  WatchCase,
  WatchSession,
} from '../types'
import type { ClassOutputEvidence } from './class/evidence'
import process from 'node:process'
import { replaceWxml } from '../../core/replace-wxml'
import { formatPath } from '../cli'
import {
  getMtime,
  readFileIfExists,
  writeFilePreserveEol,
} from '../text'
import { assertClassTokensInOutput, assertPreviousClassEvidenceRemoved } from './class/evidence'
import {
  collectPluginProcessMetrics,
  expandOutputFileEntries,
  readJoinedOutputFiles,
  waitForClassOutputBaseline,
  waitForCompileSettled,
  waitForOutputFilesUpdated,
} from './shared'

interface UserReportedOutputs {
  wxml: string
  js: string
  globalStyle: string
}

async function collectOutputMtimes(files: string[]) {
  const resolvedFiles = await expandOutputFileEntries(files)
  const entries = await Promise.all(
    resolvedFiles.map(async file => [file, await getMtime(file)] as const),
  )
  return new Map(entries)
}

async function loadOutputs(watchCase: WatchCase, globalStyleOutputs: string[]): Promise<UserReportedOutputs> {
  const [wxml, js, globalStyle] = await Promise.all([
    readFileIfExists(watchCase.outputWxml),
    readFileIfExists(watchCase.outputJs),
    readJoinedOutputFiles(globalStyleOutputs),
  ])
  return {
    wxml: wxml ?? '',
    js: js ?? '',
    globalStyle,
  }
}

export function assertUserReportedOutputs(
  watchCase: WatchCase,
  config: UserReportedHotUpdateConfig,
  phase: 'hot-update' | 'rollback',
  classTokens: string[],
  escapedClasses: string[],
  outputs: UserReportedOutputs,
  previousEvidence: ClassOutputEvidence[] = [],
) {
  const verifyClassLiteralIn = config.verifyClassLiteralIn ?? []
  const label = `[${watchCase.label}] user reported ${config.label} ${phase}`
  const evidence = assertClassTokensInOutput(outputs, classTokens, escapedClasses, [...new Set([...config.verifyEscapedIn, ...verifyClassLiteralIn])], label, true, (config.minRequiredGlobalStyleEscapedClasses ?? 1) > 0)
  assertPreviousClassEvidenceRemoved(outputs, previousEvidence, classTokens, label)

  const matchedGlobalEscapedClasses = escapedClasses.filter(escaped => outputs.globalStyle.includes(escaped))
  const minRequiredGlobalStyleEscapedClasses = config.minRequiredGlobalStyleEscapedClasses ?? 1
  if (matchedGlobalEscapedClasses.length < minRequiredGlobalStyleEscapedClasses) {
    throw new Error(
      `[${watchCase.label}] user reported ${config.label} ${phase} global style output has insufficient transformed classes: required=${minRequiredGlobalStyleEscapedClasses}, actual=${matchedGlobalEscapedClasses.length}, source=${formatPath(config.sourceFile)}`,
    )
  }

  return { matchedGlobalEscapedClasses, evidence }
}

function resolveReplacementDirection(sourceOriginal: string, config: UserReportedHotUpdateConfig) {
  if (sourceOriginal.includes(config.before)) {
    return {
      from: config.before,
      to: config.after,
      classTokens: config.afterClassTokens,
      rollbackClassTokens: config.beforeClassTokens,
    }
  }
  if (sourceOriginal.includes(config.after)) {
    return {
      from: config.after,
      to: config.before,
      classTokens: config.beforeClassTokens,
      rollbackClassTokens: config.afterClassTokens,
    }
  }
  throw new Error(
    `user reported hot-update anchor not found: ${config.label}, source=${formatPath(config.sourceFile)}`,
  )
}

export async function runUserReportedHotUpdate(
  watchCase: WatchCase,
  options: CliOptions,
  session: WatchSession,
  config: UserReportedHotUpdateConfig,
  sourceOriginal: string,
  globalStyleOutputs: string[],
): Promise<UserReportedHotUpdateMetrics> {
  await waitForClassOutputBaseline(watchCase, options, session, 'content', globalStyleOutputs)

  const {
    from,
    to,
    classTokens,
    rollbackClassTokens,
  } = resolveReplacementDirection(sourceOriginal, config)
  const escapedClasses = classTokens.map(token => replaceWxml(token))
  const rollbackEscapedClasses = rollbackClassTokens.map(token => replaceWxml(token))
  const baselineOutputs = await loadOutputs(watchCase, globalStyleOutputs)
  const baselineEvidence = assertClassTokensInOutput(baselineOutputs, rollbackClassTokens, rollbackEscapedClasses, [...new Set([...config.verifyEscapedIn, ...(config.verifyClassLiteralIn ?? [])])], `[${watchCase.label}] user reported ${config.label} baseline`, true, (config.minRequiredGlobalStyleEscapedClasses ?? 1) > 0)
  const sourcePath = config.sourceFile
  const outputFiles = [watchCase.outputWxml, watchCase.outputJs, ...globalStyleOutputs]
  let verifiedGlobalStyleEscapedClasses: string[] = []
  let hotUpdateEvidence: ClassOutputEvidence[] = []

  const sourceForHotUpdate = sourceOriginal.replace(from, to)
  if (sourceForHotUpdate === sourceOriginal) {
    throw new Error(`[${watchCase.label}] user reported ${config.label} produced no source change`)
  }

  const baselineOutputMtimes = await collectOutputMtimes(outputFiles)
  const hotUpdateStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} user-reported=${config.label} phase=hot-update dirty=${formatPath(sourcePath)} tokens=${classTokens.join(' | ')}\n`,
  )
  await writeFilePreserveEol(sourcePath, sourceForHotUpdate, sourceOriginal)
  const hotUpdateOutputMs = await waitForOutputFilesUpdated(
    watchCase,
    outputFiles,
    baselineOutputMtimes,
    options,
    session,
    hotUpdateStartedAt,
    async () => {
      const outputs = await loadOutputs(watchCase, globalStyleOutputs)
      const assertion = assertUserReportedOutputs(
        watchCase,
        config,
        'hot-update',
        classTokens,
        escapedClasses,
        outputs,
        baselineEvidence,
      )
      verifiedGlobalStyleEscapedClasses = assertion.matchedGlobalEscapedClasses
      hotUpdateEvidence = assertion.evidence
      return true
    },
    {
      label: `user-reported=${config.label} phase=hot-update source=${formatPath(sourcePath)}`,
    },
  )
  const hotUpdateEffectiveMs = hotUpdateOutputMs
  await waitForCompileSettled(watchCase, options, session, hotUpdateStartedAt)
  const hotUpdatePluginMetrics = collectPluginProcessMetrics(session, hotUpdateStartedAt)

  const updatedOutputMtimes = await collectOutputMtimes(outputFiles)
  const rollbackStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} user-reported=${config.label} phase=rollback dirty=${formatPath(sourcePath)} tokens=${rollbackClassTokens.join(' | ')}\n`,
  )
  await writeFilePreserveEol(sourcePath, sourceOriginal, sourceOriginal)
  const rollbackOutputMs = await waitForOutputFilesUpdated(
    watchCase,
    outputFiles,
    updatedOutputMtimes,
    options,
    session,
    rollbackStartedAt,
    async () => {
      const outputs = await loadOutputs(watchCase, globalStyleOutputs)
      assertUserReportedOutputs(
        watchCase,
        config,
        'rollback',
        rollbackClassTokens,
        rollbackEscapedClasses,
        outputs,
        hotUpdateEvidence,
      )
      return true
    },
    {
      label: `user-reported=${config.label} phase=rollback source=${formatPath(sourcePath)}`,
    },
  )
  const rollbackEffectiveMs = rollbackOutputMs
  await waitForCompileSettled(watchCase, options, session, rollbackStartedAt)
  const rollbackPluginMetrics = collectPluginProcessMetrics(session, rollbackStartedAt)

  const minRequiredGlobalStyleEscapedClasses = config.minRequiredGlobalStyleEscapedClasses ?? 1
  return {
    label: config.label,
    sourceFile: sourcePath,
    from,
    to,
    classTokens,
    escapedClasses,
    verifiedGlobalStyleEscapedClasses,
    minRequiredGlobalStyleEscapedClasses,
    hotUpdateOutputMs,
    hotUpdateEffectiveMs,
    hotUpdatePluginProcessMs: hotUpdatePluginMetrics.totalMs,
    hotUpdatePluginProcessSamples: hotUpdatePluginMetrics.samples as PluginProcessSample[],
    rollbackOutputMs,
    rollbackEffectiveMs,
    rollbackPluginProcessMs: rollbackPluginMetrics.totalMs,
    rollbackPluginProcessSamples: rollbackPluginMetrics.samples as PluginProcessSample[],
  }
}
