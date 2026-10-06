import type {
  AddedClassHmrMetrics,
  ClassMutationConfig,
  CliOptions,
  MutationRoundConfig,
  OutputMtime,
  WatchCase,
  WatchSession,
} from '../../types'
import type { ClassOutputEvidence } from './evidence'
import process from 'node:process'
import { replaceWxml } from '../../../core/replace-wxml'
import {
  getMtime,
  readFileIfExists,
  waitFor,
  writeFilePreserveEol,
} from '../../text'
import {
  collectPluginProcessMetrics,
  createClassMutationScenario,
  readJoinedOutputFiles,
  waitForClassOutputBaseline,
  waitForCompileSettled,
  waitForMarkerState,
  waitForOutputFilesUpdated,
  waitForOutputsUpdated,
} from '../shared'
import { buildAddedTailwindClassTokens } from '../tokens'
import { assertClassTokensInOutput, assertPreviousClassEvidenceRemoved } from './evidence'

interface RunAddedClassMutationOptions {
  watchCase: WatchCase
  options: CliOptions
  session: WatchSession
  mutationKind: 'template' | 'script'
  mutation: ClassMutationConfig
  sourceOriginal: string
  sourcePath: string
  classVariableName: string
  globalStyleOutputs: string[]
  minRequiredGlobalStyleEscapedClasses: number
  roundConfig: MutationRoundConfig
  baselineMtime: OutputMtime
  verifyClassLiteralIn: Array<'wxml' | 'js'>
}

interface OutputSnapshot { wxml: string, js: string, globalStyle: string }

async function readOutputs(watchCase: WatchCase, globalStyleOutputs: string[]): Promise<OutputSnapshot> {
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

export function assertClassOutputs(
  outputs: OutputSnapshot,
  watchCase: WatchCase,
  mutationKind: 'template' | 'script',
  mutation: ClassMutationConfig,
  verifyClassLiteralIn: Array<'wxml' | 'js'>,
  marker: string,
  classTokens: string[],
  escapedClasses: string[],
  minRequiredEscapedClasses: number,
) {
  if (!outputs.wxml.includes(marker) && !outputs.js.includes(marker)) {
    throw new Error(`[${watchCase.label}] added-class ${mutationKind} marker missing: ${marker}`)
  }

  const label = `[${watchCase.label}] added-class ${mutationKind}`
  const evidence = assertClassTokensInOutput(outputs, classTokens, escapedClasses, mutation.verifyEscapedIn, label, mutation.verifyAllEscapedClasses !== false, minRequiredEscapedClasses > 0, mutation.expectedRemovedCssUtilities)
  evidence.push(...assertClassTokensInOutput(outputs, classTokens, escapedClasses, verifyClassLiteralIn, `${label} literal`, mutation.verifyAllClassLiterals !== false, minRequiredEscapedClasses > 0, mutation.expectedRemovedCssUtilities))

  const verifiedEscapedClasses = escapedClasses.filter(escaped => outputs.globalStyle.includes(escaped))
  if (verifiedEscapedClasses.length < minRequiredEscapedClasses) {
    throw new Error(
      `[${watchCase.label}] added-class ${mutationKind} global style has insufficient transformed classes: required=${minRequiredEscapedClasses}, actual=${verifiedEscapedClasses.length}`,
    )
  }

  return { verifiedEscapedClasses, evidence }
}

function buildFreshAddedClassTokens(
  baselineWxml: string,
  baselineJs: string,
  baselineGlobalStyle: string,
  existingEscapedClasses: string[],
) {
  const maxAttempts = 100
  const existingEscaped = new Set(existingEscapedClasses)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const seed = `${attempt.toString().padStart(2, '0')}${Date.now().toString().slice(-6)}`
    const addedClassTokens = buildAddedTailwindClassTokens(seed)
    const addedEscapedClasses = addedClassTokens.map(token => replaceWxml(token))
    const freshAddedEscapedClasses = addedEscapedClasses.filter((escaped) => {
      return !existingEscaped.has(escaped)
        && !baselineWxml.includes(escaped)
        && !baselineJs.includes(escaped)
        && !baselineGlobalStyle.includes(escaped)
    })

    if (freshAddedEscapedClasses.length >= 3) {
      return {
        addedClassTokens,
        addedEscapedClasses,
      }
    }
  }

  throw new Error('failed to generate fresh added Tailwind classes for HMR')
}

