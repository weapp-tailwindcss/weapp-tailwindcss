import type { CapabilityReport } from './tailwind-capabilities/types'
import type { NativeMediaSidecar } from './tailwind-capabilities/web-native-media/types'
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { filesystemObservedAt } from './tailwind-capabilities/artifact-clock'
import { digest } from './tailwind-capabilities/identity'
import { receipt, verifyReportArtifacts } from './tailwind-capabilities/report'
import { nativeMediaProbe } from './tailwind-capabilities/web-native-media/fixtures'
import { replayNativeMedia } from './tailwind-capabilities/web-native-media/replay'
import { syntheticMedia } from './tailwind-capabilities/web-native-media/test-fixture'

const directories: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function prepared() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'native-media-replay-'))
  directories.push(directory)
  const observedAt = filesystemObservedAt(directory)
  const { observation, screenshots, runId } = syntheticMedia()
  const css = '/* 合成数据只验证重放门禁 */'
  const raw: NativeMediaSidecar = { schemaVersion: 2, id: `runtime/${nativeMediaProbe.id}`, runId, engine: 'chromium', browserVersion: 'unit-browser', observation, warnings: [], generation: { candidates: [nativeMediaProbe.candidate], cssHash: digest(css) } }
  await writeFile(path.join(directory, 'generated.css'), css)
  for (const [name, bytes] of screenshots) {
    await writeFile(path.join(directory, name), bytes)
  }
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  const result = await replayNativeMedia(directory, runId, 'unit-browser')
  const files = ['generated.css', ...screenshots.keys(), 'measurements.json']
  const hash = '0'.repeat(64)
  const report: CapabilityReport = { schemaVersion: 2, runId, observedAt, target: 'web-chromium', environment: { browserVersion: 'unit-browser' }, identity: { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { unit: '1' } }, results: [{ id: raw.id, status: 'passed', support: 'supported', assertions: result.assertions, warnings: [], artifacts: files }], artifacts: [] }
  async function refresh() {
    report.artifacts = await Promise.all(files.map(file => receipt(path.join(directory, file), directory, runId, [raw.id], file.endsWith('.png') ? 'screenshot' : file.endsWith('.css') ? 'css' : 'measurements')))
  }
  await refresh()
  return { directory, raw, report, refresh }
}

it('统一产物门禁从磁盘重放完整sidecar、CSS、PNG', async () => {
  const { report, directory } = await prepared()
  await expect(verifyReportArtifacts(report, directory)).resolves.toBeUndefined()
})

it.each(['css', 'screenshot', 'measurements'] as const)('Date 超前时本轮重放通过，旧 %s 仍被拒绝', async (kind) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 60_000)
  const { report, directory } = await prepared()
  await expect(verifyReportArtifacts(report, directory)).resolves.toBeUndefined()
  const artifact = report.artifacts.find(item => item.kind === kind)!
  const old = new Date(Date.parse(report.observedAt) - 60_000)
  await utimes(path.join(directory, artifact.path), old, old)
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow('早于本轮')
})

it.each(['媒体不变', '缺恢复', '旧run', '缺cleanup', 'console错误'] as const)('sidecar改为%s且更新hash后，旧passed依然被拒绝', async (mutation) => {
  const { report, directory, raw, refresh } = await prepared()
  if (mutation === '媒体不变') {
    raw.observation.states[1]!.queries['less'] = false
  }
  if (mutation === '缺恢复') {
    raw.observation.states.pop()
  }
  if (mutation === '旧run') {
    raw.runId = 'old'
  }
  if (mutation === '缺cleanup') {
    Reflect.deleteProperty(raw.observation, 'cleanup')
  }
  if (mutation === 'console错误') {
    raw.warnings.push('error')
  }
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  await refresh()
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it('旧run同阶段PNG重建hash仍不能通过本轮可见身份', async () => {
  const { report, directory, refresh } = await prepared()
  for (const [file, bytes] of syntheticMedia('old-run').screenshots) {
    await writeFile(path.join(directory, file), bytes)
  }
  await refresh()
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow(/重放/)
})

it.each(['损坏PNG', '错误CSS', '缺PNG引用', '错误浏览器'] as const)('拒绝%s并保留磁盘原始证据', async (mutation) => {
  const { report, directory, refresh } = await prepared()
  if (mutation === '损坏PNG') {
    await writeFile(path.join(directory, `${nativeMediaProbe.id}-less.png`), 'invalid png')
  }
  if (mutation === '错误CSS') {
    await writeFile(path.join(directory, 'generated.css'), '.wrong {}')
  }
  if (mutation === '缺PNG引用') {
    report.results[0]!.artifacts = ['generated.css', 'measurements.json']
  }
  if (mutation === '错误浏览器') {
    report.target = 'web-firefox'
  }
  await refresh()
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
  expect(JSON.parse(await readFile(path.join(directory, 'measurements.json'), 'utf8')).runId).toBe(report.runId)
})

it('替换CSS并重建sidecar hash/receipt后仍不能复用旧PNG', async () => {
  const { report, directory, raw, refresh } = await prepared()
  const css = '.wrong { background: red }'
  await writeFile(path.join(directory, 'generated.css'), css)
  raw.generation!.cssHash = digest(css)
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  await refresh()
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow(/重放/)
})

it.each(['错误协议响应', 'cleanup非数组', '候选非数组'] as const)('拒绝%s的sidecar结构伪装', async (mutation) => {
  const { report, directory, raw, refresh } = await prepared()
  if (mutation === '错误协议响应') {
    raw.observation.states[0]!.command.response = { error: { code: -1, message: 'failed' } }
  }
  if (mutation === 'cleanup非数组') {
    Object.assign(raw.observation.cleanup, { errors: { length: 0 } })
  }
  if (mutation === '候选非数组') {
    Object.assign(raw.generation!, { candidates: nativeMediaProbe.candidate })
  }
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  await refresh()
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it('报告新增warning却保留passed也被统一重放拒绝', async () => {
  const { report, directory } = await prepared()
  report.results[0]!.warnings.push('console error')
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow(/重放/)
})
