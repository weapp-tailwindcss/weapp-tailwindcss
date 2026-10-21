import type { CapabilityReport } from './tailwind-capabilities/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { digest } from './tailwind-capabilities/identity'
import { receipt, verifyReportArtifacts } from './tailwind-capabilities/report'
import { historyProbe } from './tailwind-capabilities/web-history/fixtures'
import { replayHistory } from './tailwind-capabilities/web-history/replay'
import { syntheticHistory } from './tailwind-capabilities/web-history/test-fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function prepared() {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-history-replay-'))
  directories.push(directory)
  const observedAt = new Date().toISOString()
  const fixture = syntheticHistory()
  const { raw, screenshots, runId, css } = fixture
  await writeFile(path.join(directory, 'generated.css'), css)
  for (const [name, bytes] of screenshots) {
    await writeFile(path.join(directory, name), bytes)
  }
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  const replay = await replayHistory(directory, runId, 'chromium', 'unit-browser')
  const files = ['generated.css', ...screenshots.keys(), 'measurements.json']
  const hash = '0'.repeat(64)
  const report: CapabilityReport = { schemaVersion: 2, runId, observedAt, target: 'web-chromium', environment: { browserVersion: 'unit-browser' }, identity: { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { unit: '1' } }, results: [{ id: raw.id, status: 'passed', support: 'supported', assertions: replay.assertions, warnings: [], artifacts: files }], artifacts: [] }
  async function refresh() {
    report.artifacts = await Promise.all(files.map(file => receipt(path.join(directory, file), directory, runId, [raw.id], file.endsWith('.png') ? 'screenshot' : file.endsWith('.css') ? 'css' : 'measurements')))
  }
  await refresh()
  return { directory, fixture, report, refresh }
}

it('统一产物门禁重读CSS、独占profile、导航与四边PNG', async () => {
  const { directory, report } = await prepared()
  await expect(verifyReportArtifacts(report, directory)).resolves.toBeUndefined()
})

it.each(['旧run', '错误引擎', '旧浏览器', '旧schema', '缺cleanup', '恢复复用历史', '无真实导航', 'warning', '运行时错误', '伪数组'] as const)('%s且重建receipt也不能保留cached passed', async (mutation) => {
  const { directory, fixture: { raw }, report, refresh } = await prepared()
  if (mutation === '旧run') {
    raw.runId = 'old-run'
  }
  if (mutation === '错误引擎') {
    raw.engine = 'webkit'
  }
  if (mutation === '旧浏览器') {
    raw.browserVersion = 'old-browser'
  }
  if (mutation === '旧schema') {
    Object.assign(raw, { schemaVersion: 1 })
  }
  if (mutation === '缺cleanup') {
    Reflect.deleteProperty(raw, 'cleanup')
  }
  if (mutation === '恢复复用历史') {
    raw.states[2]!.profileId = raw.states[0]!.profileId
  }
  if (mutation === '无真实导航') {
    raw.navigation = []
  }
  if (mutation === 'warning') {
    raw.warnings.push('console error')
  }
  if (mutation === '运行时错误') {
    raw.error = 'capture failed'
  }
  if (mutation === '伪数组') {
    Object.assign(raw, { states: { length: 3 } })
  }
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  await refresh()
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it.each(['旧runPNG', '跨引擎PNG', '损坏PNG', '错误CSS', '错误CSS并修改hash', '缺PNG引用', '报告warning'] as const)('拒绝%s，保留原始诊断', async (mutation) => {
  const { directory, fixture: { raw }, report, refresh } = await prepared()
  if (mutation === '旧runPNG' || mutation === '跨引擎PNG') {
    const fixture = syntheticHistory(mutation === '旧runPNG' ? 'old-run' : raw.runId, mutation === '跨引擎PNG' ? 'firefox' : 'chromium')
    for (const [name, bytes] of fixture.screenshots) {
      await writeFile(path.join(directory, name), bytes)
    }
  }
  if (mutation === '损坏PNG') {
    await writeFile(path.join(directory, `${historyProbe.id}-visited.png`), 'invalid png')
  }
  if (mutation === '错误CSS' || mutation === '错误CSS并修改hash') {
    const css = '.wrong {}'
    await writeFile(path.join(directory, 'generated.css'), css)
    if (mutation === '错误CSS并修改hash') {
      raw.generation!.cssHash = digest(css)
      await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
    }
  }
  if (mutation === '缺PNG引用') {
    report.results[0]!.artifacts = ['generated.css', 'measurements.json']
  }
  if (mutation === '报告warning') {
    report.results[0]!.warnings.push('warning')
  }
  await refresh()
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
  expect(JSON.parse(await readFile(path.join(directory, 'measurements.json'), 'utf8')).runId).toBe(raw.runId)
})

it.each([undefined, '', 'unknown', 'undefined', 'null', 123])('缺少实际浏览器版本%s时不能把字符串强制转换当证据', async (version) => {
  const { directory, report } = await prepared()
  if (version === undefined) {
    Reflect.deleteProperty(report.environment, 'browserVersion')
  }
  else {
    report.environment['browserVersion'] = version
  }
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow(/浏览器版本/)
})
