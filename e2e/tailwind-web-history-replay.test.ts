import type { CapabilityReport } from './tailwind-capabilities/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, expect, it } from 'vitest'
import { digest } from './tailwind-capabilities/identity'
import { receipt, verifyReportArtifacts } from './tailwind-capabilities/report'
import { historyIdentity, historyToken } from './tailwind-capabilities/web-history/fixtures'
import { replayHistory } from './tailwind-capabilities/web-history/replay'
import { deferredHistory, syntheticHistory } from './tailwind-capabilities/web-history/test-fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function prepared(deferred = false) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-history-replay-'))
  directories.push(directory)
  const observedAt = new Date().toISOString()
  const fixture = deferred ? deferredHistory() : syntheticHistory()
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

it('生产重放接受首张旧色后同帧probe与reference达成的完整连续轨迹', async () => {
  const { directory, report } = await prepared(true)
  await expect(verifyReportArtifacts(report, directory)).resolves.toBeUndefined()
})

it.each(['旧三帧协议', '缺轨迹', '丢首帧', '重复帧', '跳号', '乱序', '预算放宽', '超预算成功', '重置时钟', '浏览器时钟回退', '替换文档', '观察中重新请求夹具', '序号碰撞', '旧profile', '缺中间引用', '跨帧PNG', '中间control污染', '首帧已成功仍继续'] as const)('重算receipt也拒绝%s', async (mutation) => {
  const { directory, fixture: { raw, cssHash, runId, engine }, report, refresh } = await prepared(true)
  const state = raw.states[1]!
  const trace = state.observation!
  const first = trace.samples[0]!
  const last = trace.samples[1]!
  if (mutation === '旧三帧协议') {
    Object.assign(raw, { schemaVersion: 2 })
  }
  if (mutation === '缺轨迹') {
    Reflect.deleteProperty(state, 'observation')
  }
  if (mutation === '丢首帧') {
    trace.samples.shift()
  }
  if (mutation === '重复帧') {
    trace.samples.unshift(first)
  }
  if (mutation === '跳号') {
    first.attempt = 2
  }
  if (mutation === '乱序') {
    trace.samples.reverse()
  }
  if (mutation === '预算放宽') {
    trace.budgetMs = 20_000
  }
  if (mutation === '超预算成功') {
    trace.elapsedMs = last.elapsedMs = 2_001
  }
  if (mutation === '重置时钟') {
    last.startedMs = 0
  }
  if (mutation === '浏览器时钟回退') {
    first.frames = [1_000, 1_010]
  }
  if (mutation === '替换文档') {
    Object.assign(first, { timeOrigin: 123 })
  }
  if (mutation === '观察中重新请求夹具') {
    raw.requests.splice(2, 0, { ...raw.requests[0]!, sequence: 7 })
  }
  if (mutation === '序号碰撞') {
    first.sequence = raw.navigation[1]!.sequence
  }
  if (mutation === '旧profile') {
    first.profileId = raw.profiles[1]!.id
  }
  if (mutation === '缺中间引用') {
    report.results[0]!.artifacts = report.results[0]!.artifacts.filter(file => file !== first.screenshot)
  }
  if (mutation === '跨帧PNG') {
    await writeFile(path.join(directory, first.screenshot), await readFile(path.join(directory, last.screenshot)))
  }
  if (mutation === '中间control污染' || mutation === '首帧已成功仍继续') {
    const file = mutation === '中间control污染' ? first.screenshot : last.screenshot
    const png = PNG.sync.read(await readFile(path.join(directory, file)))
    if (mutation === '中间control污染') {
      png.data.set([18, 52, 86, 255], (68 * png.width + 104) * 4)
    }
    else {
      historyIdentity(runId, historyToken('visited', 1), cssHash, engine, first.profileId)
        .forEach((color, i) => png.data.set([...color, 255], (162 * png.width + 24 + i * 4 + 2) * 4))
    }
    await writeFile(path.join(directory, first.screenshot), PNG.sync.write(png))
  }
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  await refresh()
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
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
    await writeFile(path.join(directory, raw.states[1]!.screenshot), 'invalid png')
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
