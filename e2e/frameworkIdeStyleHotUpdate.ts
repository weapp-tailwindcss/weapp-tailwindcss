import type { createWatchSession } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import type { CliOptions, WatchCase } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import type { ArtifactSnapshot, IdeWatchCase } from './frameworkIdeHotUpdateArtifacts'
import process from 'node:process'
import {
  createStyleMutationPayload,
  waitForCompileSettled,
  waitForOutputFilesUpdated,
} from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations'
import {
  findCssRuleBodies,
  findCssRuleBody,
  normalizeCssDeclaration,
  waitFor,
} from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { bindWatchSessionSignal } from './framework-ide/abort'
import { writeProbeSource } from './framework-ide/source-lifecycle'
import {
  assertNoUnsupportedMiniProgramCssImport,
  collectArtifactMtimes,
  countChangedArtifacts,
  hasAnyNeedle,
  readArtifacts,
  summarizeChangedArtifacts,
} from './frameworkIdeHotUpdateArtifacts'

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function getRollbackTimeoutMs(options: CliOptions) {
  return Math.min(options.timeoutMs, readNumberEnv('E2E_IDE_ROLLBACK_TIMEOUT_MS', 30_000))
}

export function assertStyleOutput(
  watchCase: Pick<WatchCase, 'label'>,
  content: string,
  payload: ReturnType<typeof createStyleMutationPayload>,
) {
  const applyRule = findCssRuleBody(content, payload.styleNeedle)
  if (!applyRule) {
    throw new Error(`[${watchCase.label}] IDE style HMR output is missing style rule ${payload.styleNeedle}`)
  }
  const normalizedApplyRule = normalizeCssDeclaration(applyRule)
  for (const expected of payload.expectedApplyDeclarations) {
    if (!normalizedApplyRule.includes(normalizeCssDeclaration(expected))) {
      throw new Error(`[${watchCase.label}] IDE style HMR @apply output is missing declaration ${expected}`)
    }
  }

  if (!payload.functionNeedle) {
    return
  }

  const functionRules = findCssRuleBodies(content, payload.functionNeedle)
  if (functionRules.length === 0) {
    throw new Error(`[${watchCase.label}] IDE style HMR output is missing Tailwind function rule ${payload.functionNeedle}`)
  }

  const normalizedFunctionRules = functionRules.map(normalizeCssDeclaration)
  for (const forbidden of payload.forbiddenFunctionFragments) {
    if (functionRules.some(rule => rule.includes(forbidden))) {
      throw new Error(`[${watchCase.label}] IDE style HMR did not resolve Tailwind function fragment ${forbidden}`)
    }
  }
  for (const expected of payload.expectedFunctionDeclarations) {
    if (!normalizedFunctionRules.some(rule => rule.includes(normalizeCssDeclaration(expected)))) {
      throw new Error(`[${watchCase.label}] IDE style HMR function output is missing declaration ${expected}`)
    }
  }
}

function resolveUpdatedStyleFiles(watchCase: WatchCase, baselineMtimes: Map<string, number>, artifacts: ArtifactSnapshot[]) {
  return [...new Set([
    ...watchCase.outputStyleCandidates,
    ...watchCase.globalStyleCandidates,
    ...artifacts.filter(item => item.kind === 'style').map(item => item.file),
  ])]
    .filter(file => file.includes('*') || baselineMtimes.has(file))
}

export async function runIdeStyleHotUpdate(
  options: CliOptions,
  watchCase: IdeWatchCase,
  session: ReturnType<typeof createWatchSession>,
  sourceOriginal: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  session = bindWatchSessionSignal(session, signal)
  const sourceFile = watchCase.styleMutation.sourceFile
  process.stdout.write(`[e2e:ide] ${watchCase.label} style HMR mutate ${sourceFile}\n`)
  const payload = createStyleMutationPayload(watchCase)
  const mutatedSource = watchCase.styleMutation.mutate(sourceOriginal, payload)
  const { artifacts: baselineArtifacts, mtimes: baselineMtimes } = await collectArtifactMtimes(watchCase)
  const mutationStartedAt = Date.now()

  await writeProbeSource(sourceFile, mutatedSource, sourceOriginal, signal)
  await waitForOutputFilesUpdated(
    watchCase,
    resolveUpdatedStyleFiles(watchCase, baselineMtimes, baselineArtifacts),
    baselineMtimes,
    options,
    session,
    mutationStartedAt,
    async () => hasAnyNeedle(await readArtifacts(watchCase), [payload.styleNeedle]),
  )

  let changedArtifacts: string[] = []
  await waitFor(
    async () => {
      const currentArtifacts = await readArtifacts(watchCase)
      const styleArtifacts = currentArtifacts.filter(item => item.kind === 'style' && item.content.includes(payload.styleNeedle))
      if (styleArtifacts.length === 0 || countChangedArtifacts(baselineArtifacts, currentArtifacts) === 0) {
        return false
      }
      for (const artifact of styleArtifacts) {
        assertStyleOutput(watchCase, artifact.content, payload)
      }
      assertNoUnsupportedMiniProgramCssImport(watchCase, currentArtifacts, 'IDE style HMR')
      changedArtifacts = summarizeChangedArtifacts(baselineArtifacts, currentArtifacts)
      return true
    },
    {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      message: `[${watchCase.label}] IDE style HMR output did not contain expanded @apply and theme() declarations`,
      onTick: session.ensureRunning,
      signal,
    },
    mutationStartedAt,
  )

  process.stdout.write(
    `[e2e:ide] ${watchCase.label} style HMR changed artifacts=${changedArtifacts.length}: ${changedArtifacts.join(', ')}\n`,
  )

  const rollbackStartedAt = Date.now()
  await writeProbeSource(sourceFile, sourceOriginal, sourceOriginal, signal)
  await waitForCompileSettled(watchCase, options, session, rollbackStartedAt)
  await waitFor(
    async () => !hasAnyNeedle(await readArtifacts(watchCase), [payload.styleNeedle]),
    {
      timeoutMs: getRollbackTimeoutMs(options),
      pollMs: options.pollMs,
      message: `[${watchCase.label}] IDE style HMR marker was not removed after rollback: ${payload.styleNeedle}`,
      onTick: session.ensureRunning,
      signal,
    },
    rollbackStartedAt,
  )
}
