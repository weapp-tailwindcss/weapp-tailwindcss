import type {
  ClassMutationConfig,
  ClassMutationKind,
  CliOptions,
  MainStyleHotUpdateMetrics,
  PluginProcessSample,
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
  waitForOutputFilesUpdatedWithDiagnostics,
} from './shared'

const FROM_CLASS_TOKEN = 'text-[102.43rpx]'
const TO_CLASS_TOKEN = 'text-[103.43rpx]'
const CLASS_LITERAL = `${FROM_CLASS_TOKEN} font-bold`
const LABEL = `${FROM_CLASS_TOKEN} to ${TO_CLASS_TOKEN}`

interface MainStyleOutputs {
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

async function loadOutputs(watchCase: WatchCase, globalStyleOutputs: string[]): Promise<MainStyleOutputs> {
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

export function assertMainStyleOutputs(
  watchCase: WatchCase,
  mutation: ClassMutationConfig,
  phase: 'setup' | 'hot-update' | 'rollback',
  classToken: string,
  escapedClass: string,
  outputs: MainStyleOutputs,
) {
  const evidence = assertClassTokensInOutput(outputs, [classToken], [escapedClass], mutation.verifyEscapedIn, `[${watchCase.label}] main-style ${phase}`)

  if (!outputs.globalStyle.includes(escapedClass)) {
    throw new Error(
      `[${watchCase.label}] main-style ${phase} global style output is missing transformed class: ${escapedClass}`,
    )
  }

  return { escapedClasses: [escapedClass], evidence }
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function runMainStyleHotUpdate(
  watchCase: WatchCase,
  options: CliOptions,
  session: WatchSession,
  mutationKind: ClassMutationKind,
  mutation: ClassMutationConfig,
  sourceOriginal: string,
  globalStyleOutputs: string[],
): Promise<MainStyleHotUpdateMetrics> {
  const baselineOutputs = await waitForClassOutputBaseline(watchCase, options, session, 'template', globalStyleOutputs)
  const previousEvidence: ClassOutputEvidence[] = []

  const marker = `tw-watch-main-style-${watchCase.name}`
  const fromEscapedClass = replaceWxml(FROM_CLASS_TOKEN)
  const toEscapedClass = replaceWxml(TO_CLASS_TOKEN)
  const sourcePath = mutation.sourceFile
  const setupSource = mutation.mutate(sourceOriginal, {
    marker,
    classLiteral: CLASS_LITERAL,
    classVariableName: '__twMainStyleClass',
  })
  if (setupSource === sourceOriginal) {
    throw new Error(`[${watchCase.label}] main-style setup produced no source change`)
  }

  const hotUpdateSource = setupSource.replaceAll(FROM_CLASS_TOKEN, TO_CLASS_TOKEN)
  if (hotUpdateSource === setupSource) {
    throw new Error(`[${watchCase.label}] main-style hot update produced no source change`)
  }

  const outputFiles = [watchCase.outputWxml, watchCase.outputJs, ...globalStyleOutputs]
  const setupBaselineMtimes = await collectOutputMtimes(outputFiles)
  const setupStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} main-style=${LABEL} carrier=${mutationKind} phase=setup dirty=${formatPath(sourcePath)} token=${FROM_CLASS_TOKEN}\n`,
  )
  await writeFilePreserveEol(sourcePath, setupSource, sourceOriginal)
  try {
    await waitForOutputFilesUpdatedWithDiagnostics(
      watchCase,
      outputFiles,
      setupBaselineMtimes,
      options,
      session,
      setupStartedAt,
      async () => {
        const outputs = await loadOutputs(watchCase, globalStyleOutputs)
        const assertion = assertMainStyleOutputs(watchCase, mutation, 'setup', FROM_CLASS_TOKEN, fromEscapedClass, outputs)
        previousEvidence.push(...assertion.evidence)
        return true
      },
      {
        label: `main-style phase=setup source=${formatPath(sourcePath)}`,
      },
    )
    await waitForCompileSettled(watchCase, options, session, setupStartedAt)

    let verifiedGlobalStyleEscapedClasses: string[] = []
    let rollbackVerifiedGlobalStyleRemovedClasses: string[] = []
    const hotUpdateBaselineMtimes = await collectOutputMtimes(outputFiles)
    const hotUpdateStartedAt = Date.now()
    process.stdout.write(
      `[watch-hmr] ${watchCase.label} main-style=${LABEL} carrier=${mutationKind} phase=hot-update dirty=${formatPath(sourcePath)} token=${TO_CLASS_TOKEN}\n`,
    )
    await writeFilePreserveEol(sourcePath, hotUpdateSource, sourceOriginal)
    let hotUpdateOutputDiagnostics
    try {
      hotUpdateOutputDiagnostics = await waitForOutputFilesUpdatedWithDiagnostics(
        watchCase,
        outputFiles,
        hotUpdateBaselineMtimes,
        options,
        session,
        hotUpdateStartedAt,
        async () => {
          const outputs = await loadOutputs(watchCase, globalStyleOutputs)
          const assertion = assertMainStyleOutputs(watchCase, mutation, 'hot-update', TO_CLASS_TOKEN, toEscapedClass, outputs)
          assertPreviousClassEvidenceRemoved(outputs, previousEvidence, [TO_CLASS_TOKEN], `[${watchCase.label}] main-style hot-update`, baselineOutputs)
          verifiedGlobalStyleEscapedClasses = assertion.escapedClasses
          previousEvidence.push(...assertion.evidence)
          return true
        },
        {
          label: `main-style phase=hot-update source=${formatPath(sourcePath)}`,
        },
      )
    }
    catch (error) {
      throw new Error(`[${watchCase.label}] main-style phase=hot-update failed: ${asErrorMessage(error)}`)
    }
    const hotUpdateOutputMs = hotUpdateOutputDiagnostics.elapsedMs
    const hotUpdateEffectiveMs = hotUpdateOutputMs
    await waitForCompileSettled(watchCase, options, session, hotUpdateStartedAt)
    const hotUpdatePluginMetrics = collectPluginProcessMetrics(session, hotUpdateStartedAt)

    const rollbackBaselineMtimes = await collectOutputMtimes(outputFiles)
    const rollbackStartedAt = Date.now()
    const rollbackMarker = `tw-watch-main-style-rollback-${watchCase.name}-${Date.now()}`
    const rollbackSource = mutation.mutate(sourceOriginal, {
      marker: rollbackMarker,
      classLiteral: '',
      classVariableName: '__twMainStyleClass',
    })
    process.stdout.write(
      `[watch-hmr] ${watchCase.label} main-style=${LABEL} carrier=${mutationKind} phase=rollback dirty=${formatPath(sourcePath)} token=${FROM_CLASS_TOKEN}\n`,
    )
    await writeFilePreserveEol(sourcePath, rollbackSource, sourceOriginal)
    let rollbackOutputDiagnostics
    try {
      rollbackOutputDiagnostics = await waitForOutputFilesUpdatedWithDiagnostics(
        watchCase,
        outputFiles,
        rollbackBaselineMtimes,
        options,
        session,
        rollbackStartedAt,
        async () => {
          const outputs = await loadOutputs(watchCase, globalStyleOutputs)
          assertPreviousClassEvidenceRemoved(outputs, previousEvidence, [], `[${watchCase.label}] main-style rollback`, baselineOutputs)
          const sourceOriginalHasFromClass = sourceOriginal.includes(FROM_CLASS_TOKEN)
          const removedEscapedClasses = sourceOriginalHasFromClass
            ? [toEscapedClass]
            : [fromEscapedClass, toEscapedClass]
          const rollbackMarkerPresent = rollbackSource === sourceOriginal
            || outputs.wxml.includes(rollbackMarker)
            || outputs.js.includes(rollbackMarker)
          if (!rollbackMarkerPresent) {
            return false
          }
          const removedFromCodeOutputs = !outputs.wxml.includes(marker) && !outputs.js.includes(marker)
          if (removedFromCodeOutputs) {
            rollbackVerifiedGlobalStyleRemovedClasses = removedEscapedClasses.filter(escapedClass => !outputs.globalStyle.includes(escapedClass))
            return true
          }
          return false
        },
        {
          label: `main-style phase=rollback source=${formatPath(sourcePath)}`,
        },
      )
    }
    catch (error) {
      throw new Error(`[${watchCase.label}] main-style phase=rollback failed: ${asErrorMessage(error)}`)
    }
    const rollbackOutputMs = rollbackOutputDiagnostics.elapsedMs
    const rollbackEffectiveMs = rollbackOutputMs
    await waitForCompileSettled(watchCase, options, session, rollbackStartedAt)
    const rollbackPluginMetrics = collectPluginProcessMetrics(session, rollbackStartedAt)

    return {
      label: LABEL,
      mutationKind,
      sourceFile: sourcePath,
      verifyEscapedIn: mutation.verifyEscapedIn,
      verifyClassLiteralIn: mutation.verifyClassLiteralIn ?? [],
      fromClassToken: FROM_CLASS_TOKEN,
      toClassToken: TO_CLASS_TOKEN,
      fromEscapedClass,
      toEscapedClass,
      verifiedGlobalStyleEscapedClasses,
      minRequiredGlobalStyleEscapedClasses: 1,
      rollbackVerifiedGlobalStyleRemovedClasses,
      hotUpdateOutputMs,
      hotUpdateEffectiveMs,
      hotUpdateOutputDiagnostics,
      hotUpdatePluginProcessMs: hotUpdatePluginMetrics.totalMs,
      hotUpdatePluginProcessSamples: hotUpdatePluginMetrics.samples as PluginProcessSample[],
      rollbackOutputMs,
      rollbackEffectiveMs,
      rollbackOutputDiagnostics,
      rollbackPluginProcessMs: rollbackPluginMetrics.totalMs,
      rollbackPluginProcessSamples: rollbackPluginMetrics.samples as PluginProcessSample[],
    }
  }
  catch (error) {
    const message = asErrorMessage(error)
    if (message.includes('main-style phase=')) {
      throw error
    }
    throw new Error(`[${watchCase.label}] main-style phase=setup failed: ${asErrorMessage(error)}`)
  }
  finally {
    if ((await readFileIfExists(sourcePath)) !== sourceOriginal) {
      await writeFilePreserveEol(sourcePath, sourceOriginal, sourceOriginal)
    }
  }
}