export async function runAddedClassMutation(
  options: RunAddedClassMutationOptions,
): Promise<{ baselineMtime: OutputMtime, addedClassHmr: AddedClassHmrMetrics }> {
  const {
    watchCase,
    options: cliOptions,
    session,
    mutationKind,
    mutation,
    sourceOriginal,
    sourcePath,
    classVariableName,
    globalStyleOutputs,
    minRequiredGlobalStyleEscapedClasses,
    roundConfig,
    baselineMtime,
    verifyClassLiteralIn,
  } = options

  const {
    wxml: baselineWxml,
    js: baselineJs,
    globalStyle: baselineGlobalStyle,
  } = await waitForClassOutputBaseline(
    watchCase,
    cliOptions,
    session,
    mutationKind,
    globalStyleOutputs,
  )

  const baseScenario = createClassMutationScenario(
    watchCase,
    mutationKind,
    mutation,
    sourceOriginal,
    baselineWxml,
    baselineJs,
    baselineGlobalStyle,
    classVariableName,
    roundConfig,
  )
  const addedClasses = buildFreshAddedClassTokens(
    baselineWxml,
    baselineJs,
    baselineGlobalStyle,
    baseScenario.escapedClasses,
  )
  const addedClassLiteral = addedClasses.addedClassTokens.join(' ')
  const classLiteralAfter = `${baseScenario.classLiteral} ${addedClassLiteral}`
  const markerAfter = `${baseScenario.marker}-added`
  const sourceAfterAdd = mutation.mutate(sourceOriginal, {
    marker: markerAfter,
    classLiteral: classLiteralAfter,
    classVariableName,
  })

  if (sourceAfterAdd === sourceOriginal || sourceAfterAdd === baseScenario.mutatedSource) {
    throw new Error(`[${watchCase.label}] failed to build ${mutationKind} added-class source`)
  }

  const setupStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=${mutationKind} added-class phase=setup dirty=${sourcePath}\n`,
  )
  await writeFilePreserveEol(sourcePath, baseScenario.mutatedSource, sourceOriginal)
  await waitForOutputsUpdated(
    watchCase,
    baselineMtime,
    cliOptions,
    session,
    setupStartedAt,
    async () => {
      const outputs = await readOutputs(watchCase, globalStyleOutputs)
      return outputs.wxml.includes(baseScenario.marker) || outputs.js.includes(baseScenario.marker)
    },
  )
  await waitForMarkerState(
    watchCase,
    baseScenario.marker,
    'present',
    cliOptions,
    session,
    setupStartedAt,
  )
  await waitForCompileSettled(watchCase, cliOptions, session, setupStartedAt)

  const baselineBeforeAdd = {
    wxml: await getMtime(watchCase.outputWxml),
    js: await getMtime(watchCase.outputJs),
  }
  const minRequiredEscapedClasses = minRequiredGlobalStyleEscapedClasses === 0
    ? 0
    : Math.max(1, Math.min(minRequiredGlobalStyleEscapedClasses, addedClasses.addedEscapedClasses.length))
  let verifiedAddedEscapedClasses: string[] = []
  let addedEvidence: ClassOutputEvidence[] = []

  const hotUpdateStartedAt = Date.now()
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=${mutationKind} added-class phase=add dirty=${sourcePath}\n`,
  )
  await writeFilePreserveEol(sourcePath, sourceAfterAdd, sourceOriginal)
  let lastAssertError: unknown
  const hotUpdateOutputMs = await waitForOutputsUpdated(
    watchCase,
    baselineBeforeAdd,
    cliOptions,
    session,
    hotUpdateStartedAt,
    async () => {
      const outputs = await readOutputs(watchCase, globalStyleOutputs)
      try {
        assertClassOutputs(
          outputs,
          watchCase,
          mutationKind,
          mutation,
          verifyClassLiteralIn,
          markerAfter,
          addedClasses.addedClassTokens,
          addedClasses.addedEscapedClasses,
          minRequiredEscapedClasses,
        )
        return true
      }
      catch (error) {
        lastAssertError = error
        return false
      }
    },
  )
  let hotUpdateEffectiveMs = 0
  try {
    hotUpdateEffectiveMs = await waitFor(
      async () => {
        const outputs = await readOutputs(watchCase, globalStyleOutputs)
        try {
          const assertion = assertClassOutputs(
            outputs,
            watchCase,
            mutationKind,
            mutation,
            verifyClassLiteralIn,
            markerAfter,
            addedClasses.addedClassTokens,
            addedClasses.addedEscapedClasses,
            minRequiredEscapedClasses,
          )
          verifiedAddedEscapedClasses = assertion.verifiedEscapedClasses
          addedEvidence = assertion.evidence
          return true
        }
        catch (error) {
          lastAssertError = error
          return false
        }
      },
      {
        timeoutMs: cliOptions.timeoutMs,
        pollMs: cliOptions.pollMs,
        message: `[${watchCase.label}] ${mutationKind} added Tailwind classes were not propagated in time`,
        onTick: session.ensureRunning,
      },
      hotUpdateStartedAt,
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const assertMessage = lastAssertError instanceof Error ? lastAssertError.message : String(lastAssertError)
    throw new Error(`${message}: ${assertMessage}`)
  }

  const mtimeAfterAdd = {
    wxml: await getMtime(watchCase.outputWxml),
    js: await getMtime(watchCase.outputJs),
  }
  await waitForCompileSettled(watchCase, cliOptions, session, hotUpdateStartedAt)
  const hotUpdatePluginMetrics = collectPluginProcessMetrics(session, hotUpdateStartedAt)

  const rollbackStartedAt = Date.now()
  const rollbackMarker = `tw-watch-added-class-rollback-${watchCase.name}-${mutationKind}-${Date.now()}`
  const sourceAfterRollback = mutation.mutate(sourceOriginal, {
    marker: rollbackMarker,
    classLiteral: baseScenario.classLiteral,
    classVariableName,
  })
  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=${mutationKind} added-class phase=delete dirty=${sourcePath}\n`,
  )
  await writeFilePreserveEol(sourcePath, sourceAfterRollback, sourceOriginal)
  const rollbackOutputMs = await waitForOutputFilesUpdated(
    watchCase,
    [watchCase.outputWxml, watchCase.outputJs],
    new Map([[watchCase.outputWxml, mtimeAfterAdd.wxml], [watchCase.outputJs, mtimeAfterAdd.js]]),
    cliOptions,
    session,
    rollbackStartedAt,
    async () => {
      const outputs = await readOutputs(watchCase, globalStyleOutputs)
      assertPreviousClassEvidenceRemoved(outputs, addedEvidence, baseScenario.classTokens, `[${watchCase.label}] added-class rollback`, { wxml: baselineWxml, js: baselineJs, globalStyle: baselineGlobalStyle })
      const rollbackMarkerPresent = sourceAfterRollback === sourceOriginal
        || outputs.wxml.includes(rollbackMarker)
        || outputs.js.includes(rollbackMarker)
      return rollbackMarkerPresent
        && !outputs.wxml.includes(markerAfter)
        && !outputs.js.includes(markerAfter)
    },
  )
  const rollbackEffectiveMs = rollbackOutputMs
  await waitForCompileSettled(watchCase, cliOptions, session, rollbackStartedAt)
  const rollbackPluginMetrics = collectPluginProcessMetrics(session, rollbackStartedAt)

  return {
    baselineMtime: {
      wxml: await getMtime(watchCase.outputWxml),
      js: await getMtime(watchCase.outputJs),
    },
    addedClassHmr: {
      markerBefore: baseScenario.marker,
      markerAfter,
      classLiteralBefore: baseScenario.classLiteral,
      classLiteralAfter,
      addedClassLiteral,
      addedClassTokens: addedClasses.addedClassTokens,
      addedEscapedClasses: addedClasses.addedEscapedClasses,
      verifiedAddedEscapedClasses,
      minRequiredEscapedClasses,
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
