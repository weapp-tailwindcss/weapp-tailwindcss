function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function pct(from, to) {
  return typeof from === 'number' && from !== 0 && typeof to === 'number'
    ? ((to - from) / from) * 100
    : undefined
}

function fmtMs(value) {
  const n = toNumber(value)
  return n === undefined ? '-' : n.toFixed(2)
}

function fmtPct(value) {
  const n = toNumber(value)
  if (n === undefined) {
    return '-'
  }
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function summaryMetric(row, kind, statistic = 'median') {
  return toNumber(row?.summary?.[kind]?.[statistic])
}

function memoryMetric(row, kind) {
  return summaryMetric(row, kind, 'median')
}

function sampleCount(row, field) {
  return Array.isArray(row?.[field]) ? row[field].length : undefined
}

function numericSamples(row, field) {
  return Array.isArray(row?.[field])
    ? row[field].filter(value => typeof value === 'number' && Number.isFinite(value))
    : undefined
}

function steadySamples(row, field) {
  const samples = numericSamples(row, field)
  return samples?.slice(1)
}

function standardNormalCdf(value) {
  const absolute = Math.abs(value)
  const scale = 1 / (1 + 0.2316419 * absolute)
  const density = Math.exp(-absolute * absolute / 2) / Math.sqrt(2 * Math.PI)
  const tail = density * scale * (
    0.319381530
    + scale * (-0.356563782
      + scale * (1.781477937
        + scale * (-1.821255978 + scale * 1.330274429)))
  )
  return value >= 0 ? 1 - tail : tail
}

function mannWhitneyGreaterPValue(baselineSamples, currentSamples) {
  if (!Array.isArray(baselineSamples) || !Array.isArray(currentSamples)
    || baselineSamples.length < 2 || currentSamples.length < 2) {
    return undefined
  }
  const values = [...baselineSamples, ...currentSamples]
  const rankedIndices = values.map((value, index) => ({ index, value }))
    .sort((first, second) => first.value - second.value)
  const ranks = new Array(values.length)
  let tieCorrection = 0
  for (let start = 0; start < rankedIndices.length;) {
    let end = start + 1
    while (end < rankedIndices.length && rankedIndices[end].value === rankedIndices[start].value) {
      end += 1
    }
    const averageRank = (start + 1 + end) / 2
    const tieCount = end - start
    tieCorrection += tieCount ** 3 - tieCount
    for (let index = start; index < end; index += 1) {
      ranks[rankedIndices[index].index] = averageRank
    }
    start = end
  }

  const currentCount = currentSamples.length
  const rankOffset = currentCount * (currentCount + 1) / 2
  const observedRankSum = ranks.slice(baselineSamples.length).reduce((sum, rank) => sum + rank, 0)
  const observedU = observedRankSum - rankOffset
  if (values.length > 18) {
    const baselineCount = baselineSamples.length
    const mean = baselineCount * currentCount / 2
    const variance = baselineCount * currentCount / 12 * (
      values.length + 1 - tieCorrection / (values.length * (values.length - 1))
    )
    if (variance <= 0) {
      return 1
    }
    const zScore = (observedU - mean - 0.5) / Math.sqrt(variance)
    return 1 - standardNormalCdf(zScore)
  }
  let extremeCombinations = 0
  let totalCombinations = 0

  function visit(start, remaining, rankSum) {
    if (remaining === 0) {
      totalCombinations += 1
      if (rankSum - rankOffset >= observedU - Number.EPSILON) {
        extremeCombinations += 1
      }
      return
    }
    for (let index = start; index <= ranks.length - remaining; index += 1) {
      visit(index + 1, remaining - 1, rankSum + ranks[index])
    }
  }

  visit(0, currentCount, 0)
  return totalCombinations > 0 ? extremeCombinations / totalCombinations : undefined
}

function hmrPluginStatistic(row) {
  return row?.hmrPluginStatistic === 'median' ? 'median' : 'p95'
}

function average(values) {
  const validValues = values.filter(value => typeof value === 'number' && Number.isFinite(value))
  return validValues.length ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length : undefined
}

function normalizePackageSpec(value) {
  if (value.startsWith('weapp-tailwindcss@')) {
    return value
  }
  return `weapp-tailwindcss@${value}`
}

const hmrMemoryMetrics = new Set(['hmrPeakRssMb', 'hmrSteadyRssMb'])

function violationId(violation) {
  return `${violation.key}::${violation.metric}`
}

export function requiresHmrMemoryConfirmation(guard) {
  return guard.violations.length > 0
    && guard.violations.every(violation => hmrMemoryMetrics.has(violation.metric))
}

export function confirmHmrMemoryViolations(primaryGuard, confirmationGuard) {
  const confirmationById = new Map(
    confirmationGuard.violations
      .filter(violation => hmrMemoryMetrics.has(violation.metric))
      .map(violation => [violationId(violation), violation]),
  )
  const observations = [...(primaryGuard.observations ?? [])]
  const violations = primaryGuard.violations.flatMap((violation) => {
    if (!hmrMemoryMetrics.has(violation.metric)) {
      return [violation]
    }
    const confirmation = confirmationById.get(violationId(violation))
    if (!confirmation) {
      observations.push({
        ...violation,
        message: `首次检测到 HMR RSS 回归，反向顺序独立复测未复现（${fmtMs(violation.baseline)} -> ${fmtMs(violation.current)} MB）`,
      })
      return []
    }
    return [{
      ...violation,
      message: `HMR RSS 回归经反向顺序独立复测确认：首次 ${fmtMs(violation.baseline)} -> ${fmtMs(violation.current)} MB；复测 ${fmtMs(confirmation.baseline)} -> ${fmtMs(confirmation.current)} MB`,
      confirmation: {
        baseline: confirmation.baseline,
        current: confirmation.current,
        deltaPercent: confirmation.deltaPercent,
        absoluteDelta: confirmation.absoluteDelta,
      },
    }]
  })

  return {
    ...primaryGuard,
    passed: violations.length === 0,
    violations,
    observations,
    memoryConfirmation: {
      order: 'current->baseline',
      confirmedViolations: violations.filter(violation => hmrMemoryMetrics.has(violation.metric)).length,
    },
  }
}

export function markHmrMemoryConfirmationUnavailable(primaryGuard, reason) {
  return {
    ...primaryGuard,
    violations: primaryGuard.violations.map(violation => ({
      ...violation,
      message: `HMR RSS 首次检测已超限，但反向顺序独立复测不可用：${reason}`,
    })),
    memoryConfirmation: {
      order: 'current->baseline',
      error: reason,
    },
  }
}

export function buildSummary(raw, baselineLabel, currentLabel) {
  const rows = raw.rows ?? []
  const byKey = new Map(rows.map(row => [`${row.version}::${row.key}`, row]))
  const currentRows = rows.filter(row => row.version === currentLabel)
  const compares = currentRows.map((current) => {
    const baseline = byKey.get(`${baselineLabel}::${current.key}`)
    const baselineBuild = summaryMetric(baseline, 'build')
    const currentBuild = summaryMetric(current, 'build')
    const baselineHmrMedian = summaryMetric(baseline, 'hmr')
    const currentHmrMedian = summaryMetric(current, 'hmr')
    const baselineHmr = summaryMetric(baseline, 'hmr', 'p95')
    const currentHmr = summaryMetric(current, 'hmr', 'p95')
    const baselineBuildPlugin = summaryMetric(baseline, 'buildPlugin')
    const currentBuildPlugin = summaryMetric(current, 'buildPlugin')
    const baselineHmrPluginMedian = summaryMetric(baseline, 'hmrPlugin')
    const currentHmrPluginMedian = summaryMetric(current, 'hmrPlugin')
    const baselineHmrPluginStatistic = hmrPluginStatistic(baseline)
    const currentHmrPluginStatistic = hmrPluginStatistic(current)
    const baselineHmrPlugin = summaryMetric(baseline, 'hmrPlugin', baselineHmrPluginStatistic)
    const currentHmrPlugin = summaryMetric(current, 'hmrPlugin', currentHmrPluginStatistic)
    const baselineHmrPluginSteady = summaryMetric(baseline, 'hmrPluginSteady', 'p95')
    const currentHmrPluginSteady = summaryMetric(current, 'hmrPluginSteady', 'p95')
    const baselineHmrPluginGuard = baselineHmrPluginSteady ?? baselineHmrPlugin
    const currentHmrPluginGuard = currentHmrPluginSteady ?? currentHmrPlugin
    const baselineBuildPeakRssMb = memoryMetric(baseline, 'buildPeakRssMb')
    const currentBuildPeakRssMb = memoryMetric(current, 'buildPeakRssMb')
    const baselineBuildSteadyRssMb = memoryMetric(baseline, 'buildSteadyRssMb')
    const currentBuildSteadyRssMb = memoryMetric(current, 'buildSteadyRssMb')
    const baselineHmrPeakRssMb = memoryMetric(baseline, 'hmrPeakRssMb')
    const currentHmrPeakRssMb = memoryMetric(current, 'hmrPeakRssMb')
    const baselineHmrSteadyRssMb = memoryMetric(baseline, 'hmrSteadyRssMb')
    const currentHmrSteadyRssMb = memoryMetric(current, 'hmrSteadyRssMb')
    const baselineHmrMode = baseline?.hmrMode ?? 'watch'
    const currentHmrMode = current.hmrMode ?? 'watch'
    const hmrEndToEndGuard = baseline?.hmrEndToEndGuard !== false && current.hmrEndToEndGuard !== false
    return {
      key: current.key,
      project: current.project,
      target: current.target,
      baselineBuild,
      currentBuild,
      buildDeltaPct: pct(baselineBuild, currentBuild),
      baselineHmr,
      currentHmr,
      hmrDeltaPct: pct(baselineHmr, currentHmr),
      baselineHmrMedian,
      currentHmrMedian,
      hmrMedianDeltaPct: pct(baselineHmrMedian, currentHmrMedian),
      baselineBuildPlugin,
      currentBuildPlugin,
      buildPluginDeltaPct: pct(baselineBuildPlugin, currentBuildPlugin),
      baselineHmrPlugin,
      currentHmrPlugin,
      hmrPluginStatistic: baselineHmrPluginStatistic === currentHmrPluginStatistic
        ? currentHmrPluginStatistic
        : `${baselineHmrPluginStatistic}->${currentHmrPluginStatistic}`,
      hmrPluginDeltaPct: pct(baselineHmrPlugin, currentHmrPlugin),
      baselineHmrPluginGuard,
      currentHmrPluginGuard,
      hmrPluginGuardDeltaPct: pct(baselineHmrPluginGuard, currentHmrPluginGuard),
      baselineHmrPluginMedian,
      currentHmrPluginMedian,
      hmrPluginMedianDeltaPct: pct(baselineHmrPluginMedian, currentHmrPluginMedian),
      baselineBuildPeakRssMb,
      currentBuildPeakRssMb,
      buildPeakRssDeltaPct: pct(baselineBuildPeakRssMb, currentBuildPeakRssMb),
      baselineBuildSteadyRssMb,
      currentBuildSteadyRssMb,
      buildSteadyRssDeltaPct: pct(baselineBuildSteadyRssMb, currentBuildSteadyRssMb),
      baselineHmrPeakRssMb,
      currentHmrPeakRssMb,
      hmrPeakRssDeltaPct: pct(baselineHmrPeakRssMb, currentHmrPeakRssMb),
      baselineHmrSteadyRssMb,
      currentHmrSteadyRssMb,
      hmrSteadyRssDeltaPct: pct(baselineHmrSteadyRssMb, currentHmrSteadyRssMb),
      baselineHmrSampleCount: sampleCount(baseline, 'hmrMs'),
      currentHmrSampleCount: sampleCount(current, 'hmrMs'),
      baselineHmrPluginSampleCount: sampleCount(baseline, 'hmrPluginMs'),
      currentHmrPluginSampleCount: sampleCount(current, 'hmrPluginMs'),
      baselineBuildSamples: numericSamples(baseline, 'buildMs'),
      currentBuildSamples: numericSamples(current, 'buildMs'),
      baselineBuildPluginSamples: numericSamples(baseline, 'buildPluginMs'),
      currentBuildPluginSamples: numericSamples(current, 'buildPluginMs'),
      baselineHmrSamples: numericSamples(baseline, 'hmrMs'),
      currentHmrSamples: numericSamples(current, 'hmrMs'),
      baselineHmrPluginSamples: numericSamples(baseline, 'hmrPluginMs'),
      currentHmrPluginSamples: numericSamples(current, 'hmrPluginMs'),
      baselineHmrPluginSteadySamples: steadySamples(baseline, 'hmrPluginMs'),
      currentHmrPluginSteadySamples: steadySamples(current, 'hmrPluginMs'),
      baselineBuildPeakRssSamples: numericSamples(baseline, 'buildPeakRssMb'),
      currentBuildPeakRssSamples: numericSamples(current, 'buildPeakRssMb'),
      baselineBuildSteadyRssSamples: numericSamples(baseline, 'buildSteadyRssMb'),
      currentBuildSteadyRssSamples: numericSamples(current, 'buildSteadyRssMb'),
      baselineMemoryStability: baseline?.memoryStability,
      currentMemoryStability: current.memoryStability,
      baselineBuildMode: baseline?.buildMode ?? 'build',
      currentBuildMode: current.buildMode ?? 'build',
      baselineHmrMode,
      currentHmrMode,
      hmrEndToEndGuard,
      hmrGuardNote: current.hmrGuardNote ?? baseline?.hmrGuardNote,
      baselineBuildNote: baseline?.buildNote,
      currentBuildNote: current.buildNote,
      baselineHmrNote: baseline?.hmrNote,
      currentHmrNote: current.hmrNote,
      baselineError: baseline?.error,
      currentError: current.error,
    }
  })
  const errors = rows.filter(row => row.error).map(row => ({
    version: row.version,
    key: row.key,
    error: row.error,
  }))
  const baselineErrors = errors.filter(item => item.version === baselineLabel)
  const currentErrors = errors.filter(item => item.version === currentLabel)
  const baselineErrorKeys = new Set(baselineErrors.map(item => item.key))
  const currentErrorKeys = new Set(currentErrors.map(item => item.key))
  const currentOnlyErrors = currentErrors.filter(item => !baselineErrorKeys.has(item.key))
  const sharedErrors = currentErrors
    .filter(item => baselineErrorKeys.has(item.key))
    .map(current => ({
      key: current.key,
      baselineError: baselineErrors.find(item => item.key === current.key)?.error,
      currentError: current.error,
    }))
  const baselineOnlyErrors = baselineErrors.filter(item => !currentErrorKeys.has(item.key))
  const validBuildCompares = compares.filter(item => !item.baselineError && !item.currentError && typeof item.baselineBuild === 'number' && typeof item.currentBuild === 'number')
  const validWatchHmrCompares = compares.filter((item) => {
    return !item.baselineError
      && !item.currentError
      && item.baselineHmrMode === 'watch'
      && item.currentHmrMode === 'watch'
      && typeof item.baselineHmr === 'number'
      && typeof item.currentHmr === 'number'
  })
  const validBuildPluginCompares = compares.filter(item => !item.baselineError && !item.currentError && typeof item.baselineBuildPlugin === 'number' && typeof item.currentBuildPlugin === 'number')
  const validWatchHmrPluginCompares = compares.filter((item) => {
    return !item.baselineError
      && !item.currentError
      && item.baselineHmrMode === 'watch'
      && item.currentHmrMode === 'watch'
      && typeof item.baselineHmrPlugin === 'number'
      && typeof item.currentHmrPlugin === 'number'
  })
  return {
    generatedAt: raw.generatedAt,
    options: raw.options,
    baseline: baselineLabel,
    current: currentLabel,
    compares,
    errors,
    baselineErrors,
    currentErrors,
    currentOnlyErrors,
    sharedErrors,
    baselineOnlyErrors,
    averages: {
      buildDeltaPct: average(validBuildCompares.map(item => item.buildDeltaPct)),
      hmrDeltaPct: average(validWatchHmrCompares.map(item => item.hmrDeltaPct)),
      buildCompareCount: validBuildCompares.length,
      watchHmrCompareCount: validWatchHmrCompares.length,
      buildPluginDeltaPct: average(validBuildPluginCompares.map(item => item.buildPluginDeltaPct)),
      hmrPluginDeltaPct: average(validWatchHmrPluginCompares.map(item => item.hmrPluginDeltaPct)),
      buildPluginCompareCount: validBuildPluginCompares.length,
      watchHmrPluginCompareCount: validWatchHmrPluginCompares.length,
    },
  }
}

export function evaluatePerformanceGuard(summary, options = {}) {
  const regressionPercent = toNumber(options.regressionPercent) ?? 5
  const minimumTimingRegressionMs = toNumber(options.minimumTimingRegressionMs) ?? 10
  const minimumMemoryRegressionMb = toNumber(options.minimumMemoryRegressionMb) ?? 64
  const minimumTailRegressionSamples = Math.max(1, Math.floor(toNumber(options.minimumTailRegressionSamples) ?? 2))
  const maximumMedianRegressionPValue = toNumber(options.maximumMedianRegressionPValue) ?? 0.05
  const violations = summary.currentOnlyErrors.map(item => ({
    key: item.key,
    metric: 'error',
    message: String(item.error).split('\n')[0],
  }))
  const metrics = [
    { metric: 'buildMedian', baseline: 'baselineBuild', current: 'currentBuild', delta: 'buildDeltaPct', timing: true, baselineSamples: 'baselineBuildSamples', tailSamples: 'currentBuildSamples', medianSamples: true },
    { metric: 'hmrMedian', baseline: 'baselineHmrMedian', current: 'currentHmrMedian', delta: 'hmrMedianDeltaPct', timing: true, watchOnly: true, baselineSamples: 'baselineHmrSamples', tailSamples: 'currentHmrSamples', medianSamples: true, pluginConfirmation: { baseline: 'baselineHmrPluginMedian', current: 'currentHmrPluginMedian', delta: 'hmrPluginMedianDeltaPct', baselineSamples: 'baselineHmrPluginSamples', tailSamples: 'currentHmrPluginSamples', medianSamples: true } },
    { metric: 'hmrP95', baseline: 'baselineHmr', current: 'currentHmr', delta: 'hmrDeltaPct', timing: true, watchOnly: true, tailSamples: 'currentHmrSamples', pluginConfirmation: { baseline: 'baselineHmrPluginGuard', current: 'currentHmrPluginGuard', delta: 'hmrPluginGuardDeltaPct', tailSamples: 'currentHmrPluginSteadySamples' } },
    { metric: 'buildPluginMedian', baseline: 'baselineBuildPlugin', current: 'currentBuildPlugin', delta: 'buildPluginDeltaPct', timing: true, baselineSamples: 'baselineBuildPluginSamples', tailSamples: 'currentBuildPluginSamples', medianSamples: true },
    { metric: 'hmrPluginMedian', baseline: 'baselineHmrPluginMedian', current: 'currentHmrPluginMedian', delta: 'hmrPluginMedianDeltaPct', timing: true, watchOnly: true, baselineSamples: 'baselineHmrPluginSamples', tailSamples: 'currentHmrPluginSamples', medianSamples: true },
    { metric: 'hmrPluginP95', baseline: 'baselineHmrPluginGuard', current: 'currentHmrPluginGuard', delta: 'hmrPluginGuardDeltaPct', timing: true, watchOnly: true, baselineSamples: 'baselineHmrPluginSteadySamples', tailSamples: 'currentHmrPluginSteadySamples', p95PluginOnly: true },
    { metric: 'buildPeakRssMb', baseline: 'baselineBuildPeakRssMb', current: 'currentBuildPeakRssMb', delta: 'buildPeakRssDeltaPct', memory: true, baselineSamples: 'baselineBuildPeakRssSamples', tailSamples: 'currentBuildPeakRssSamples', medianSamples: true },
    { metric: 'buildSteadyRssMb', baseline: 'baselineBuildSteadyRssMb', current: 'currentBuildSteadyRssMb', delta: 'buildSteadyRssDeltaPct', memory: true, baselineSamples: 'baselineBuildSteadyRssSamples', tailSamples: 'currentBuildSteadyRssSamples', medianSamples: true },
    { metric: 'hmrPeakRssMb', baseline: 'baselineHmrPeakRssMb', current: 'currentHmrPeakRssMb', delta: 'hmrPeakRssDeltaPct', memory: true, watchOnly: true, steadyConfirmation: true },
    { metric: 'hmrSteadyRssMb', baseline: 'baselineHmrSteadyRssMb', current: 'currentHmrSteadyRssMb', delta: 'hmrSteadyRssDeltaPct', memory: true, watchOnly: true, peakConfirmation: true },
  ]

  for (const compare of summary.compares) {
    if (compare.baselineError || compare.currentError) {
      continue
    }
    if (compare.currentMemoryStability?.stable === false) {
      violations.push({
        key: compare.key,
        metric: 'memoryStability100Cycles',
        message: `100 次 class 增删后的稳态 heap 增长 ${fmtPct(compare.currentMemoryStability.growthPct)}`,
      })
    }
    if (
      typeof compare.baselineBuild === 'number'
      && typeof compare.currentBuild === 'number'
      && [
        compare.baselineBuildPeakRssMb,
        compare.currentBuildPeakRssMb,
        compare.baselineBuildSteadyRssMb,
        compare.currentBuildSteadyRssMb,
      ].some(value => typeof value !== 'number')
    ) {
      violations.push({
        key: compare.key,
        metric: 'buildMemorySamples',
        message: 'build peak/steady RSS samples are incomplete',
      })
    }
    if (
      compare.baselineHmrMode === 'watch'
      && compare.currentHmrMode === 'watch'
      && typeof compare.baselineHmr === 'number'
      && typeof compare.currentHmr === 'number'
      && [
        compare.baselineHmrPeakRssMb,
        compare.currentHmrPeakRssMb,
        compare.baselineHmrSteadyRssMb,
        compare.currentHmrSteadyRssMb,
      ].some(value => typeof value !== 'number')
    ) {
      violations.push({
        key: compare.key,
        metric: 'hmrMemorySamples',
        message: 'HMR peak/steady RSS samples are incomplete',
      })
    }
    if (compare.baselineHmrMode === 'watch' && compare.currentHmrMode === 'watch') {
      const baselinePluginSamples = toNumber(compare.baselineHmrPluginSampleCount)
      const currentPluginSamples = toNumber(compare.currentHmrPluginSampleCount)
      const hasPluginTimingData = (baselinePluginSamples ?? 0) > 0 || (currentPluginSamples ?? 0) > 0
      for (const side of ['baseline', 'current']) {
        const hmrSamples = toNumber(compare[`${side}HmrSampleCount`])
        const pluginSamples = toNumber(compare[`${side}HmrPluginSampleCount`])
        if (hmrSamples !== undefined && hmrSamples > 0 && pluginSamples !== hmrSamples && hasPluginTimingData) {
          violations.push({
            key: compare.key,
            metric: `${side}HmrPluginSamples`,
            message: `${side} HMR plugin timing samples ${pluginSamples ?? 0}/${hmrSamples}`,
          })
        }
      }
    }
    for (const config of metrics) {
      if (config.watchOnly && (compare.baselineHmrMode !== 'watch' || compare.currentHmrMode !== 'watch')) {
        continue
      }
      if (config.metric === 'hmrP95' && compare.hmrEndToEndGuard === false) {
        continue
      }
      if (config.metric === 'hmrMedian' && compare.hmrEndToEndGuard === false) {
        continue
      }
      if (config.p95PluginOnly && compare.hmrPluginStatistic !== 'p95') {
        continue
      }
      const baseline = toNumber(compare[config.baseline])
      const current = toNumber(compare[config.current])
      const deltaPercent = toNumber(compare[config.delta])
      if (baseline === undefined || current === undefined || deltaPercent === undefined) {
        continue
      }
      const absoluteDelta = current - baseline
      const minimumAbsoluteDelta = config.timing
        ? minimumTimingRegressionMs
        : config.memory
          ? minimumMemoryRegressionMb
          : 0
      if (deltaPercent > regressionPercent && absoluteDelta >= minimumAbsoluteDelta) {
        if (config.pluginConfirmation) {
          const pluginBaseline = toNumber(compare[config.pluginConfirmation.baseline])
          const pluginCurrent = toNumber(compare[config.pluginConfirmation.current])
          const pluginDeltaPercent = toNumber(compare[config.pluginConfirmation.delta])
          if (
            pluginBaseline !== undefined
            && pluginCurrent !== undefined
            && pluginDeltaPercent !== undefined
          ) {
            const pluginTailSamples = config.pluginConfirmation.tailSamples
              ? compare[config.pluginConfirmation.tailSamples]
              : undefined
            const regressedPluginTailSamples = Array.isArray(pluginTailSamples)
              ? pluginTailSamples.filter((sample) => {
                const sampleDelta = sample - pluginBaseline
                return pct(pluginBaseline, sample) > regressionPercent && sampleDelta >= minimumTimingRegressionMs
              }).length
              : undefined
            const requiredPluginRegressionSamples = config.pluginConfirmation.medianSamples && Array.isArray(pluginTailSamples)
              ? Math.floor(pluginTailSamples.length / 2) + 1
              : minimumTailRegressionSamples
            const pluginMedianRegressionPValue = config.pluginConfirmation.medianSamples
              ? mannWhitneyGreaterPValue(
                  compare[config.pluginConfirmation.baselineSamples],
                  pluginTailSamples,
                )
              : undefined
            if (
              pluginDeltaPercent <= regressionPercent
              || pluginCurrent - pluginBaseline < minimumTimingRegressionMs
              || (regressedPluginTailSamples !== undefined && regressedPluginTailSamples < requiredPluginRegressionSamples)
              || (pluginMedianRegressionPValue !== undefined && pluginMedianRegressionPValue > maximumMedianRegressionPValue)
            ) {
              continue
            }
          }
        }
        if (config.steadyConfirmation) {
          const steadyBaseline = toNumber(compare.baselineHmrSteadyRssMb)
          const steadyCurrent = toNumber(compare.currentHmrSteadyRssMb)
          const steadyDeltaPercent = toNumber(compare.hmrSteadyRssDeltaPct)
          if (
            steadyBaseline === undefined
            || steadyCurrent === undefined
            || steadyDeltaPercent === undefined
            || steadyDeltaPercent <= regressionPercent
            || steadyCurrent - steadyBaseline < minimumMemoryRegressionMb
          ) {
            continue
          }
        }
        if (config.peakConfirmation) {
          const peakBaseline = toNumber(compare.baselineHmrPeakRssMb)
          const peakCurrent = toNumber(compare.currentHmrPeakRssMb)
          const peakDeltaPercent = toNumber(compare.hmrPeakRssDeltaPct)
          if (
            peakBaseline === undefined
            || peakCurrent === undefined
            || peakDeltaPercent === undefined
            || peakDeltaPercent <= regressionPercent
            || peakCurrent - peakBaseline < minimumMemoryRegressionMb
          ) {
            continue
          }
        }
        const tailSamples = config.tailSamples ? compare[config.tailSamples] : undefined
        const minimumSampleDelta = config.timing
          ? minimumTimingRegressionMs
          : config.memory
            ? minimumMemoryRegressionMb
            : 0
        const regressedTailSamples = Array.isArray(tailSamples)
          ? tailSamples.filter((sample) => {
            const sampleDelta = sample - baseline
            return pct(baseline, sample) > regressionPercent && sampleDelta >= minimumSampleDelta
          }).length
          : undefined
        const requiredRegressionSamples = config.medianSamples && Array.isArray(tailSamples)
          ? Math.floor(tailSamples.length / 2) + 1
          : minimumTailRegressionSamples
        if (regressedTailSamples !== undefined && regressedTailSamples < requiredRegressionSamples) {
          continue
        }
        const medianRegressionPValue = config.medianSamples
          ? mannWhitneyGreaterPValue(compare[config.baselineSamples], tailSamples)
          : undefined
        if (medianRegressionPValue !== undefined && medianRegressionPValue > maximumMedianRegressionPValue) {
          continue
        }
        violations.push({
          key: compare.key,
          metric: config.metric,
          baseline,
          current,
          deltaPercent,
          absoluteDelta,
          ...(regressedTailSamples === undefined
            ? {}
            : {
                regressionSamples: regressedTailSamples,
                requiredRegressionSamples,
              }),
          ...(medianRegressionPValue === undefined ? {} : { medianRegressionPValue }),
          thresholdPercent: regressionPercent,
        })
      }
    }
  }

  return {
    passed: violations.length === 0,
    thresholds: {
      minimumMemoryRegressionMb,
      minimumTailRegressionSamples,
      minimumTimingRegressionMs,
      maximumMedianRegressionPValue,
      regressionPercent,
    },
    violations,
  }
}

export function asInformationalPerformanceGuard(guard, skipReason) {
  return {
    ...guard,
    passed: true,
    blocking: false,
    skipReason,
    observations: guard.violations,
    violations: [],
  }
}

export function toMarkdown(summary, baselineSpec) {
  const rows = summary.compares.map((item) => {
    const hmrMode = item.baselineHmrMode === item.currentHmrMode
      ? item.currentHmrMode
      : `${item.baselineHmrMode} -> ${item.currentHmrMode}`
    const note = [
      item.baselineError && 'baseline error',
      item.currentError && 'current error',
      item.baselineBuildMode === 'unsupported' && `baseline build: ${item.baselineBuildNote}`,
      item.currentBuildMode === 'unsupported' && `current build: ${item.currentBuildNote}`,
      item.baselineHmrMode !== 'watch' && `baseline HMR: ${item.baselineHmrNote ?? item.baselineHmrMode}`,
      item.currentHmrMode !== 'watch' && `current HMR: ${item.currentHmrNote ?? item.currentHmrMode}`,
      item.hmrEndToEndGuard === false && `HMR end-to-end informational: ${item.hmrGuardNote ?? 'plugin timing remains guarded'}`,
    ].filter(Boolean).join('<br>')
    return `| ${item.key} | ${item.target ?? '-'} | ${fmtMs(item.baselineBuild)} | ${fmtMs(item.currentBuild)} | ${fmtPct(item.buildDeltaPct)} | ${hmrMode} | ${fmtMs(item.baselineHmr)} | ${fmtMs(item.currentHmr)} | ${fmtPct(item.hmrDeltaPct)} | ${note || '-'} |`
  }).join('\n')
  const errors = summary.errors.length
    ? summary.errors.map(item => `- ${item.version} / ${item.key}: ${String(item.error).split('\n')[0]}`).join('\n')
    : '- 无'
  const pluginRows = summary.compares.map(item => `| ${item.key} | ${fmtMs(item.baselineBuildPlugin)} | ${fmtMs(item.currentBuildPlugin)} | ${fmtPct(item.buildPluginDeltaPct)} | ${item.hmrPluginStatistic} | ${fmtMs(item.baselineHmrPlugin)} | ${fmtMs(item.currentHmrPlugin)} | ${fmtPct(item.hmrPluginDeltaPct)} |`).join('\n')
  const memoryRows = summary.compares.map(item => `| ${item.key} | ${fmtMs(item.baselineBuildPeakRssMb)} | ${fmtMs(item.currentBuildPeakRssMb)} | ${fmtPct(item.buildPeakRssDeltaPct)} | ${fmtMs(item.baselineBuildSteadyRssMb)} | ${fmtMs(item.currentBuildSteadyRssMb)} | ${fmtPct(item.buildSteadyRssDeltaPct)} | ${fmtMs(item.baselineHmrPeakRssMb)} | ${fmtMs(item.currentHmrPeakRssMb)} | ${fmtPct(item.hmrPeakRssDeltaPct)} | ${fmtMs(item.baselineHmrSteadyRssMb)} | ${fmtMs(item.currentHmrSteadyRssMb)} | ${fmtPct(item.hmrSteadyRssDeltaPct)} |`).join('\n')
  const baselineDisplay = summary.baseline.startsWith('base:')
    ? baselineSpec
    : normalizePackageSpec(baselineSpec)
  const guard = summary.performanceGuard
  const guardLines = guard
    ? [
        '',
        '## 性能门禁',
        '',
        `- 结果：${guard.passed ? '通过' : '失败'}`,
        `- 门禁模式：${guard.blocking === false ? '仅记录' : '阻断'}`,
        ...(guard.skipReason ? [`- 仅记录原因：${guard.skipReason}`] : []),
        ...(guard.relevantChanges?.length ? [`- 阻断依据：检测到性能相关变更：${guard.relevantChanges.join(', ')}`] : []),
        `- 统一退化阈值：${guard.thresholds.regressionPercent}%`,
        `- 时间回归绝对下限：${fmtMs(guard.thresholds.minimumTimingRegressionMs)}ms`,
        `- 内存回归绝对下限：${fmtMs(guard.thresholds.minimumMemoryRegressionMb)}MB`,
        `- P95 尾部回归最少样本：${guard.thresholds.minimumTailRegressionSamples}`,
        '- HMR 插件 P95 门禁使用首轮预热后的稳态样本',
        `- 中位数回归置信上限：p <= ${guard.thresholds.maximumMedianRegressionPValue}`,
        '- 中位数回归需严格多数样本同步越界，并通过单侧分布置信检验',
        '- 端到端 HMR 回归需插件处理阶段同步越界确认',
        '- HMR 内存回归需 peak 与 steady 两项同步越界，并通过反向顺序独立复测确认',
        ...(guard.memoryConfirmation
          ? [guard.memoryConfirmation.error
              ? `- HMR 内存独立复测：${guard.memoryConfirmation.order}，不可用：${guard.memoryConfirmation.error}`
              : `- HMR 内存独立复测：${guard.memoryConfirmation.order}，确认 ${guard.memoryConfirmation.confirmedViolations} 项`]
          : []),
        `- 违规项：${guard.violations.length}`,
        ...guard.violations.map(item => `- ${item.key} / ${item.metric}: ${item.message ?? `${fmtMs(item.baseline)} -> ${fmtMs(item.current)} (${fmtPct(item.deltaPercent)})`}`),
        `- 观察项：${guard.observations?.length ?? 0}`,
        ...(guard.observations ?? []).map(item => `- ${item.key} / ${item.metric}: ${item.message ?? `${fmtMs(item.baseline)} -> ${fmtMs(item.current)} (${fmtPct(item.deltaPercent)})`}`),
      ].join('\n')
    : ''

  return `# weapp-tailwindcss 性能对照 Benchmark

生成时间：${summary.generatedAt}

## 基线

- 当前版本：${summary.current}
- 对照基线：${summary.baseline}（${baselineDisplay}）
- 样本参数：build ${summary.options.buildRuns} 次，hmr ${summary.options.hmrRuns} 次，timeout ${summary.options.timeoutMs}ms

## 汇总

- 冷构建中位数平均变化：${fmtPct(summary.averages.buildDeltaPct)}（${summary.averages.buildCompareCount} 项）
- 真实 watch HMR P95 平均变化：${fmtPct(summary.averages.hmrDeltaPct)}（${summary.averages.watchHmrCompareCount} 项；fallback-build/unsupported 不参与）
- 插件 Build 中位数平均变化：${fmtPct(summary.averages.buildPluginDeltaPct)}（${summary.averages.buildPluginCompareCount} 项）
- 插件 HMR 门禁统计平均变化：${fmtPct(summary.averages.hmrPluginDeltaPct)}（${summary.averages.watchHmrPluginCompareCount} 项）
- 失败项：${summary.errors.length}
- 当前版本独有失败项：${summary.currentOnlyErrors.length}
- 基线/当前共同失败项：${summary.sharedErrors.length}

## 项目矩阵

| 项目 | 目标平台 | Baseline Build median(ms) | Current Build median(ms) | Build 变化 | HMR 模式 | Baseline HMR P95(ms) | Current HMR P95(ms) | HMR 变化 | 备注 |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
${rows}

## 插件处理阶段

| 项目 | Baseline Build Plugin median(ms) | Current Build Plugin median(ms) | Build Plugin 变化 | HMR 统计 | Baseline HMR Plugin(ms) | Current HMR Plugin(ms) | HMR Plugin 变化 |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
${pluginRows}

## 内存

| 项目 | Baseline Build peak(MB) | Current Build peak(MB) | 变化 | Baseline Build steady(MB) | Current Build steady(MB) | 变化 | Baseline HMR peak(MB) | Current HMR peak(MB) | 变化 | Baseline HMR steady(MB) | Current HMR steady(MB) | 变化 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${memoryRows}
${guardLines}

## 失败项

${errors}
`
}
