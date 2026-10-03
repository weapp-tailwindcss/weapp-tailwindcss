import type {
  CliOptions,
  WatchCase,
} from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import type { FrameworkSupportCase } from './frameworkSupportMatrix'
import fs from 'node:fs/promises'
import process from 'node:process'
import { buildCases } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import {
  waitForInitialWarmup,
  waitForOutputsReady,
} from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations'
import { createWatchSession, runPnpmCommand, sleep } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { getMtime, readFileIfExists, waitFor, writeFilePreserveEol } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { runIdeClassHotUpdate } from './frameworkIdeClassHotUpdate'
import { runIdeStyleHotUpdate } from './frameworkIdeStyleHotUpdate'
import { resolveFrameworkSupportPaths } from './frameworkSupportPaths'

const TARO_VITE_INITIAL_BUILD_RE = /built in [\d.]+s?|compiled successfully|构建完成/i
const IDE_STYLE_HOT_UPDATE_EXEMPT_CASES = new Set([
  'mpx-tailwindcss-v4',
])

export const frameworkIdeWatchCaseNames: Record<string, WatchCase['name']> = {
  'gulp-tailwindcss-v4': 'gulp-tailwindcss-v4',
  'mpx-tailwindcss-v4': 'mpx-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4': 'taro-webpack-react-tailwindcss-v4',
  'taro-webpack-vue3-tailwindcss-v4': 'taro-webpack-vue3-tailwindcss-v4',
  'taro-vite-react-tailwindcss-v4': 'taro-vite-react-tailwindcss-v4',
  'taro-vite-vue3-tailwindcss-v4': 'taro-vite-vue3-tailwindcss-v4',
  'uni-app-vite-tailwindcss-v4': 'uni-app-vite-tailwindcss-v4',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4': 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4': 'uni-app-x-vdom-tailwindcss-v4',
  'weapp-vite-tailwindcss-v4': 'weapp-vite-tailwindcss-v4',
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function createWatchOptions(): CliOptions {
  return {
    caseName: 'all',
    maxHotUpdateMs: readNumberEnv('E2E_IDE_MAX_HOT_UPDATE_MS', 60_000),
    pollMs: readNumberEnv('E2E_IDE_HOT_UPDATE_POLL_MS', readNumberEnv('E2E_WATCH_POLL_MS', 40)),
    quietSass: true,
    skipBuild: true,
    timeoutMs: readNumberEnv('E2E_IDE_HOT_UPDATE_TIMEOUT_MS', readNumberEnv('E2E_WATCH_TIMEOUT_MS', 120_000)),
  }
}

function readHotUpdateTotalTimeoutMs(watchCase: WatchCase, options: CliOptions) {
  const stageCount = shouldRunIdeStyleHotUpdate(watchCase)
    ? 3
    : 2
  return readNumberEnv('E2E_IDE_HOT_UPDATE_TOTAL_TIMEOUT_MS', options.timeoutMs * stageCount)
}

async function withHotUpdateTotalTimeout<T>(
  watchCase: WatchCase,
  options: CliOptions,
  task: Promise<T>,
) {
  const timeoutMs = readHotUpdateTotalTimeoutMs(watchCase, options)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`[${watchCase.label}] IDE hot-update probe timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  }
  finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function resolveFrameworkWatchCase(entry: FrameworkSupportCase) {
  const watchCaseName = frameworkIdeWatchCaseNames[entry.name]
  if (!watchCaseName) {
    throw new Error(`Missing IDE hot-update watch case mapping for ${entry.name}`)
  }

  const root = process.cwd()
  const watchCase = buildCases(root, {
    includeLocalOnly: true,
  }).find(item => item.name === watchCaseName)
  if (!watchCase) {
    throw new Error(`Missing IDE hot-update watch case ${watchCaseName} for ${entry.name}`)
  }
  return { ...watchCase, miniprogramRoot: resolveFrameworkSupportPaths(entry).miniprogramRoot }
}

function shouldWaitForTaroViteInitialBuild(watchCase: WatchCase) {
  return watchCase.name.startsWith('taro-vite-')
}

function shouldRunIdeStyleHotUpdate(watchCase: WatchCase) {
  return !watchCase.skipStyleMutation && !IDE_STYLE_HOT_UPDATE_EXEMPT_CASES.has(watchCase.name)
}

async function waitForTaroViteInitialBuild(
  watchCase: WatchCase,
  options: CliOptions,
  session: ReturnType<typeof createWatchSession>,
  sessionStartedAt: number,
) {
  const stableWindowMs = Math.min(Math.max(options.pollMs * 4, 1500), 3000)
  await waitFor(
    async () => {
      if (TARO_VITE_INITIAL_BUILD_RE.test(session.logs())) {
        return true
      }

      const [wxmlMtime, jsMtime] = await Promise.all([
        getMtime(watchCase.outputWxml),
        getMtime(watchCase.outputJs),
      ])
      const latestOutputMtime = Math.max(wxmlMtime, jsMtime)
      return latestOutputMtime > sessionStartedAt
        && Date.now() - latestOutputMtime >= stableWindowMs
    },
    {
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      message: `[${watchCase.label}] Taro/Vite initial build did not finish before IDE HMR mutation`,
      onTick: session.ensureRunning,
    },
    sessionStartedAt,
  )
}

async function waitForIdeWatchReady(
  watchCase: WatchCase,
  options: CliOptions,
  session: ReturnType<typeof createWatchSession>,
  sessionStartedAt: number,
) {
  const [wxml, js] = await Promise.all([
    readFileIfExists(watchCase.outputWxml),
    readFileIfExists(watchCase.outputJs),
  ])

  if (wxml == null || js == null) {
    await waitForOutputsReady(watchCase, options, session, sessionStartedAt)
  }

  await waitForInitialWarmup(watchCase, options, session, sessionStartedAt)

  if (shouldWaitForTaroViteInitialBuild(watchCase)) {
    await waitForTaroViteInitialBuild(watchCase, options, session, sessionStartedAt)
  }
}

export type FrameworkIdeHotUpdateProbe = (
  miniProgram: any,
  page: any,
  pageUrl: string,
  launchProjectPath: string,
  runtimeErrors?: { assertNoErrors: (stage: string) => Promise<void> },
) => Promise<void>

/** 首轮构建与 watcher 就绪后再打开 IDE，避免运行时观察到清理中的产物图。 */
export async function withFrameworkIdeHotUpdateProbe<T>(
  entry: FrameworkSupportCase,
  run: (probe: FrameworkIdeHotUpdateProbe) => Promise<T>,
) {
  const watchCase = resolveFrameworkWatchCase(entry)
  const options = createWatchOptions()
  const sourceFiles = [...new Set([
    watchCase.templateMutation.sourceFile,
    watchCase.scriptMutation.sourceFile,
    watchCase.skipStyleMutation ? undefined : watchCase.styleMutation.sourceFile,
  ].filter((item): item is string => Boolean(item)))]
  const sourceOriginals = new Map<string, string>()

  for (const sourceFile of sourceFiles) {
    sourceOriginals.set(sourceFile, await fs.readFile(sourceFile, 'utf8'))
  }

  if (watchCase.initialBuildScript) {
    await runPnpmCommand(watchCase.cwd, ['run', watchCase.initialBuildScript], 'ide-prebuild')
  }

  const sessionStartedAt = Date.now()
  const session = createWatchSession(watchCase.cwd, watchCase.devScript, {
    quietSass: options.quietSass,
  }, watchCase.env)

  try {
    process.stdout.write(`[e2e:ide] ${watchCase.label} wait for watch ready before IDE launch\n`)
    await waitForIdeWatchReady(watchCase, options, session, sessionStartedAt)
    if ((watchCase.initialMutationDelayMs ?? 0) > 0) {
      await sleep(watchCase.initialMutationDelayMs!)
      session.ensureRunning()
    }

    return await run(async (miniProgram, page, pageUrl, launchProjectPath, runtimeErrors) => withHotUpdateTotalTimeout(
      watchCase,
      options,
      (async () => {
        session.ensureRunning()
        await runtimeErrors?.assertNoErrors('watch ready')

        await runIdeClassHotUpdate(
          options,
          watchCase,
          session,
          'template',
          sourceOriginals.get(watchCase.templateMutation.sourceFile)!,
          miniProgram,
          page,
          pageUrl,
          launchProjectPath,
        )
        await runtimeErrors?.assertNoErrors('template class HMR')
        await runIdeClassHotUpdate(
          options,
          watchCase,
          session,
          'script',
          sourceOriginals.get(watchCase.scriptMutation.sourceFile)!,
          miniProgram,
          page,
          pageUrl,
          launchProjectPath,
        )
        await runtimeErrors?.assertNoErrors('script class HMR')
        if (shouldRunIdeStyleHotUpdate(watchCase)) {
          await runIdeStyleHotUpdate(
            options,
            watchCase,
            session,
            sourceOriginals.get(watchCase.styleMutation.sourceFile)!,
          )
          await runtimeErrors?.assertNoErrors('style HMR')
        }
        else if (!watchCase.skipStyleMutation) {
          process.stdout.write(`[e2e:ide] ${watchCase.label} style HMR skipped for IDE stability; watch-HMR keeps style coverage\n`)
        }
      })(),
    ))
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`[${watchCase.label}] recent watch logs:\n${session.logs()}\n[${watchCase.label}] IDE HMR failure:\n${message}`)
  }
  finally {
    for (const [sourceFile, sourceOriginal] of sourceOriginals) {
      try {
        await writeFilePreserveEol(sourceFile, sourceOriginal, sourceOriginal)
      }
      catch {
      }
    }
    await session.stop()
  }
}
