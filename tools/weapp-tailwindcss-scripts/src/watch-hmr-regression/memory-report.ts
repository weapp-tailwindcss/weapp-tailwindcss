import type {
  HmrMemoryDebugSample,
  HmrMemoryDebugSummary,
  HmrMemoryProjectReport,
  HmrMemoryReport,
  MemoryPeakSample,
  MemoryUsageSample,
  MemoryUsageSummary,
  WatchCaseMetrics,
} from './types'

function toFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readProcessMemoryValue(sample: HmrMemoryDebugSample, key: 'heapUsedMb' | 'rssMb') {
  const processStats = sample.data['process']
  if (!processStats || typeof processStats !== 'object' || Array.isArray(processStats)) {
    return undefined
  }
  return toFiniteNumber((processStats as Record<string, unknown>)[key])
}

function readObjectValue(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readProcessCacheNumber(sample: HmrMemoryDebugSample, key: 'staleCacheKeys' | 'staleHashKeys') {
  const processCache = readObjectValue(sample.data, 'processCache')
  return processCache ? toFiniteNumber(processCache[key]) : undefined
}

function readProcessCacheBoolean(sample: HmrMemoryDebugSample, key: 'pruneSkipped') {
  const processCache = readObjectValue(sample.data, 'processCache')
  return processCache?.[key] === true
}

function readAssetsNumber(sample: HmrMemoryDebugSample, key: 'activeCss') {
  const assets = readObjectValue(sample.data, 'assets')
  return assets ? toFiniteNumber(assets[key]) : undefined
}

function readBundleBoolean(sample: HmrMemoryDebugSample, key: 'hasOmittedKnownFiles') {
  const bundle = readObjectValue(sample.data, 'bundle')
  return bundle?.[key] === true
}

export function summarizeMemorySamples(samples: MemoryUsageSample[]): MemoryUsageSummary {
  if (samples.length === 0) {
    return {
      availability: 'unavailable',
      count: 0,
      baselineRssMb: 0,
      peakRssMb: 0,
      steadyRssMb: 0,
      steadyGrowthPct: 0,
      rssDeltaMb: 0,
      peakMaxProcessRssMb: 0,
      peakProcessCount: 0,
      uniqueProcessCount: 0,
      durationMs: 0,
    }
  }

  const first = samples.find(sample => sample.processCount > 1 && sample.rssMb >= 128) ?? samples[0]!
  const peakSample = samples.reduce((current, sample) => {
    if (sample.rssMb > current.rssMb) {
      return sample
    }
    if (sample.rssMb === current.rssMb && sample.processCount > current.processCount) {
      return sample
    }
    return current
  }, samples[0]!)
  const peakRssMb = peakSample.rssMb
  const activeSamples = samples.filter(sample => sample.processCount > 0 && sample.rssMb > 0)
  const windowSize = Math.max(1, Math.ceil(activeSamples.length * 0.2))
  const warmupOffset = Math.min(activeSamples.length - 1, windowSize)
  const steadyBaselineSamples = activeSamples.slice(warmupOffset, warmupOffset + windowSize)
  const steadySamples = activeSamples.slice(-windowSize)
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0)
  }
  const steadyBaselineRssMb = median(steadyBaselineSamples.map(sample => sample.rssMb))
  const steadyRssMb = median(steadySamples.map(sample => sample.rssMb))
  const peakMaxProcessRssMb = Math.max(...samples.map(sample => sample.maxProcessRssMb))
  const peakProcessCount = Math.max(...samples.map(sample => sample.processCount))
  const uniqueProcessCount = new Set(
    samples.flatMap(sample => sample.topProcesses?.map(processSample => processSample.pid) ?? []),
  ).size
  const firstAt = samples[0]!.at
  const lastAt = samples[samples.length - 1]!.at
  const peak: MemoryPeakSample = {
    at: peakSample.at,
    rssMb: peakSample.rssMb,
    maxProcessRssMb: peakSample.maxProcessRssMb,
    processCount: peakSample.processCount,
    ...(peakSample.topProcesses?.length ? { topProcesses: peakSample.topProcesses } : {}),
  }
  return {
    availability: 'available',
    count: samples.length,
    baselineRssMb: first.rssMb,
    peakRssMb,
    steadyRssMb,
    steadyGrowthPct: steadyBaselineRssMb === 0 ? 0 : ((steadyRssMb - steadyBaselineRssMb) / steadyBaselineRssMb) * 100,
    rssDeltaMb: Math.max(0, peakRssMb - first.rssMb),
    peakMaxProcessRssMb,
    peakProcessCount,
    uniqueProcessCount,
    firstAt,
    lastAt,
    durationMs: Math.max(0, lastAt - firstAt),
    peakSample: peak,
  }
}

