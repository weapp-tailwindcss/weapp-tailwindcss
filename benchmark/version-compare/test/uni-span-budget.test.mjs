import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { createEvidenceWriter } from '../scripts/diagnostics/evidence.mjs'
import { createOperationRecorder } from '../scripts/diagnostics/operations.mjs'
import { verifyUniInputEvidence } from '../scripts/diagnostics/uni-evidence.mjs'
import { createUniInputObserver } from '../scripts/diagnostics/uni-observer.mjs'

const shape = JSON.parse(await fs.readFile(new URL('./fixtures/uni-diagnostics/operation-shape.json', import.meta.url)))
const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })

function detailsFor(row) {
  const details = { ...shape.shapes[row[1]] }
  // 保留实际资产、分支与调用形状；其余原字段按编码尺寸保守填充，不伪装真实源码。
  details.fixturePadding = '\n'.repeat(row[2])
  return details
}

it('真实37首轮/22后续资产与七bundle形状包含全部generic、cache、plan和关闭尾部，保留固定预算余量', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uni-span-budget-'))
  roots.push(directory)
  let phase = { type: 'watch-start' }
  const writer = createEvidenceWriter(directory)
  const operations = createOperationRecorder({ writer, root: directory, phase: () => phase })
  const observer = createUniInputObserver({ operations, root: directory, phase: () => phase, dependencies: { snapshot: () => ({ loaded: [], resolved: [], missingEvidence: [] }) } })
  const genericIds = new Map()
  const recordedAssetCounts = []
  const genericCounts = {}
  let referenceEncodedBytes = 0
  let expectedSpans = 0
  function generic(row, bundleId) {
    const name = shape.names[row[0]]
    const details = detailsFor(row)
    if (name === 'vite.completed') details.finalizationId = bundleId
    if (/\.(?:success|failure)$/.test(name)) details.operationId = genericIds.get(row[3])
    const id = operations.emit(name, details)
    if (name.endsWith('.start')) genericIds.set(row[3], id)
    genericCounts[name] = (genericCounts[name] ?? 0) + 1
  }
  for (const [index, fixtureIndex] of shape.provenance.workloadBundleIndexes.entries()) {
    const fixture = shape.bundles[fixtureIndex]
    referenceEncodedBytes += fixture.referenceEncodedBytes
    recordedAssetCounts.push(fixture.assets.length)
    phase = index === 0 ? { type: 'watch-start' } : { type: index % 2 ? 'mutation-write' : 'rollback-write', round: Math.ceil(index / 2) }
    await observer.bundle(async () => {
      const assets = Object.fromEntries(fixture.assets.map(asset => {
        const source = asset.file + '\n'.repeat(Math.max(0, asset.rawBytes - asset.file.length))
        return [asset.file, asset.outputType === 'chunk' ? { type: 'chunk', code: source } : { type: 'asset', source }]
      }))
      const pending = new Map()
      for (const row of fixture.rows) {
        const name = shape.names[row[0]]
        if (!name.startsWith('uni.')) { generic(row, index + 1); continue }
        if (['uni.bundle.start', 'uni.bundle.success', 'uni.dependencies'].includes(name)) continue
        if (name === 'uni.bundle.input') { observer.rawBundle(assets); continue }
        if (name === 'uni.snapshot') {
          const sets = () => Object.fromEntries(['html', 'js', 'css'].map(type => [type, new Set(fixture.assets.filter(asset => asset.type === type).map(asset => asset.file))]))
          observer.snapshot({ entries: fixture.assets.map(asset => ({ ...asset, output: assets[asset.file], source: assets[asset.file].code ?? assets[asset.file].source })), processFiles: sets(), changedByType: sets(), runtimeAffectingChangedByType: sets(), linkedImpactsByEntry: new Map(), removedFiles: new Set() }, fixture.flags)
          continue
        }
        if (name.startsWith('uni.phase.') && name.endsWith('.start')) {
          let resolve
          const promise = new Promise(done => { resolve = done })
          observer.observe(name.slice(4, -6), detailsFor(row), () => promise)
          pending.set(row[3], resolve)
          expectedSpans++
          continue
        }
        if (name.startsWith('uni.phase.') && name.endsWith('.success')) {
          expect(pending.has(row[3])).toBe(true)
          pending.get(row[3])()
          pending.delete(row[3])
          await Promise.resolve()
          continue
        }
        if (name === 'uni.plan.complete') observer.completed({ ...detailsFor(row), timingDetails: { 'entries.plan': 1, tasks: 1 } })
        else if (name === 'uni.finalization') observer.finalization(index + 1)
        else observer.note(name.slice(4), detailsFor(row))
      }
      expect(pending.size).toBe(0)
    })
  }
  for (const row of shape.shutdownTail) generic(row, 7)
  // 首败存储量按各完整bundle分别计全文，重复内容也保守重复计入，保证不是小文本fixture。
  const reserve = Math.max(0, referenceEncodedBytes - writer.accounting().bytesWritten)
  operations.source('fixture-reference-encoded-byte-reserve', '\n'.repeat(Math.ceil(reserve / 2)))
  const summary = operations.summary()
  expect(recordedAssetCounts).toEqual([37, 22, 22, 22, 22, 22, 22])
  expect(summary.events).toBe(3748)
  expect(limits.maxOperationEvents - summary.events).toBe(348)
  expect(observer.summary().spans).toEqual({ started: expectedSpans, completed: expectedSpans, pending: [] })
  expect(expectedSpans).toBe(1347)
  expect(genericCounts['engine.build.start']).toBeGreaterThan(0)
  expect(genericCounts['source.snapshot']).toBe(7)
  expect(genericCounts['service.release.success']).toBeGreaterThan(0)
  const files = await fs.readdir(directory)
  const sizes = await Promise.all(files.map(file => fs.stat(path.join(directory, file)).then(stat => stat.size)))
  expect(Math.max(...sizes)).toBeLessThan(limits.maxProfileBytes)
  expect(writer.accounting().bytesWritten).toBeGreaterThanOrEqual(referenceEncodedBytes)
  expect(limits.maxTotalBytes - writer.accounting().bytesWritten).toBeGreaterThan(32 * 1024 * 1024)
  console.info('Uni diagnostic fixture budget', { events: summary.events, eventMargin: limits.maxOperationEvents - summary.events, bytes: writer.accounting().bytesWritten, byteMargin: limits.maxTotalBytes - writer.accounting().bytesWritten, largestFile: Math.max(...sizes) })
  const events = await Promise.all(files.filter(file => /^operation-\d+\.json$/.test(file)).map(file => fs.readFile(path.join(directory, file), 'utf8').then(JSON.parse)))
  const verified = await verifyUniInputEvidence(directory, observer.summary(), events)
  expect(verified.bundles).toBe(7)
  expect(verified.phaseCosts).toHaveLength(expectedSpans)
  const fourth = events.filter(event => event.details.bundleId === 4 && event.name === 'uni.cache')
  expect(fourth.filter(event => event.details.sourceModule.endsWith('transform-scheduling.ts') && event.details.state === 'local-hit')).toHaveLength(5)
  expect(fourth.filter(event => event.details.sourceModule.endsWith('transform-scheduling.ts') && event.details.state === 'transform-entered')).toHaveLength(2)
  for (let index = summary.events; index < limits.maxOperationEvents; index++) operations.emit('fixture.actual-extra-event')
  expect(() => operations.emit('fixture.over-limit')).toThrow('超过上限')
  expect(operations.summary().recordingError).toContain('超过上限')
}, 30000)
