import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import fg from 'fast-glob'
import { repositoryPackageManager } from '../version-contract.mjs'
import { cases, coverage, matrix, requiredPhases } from './catalog.mjs'

const platforms = { 'ubuntu-latest': 'linux', 'windows-latest': 'win32', 'macos-latest': 'darwin' }

export function verifyReports(reports, expectedMatrix, sha, packageManager = repositoryPackageManager) {
  const expected = new Set(expectedMatrix.include.flatMap(job => job.cases.map(id => `${platforms[job.os]}:${job.node}:${id}`)))
  const actual = new Set()
  for (const report of reports) {
    assert.equal(report.sha, sha, 'Report belongs to a different commit')
    assert.equal(report.pnpm, packageManager.version, 'Report pnpm version differs from the tested manifest')
    const node = Number(report.node.match(/^v(\d+)/)?.[1])
    assert.deepEqual(report.results.map(result => result.id).sort(), [...report.expected].sort())
    for (const result of report.results) {
      const key = `${report.os}:${node}:${result.id}`
      assert.ok(expected.has(key), `Unexpected result ${key}`)
      assert.ok(!actual.has(key), `Duplicate result ${key}`)
      assert.equal(result.status, 'passed', `Failed result ${key}`)
      const item = cases.find(item => item.id === result.id)
      assert.ok(item, `Unregistered case ${result.id}`)
      assert.equal(result.coverage, coverage(item), `Incorrect coverage ${key}`)
      for (const phase of requiredPhases(item)) {
        assert.ok(result.rounds[phase], `Missing ${phase}: ${key}`)
      }
      actual.add(key)
    }
  }
  assert.deepEqual([...actual].sort(), [...expected].sort(), 'Missing matrix evidence')
  return actual.size
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.env.DEMO_MATRIX_SHA
  assert.match(sha ?? '', /^[a-f\d]{40}$/i, 'DEMO_MATRIX_SHA must identify the tested checkout')
  const files = await fg('**/report.json', { cwd: process.argv[2], absolute: true })
  const reports = await Promise.all(files.map(async file => JSON.parse(await readFile(file, 'utf8'))))
  console.log(`Verified ${verifyReports(reports, matrix(), sha)} demo/OS/Node results`)
}
