import type { WatchCaseMetrics } from './types'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { assertWatchCommandActive } from './cancellation'
import { buildCases, isLocalOnlyWatchCase, pickCases } from './cases'
import { formatPath, resolveBaseCwd, resolveOptions } from './cli'
import { assertHotUpdateBudget, assertMemoryBudget, assertPluginProcessBudget, logSummary, runCase, runMainStyleOnlyCase, runSubPackagesOnlyCase, runWebOnlyCase, WatchHmrPartialMetricsError } from './runner'
import { ensureLocalPackageBuild, sleep } from './session'
import { runStyleOnlyCase } from './style-only'
import {
  summarizeMetrics,
  summarizeMetricsByGroup,
  summarizeMetricsByRound,
  summarizeMutationKindAcrossCases,
  writeReport,
} from './summary'

function resolveFailureLogPath(baseCwd: string) {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return path.resolve(
    baseCwd,
    'e2e/benchmark/e2e-watch-hmr/failures',
    `${timestamp}-watch-hmr-runner-failure.log`,
  )
}

async function writeFailureLog(baseCwd: string, message: string) {
  const file = resolveFailureLogPath(baseCwd)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${message}\n`, 'utf8')
  process.stdout.write(`[watch-hmr] failure log written: ${formatPath(file)}\n`)
}

export async function main() {
  const options = resolveOptions()
  const baseCwd = resolveBaseCwd()
  process.stdout.write(`[watch-hmr] repository root: ${formatPath(baseCwd)}\n`)

  if (!options.skipBuild) {
    await ensureLocalPackageBuild(baseCwd)
    // 本地包刚 build 完时，大量 dist 改动会让部分 watch 工具链的首次订阅不稳定。
    // 这里统一给一个短暂冷却窗口，避免首个 mutation 被吞掉。
    const postBuildSettleMs = 5_000
    process.stdout.write(`[watch-hmr] post-build settle ${postBuildSettleMs}ms\n`)
    await sleep(postBuildSettleMs)
  }

  const allCases = buildCases(baseCwd, {
    includeLocalOnly: isLocalOnlyWatchCase(options.caseName),
  })
  const selected = pickCases(allCases, options.caseName)

  if (selected.length === 0) {
    throw new Error(`no watch case matched --case=${options.caseName}`)
  }

  process.stdout.write(`[watch-hmr] running cases: ${selected.map(item => item.label).join(', ')}\n`)

  const metrics: WatchCaseMetrics[] = []

  try {
    for (const watchCase of selected) {
      assertWatchCommandActive()
      process.stdout.write(`[watch-hmr] start ${watchCase.label} (${watchCase.devScript})\n`)
      const result = options.miniProgramScope === 'subpackages'
        ? await runSubPackagesOnlyCase(watchCase, options)
        : options.mainStyleOnly
          ? await runMainStyleOnlyCase(watchCase, options)
          : options.styleOnly
            ? (await runStyleOnlyCase(watchCase, options)).watchCaseMetrics
            : options.webOnly
              ? await runWebOnlyCase(watchCase, options)
              : await runCase(
                  options.miniProgramScope === 'main-package'
                    ? { ...watchCase, subPackageMutations: undefined }
                    : watchCase,
                  options,
                )
      metrics.push(result)
      assertHotUpdateBudget(result, options)
      assertPluginProcessBudget(result, options)
      assertMemoryBudget(result, options)
    }
  }
  catch (error) {
    if (error instanceof WatchHmrPartialMetricsError) {
      metrics.push(error.metrics)
    }
    if (metrics.length > 0) {
      await writeReport(baseCwd, options, metrics)
    }
    throw error
  }

  const summary = summarizeMetrics(metrics)
  const summaryByRound = summarizeMetricsByRound(metrics)
  const summaryByGroup = summarizeMetricsByGroup(metrics)
  const summaryByMutationKind = summarizeMutationKindAcrossCases(metrics)

  logSummary(summary, summaryByRound, summaryByGroup, summaryByMutationKind)
  await writeReport(baseCwd, options, metrics)

  if (metrics.length === 0) {
    throw new Error('no metrics collected')
  }

  assertWatchCommandActive()
  process.stdout.write('[watch-hmr] all cases passed\n')
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  const baseCwd = resolveBaseCwd()
  try {
    await writeFailureLog(baseCwd, message)
  }
  catch {
  }
  console.error(`[watch-hmr] failed\n${message}`)
  process.exitCode = 1
})

process.on('unhandledRejection', (reason) => {
  console.error('[watch-hmr] unhandled rejection:', reason)
  process.exitCode = 1
})

process.on('uncaughtException', (error) => {
  console.error('[watch-hmr] uncaught exception:', error)
  process.exitCode = 1
})
