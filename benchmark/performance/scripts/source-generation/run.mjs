import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { deserialize } from 'node:v8'
import { measureBuild, measureWatch } from '../../demo/measure.mjs'
import { defaults, difference, metrics, modes, sampleErrors, selectCases, summarizeRow } from '../../demo/model.mjs'
import { run } from '../../demo/process.mjs'
import { assertSameRegistryDependencies } from './identity.mjs'
import { comparisonBatches } from './ordering.mjs'

const { values } = parseArgs({ options: {
  'before': { type: 'string' },
  'after': { type: 'string' },
  'only': { type: 'string' },
  'out-dir': { type: 'string' },
  'diagnostic': { type: 'boolean' },
  'phases': { type: 'string', default: 'build,hmr' },
  'confirmation': { type: 'boolean' },
  'confirmation-of': { type: 'string' },
  'dependency-changes': { type: 'string' },
  'registry': { type: 'string', default: 'https://registry.npmjs.org/' },
} })
assert.ok(values.before && values.after && values.only && values['out-dir'], '需要前后 tarball 清单、明确目标和报告目录')
assert.ok(!values['confirmation-of'] || (values.confirmation && ['first', 'second'].includes(values['confirmation-of'])), 'confirmation-of 必须与 confirmation 一起指定 first 或 second')
const phases = values.phases.split(',')
assert.ok(phases.length && new Set(phases).size === phases.length && phases.every(phase => ['build', 'startup', 'hmr'].includes(phase)), '源码实验阶段仅支持 build、startup、hmr')
const artifacts = Object.fromEntries(await Promise.all(['before', 'after'].map(async variant => [variant, JSON.parse(await readFile(values[variant], 'utf8'))])))
const dependencyChanges = values['dependency-changes'] ? JSON.parse(await readFile(values['dependency-changes'], 'utf8')) : []
assert.equal(artifacts.before.version, artifacts.after.version, '源码实验应保持依赖版本，仅改变实现')
assert.deepEqual(Object.keys(artifacts.before.packages).sort(), Object.keys(artifacts.after.packages).sort(), '源码依赖闭包不同')
const output = path.resolve(values['out-dir'])
await mkdir(output, { recursive: true })
const settings = values.diagnostic ? { runs: 1, hmrRuns: 1, warmups: 0 } : defaults
const report = { schema: 'weapp-source-demo-comparison/v1', scope: '源码打包产物；不是 npm 稳定版周报', diagnostic: Boolean(values.diagnostic), confirmation: Boolean(values.confirmation), settings, phases, artifacts, environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, runner: os.hostname() }, batches: [], errors: [] }
const checkpoint = () => writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
report.dependencyChanges = dependencyChanges
report.confirmationOf = values.confirmation ? values['confirmation-of'] ?? 'first' : null
report.registry = values.registry
report.dependencyEvidence = {}
for (const item of selectCases(values.only)) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'weapp-source-comparison-'))
  const prepared = {}
  const key = item.id.replaceAll(/[^\w.-]/g, '_')
  try {
    for (const variant of ['before', 'after']) {
      const directory = path.join(temporary, variant)
      const logs = path.join(output, key, variant, 'prepare')
      await mkdir(directory, { recursive: true })
      const response = path.join(directory, 'prepared.bin')
      const request = path.join(directory, 'request.json')
      await writeFile(request, JSON.stringify({ item, directory, logs, artifacts: artifacts[variant], response, registry: values.registry }))
      await run(process.execPath, [fileURLToPath(new URL('./prepare.mjs', import.meta.url)), request], { logFile: path.join(output, key, `${variant}-prepare.log`), timeout: 1_800_000 })
      prepared[variant] = deserialize(await readFile(response))
    }
    report.dependencyEvidence[item.id] = assertSameRegistryDependencies(prepared.before.locks, prepared.after.locks, dependencyChanges)
    // 两批使用相反的版本顺序；每个版本内保持三组串行轮换。
    for (const { batch, order, reverse } of comparisonBatches(values.confirmation, report.confirmationOf)) {
      const results = {}
      for (const variant of order) {
        console.log(`${item.id} ${batch} ${variant}`)
        const selectedMetrics = [...new Set([...metrics(item, phases), ...(phases.includes('startup') ? metrics(item, ['hmr']).filter(metric => metric.startsWith('startup.')) : [])])]
        assert.ok(selectedMetrics.length, `${item.id} 没有适用的被选指标`)
        const rows = Object.fromEntries(selectedMetrics.map(metric => [metric, { metric, status: 'pending', semanticVerified: false, samples: Object.fromEntries(modes.map(mode => [mode, []])) }]))
        const record = { target: item.id, batch, variant, rows, evidence: prepared[variant].evidence }
        report.batches.push(record)
        const options = { ...settings, reverse, timeout: 60_000, logs: path.join(output, key, variant, batch), checkpoint }
        await mkdir(options.logs, { recursive: true })
        await measureBuild(prepared[variant], rows, options)
        await measureWatch(prepared[variant], rows, options)
        for (const [metric, row] of Object.entries(rows)) {
          rows[metric] = summarizeRow(row, settings)
          if (!rows[metric].comparable) {
            report.errors.push(`${item.id} ${batch} ${variant} ${metric}: ${row.error ?? sampleErrors(row, settings).join('; ')}`)
          }
        }
        results[variant] = rows
        await checkpoint()
      }
      for (const metric of Object.keys(results.before)) {
        const before = results.before[metric]
        const after = results.after[metric]
        if (!before.comparable || !after.comparable) {
          continue
        }
        // 每个版本先验证 static/enabled 等价，再比较两个版本的实际消费结果。
        for (const mode of ['static', 'enabled']) {
          assert.equal(after.samples[mode][0].semanticHash, before.samples[mode][0].semanticHash, `${item.id} ${metric} ${mode} 优化前后语义不等价`)
        }
        after.sourceDifference = Object.fromEntries(modes.map(mode => [mode, difference(before.summary[mode].median, after.summary[mode].median)]))
      }
      await checkpoint()
    }
  }
  catch (error) {
    report.errors.push(`${item.id}: ${error.stack}`)
    await checkpoint()
  }
  finally { await rm(temporary, { recursive: true, force: true }) }
}
report.finishedAt = new Date().toISOString()
await checkpoint()
const lines = ['# 源码打包产物对照', '', report.scope, '', `采样：构建/启动 ${settings.runs} 轮，HMR 预热 ${settings.warmups} 轮、采样 ${settings.hmrRuns} 轮。`, '', '| 目标 | 批次 | 指标 | 优化前 median / p95 ms | 优化后 median / p95 ms | median 差值 | 差值 % |', '| --- | --- | --- | --- | --- | --- | --- |']
const number = value => Number.isFinite(value) ? value.toFixed(2) : 'N/A'
for (const after of report.batches.filter(batch => batch.variant === 'after')) {
  const before = report.batches.find(batch => batch.variant === 'before' && batch.batch === after.batch && batch.target === after.target)
  for (const [metric, row] of Object.entries(after.rows)) {
    const previous = before?.rows[metric]?.summary?.enabled
    const current = row.summary?.enabled
    const delta = row.sourceDifference?.enabled
    lines.push(`| ${after.target} | ${after.batch} | ${metric} | ${number(previous?.median)} / ${number(previous?.p95)} | ${number(current?.median)} / ${number(current?.p95)} | ${number(delta?.absolute)} | ${number(delta?.percent)} |`)
  }
}
lines.push('', '## 验证边界', '', '每个版本均执行不接入、等价静态、正常接入三组；完整原始样本、RSS、依赖身份及语义哈希见 report.json。这里只比较正常接入的源码产物。设备、IDE 和安装性能不在此报告范围。', '', ...report.errors.map(error => `- ${error.split(/\r?\n/)[0]}`))
await writeFile(path.join(output, 'report.md'), `${lines.join('\n')}\n`)
console.log(`源码对照报告：${output}；失败 ${report.errors.length}`)
if (report.errors.length) {
  process.exitCode = 1
}
