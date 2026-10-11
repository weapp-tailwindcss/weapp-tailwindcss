import assert from 'node:assert/strict'
import { difference, rowKey, statistics, validateReport } from './model.mjs'

function signedMedian(values) {
  assert.ok(values.length && values.every(Number.isFinite), '无效性能样本')
  const shift = Math.min(...values, 0)
  return statistics(values.map(value => value - shift)).median + shift
}

function environment(row, report) {
  const value = row.environment ?? report.environment
  assert.ok(value?.platform && value?.node && value?.cpu && value?.pnpm, '缺少可比较的设备和工具链身份')
  const { runner, ...identity } = value
  return JSON.stringify(identity)
}

function comparisonIdentity(row) {
  const identity = row.dependencies?.comparisonIdentity
  assert.ok(identity?.nativeLock && identity?.staticLock && identity?.scenario, '缺少依赖或场景身份，不能冻结或比较历史预算')
  return identity
}

function dimensions(row) {
  return Object.fromEntries(['ms', 'peakRssMb'].flatMap(field => {
    const enabled = row.samples.enabled.map(sample => sample[field])
    const processing = enabled.map((value, index) => value - row.samples.static[index][field])
    return [[`${field}.enabled`, enabled], [`${field}.processing`, processing]]
  }))
}

export function limits(metric, memory = false) {
  return memory ? { percent: 5, absolute: 64 } : metric === 'install.offline' || metric === 'install.incremental'
    ? { percent: 10, absolute: 250 } : { percent: 5, absolute: 10 }
}

export function pairedSignProbability(before, after) {
  assert.equal(before.length, after.length, '配对样本数量不同')
  const signs = before.map((value, index) => Math.sign(after[index] - value)).filter(Boolean)
  const positive = signs.filter(value => value > 0).length
  let combinations = 1
  let tail = positive === 0 ? 1 : 0
  for (let index = 1; index <= signs.length; index++) {
    combinations *= (signs.length - index + 1) / index
    if (index >= positive) tail += combinations
  }
  return signs.length ? tail / 2 ** signs.length : 1
}

export function regression(before, after, metric, memory = false) {
  assert.equal(before.length, after.length, '无效性能样本')
  const a = signedMedian(before)
  const b = signedMedian(after)
  const delta = difference(a, b)
  const threshold = limits(metric, memory)
  return delta.absolute > threshold.absolute && (a === 0 || delta.absolute / Math.abs(a) * 100 > threshold.percent)
    && pairedSignProbability(before, after) <= 0.05
}

export function createBudgets(first, second) {
  assert.ok(!first.harnessState && !second.harnessState, '未提交测量脚本不能冻结预算')
  assert.deepEqual(validateReport(first), [], '第一批报告不完整')
  assert.deepEqual(validateReport(second), [], '第二批报告不完整')
  assert.notEqual(first.runId, second.runId, '预算需要两批独立采样')
  assert.equal(first.sha, second.sha, '预算脚本提交不同')
  assert.equal(first.package.version, second.package.version, '预算版本不一致')
  assert.equal(first.package.integrity, second.package.integrity, '预算发布包完整性不一致')
  assert.deepEqual(first.settings, second.settings, '预算采样口径不同')
  assert.deepEqual([...first.expected].sort(), [...second.expected].sort(), '预算覆盖不同')
  const other = new Map(second.rows.map(row => [rowKey(row), row]))
  return {
    schema: 'weapp-demo-cost-budget/v1',
    version: first.package.version, evidence: [first.runId, second.runId], createdAt: new Date().toISOString(),
    cases: Object.fromEntries(first.rows.map(raw => {
      const secondRow = other.get(rowKey(raw))
      const identity = environment(raw, first)
      assert.equal(identity, environment(secondRow, second), '预算环境不一致')
      const comparison = comparisonIdentity(raw)
      assert.deepEqual(comparison, comparisonIdentity(secondRow), '预算依赖或场景不一致')
      const a = dimensions(raw)
      const b = dimensions(secondRow)
      return [rowKey(raw), { environment: identity, comparison, dimensions: Object.fromEntries(Object.keys(a).map(key => {
        const samples = signedMedian(a[key]) >= signedMedian(b[key]) ? a[key] : b[key]
        const median = signedMedian(samples)
        const threshold = limits(raw.metric, key.startsWith('peakRssMb'))
        return [key, { samples, maximum: median + Math.max(Math.abs(median) * threshold.percent / 100, threshold.absolute) }]
      })) }]
    })),
  }
}

export function evaluateBudgets(report, budgets) {
  const failures = validateReport(report)
  if (budgets.schema !== 'weapp-demo-cost-budget/v1') return [...failures, '预算格式不匹配']
  if (failures.length) return failures
  for (const raw of report.rows) {
    const budget = budgets.cases[rowKey(raw)]
    if (!budget) { failures.push(`缺少预算 ${rowKey(raw)}`); continue }
    if (budget.environment !== environment(raw, report)) { failures.push(`环境不兼容 ${rowKey(raw)}`); continue }
    try { assert.deepEqual(comparisonIdentity(raw), budget.comparison) }
    catch { failures.push(`依赖或场景不兼容 ${rowKey(raw)}`); continue }
    if (raw.metric === 'install.cold') continue
    for (const [key, samples] of Object.entries(dimensions(raw))) {
      const limit = budget.dimensions[key]
      if (!limit || samples.length !== limit.samples.length) { failures.push(`预算样本不兼容 ${rowKey(raw)}:${key}`); continue }
      if (signedMedian(samples) > limit.maximum && pairedSignProbability(limit.samples, samples) <= 0.05) failures.push(`疑似退化（需一次反向完整复测） ${rowKey(raw)}:${key}`)
    }
  }
  return failures
}
