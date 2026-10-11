import type { CliOptions, StyleMutationConfig, StyleMutationMetrics, WatchCase, WatchSession } from '../types'
import { promises as fs } from 'node:fs'
import process from 'node:process'
import { formatPath } from '../cli'
import { getOutputMtimeOnce, readOutputFileOnce } from '../outputs/read'
import {
  assertContains,
  findCssRuleBodies,
  normalizeCssDeclaration,
  waitFor,
  writeWatchedFilePreserveEol,
} from '../text'
import { assertNoUnsupportedMiniProgramCssImport, collectPluginProcessMetrics, createStyleMutationPayload, expandOutputFileEntries } from './shared'
import { captureStyleRollbackCandidates, waitForStyleRollback } from './style/rollback'

async function touchImporterFiles(files: string[]) {
  for (const file of files) {
    const now = new Date()
    await fs.utimes(file, now, now)
  }
}

export async function runStyleMutation(
  watchCase: WatchCase,
  options: CliOptions,
  session: WatchSession,
  styleMutation: StyleMutationConfig,
  sourceOriginal: string,
  outputStyleCandidates: string[],
): Promise<StyleMutationMetrics> {
  const payload = createStyleMutationPayload(watchCase)
  const sourcePath = styleMutation.sourceFile
  const mutatedSource = styleMutation.mutate(sourceOriginal, payload)
  const verifyOutputCandidates = styleMutation.verifyOutputCandidates ?? outputStyleCandidates
  const validateApply = styleMutation.validateApply !== false
  const validateFunction = styleMutation.validateFunction !== false
  const outputStyleNeedle = styleMutation.outputStyleNeedle?.(payload) ?? payload.styleNeedle
  const outputNeedles = styleMutation.outputNeedles?.(payload) ?? payload.outputNeedles
  const rollbackNeedles = styleMutation.rollbackNeedles?.(payload) ?? payload.rollbackNeedles
  const importerFiles = styleMutation.importerFiles ?? []
  const hasExpectedStyleRule = (content: string) => findCssRuleBodies(content, outputStyleNeedle).length > 0
  const hasExpectedOutput = (content: string) =>
    outputNeedles.every(needle => content.includes(needle)) && hasExpectedStyleRule(content)

  if (mutatedSource === sourceOriginal) {
    throw new Error(`[${watchCase.label}] style mutation produced no source change`)
  }
  if (outputNeedles.length === 0) {
    throw new Error(`[${watchCase.label}] style mutation requires at least one output needle`)
  }
  if (rollbackNeedles.length === 0) {
    throw new Error(`[${watchCase.label}] style mutation requires at least one rollback needle`)
  }
  const requiredRollbackCandidates = await captureStyleRollbackCandidates(verifyOutputCandidates, session)
  const ensureActive = () => {
    session.signal?.throwIfAborted()
    session.ensureRunning()
  }

  const collectOutputCandidateMtimes = async () => {
    const resolvedCandidates = await expandOutputFileEntries(verifyOutputCandidates, { presenceOnly: true, ensureActive })
    const entries = await Promise.all(resolvedCandidates.map(async candidate => [candidate, await getOutputMtimeOnce(candidate, ensureActive)] as const))
    return new Map(entries)
  }

  const waitForOutputCandidateMtimeChanged = async (
    baselineMtimes: Map<string, number>,
    startedAt: number,
    phase: 'hot-update' | 'rollback',
    acceptWhen?: (candidate: string, ensurePhaseActive: () => void) => Promise<boolean>,
  ) => {
    const deadlineAt = startedAt + options.timeoutMs
    const message = `[${watchCase.label}] style output candidates were not updated during ${phase}: ${verifyOutputCandidates.map(formatPath).join(', ')}`
    const ensurePhaseActive = () => {
      ensureActive()
      if (Date.now() > deadlineAt) {
        throw new Error(message)
      }
    }
    return waitFor(
      async () => {
        const resolvedCandidates = await expandOutputFileEntries(verifyOutputCandidates, { presenceOnly: true, ensureActive: ensurePhaseActive })
        for (const candidate of resolvedCandidates) {
          const baselineMtime = baselineMtimes.get(candidate) ?? 0
          const currentMtime = await getOutputMtimeOnce(candidate, ensurePhaseActive)
          if (currentMtime > baselineMtime) {
            return true
          }
          if (acceptWhen && await acceptWhen(candidate, ensurePhaseActive)) {
            return true
          }
        }
        return false
      },
      {
        timeoutMs: options.timeoutMs,
        pollMs: options.pollMs,
        message,
        onTick: ensurePhaseActive,
        signal: session.signal,
        deadlineAt,
      },
      startedAt,
    )
  }

  const baselineOutputCandidateMtimes = await collectOutputCandidateMtimes()
  const hotUpdateStartedAt = Date.now()
  await writeWatchedFilePreserveEol(sourcePath, mutatedSource, sourceOriginal)
  await touchImporterFiles(importerFiles)
  const hotUpdateOutputMs = await waitForOutputCandidateMtimeChanged(
    baselineOutputCandidateMtimes,
    hotUpdateStartedAt,
    'hot-update',
    async (candidate, ensurePhaseActive) => {
      const content = await readOutputFileOnce(candidate, { signal: session.signal, ensureActive: ensurePhaseActive })
      return content != null && hasExpectedOutput(content)
    },
  )
  let resolvedOutputStyle: string | undefined
  const hotUpdateMessage = `[${watchCase.label}] style output candidates are missing needles ${outputNeedles.join(', ')}: ${verifyOutputCandidates.map(formatPath).join(', ')}`
  const ensureHotUpdateActive = () => {
    ensureActive()
    if (Date.now() > hotUpdateStartedAt + options.timeoutMs) {
      throw new Error(hotUpdateMessage)
    }
  }
  const hotUpdateEffectiveMs = await waitFor(
    async () => {
      const resolvedCandidates = await expandOutputFileEntries(verifyOutputCandidates, { presenceOnly: true, ensureActive: ensureHotUpdateActive })
      for (const candidate of resolvedCandidates) {
        const content = await readOutputFileOnce(candidate, { signal: session.signal, ensureActive: ensureHotUpdateActive })
        if (content != null && hasExpectedOutput(content)) {
          resolvedOutputStyle = candidate
          return true
        }
      }
      return false
    },
    {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      message: hotUpdateMessage,
      onTick: ensureHotUpdateActive,
      signal: session.signal,
      deadlineAt: hotUpdateStartedAt + options.timeoutMs,
    },
    hotUpdateStartedAt,
  )

  if (!resolvedOutputStyle) {
    throw new Error(`[${watchCase.label}] failed to resolve style output after mutation`)
  }
  const hotUpdatePluginMetrics = collectPluginProcessMetrics(session, hotUpdateStartedAt)

  const updatedStyle = await readOutputFileOnce(resolvedOutputStyle, { signal: session.signal, ensureActive: ensureHotUpdateActive })
  if (updatedStyle == null) {
    throw new Error(`[${watchCase.label}] updated style output is missing or unreadable: ${formatPath(resolvedOutputStyle)}`)
  }
  assertNoUnsupportedMiniProgramCssImport(watchCase, updatedStyle, 'mutation=style phase=hot-update', formatPath(resolvedOutputStyle))
  for (const needle of outputNeedles) {
    assertContains(updatedStyle, needle, `[${watchCase.label}] updated style output (${formatPath(resolvedOutputStyle)})`)
  }
  if (validateApply && payload.expectedApplyDeclarations.length > 0) {
    const updatedRuleBodies = findCssRuleBodies(updatedStyle, outputStyleNeedle)
    if (updatedRuleBodies.length === 0) {
      throw new Error(`[${watchCase.label}] failed to locate style rule body for ${outputStyleNeedle}`)
    }
    for (const expectedDeclaration of payload.expectedApplyDeclarations) {
      const normalizedExpectedDeclaration = normalizeCssDeclaration(expectedDeclaration)
      if (!updatedRuleBodies.some(ruleBody => normalizeCssDeclaration(ruleBody).includes(normalizedExpectedDeclaration))) {
        throw new Error(
          `[${watchCase.label}] style @apply declaration missing: ${expectedDeclaration}, rule=${outputStyleNeedle}`,
        )
      }
    }
    for (const expectedDeclarationGroup of payload.expectedApplyDeclarationGroups) {
      if (!expectedDeclarationGroup.some((expectedDeclaration) => {
        const normalizedExpectedDeclaration = normalizeCssDeclaration(expectedDeclaration)
        return updatedRuleBodies.some(ruleBody => normalizeCssDeclaration(ruleBody).includes(normalizedExpectedDeclaration))
      })) {
        throw new Error(
          `[${watchCase.label}] style @apply declaration group missing: ${expectedDeclarationGroup.join(' or ')}, rule=${outputStyleNeedle}`,
        )
      }
    }
  }
  if (validateFunction && payload.functionNeedle && payload.expectedFunctionDeclarations.length > 0) {
    const updatedFunctionRuleBodies = findCssRuleBodies(updatedStyle, payload.functionNeedle)
    if (updatedFunctionRuleBodies.length === 0) {
      throw new Error(`[${watchCase.label}] failed to locate Tailwind function rule body for ${payload.functionNeedle}`)
    }
    for (const forbiddenFragment of payload.forbiddenFunctionFragments) {
      if (updatedFunctionRuleBodies.every(ruleBody => ruleBody.includes(forbiddenFragment))) {
        throw new Error(
          `[${watchCase.label}] style Tailwind function was not resolved: ${forbiddenFragment}, rule=${payload.functionNeedle}`,
        )
      }
    }
    for (const expectedDeclaration of payload.expectedFunctionDeclarations) {
      const normalizedExpectedDeclaration = normalizeCssDeclaration(expectedDeclaration)
      if (!updatedFunctionRuleBodies.some(ruleBody => normalizeCssDeclaration(ruleBody).includes(normalizedExpectedDeclaration))) {
        throw new Error(
          `[${watchCase.label}] style Tailwind function declaration missing: ${expectedDeclaration}, rule=${payload.functionNeedle}`,
        )
      }
    }
  }

  const outputCandidateMtimesAfterHotUpdate = await collectOutputCandidateMtimes()
  const rollbackStartedAt = Date.now()
  await writeWatchedFilePreserveEol(sourcePath, sourceOriginal, sourceOriginal)
  await touchImporterFiles(importerFiles)
  const rollbackOutputMs = await waitForOutputCandidateMtimeChanged(
    outputCandidateMtimesAfterHotUpdate,
    rollbackStartedAt,
    'rollback',
    async (candidate, ensurePhaseActive) => {
      const content = await readOutputFileOnce(candidate, { signal: session.signal, ensureActive: ensurePhaseActive })
      return content != null && rollbackNeedles.every(needle => !content.includes(needle))
    },
  )
  const rollbackEffectiveMs = await waitForStyleRollback(
    watchCase,
    options,
    session,
    rollbackStartedAt,
    verifyOutputCandidates,
    requiredRollbackCandidates,
    rollbackNeedles,
  )
  const rollbackPluginMetrics = collectPluginProcessMetrics(session, rollbackStartedAt)

  process.stdout.write(
    `[watch-hmr] ${watchCase.label} mutation=style passed (hotUpdate=${hotUpdateEffectiveMs}ms, rollback=${rollbackEffectiveMs}ms)\n`,
  )

  return {
    mutationKind: 'style',
    sourceFile: sourcePath,
    outputStyle: resolvedOutputStyle,
    marker: payload.marker,
    styleNeedle: payload.styleNeedle,
    outputNeedles,
    rollbackNeedles,
    applyUtilities: payload.applyUtilities,
    expectedApplyDeclarations: payload.expectedApplyDeclarations,
    expectedApplyDeclarationGroups: payload.expectedApplyDeclarationGroups,
    ...(payload.functionNeedle ? { functionNeedle: payload.functionNeedle } : {}),
    functionDeclarations: payload.functionDeclarations,
    expectedFunctionDeclarations: payload.expectedFunctionDeclarations,
    forbiddenFunctionFragments: payload.forbiddenFunctionFragments,
    ...(payload.referenceDirective ? { referenceDirective: payload.referenceDirective } : {}),
    hotUpdateOutputMs,
    hotUpdateEffectiveMs,
    hotUpdatePluginProcessMs: hotUpdatePluginMetrics.totalMs,
    hotUpdatePluginProcessSamples: hotUpdatePluginMetrics.samples,
    rollbackOutputMs,
    rollbackEffectiveMs,
    rollbackPluginProcessMs: rollbackPluginMetrics.totalMs,
    rollbackPluginProcessSamples: rollbackPluginMetrics.samples,
    rollbackNeedleCleared: true,
  }
}
