import type { CliOptions, MutationKind, MutationRoundMetrics, MutationRoundName, WatchCaseMetrics, WatchCaseMutationMetrics, WatchProjectGroup, WatchReport, WatchSummary } from './types'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { formatPath } from './cli'
import { summarizeHmrDurations } from './hmr-durations'
import { summarizeHmrMemoryReport } from './memory-report'
import { MUTATION_ROUND_NAMES } from './types'

interface SummarySample {
  hotUpdateEffectiveMs: number
  rollbackEffectiveMs: number
}

function resolvePreferredRound(rounds: MutationRoundMetrics[]) {
  return rounds.find(item => item.roundName === 'complex-corpus')
    ?? rounds.at(-1)
}

export function summarizeSamples(samples: SummarySample[]): WatchSummary {
  const count = samples.length
  if (count === 0) {
    return {
      count,
      hotUpdateAvgMs: 0,
      hotUpdateMaxMs: 0,
      hotUpdateMinMs: 0,
      rollbackAvgMs: 0,
      rollbackMaxMs: 0,
      rollbackMinMs: 0,
    }
  }

  const hotUpdateDurations = samples.map(item => item.hotUpdateEffectiveMs)
  const rollbackDurations = samples.map(item => item.rollbackEffectiveMs)
  const hotUpdateSum = hotUpdateDurations.reduce((sum, value) => sum + value, 0)
  const rollbackSum = rollbackDurations.reduce((sum, value) => sum + value, 0)

  return {
    count,
    hotUpdateAvgMs: Math.round(hotUpdateSum / count),
    hotUpdateMaxMs: Math.max(...hotUpdateDurations),
    hotUpdateMinMs: Math.min(...hotUpdateDurations),
    rollbackAvgMs: Math.round(rollbackSum / count),
    rollbackMaxMs: Math.max(...rollbackDurations),
    rollbackMinMs: Math.min(...rollbackDurations),
  }
}

export function summarizeMetrics(cases: WatchCaseMetrics[]): WatchSummary {
  return summarizeSamples(
    cases.map(item => ({
      hotUpdateEffectiveMs: item.hotUpdateEffectiveMs,
      rollbackEffectiveMs: item.rollbackEffectiveMs,
    })),
  )
}

export function summarizeMetricsForRound(cases: WatchCaseMetrics[], roundName: MutationRoundName): WatchSummary {
  const projected = cases
    .map((item) => {
      return item.rounds.find(round => round.roundName === roundName)
    })
    .filter((item): item is MutationRoundMetrics => Boolean(item))
    .map((round) => {
      return {
        hotUpdateEffectiveMs: round.hotUpdateEffectiveMs,
        rollbackEffectiveMs: round.rollbackEffectiveMs,
      }
    })

  return summarizeSamples(projected)
}

export function summarizeMetricsByRound(cases: WatchCaseMetrics[]) {
  const summaryByRound: Partial<Record<MutationRoundName, WatchSummary>> = {}
  for (const roundName of MUTATION_ROUND_NAMES) {
    summaryByRound[roundName] = summarizeMetricsForRound(cases, roundName)
  }
  return summaryByRound
}

export function summarizeMetricsByGroup(cases: WatchCaseMetrics[]) {
  const summaryByGroup: Partial<Record<WatchProjectGroup, WatchSummary>> = {}
  for (const groupName of ['demo'] as const) {
    const groupCases = cases.filter(item => item.projectGroup === groupName)
    summaryByGroup[groupName] = summarizeMetrics(groupCases)
  }
  return summaryByGroup
}

export function summarizeMetricsByProject(cases: WatchCaseMetrics[]) {
  const grouped: Record<string, WatchCaseMetrics[]> = {}
  for (const item of cases) {
    if (!grouped[item.project]) {
      grouped[item.project] = []
    }
    grouped[item.project]!.push(item)
  }

  const summaryByProject: Record<string, WatchSummary> = {}
  for (const [projectName, projectCases] of Object.entries(grouped)) {
    summaryByProject[projectName] = summarizeMetrics(projectCases)
  }

  return summaryByProject
}

