import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { coverage } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { measureInstall } from './install.mjs'
import { measureBuild, measureWatch } from './measure.mjs'
import { modes, rowKey, selectCases } from './model.mjs'
import { prepareIsolated } from './prepare-process.mjs'
import { writeReport } from './report.mjs'
import { run } from './process.mjs'

export async function runJob(manifest, job, directory, { timeout = 600_000, reverse = false } = {}) {
  assert.equal((await run('git', ['rev-parse', 'HEAD'])).stdout.trim(), manifest.sha, '测量脚本提交与计划不同')
  const platform = { 'ubuntu-latest': 'linux', 'windows-latest': 'win32', 'macos-latest': 'darwin' }[job.os]
  assert.equal(process.platform, platform, '实际系统与预期分片不同')
  assert.equal(Number(process.versions.node.split('.')[0]), job.node, '实际 Node 主版本与分片不同')
  await mkdir(directory, { recursive: true })
  const environment = { platform: process.platform, release: os.release(), arch: process.arch, node: process.version, pnpm: (await run('pnpm', ['--version'])).stdout.trim(), cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryBytes: os.totalmem(), runner: process.env.RUNNER_NAME ?? os.hostname(), image: process.env.ImageOS, imageVersion: process.env.ImageVersion }
  environment.memorySampler = process.platform === 'win32' ? 'toolhelp32-working-set-50ms' : 'ps-rss-250ms'
  environment.hmrExecution = 'serial-mode-batches'
  const report = { ...manifest, reverse, jobs: undefined, shard: job.id, environment, environmentKey: JSON.stringify({ ...environment, runner: undefined }), expected: job.rows.map(rowKey), rows: job.rows.map(row => ({ ...row, version: manifest.package.version, status: 'pending', semanticVerified: false, samples: Object.fromEntries(modes.map(mode => [mode, []])) })) }
  report.sampleBatchId = randomUUID()
  await writeReport(report, directory)
  for (const item of selectCases(job.cases.join(','))) {
    const rows = Object.fromEntries(report.rows.filter(row => row.demo === item.name && (row.target === item.target || row.target === '@install' && job.installCases.includes(item.id))).map(row => [row.metric, row]))
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'weapp-weekly-'))
    const logs = path.join(directory, item.id.replaceAll(/[^\w.-]/g, '_'))
    const batchRotation = Number(job.id.match(/\d+$/)?.[0] ?? 0) % modes.length
    const options = { ...manifest.settings, directory: temporary, logs, timeout, reverse, batchRotation, checkpoint: () => writeReport(report, directory) }
    console.log(`开始 ${item.id}，发布版 ${manifest.package.version}`)
    try {
      const prepared = await prepareIsolated(item, manifest.package, temporary, logs)
      for (const row of Object.values(rows)) { row.coverage = coverage(item); row.dependencies = prepared.evidence; row.environment = environment }
      if (rows['install.cold']) {
        try { await measureInstall(prepared.consumers, Object.fromEntries(Object.entries(rows).filter(([key]) => key.startsWith('install.'))), options) }
        catch (error) { for (const row of Object.values(rows).filter(row => row.metric.startsWith('install.'))) { row.status = 'failed'; row.error = error.stack } }
      }
      await measureBuild(prepared, rows, options)
      await measureWatch(prepared, rows, options)
    }
    catch (error) { for (const row of Object.values(rows).filter(row => row.status !== 'passed')) { row.status = 'failed'; row.error = error.stack } }
    finally {
      await writeReport(report, directory)
      await rm(temporary, { recursive: true, force: true })
    }
  }
  report.finishedAt = new Date().toISOString()
  return writeReport(report, directory)
}

export async function mergeReports(manifest, files) {
  const errors = [...(manifest.collectionErrors ?? [])]
  const seen = new Set()
  const rows = []
  for (const file of files) {
    try {
      const report = JSON.parse(await readFile(file, 'utf8'))
      const job = manifest.jobs.find(job => job.id === report.shard)
      assert.ok(job, '未知分片')
      assert.ok(!seen.has(job.id), '重复分片')
      assert.equal(report.runId, manifest.runId, '不是本轮采样')
      assert.equal(report.sha, manifest.sha, '源码 SHA 不一致')
      assert.deepEqual(report.package, manifest.package, '发布版身份不一致')
      assert.deepEqual(report.settings, manifest.settings, '采样设置不一致')
      assert.deepEqual(report.expected, job.rows.map(rowKey), '分片缺少预期指标')
      assert.ok(report.rows.every(row => report.expected.includes(rowKey(row))), '分片提交了别的目标')
      seen.add(job.id)
      rows.push(...report.rows.map(row => !report.finishedAt && row.status === 'pending'
        ? { ...row, status: 'interrupted', error: '分片未完成（取消、超时或进程中断）；已采样数据保留，但不计算完整对照开销' }
        : row))
    }
    catch (error) { errors.push(`${path.basename(path.dirname(file))}: ${error.message}`) }
  }
  for (const job of manifest.jobs) if (!seen.has(job.id)) errors.push(`分片缺失：${job.id} / ${job.os} / Node ${job.node} / ${job.shard}`)
  const received = new Set(rows.map(rowKey))
  for (const row of manifest.jobs.flatMap(job => job.rows)) {
    if (!received.has(rowKey(row))) rows.push({ ...row, status: 'missing', error: '本轮没有收到有效结果，参见分片收集错误', version: manifest.package.version, semanticVerified: false, samples: Object.fromEntries(modes.map(mode => [mode, []])) })
  }
  return { ...manifest, jobs: undefined, rows, collectionErrors: errors, finishedAt: new Date().toISOString() }
}
