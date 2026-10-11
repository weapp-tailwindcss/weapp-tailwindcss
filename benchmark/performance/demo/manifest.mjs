import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { boundaries, defaults, metrics, rowKey, schema, weeklyMatrix } from './model.mjs'
import { run } from './process.mjs'
import { resolvePublished } from './published.mjs'

export function planJobs(only = '', phases = ['install', 'build', 'hmr']) {
  const owners = new Set()
  const planned = weeklyMatrix(only)
  const itemsById = new Map(planned.items.map(item => [item.id, item]))
  return planned.include.map((job, index) => {
    const items = job.cases.map(id => {
      const item = itemsById.get(id)
      assert.ok(item, `未知目标 ${id}`)
      return item
    })
    const rows = []
    const installCases = []
    for (const item of items) {
      const key = JSON.stringify([item.name, job.os, job.node])
      const install = phases.includes('install') && !owners.has(key)
      if (install) { owners.add(key); installCases.push(item.id) }
      for (const metric of metrics(item, phases.filter(phase => phase !== 'install' || install))) {
        rows.push({ demo: item.name, target: metric.startsWith('install.') ? '@install' : item.target, os: job.os, node: job.node, metric })
      }
    }
    return { ...job, id: `shard-${index}`, installCases, rows }
  })
}

export async function createManifest({ only = '', phases = ['install', 'build', 'hmr'], version = 'latest', settings = defaults, failure } = {}) {
  const jobs = planJobs(only, phases)
  const manifest = {
    schema, runId: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}` : randomUUID(),
    sha: (await run('git', ['rev-parse', 'HEAD'])).stdout.trim(),
    package: { name: 'weapp-tailwindcss', version: null, integrity: null, requested: version }, startedAt: new Date().toISOString(), settings,
    phases, only, boundaries: boundaries(), jobs, expected: jobs.flatMap(job => job.rows.map(rowKey)),
  }
  try {
    if (failure) throw failure
    manifest.package = await resolvePublished(version)
  }
  catch (error) {
    manifest.planFailed = true
    manifest.collectionErrors = [`计划未完成：${error.message}`]
  }
  return manifest
}

export function validateManifest(manifest) {
  assert.equal(manifest.schema, schema)
  assert.match(manifest.package.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/)
  assert.ok(manifest.package.integrity && manifest.sha && manifest.runId)
  for (const [key, value] of Object.entries(defaults)) assert.ok(Number.isInteger(manifest.settings[key]) && manifest.settings[key] >= value, `正式报告 ${key} 不得少于 ${value}`)
  const jobs = planJobs(manifest.only, manifest.phases)
  assert.deepEqual(manifest.jobs, jobs, '分片清单不是当前目录生成的完整清单')
  assert.deepEqual(manifest.expected, jobs.flatMap(job => job.rows.map(rowKey)), '预期指标清单不一致')
  return manifest
}
