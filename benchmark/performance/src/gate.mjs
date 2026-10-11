import fs from 'node:fs/promises'
import path from 'node:path'
import { complexityExponent } from './stats.mjs'

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

export async function loadGateConfig(root) {
  const [budgets, debts] = await Promise.all([
    readJson(path.join(root, 'budgets.json')),
    readJson(path.join(root, 'known-debts.json')),
  ])
  return { budgets, debts }
}

export function evaluateSyntheticGate(report, config) {
  const violations = []
  const observations = []
  for (const result of report.cases) {
    const budget = config.budgets.cases[result.id] ?? config.budgets.default
    const checks = [
      ['medianMs', result.time?.median, budget.medianMs],
      ['p95Ms', result.time?.p95, budget.p95Ms],
      ['peakRssMb', result.memory?.peakRssMb, budget.peakRssMb],
      ['peakRssDeltaMb', result.memory?.peakRssDeltaMb, budget.rssDeltaMb],
      ['outputBytes', result.outputBytes, budget.outputBytes],
    ]
    if (result.sampleCount < report.options.runs) {
      violations.push({ id: result.id, metric: 'sampleCount', message: `样本不足 ${result.sampleCount}/${report.options.runs}` })
    }
    if (result.outputHashes?.length > 1) {
      violations.push({ id: result.id, metric: 'outputHash', message: '同一场景多次输出不一致' })
    }
    for (const [metric, actual, limit] of checks) {
      if (Number.isFinite(actual) && Number.isFinite(limit) && actual > limit) {
        violations.push({ id: result.id, metric, actual, limit, message: `${metric} ${actual} 超过 ${limit}` })
      }
    }
  }

  for (const bundle of report.bundles ?? []) {
    const budget = config.budgets.bundles?.[bundle.name]
    for (const metric of ['gzipBytes', 'brotliBytes']) {
      if (budget && Number.isFinite(bundle[metric]) && Number.isFinite(budget[metric]) && bundle[metric] > budget[metric]) {
        violations.push({ id: bundle.name, metric, actual: bundle[metric], limit: budget[metric], message: `${metric} ${bundle[metric]} 超过 ${budget[metric]}` })
      }
    }
  }

  const grouped = new Map()
  for (const result of report.cases) {
    const group = result.complexityGroup ?? (result.id.startsWith('postcss-v4-') ? 'postcss-v4' : result.group)
    const points = grouped.get(group) ?? []
    points.push({ size: result.size, value: result.time?.median })
    grouped.set(group, points)
  }
  const complexity = [...grouped.entries()].map(([group, points]) => ({ group, exponent: complexityExponent(points), points }))
  if ((report.options?.runs ?? 0) < 3) {
    return { passed: violations.length === 0, violations, observations, complexity }
  }
  for (const item of complexity) {
    if (!Number.isFinite(item.exponent) || item.exponent <= 1.25) {
      continue
    }
    const debt = config.debts.debts.find(candidate => candidate.id === 'postcss-v4-root-content-scan' && item.group === 'postcss-v4')
    const finding = { id: debt?.id ?? item.group, metric: 'complexityExponent', actual: item.exponent, limit: debt?.maxComplexityExponent ?? 1.25, message: `${item.group} 复杂度指数 ${item.exponent.toFixed(2)}` }
    if (debt?.blocking === false) {
      observations.push({ ...finding, issue: debt.issue, knownDebt: true })
      const worseningLimit = Number.isFinite(debt.baselineComplexityExponent)
        ? debt.baselineComplexityExponent * (1 + (debt.worseningTolerancePercent ?? 0) / 100)
        : undefined
      if (Number.isFinite(worseningLimit) && item.exponent > worseningLimit) {
        violations.push({
          ...finding,
          metric: 'knownDebtWorsening',
          limit: worseningLimit,
          issue: debt.issue,
          message: `${item.group} 复杂度指数 ${item.exponent.toFixed(2)} 超过已知债务基线 ${worseningLimit.toFixed(2)}`,
        })
      }
    }
    else {
      violations.push(finding)
    }
  }
  return { passed: violations.length === 0, violations, observations, complexity }
}
