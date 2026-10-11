import assert from 'node:assert/strict'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import fg from 'fast-glob'
import { createBudgets, evaluateBudgets } from './gate.mjs'
import { createManifest, validateManifest } from './manifest.mjs'
import { defaults, validateReport } from './model.mjs'
import { renderSummary, writeReport } from './report.mjs'
import { mergeReports, runJob } from './runner.mjs'

const { values: args } = parseArgs({ options: {
  plan: { type: 'boolean' }, merge: { type: 'string' }, manifest: { type: 'string' }, job: { type: 'string' },
  only: { type: 'string', default: '' }, phases: { type: 'string', default: 'install,build,hmr' }, version: { type: 'string', default: 'latest' },
  'out-dir': { type: 'string', default: '.tmp/demo-weekly' }, timeout: { type: 'string', default: '600000' }, reverse: { type: 'boolean' },
  guard: { type: 'boolean' }, report: { type: 'string' }, budget: { type: 'string' }, confirmation: { type: 'string' },
  'update-baseline': { type: 'boolean' }, first: { type: 'string' }, second: { type: 'string' },
  diagnostic: { type: 'boolean' }, runs: { type: 'string' }, 'hmr-runs': { type: 'string' }, warmups: { type: 'string' },
} })
const readJson = async file => JSON.parse(await readFile(path.resolve(file), 'utf8'))
const directory = path.resolve(args['out-dir'])
await mkdir(directory, { recursive: true })
if (args['update-baseline']) {
  assert.ok(args.first && args.second && args.budget, '显式更新需要 --first、--second 和 --budget')
  const budget = createBudgets(await readJson(args.first), await readJson(args.second))
  await writeFile(path.resolve(args.budget), `${JSON.stringify(budget, null, 2)}\n`)
}
else if (args.guard) {
  assert.ok(args.report, '检查需要 --report；周报首次校准前只检查完整性')
  const report = await readJson(args.report)
  let errors = args.budget ? evaluateBudgets(report, await readJson(args.budget)) : validateReport(report)
  if (args.confirmation) {
    assert.ok(args.budget, '反向确认需要冻结预算')
    const confirmation = await readJson(args.confirmation)
    assert.equal(report.reverse, false, '首次必须使用正向轮换顺序')
    assert.equal(confirmation.reverse, true, '只接受一次完整的反向复测')
    assert.ok(report.sampleBatchId && confirmation.sampleBatchId && report.sampleBatchId !== confirmation.sampleBatchId, '不能重复使用同一批样本')
    for (const field of ['sha', 'package', 'settings', 'expected', 'environment']) assert.deepEqual(confirmation[field], report[field], `确认报告 ${field} 不兼容`)
    const repeated = evaluateBudgets(confirmation, await readJson(args.budget))
    errors = [...errors.filter(error => !error.startsWith('疑似退化')), ...repeated.filter(error => !error.startsWith('疑似退化') || errors.includes(error))]
  }
  await writeFile(path.join(directory, 'guard.json'), JSON.stringify({ first: args.report, confirmation: args.confirmation ?? null, budget: args.budget ?? null, errors }, null, 2))
  console.log(errors.length ? errors.join('\n') : '报告完整性与已配置预算通过')
  if (errors.length) process.exitCode = 1
}
else {
  const phases = args.phases.split(',')
  assert.ok(phases.length && new Set(phases).size === phases.length && phases.every(value => ['install', 'build', 'hmr'].includes(value)), '未知或重复阶段')
  const settings = { runs: Number(args.runs ?? defaults.runs), hmrRuns: Number(args['hmr-runs'] ?? defaults.hmrRuns), warmups: Number(args.warmups ?? defaults.warmups) }
  assert.ok(Object.values(settings).every(value => Number.isInteger(value) && value >= 0) && settings.runs > 0 && settings.hmrRuns > 0, '无效采样次数')
  let manifest
  try {
    manifest = args.manifest ? await readJson(args.manifest) : { ...await createManifest({ only: args.only, phases, version: args.version, settings }), diagnostic: Boolean(args.diagnostic) }
  }
  catch (error) {
    if (!args.merge) throw error
    manifest = await createManifest({ only: args.only, phases, version: args.version, settings, failure: new Error(`无法读取本轮计划：${error.message}`) })
  }
  if (!manifest.diagnostic && !manifest.planFailed) validateManifest(manifest)
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  if (manifest.planFailed) {
    const report = await writeReport(await mergeReports(manifest, []), directory)
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, renderSummary(report))
    console.error(manifest.collectionErrors.join('\n'))
    process.exitCode = 1
  }
  else if (args.plan) {
    const matrix = { include: manifest.jobs.map(({ rows, ...job }) => job) }
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `ready=true\nmatrix=${JSON.stringify(matrix)}\n`)
    console.log(JSON.stringify(matrix))
  }
  else {
    let report
    if (args.merge) report = await mergeReports(manifest, await fg('**/report.json', { cwd: path.resolve(args.merge), absolute: true }))
    else {
      const matchingOS = { linux: 'ubuntu-latest', darwin: 'macos-latest', win32: 'windows-latest' }[process.platform]
      const job = args.job ? manifest.jobs.find(job => job.id === args.job) : manifest.jobs.find(job => job.os === matchingOS && job.node === Number(process.versions.node.split('.')[0]))
      assert.ok(job, '没有匹配当前环境的分片')
      assert.ok(args.job || args.only, '本地执行需显式指定 --only，避免无意启动全量验收')
      report = await runJob(manifest, job, directory, { timeout: Number(args.timeout), reverse: args.reverse })
    }
    report = await writeReport(report, directory)
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, renderSummary(report))
    }
    console.log(`报告：${path.join(directory, 'report.html')}；完整性错误 ${report.errors.length}`)
    if (report.errors.length) process.exitCode = 1
  }
}