export function summarizeMutationMetricsByKind(mutations: WatchCaseMutationMetrics[]) {
  const summaryByMutationKind: Partial<Record<MutationKind, WatchSummary>> = {}

  for (const mutationKind of ['template', 'script', 'style', 'content'] as const) {
    const samples: SummarySample[] = []
    for (const item of mutations) {
      if (item.mutationKind !== mutationKind) {
        continue
      }

      if (item.mutationKind === 'style') {
        samples.push({
          hotUpdateEffectiveMs: item.hotUpdateEffectiveMs,
          rollbackEffectiveMs: item.rollbackEffectiveMs,
        })
        continue
      }

      const preferredRound = resolvePreferredRound(item.rounds)
      if (!preferredRound) {
        continue
      }
      samples.push({
        hotUpdateEffectiveMs: preferredRound.hotUpdateEffectiveMs,
        rollbackEffectiveMs: preferredRound.rollbackEffectiveMs,
      })
    }

    summaryByMutationKind[mutationKind] = summarizeSamples(samples)
  }

  return summaryByMutationKind
}

export function summarizeMutationKindAcrossCases(cases: WatchCaseMetrics[]) {
  const allMutations = cases.flatMap(item => item.mutationMetrics)
  return summarizeMutationMetricsByKind(allMutations)
}

export function resolveReportPath(baseCwd: string, file: string) {
  return path.isAbsolute(file) ? file : path.resolve(baseCwd, file)
}

export function resolveRepositoryRootLabel(baseCwd: string) {
  const label = path.basename(baseCwd)
  return label || 'workspace'
}

export async function writeReport(baseCwd: string, options: CliOptions, metrics: WatchCaseMetrics[]) {
  if (!options.reportFile) {
    return
  }

  const summary = summarizeMetrics(metrics)
  const summaryByRound = summarizeMetricsByRound(metrics)
  const summaryByGroup = summarizeMetricsByGroup(metrics)
  const summaryByProject = summarizeMetricsByProject(metrics)
  const summaryByMutationKind = summarizeMutationKindAcrossCases(metrics)
  const hmrDurations = summarizeHmrDurations(metrics)
  const memoryReport = summarizeHmrMemoryReport(metrics)
  const reportPath = resolveReportPath(baseCwd, options.reportFile)

  const report: WatchReport = {
    generatedAt: new Date().toISOString(),
    repositoryRoot: resolveRepositoryRootLabel(baseCwd),
    options: {
      caseName: options.caseName,
      timeoutMs: options.timeoutMs,
      pollMs: options.pollMs,
      skipBuild: options.skipBuild,
      quietSass: options.quietSass,
      webOnly: options.webOnly,
      miniProgramOnly: options.miniProgramOnly,
      ...(options.miniProgramScope !== undefined ? { miniProgramScope: options.miniProgramScope } : {}),
      styleOnly: options.styleOnly,
      mainStyleOnly: options.mainStyleOnly,
      ...(options.mainStyleSubPackageLimit !== undefined ? { mainStyleSubPackageLimit: options.mainStyleSubPackageLimit } : {}),
      ...(options.maxHotUpdateMs !== undefined ? { maxHotUpdateMs: options.maxHotUpdateMs } : {}),
      ...(options.maxPluginProcessMs !== undefined ? { maxPluginProcessMs: options.maxPluginProcessMs } : {}),
      ...(options.maxMemoryRssMb !== undefined ? { maxMemoryRssMb: options.maxMemoryRssMb } : {}),
      ...(options.maxMemoryRssDeltaMb !== undefined ? { maxMemoryRssDeltaMb: options.maxMemoryRssDeltaMb } : {}),
      ...(options.maxMemoryHeapUsedMb !== undefined ? { maxMemoryHeapUsedMb: options.maxMemoryHeapUsedMb } : {}),
    },
    summary,
    summaryByRound,
    summaryByGroup,
    summaryByProject,
    summaryByMutationKind,
    hmrDurations,
    memoryReport,
    cases: metrics,
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  process.stdout.write(`[watch-hmr] report written: ${formatPath(reportPath)}\n`)
}
