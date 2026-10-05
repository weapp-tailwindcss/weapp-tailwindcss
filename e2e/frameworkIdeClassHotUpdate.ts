import type { createWatchSession } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import type { CliOptions, WatchCase } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import type { IdeWatchCase } from './frameworkIdeHotUpdateArtifacts'
import process from 'node:process'
import { buildHexScriptRoundConfigs } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/round-configs'
import {
  createClassMutationScenario,
  waitForCompileSettled,
  waitForMarkerState,
  waitForOutputFilesUpdated,
} from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations'
import { waitFor } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { awaitWithAbort, bindWatchSessionSignal } from './framework-ide/abort'
import { writeProbeSource } from './framework-ide/source-lifecycle'
import {
  assertNoUnsupportedMiniProgramCssImport,
  collectArtifactMtimes,
  countChangedArtifacts,
  hasAnyNeedle,
  joinArtifactContent,
  readArtifacts,
  summarizeChangedArtifacts,
} from './frameworkIdeHotUpdateArtifacts'
import {
  getDevToolsBestEffortVisibleTimeoutMs,
  getDevToolsVisibleTimeoutMs,
  readCurrentPageLiveContent,
} from './frameworkIdeLivePage'
import { readFreshDevToolsPageContent, withDevToolsRelaunchTimeout } from './frameworkIdeReopen'

const IDE_LIVE_PAGE_VISIBILITY_RELAXED_CASES = new Set<WatchCase['name']>([
  'taro-webpack-react-tailwindcss-v4',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4',
])

function resolveRoundConfig(watchCase: WatchCase) {
  const roundConfigs = watchCase.templateMutation.roundConfigs ?? buildHexScriptRoundConfigs()
  return roundConfigs.find(item => item.name === 'complex-corpus')
    ?? roundConfigs.find(item => item.name === 'baseline-arbitrary')
    ?? roundConfigs[0]!
}

function resolveUpdatedArtifactFiles(files: string[], baselineMtimes: Map<string, number>) {
  return files.filter(file => file.includes('*') || baselineMtimes.has(file))
}

function shouldVerifyLivePageVisibility(watchCase: WatchCase) {
  return !watchCase.outputWxml.includes('/custom-tab-bar/')
}

export function shouldRequireIdeLivePageVisibility(watchCase?: Pick<WatchCase, 'name'>) {
  if (process.env['E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY'] === '0') {
    return false
  }
  return !watchCase || !IDE_LIVE_PAGE_VISIBILITY_RELAXED_CASES.has(watchCase.name)
}

function getLivePageVisibilitySkipReason(watchCase: Pick<WatchCase, 'name'>) {
  if (process.env['E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY'] === '0') {
    return 'E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY=0'
  }
  if (IDE_LIVE_PAGE_VISIBILITY_RELAXED_CASES.has(watchCase.name)) {
    return 'case-level relaxed visibility'
  }
  return 'unknown'
}

function summarizeDiagnostic(value: string | undefined) {
  if (value == null) {
    return 'unavailable'
  }
  return JSON.stringify(value.slice(0, 500))
}