export function summarizeMemoryDebugSamples(samples: HmrMemoryDebugSample[]): HmrMemoryDebugSummary {
  const byBundlerPhase = new Map<string, {
    count: number
    peakHeapUsedMb: number
    peakRssMb: number
    peakStaleCacheKeys: number
    peakStaleHashKeys: number
    pruneSkippedCount: number
    omittedKnownFilesCount: number
    peakDurationMs: number
    peakDurationActiveCss: number
    peakDurationStaleCacheKeys: number
    peakDurationStaleHashKeys: number
    peakDurationPruneSkipped: boolean
    peakDurationOmittedKnownFiles: boolean
  }>()

  let peakHeapUsedMb = 0
  let peakRssMb = 0
  let peakStaleCacheKeys = 0
  let peakStaleHashKeys = 0
  for (const sample of samples) {
    const heapUsedMb = readProcessMemoryValue(sample, 'heapUsedMb') ?? 0
    const rssMb = readProcessMemoryValue(sample, 'rssMb') ?? 0
    const staleCacheKeys = readProcessCacheNumber(sample, 'staleCacheKeys') ?? 0
    const staleHashKeys = readProcessCacheNumber(sample, 'staleHashKeys') ?? 0
    const pruneSkipped = readProcessCacheBoolean(sample, 'pruneSkipped')
    const hasOmittedKnownFiles = readBundleBoolean(sample, 'hasOmittedKnownFiles')
    const activeCss = readAssetsNumber(sample, 'activeCss') ?? 0
    peakHeapUsedMb = Math.max(peakHeapUsedMb, heapUsedMb)
    peakRssMb = Math.max(peakRssMb, rssMb)
    peakStaleCacheKeys = Math.max(peakStaleCacheKeys, staleCacheKeys)
    peakStaleHashKeys = Math.max(peakStaleHashKeys, staleHashKeys)

    const key = `${sample.bundler}:${sample.phase}`
    const current = byBundlerPhase.get(key) ?? {
      count: 0,
      peakHeapUsedMb: 0,
      peakRssMb: 0,
      peakStaleCacheKeys: 0,
      peakStaleHashKeys: 0,
      pruneSkippedCount: 0,
      omittedKnownFilesCount: 0,
      peakDurationMs: 0,
      peakDurationActiveCss: 0,
      peakDurationStaleCacheKeys: 0,
      peakDurationStaleHashKeys: 0,
      peakDurationPruneSkipped: false,
      peakDurationOmittedKnownFiles: false,
    }
    current.count += 1
    current.peakHeapUsedMb = Math.max(current.peakHeapUsedMb, heapUsedMb)
    current.peakRssMb = Math.max(current.peakRssMb, rssMb)
    current.peakStaleCacheKeys = Math.max(current.peakStaleCacheKeys, staleCacheKeys)
    current.peakStaleHashKeys = Math.max(current.peakStaleHashKeys, staleHashKeys)
    if (pruneSkipped) {
      current.pruneSkippedCount += 1
    }
    if (hasOmittedKnownFiles) {
      current.omittedKnownFilesCount += 1
    }
    if (sample.durationMs > current.peakDurationMs) {
      current.peakDurationMs = sample.durationMs
      current.peakDurationActiveCss = activeCss
      current.peakDurationStaleCacheKeys = staleCacheKeys
      current.peakDurationStaleHashKeys = staleHashKeys
      current.peakDurationPruneSkipped = pruneSkipped
      current.peakDurationOmittedKnownFiles = hasOmittedKnownFiles
    }
    byBundlerPhase.set(key, current)
  }

  return {
    count: samples.length,
    peakHeapUsedMb,
    peakRssMb,
    peakStaleCacheKeys,
    peakStaleHashKeys,
    byBundlerPhase: Object.fromEntries(
      [...byBundlerPhase.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    topHeapPhases: [...byBundlerPhase.entries()]
      .map(([phase, summary]) => ({
        phase,
        count: summary.count,
        peakHeapUsedMb: summary.peakHeapUsedMb,
        peakRssMb: summary.peakRssMb,
        peakStaleCacheKeys: summary.peakStaleCacheKeys,
        peakStaleHashKeys: summary.peakStaleHashKeys,
        pruneSkippedCount: summary.pruneSkippedCount,
        omittedKnownFilesCount: summary.omittedKnownFilesCount,
      }))
      .sort((a, b) => b.peakHeapUsedMb - a.peakHeapUsedMb || b.peakRssMb - a.peakRssMb || a.phase.localeCompare(b.phase))
      .slice(0, 10),
    topStaleCachePhases: [...byBundlerPhase.entries()]
      .map(([phase, summary]) => ({
        phase,
        count: summary.count,
        peakStaleCacheKeys: summary.peakStaleCacheKeys,
        peakStaleHashKeys: summary.peakStaleHashKeys,
        pruneSkippedCount: summary.pruneSkippedCount,
        omittedKnownFilesCount: summary.omittedKnownFilesCount,
      }))
      .sort((a, b) => b.peakStaleHashKeys - a.peakStaleHashKeys || b.peakStaleCacheKeys - a.peakStaleCacheKeys || a.phase.localeCompare(b.phase))
      .slice(0, 10),
    topDurationPhases: [...byBundlerPhase.entries()]
      .map(([phase, summary]) => ({
        phase,
        count: summary.count,
        peakDurationMs: summary.peakDurationMs,
        peakDurationActiveCss: summary.peakDurationActiveCss,
        peakDurationStaleCacheKeys: summary.peakDurationStaleCacheKeys,
        peakDurationStaleHashKeys: summary.peakDurationStaleHashKeys,
        peakDurationPruneSkipped: summary.peakDurationPruneSkipped,
        peakDurationOmittedKnownFiles: summary.peakDurationOmittedKnownFiles,
      }))
      .sort((a, b) => b.peakDurationMs - a.peakDurationMs || a.phase.localeCompare(b.phase))
      .slice(0, 10),
  }
}

function createProjectMemoryReport(item: WatchCaseMetrics): HmrMemoryProjectReport {
  const peakRssMb = Math.max(item.memorySummary.peakRssMb, item.memoryDebugSummary.peakRssMb)
  const peakMaxProcessRssMb = Math.max(item.memorySummary.peakMaxProcessRssMb, item.memoryDebugSummary.peakRssMb)
  return {
    name: item.name,
    availability: item.memorySummary.availability ?? (item.memorySummary.count > 0 ? 'available' : 'unavailable'),
    label: item.label,
    project: item.project,
    projectGroup: item.projectGroup,
    initialReadyMs: Math.round(item.initialReadyMs),
    totalMs: Math.round(item.totalMs),
    sampleCount: item.memorySummary.count,
    debugSampleCount: item.memoryDebugSummary.count,
    baselineRssMb: item.memorySummary.baselineRssMb,
    peakRssMb,
    steadyRssMb: item.memorySummary.steadyRssMb,
    steadyGrowthPct: item.memorySummary.steadyGrowthPct,
    rssDeltaMb: Math.max(0, peakRssMb - item.memorySummary.baselineRssMb),
    peakMaxProcessRssMb,
    peakProcessCount: item.memorySummary.peakProcessCount,
    uniqueProcessCount: item.memorySummary.uniqueProcessCount,
    peakHeapUsedMb: item.memoryDebugSummary.peakHeapUsedMb,
    peakDebugRssMb: item.memoryDebugSummary.peakRssMb,
    ...(item.memorySummary.peakSample ? { peakSample: item.memorySummary.peakSample } : {}),
    topHeapPhases: item.memoryDebugSummary.topHeapPhases,
    topStaleCachePhases: item.memoryDebugSummary.topStaleCachePhases,
    topDurationPhases: item.memoryDebugSummary.topDurationPhases,
  }
}

export function summarizeHmrMemoryReport(cases: WatchCaseMetrics[]): HmrMemoryReport {
  const byProject = Object.fromEntries(
    cases.map(item => [item.project, createProjectMemoryReport(item)]),
  )
  const projects = Object.values(byProject)
  const sampleCount = projects.reduce((total, item) => total + item.sampleCount, 0)
  const debugSampleCount = projects.reduce((total, item) => total + item.debugSampleCount, 0)

  return {
    summary: {
      projectCount: projects.length,
      sampleCount,
      debugSampleCount,
      peakRssMb: Math.max(0, ...projects.map(item => item.peakRssMb)),
      peakSteadyRssMb: Math.max(0, ...projects.map(item => item.steadyRssMb)),
      maxSteadyGrowthPct: Math.max(0, ...projects.map(item => item.steadyGrowthPct)),
      maxRssDeltaMb: Math.max(0, ...projects.map(item => item.rssDeltaMb)),
      peakHeapUsedMb: Math.max(0, ...projects.map(item => item.peakHeapUsedMb)),
    },
    byProject,
  }
}
