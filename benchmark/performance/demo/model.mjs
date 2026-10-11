import assert from 'node:assert/strict'
import { cases, checkCatalog, coverage, demos, isWeb, matrix } from '../../../scripts/ci/demo-matrix/catalog.mjs'

export const schema = 'weapp-demo-cost/v1'
export const modes = ['native', 'static', 'enabled']
export const defaults = { runs: 7, warmups: 2, hmrRuns: 20 }
export const operations = ['text', 'replace', 'add', 'remove', 'css', 'config', 'restore']

export function selectCases(only = '') {
  checkCatalog()
  const ids = only ? only.split(',').filter(Boolean) : cases.map(item => item.id)
  assert.equal(new Set(ids).size, ids.length, '重复目标')
  return ids.map((id) => {
    const item = cases.find(item => item.id === id)
    assert.ok(item, `未知目标 ${id}`)
    return item
  })
}

export function weeklyMatrix(only = '') {
  const selectedItems = selectCases(only)
  const selected = new Set(selectedItems.map(item => item.id))
  return { items: selectedItems, include: matrix().include.flatMap(job => {
    const selectedCases = job.cases.filter(id => selected.has(id))
    return selectedCases.length ? [{ ...job, cases: selectedCases }] : []
  }) }
}

export function boundaries() {
  return demos.map(item => ({ demo: item.name, targets: item.targets, limitation: item.limitation ?? null }))
}

export function capabilityLabel(row) {
  if (row.target === '@install') return '发布依赖安装（按 demo 去重）'
  const item = cases.find(item => item.name === row.demo && item.target === row.target)
  const kind = row.coverage ?? (item ? coverage(item) : undefined)
  return { 'authored-styles': '作者样式注入', 'native-build': '原生构建，插件默认禁用', 'webview-build': '仅构建，设备未验收', utilities: 'Tailwind 样式生成' }[kind] ?? '未确认'
}

export function metrics(item, phases = ['install', 'build', 'hmr']) {
  const result = []
  if (phases.includes('install')) result.push('install.cold', 'install.offline', 'install.incremental')
  if (phases.includes('build')) result.push('build.cold', 'build.warm')
  if (phases.includes('hmr') && !['native-build', 'webview-build'].includes(coverage(item))) {
    const endpoint = isWeb(item) || item.name.startsWith('web/') ? 'page' : 'artifact'
    result.push(`startup.${endpoint}`, ...operations.filter(operation => coverage(item) !== 'authored-styles' || operation !== 'config').map(operation => `hmr.${operation}.${endpoint}`))
  }
  return result
}

export function order(round, reverse = false) {
  const rotation = modes.map((_, index) => modes[(round + index) % modes.length])
  return reverse ? rotation.reverse() : rotation
}

export function statistics(samples) {
  if (!samples.length || samples.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return null
  const values = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(values.length / 2)
  return { count: values.length, median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2, p95: values[Math.ceil(values.length * 0.95) - 1], min: values[0], max: values.at(-1) }
}

export function difference(baseline, enabled) {
  if (!Number.isFinite(baseline) || !Number.isFinite(enabled)) return null
  return { absolute: enabled - baseline, percent: baseline === 0 ? null : (enabled - baseline) / baseline * 100 }
}

export function rowKey(row) {
  return JSON.stringify([row.demo, row.target, row.os, row.node, row.metric])
}

export function sampleErrors(row, settings) {
  const errors = []
  const key = rowKey(row)
  const required = row.metric.startsWith('hmr.') ? settings.hmrRuns : settings.runs
  for (const mode of modes) {
    const samples = row.samples?.[mode]
    if (samples?.length !== required || !statistics(samples?.map(item => item.ms) ?? [])) errors.push(`样本不足或无效 ${key}:${mode}`)
    if (!samples?.every(sample => Number.isFinite(sample.peakRssMb) && sample.peakRssMb > 0)) errors.push(`内存样本缺失 ${key}:${mode}`)
    if (!row.metric.startsWith('install.') && (!samples?.every(sample => sample.semanticHash) || mode !== 'native' && new Set(samples?.map(sample => sample.semanticHash)).size !== 1)) errors.push(`语义快照缺失或样本之间不稳定 ${key}:${mode}`)
    if (row.metric === 'install.cold' && !samples?.every(sample => Number.isFinite(sample.installedBytes) && Number.isFinite(sample.packageArchiveBytes) && sample.packageArchiveBytes > 0)) errors.push(`安装空间或压缩包体积缺失 ${key}:${mode}`)
  }
  return errors
}

export function summarizeRow(row, settings = defaults, report) {
  const values = Object.fromEntries(modes.map(mode => [mode, statistics(row.samples?.[mode]?.map(sample => sample.ms) ?? [])]))
  const memory = Object.fromEntries(modes.map(mode => [mode, statistics(row.samples?.[mode]?.map(sample => sample.peakRssMb) ?? [])]))
  const valid = row.status === 'passed' && row.semanticVerified && !sampleErrors(row, settings).length
    && (!report || row.version === report.package?.version)
  return { ...row, comparable: valid, summary: valid ? values : Object.fromEntries(modes.map(mode => [mode, null])), memory: valid ? memory : null, overhead: valid ? difference(values.native.median, values.enabled.median) : null, processing: valid ? difference(values.static.median, values.enabled.median) : null }
}

export function validateReport(report) {
  const errors = [...(report.collectionErrors ?? [])]
  if (report.diagnostic) errors.push('缩减采样诊断不能作为正式周报或预算依据')
  if (report.schema !== schema) errors.push('未知报告格式')
  if (!report.sha || !report.runId || !report.package?.integrity || !report.package?.version) errors.push('缺少提交、批次或发布包身份')
  if (Object.entries(defaults).some(([key, minimum]) => !Number.isInteger(report.settings?.[key]) || report.settings[key] < minimum)) errors.push('正式报告采样口径不足')
  const actual = new Set()
  const expected = new Set(report.expected ?? [])
  if (expected.size !== report.expected?.length) errors.push('预期清单重复或缺失')
  for (const row of report.rows ?? []) {
    const key = rowKey(row)
    if (actual.has(key)) errors.push(`重复结果 ${key}`)
    actual.add(key)
    if (!expected.has(key)) errors.push(`非预期结果 ${key}`)
    if (row.status !== 'passed') { errors.push(`${key}: ${row.error ?? row.status}`); continue }
    if (row.version !== report.package?.version) errors.push(`版本不一致 ${key}`)
    if (!row.semanticVerified) errors.push(`缺少语义验证 ${key}`)
    const environment = row.environment ?? report.environment
    const platform = { 'ubuntu-latest': 'linux', 'macos-latest': 'darwin', 'windows-latest': 'win32' }[row.os]
    if (!environment?.cpu || !environment?.pnpm || environment.platform !== platform || Number(environment.node?.replace(/^v/, '').split('.')[0]) !== row.node) errors.push(`环境身份缺失或错误 ${key}`)
    errors.push(...sampleErrors(row, report.settings))
  }
  for (const key of expected) if (!actual.has(key)) errors.push(`缺失 ${key}`)
  if (!expected.size) errors.push('空矩阵不能通过')
  return errors
}