async function refreshDevToolsCompile(miniProgram: any, signal?: AbortSignal) {
  const errors: string[] = []
  if (typeof miniProgram.clearCache === 'function') {
    await awaitWithAbort(signal, () => miniProgram.clearCache({ clean: 'compile' })).catch((error: unknown) => {
      signal?.throwIfAborted()
      errors.push(`clearCache: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  if (typeof miniProgram.compile === 'function') {
    await awaitWithAbort(signal, () => miniProgram.compile({ force: true })).catch((error: unknown) => {
      signal?.throwIfAborted()
      errors.push(`compile: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  return errors
}

export async function runIdeClassHotUpdate(
  options: CliOptions,
  watchCase: IdeWatchCase,
  session: ReturnType<typeof createWatchSession>,
  mutationKind: 'template' | 'script',
  sourceOriginal: string,
  miniProgram: any,
  page: any,
  pageUrl: string,
  launchProjectPath: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  session = bindWatchSessionSignal(session, signal)
  const mutation = mutationKind === 'template' ? watchCase.templateMutation : watchCase.scriptMutation
  const sourceFile = mutation.sourceFile
  process.stdout.write(`[e2e:ide] ${watchCase.label} ${mutationKind} HMR mutate ${sourceFile}\n`)
  const { artifacts: baselineArtifacts, mtimes: baselineMtimes } = await collectArtifactMtimes(watchCase)
  const liveBefore = await readCurrentPageLiveContent(miniProgram, page, pageUrl, signal)
    .then((result) => {
      page = result.page
      return result.content
    })
    .catch(() => undefined)
  const scenario = createClassMutationScenario(
    watchCase,
    mutationKind,
    mutation,
    sourceOriginal,
    joinArtifactContent(baselineArtifacts, 'wxml'),
    joinArtifactContent(baselineArtifacts, 'js'),
    joinArtifactContent(baselineArtifacts, 'style'),
    '__twIdeWatchClass',
    resolveRoundConfig(watchCase),
  )
  const mutationStartedAt = Date.now()

  await writeProbeSource(sourceFile, scenario.mutatedSource, sourceOriginal, signal)
  await waitForOutputFilesUpdated(
    watchCase,
    resolveUpdatedArtifactFiles([
      watchCase.outputWxml,
      watchCase.outputJs,
      ...watchCase.outputStyleCandidates,
      ...watchCase.globalStyleCandidates,
    ], baselineMtimes),
    baselineMtimes,
    options,
    session,
    mutationStartedAt,
    async () => hasAnyNeedle(await readArtifacts(watchCase), [scenario.marker, ...scenario.freshEscapedClasses]),
  )
  await waitForMarkerState(watchCase, scenario.marker, 'present', options, session, mutationStartedAt)

  let changedArtifacts: string[] = []
  const afterArtifacts = await waitFor(
    async () => {
      const currentArtifacts = await readArtifacts(watchCase)
      const changedCount = countChangedArtifacts(baselineArtifacts, currentArtifacts)
      const hasMarker = hasAnyNeedle(currentArtifacts, [scenario.marker])
      const hasEscapedClass = hasAnyNeedle(currentArtifacts, scenario.freshEscapedClasses)
      if (changedCount > 0 && hasMarker && hasEscapedClass) {
        changedArtifacts = summarizeChangedArtifacts(baselineArtifacts, currentArtifacts)
        return true
      }
      return false
    },
    {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      message: `[${watchCase.label}] IDE ${mutationKind} HMR artifacts did not contain marker and transformed classes in time`,
      onTick: session.ensureRunning,
      signal,
    },
    mutationStartedAt,
  ).then(async () => readArtifacts(watchCase))

  if (!hasAnyNeedle(afterArtifacts, scenario.freshEscapedClasses)) {
    throw new Error(`[${watchCase.label}] IDE ${mutationKind} HMR artifacts missed transformed classes`)
  }
  assertNoUnsupportedMiniProgramCssImport(watchCase, afterArtifacts, `IDE ${mutationKind} HMR`)

  const compileErrors = await refreshDevToolsCompile(miniProgram, signal)
  let devtoolsVisible = 'false'
  const verifyLivePage = shouldVerifyLivePageVisibility(watchCase)
  const requireLivePage = verifyLivePage && shouldRequireIdeLivePageVisibility(watchCase)
  const livePageTimeoutMs = requireLivePage
    ? getDevToolsVisibleTimeoutMs(options)
    : getDevToolsBestEffortVisibleTimeoutMs(options)
  process.stdout.write(`[e2e:ide] ${watchCase.label} ${mutationKind} HMR verify DevTools visibility=${verifyLivePage ? 'page' : 'compile'}\n`)
  let liveHasMarker = false
  let liveAfter: string | undefined
  if (verifyLivePage) {
    liveHasMarker = await waitFor(
      async () => {
        try {
          const current = await readCurrentPageLiveContent(miniProgram, page, pageUrl, signal)
          page = current.page
          const content = current.content
          liveAfter = content
          if (content.includes(scenario.marker)) {
            return true
          }
          return false
        }
        catch {
          return false
        }
      },
      {
        timeoutMs: livePageTimeoutMs,
        pollMs: options.pollMs,
        message: `[${watchCase.label}] DevTools page did not show IDE ${mutationKind} HMR marker: ${scenario.marker}`,
        onTick: session.ensureRunning,
        signal,
      },
      mutationStartedAt,
    ).then(() => true).catch(() => false)
  }

  if (liveHasMarker) {
    if (liveAfter != null && liveBefore != null && liveBefore === liveAfter) {
      throw new Error(`[${watchCase.label}] DevTools live page content did not change after ${mutationKind} HMR`)
    }
    devtoolsVisible = 'live'
  }
  else if (verifyLivePage) {
    if (!requireLivePage) {
      process.stdout.write(`[e2e:ide] ${watchCase.label} ${mutationKind} HMR DevTools page visibility skipped by ${getLivePageVisibilitySkipReason(watchCase)}\n`)
      devtoolsVisible = 'artifact'
    }
    else {
      process.stdout.write(`[e2e:ide] ${watchCase.label} ${mutationKind} HMR reLaunch DevTools page for visibility fallback\n`)
      signal?.throwIfAborted()
      const freshPage: any = await withDevToolsRelaunchTimeout(options, pageUrl, miniProgram.reLaunch(pageUrl), signal).catch(() => undefined)
      signal?.throwIfAborted()
      const freshContent = freshPage
        ? await readCurrentPageLiveContent(miniProgram, freshPage, pageUrl, signal).then(result => result.content).catch(() => undefined)
        : undefined
      if (freshContent == null || !freshContent.includes(scenario.marker)) {
        signal?.throwIfAborted()
        process.stdout.write(`[e2e:ide] ${watchCase.label} ${mutationKind} HMR reconnect to owned DevTools project for visibility fallback\n`)
        const reopenedContent = await readFreshDevToolsPageContent(launchProjectPath, options, pageUrl, scenario.marker, signal)
        signal?.throwIfAborted()
        if (reopenedContent == null || !reopenedContent.includes(scenario.marker)) {
          throw new Error([
            `[${watchCase.label}] DevTools page did not show ${mutationKind} HMR marker after reLaunch/reconnect: ${scenario.marker}`,
            `compileErrors=${JSON.stringify(compileErrors)}`,
            `liveBefore=${summarizeDiagnostic(liveBefore)}`,
            `liveAfter=${summarizeDiagnostic(liveAfter)}`,
            `freshContent=${summarizeDiagnostic(freshContent)}`,
            `reopenedContent=${summarizeDiagnostic(reopenedContent)}`,
          ].join('\n'))
        }
        else if (liveBefore != null && liveBefore === reopenedContent) {
          throw new Error(`[${watchCase.label}] DevTools reopened page content did not change after ${mutationKind} HMR`)
        }
        else {
          devtoolsVisible = 'reconnected'
        }
      }
      else if (liveBefore != null && liveBefore === freshContent) {
        throw new Error(`[${watchCase.label}] DevTools fresh page content did not change after ${mutationKind} HMR`)
      }
      else {
        devtoolsVisible = 'relaunch'
      }
    }
  }
  else {
    devtoolsVisible = 'compile'
  }

  process.stdout.write(
    `[e2e:ide] ${watchCase.label} ${mutationKind} HMR changed artifacts=${changedArtifacts.length}, devtoolsVisible=${devtoolsVisible}: ${changedArtifacts.join(', ')}\n`,
  )

  const rollbackStartedAt = Date.now()
  await writeProbeSource(sourceFile, sourceOriginal, sourceOriginal, signal)
  await waitForCompileSettled(watchCase, options, session, rollbackStartedAt)
  await waitForMarkerState(watchCase, scenario.marker, 'absent', options, session, rollbackStartedAt)
  await refreshDevToolsCompile(miniProgram, signal)
}
