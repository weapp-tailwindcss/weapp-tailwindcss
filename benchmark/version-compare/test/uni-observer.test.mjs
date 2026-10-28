import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createEvidenceWriter } from '../scripts/diagnostics/evidence.mjs'
import { createOperationRecorder } from '../scripts/diagnostics/operations.mjs'
import { compareOperationInputs } from '../scripts/diagnostics/operation-evidence.mjs'
import { verifyUniInputEvidence } from '../scripts/diagnostics/uni-evidence.mjs'
import { createUniInputObserver } from '../scripts/diagnostics/uni-observer.mjs'

const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uni-input-observer-'))
  roots.push(directory)
  const writer = createEvidenceWriter(directory)
  const operations = createOperationRecorder({ writer, root: directory, phase: () => ({ type: 'mutation-write', round: 2 }) })
  const observer = createUniInputObserver({ operations, root: directory, phase: () => ({ type: 'mutation-write', round: 2 }), dependencies: { snapshot: () => ({ loaded: [], resolved: [], missingEvidence: [{ reason: 'ESM 注册表未知' }] }) } })
  return { directory, writer, operations, observer }
}
function snapshot(asset) {
  return { entries: [{ file: 'a.wxss', type: 'css', output: asset, source: '.中文{color:red}' }], processFiles: { html: new Set(), css: new Set(['a.wxss']), js: new Set() }, changedByType: { html: new Set(), css: new Set(['a.wxss']), js: new Set() }, runtimeAffectingChangedByType: { html: new Set(), css: new Set(), js: new Set() }, linkedImpactsByEntry: new Map([['a.wxss', new Set(['b.wxss'])]]), removedFiles: new Set(), hasOmittedKnownFiles: true }
}
async function eventsAt(directory) {
  const names = (await fs.readdir(directory)).filter(name => /^operation-\d+\.json$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  return Promise.all(names.map(name => fs.readFile(path.join(directory, name), 'utf8').then(JSON.parse)))
}
async function complete(f, id) {
  f.observer.completed({ metrics: { css: { total: 1, cacheHits: 0, transformed: 1 } }, timingDetails: { 'entries.plan': 5, tasks: 2 } })
  f.observer.finalization(id)
  f.operations.emit('vite.completed', { finalizationId: id }, undefined, undefined, f.observer.phase())
}

it('原始二进制字节、处理器 Unicode 文本与选择集合留存，后续改写不污染输入', async () => {
  const f = await fixture()
  await f.observer.bundle(async () => {
    const binary = { type: 'asset', source: Uint8Array.from([0, 255, 13, 10]) }
    const asset = { type: 'asset', source: '.中文{color:red}' }
    f.observer.rawBundle({ 'x.bin': binary, 'a.wxss': asset })
    f.observer.snapshot(snapshot(asset), { useIncrementalMode: true })
    binary.source[1] = 0
    asset.source = 'later'
    await f.observer.async('phase.css', { file: 'a.wxss' }, async () => undefined)
    await complete(f, 1)
  })
  const events = await eventsAt(f.directory)
  const result = await verifyUniInputEvidence(f.directory, f.observer.summary(), events)
  expect(result.bundles).toBe(1)
  expect(result.missingEvidence).toHaveLength(1)
  const raw = events.find(event => event.name === 'uni.bundle.input').details.entries[0]
  const archived = JSON.parse(await fs.readFile(path.join(f.directory, raw.content.text.file), 'utf8')).text
  expect(Buffer.from(archived, 'base64')).toEqual(Buffer.from([0, 255, 13, 10]))
  const stored = events.find(event => event.name === 'uni.snapshot').details.entries[0]
  expect(JSON.parse(await fs.readFile(path.join(f.directory, stored.source.text.file), 'utf8')).text).toBe('.中文{color:red}')
  raw.rawByteSha256 = '0'.repeat(64)
  await expect(verifyUniInputEvidence(f.directory, f.observer.summary(), events)).rejects.toThrow('字节 SHA')
})

it('两个同名资产的并行 bundle/异步任务保留独立归属，Promise 旁观保留身份', async () => {
  const f = await fixture()
  let unblock
  const wait = new Promise(resolve => { unblock = resolve })
  const first = f.observer.bundle(async () => {
    const asset = { type: 'asset', source: 'first' }
    f.observer.rawBundle({ 'same.js': asset })
    f.observer.snapshot(snapshot(asset), {})
    const task = Promise.resolve('same')
    expect(f.observer.observe('phase.identity', { file: 'same.js' }, () => task)).toBe(task)
    await wait
    f.observer.note('cache', { file: 'same.js', state: 'local-hit' })
    await complete(f, 1)
  })
  const second = f.observer.bundle(async () => {
    const asset = { type: 'asset', source: 'second' }
    f.observer.rawBundle({ 'same.js': asset })
    f.observer.snapshot(snapshot(asset), {})
    await Promise.resolve()
    f.observer.note('cache', { file: 'same.js', state: 'transform-entered' })
    await complete(f, 2)
    unblock()
  })
  await Promise.all([first, second])
  const events = await eventsAt(f.directory)
  await expect(verifyUniInputEvidence(f.directory, f.observer.summary(), events)).resolves.toMatchObject({ bundles: 2, cacheStates: { 'local-hit': 1, 'transform-entered': 1 } })
  expect(events.filter(event => event.name === 'uni.cache').map(event => [event.details.bundleId, event.details.state])).toEqual([[2, 'transform-entered'], [1, 'local-hit']])
})

it('缺失 begin/end、选择理由、阶段成本或 finalization 均阻断', async () => {
  const f = await fixture()
  await f.observer.bundle(async () => {
    const asset = { type: 'asset', source: 'source' }
    f.observer.rawBundle({ 'a.wxss': asset })
    f.observer.snapshot(snapshot(asset), {})
    await complete(f, 1)
  })
  const events = await eventsAt(f.directory)
  for (const name of ['uni.bundle.input', 'uni.snapshot', 'uni.plan.complete', 'uni.finalization', 'uni.bundle.success', 'uni.dependencies']) {
    await expect(verifyUniInputEvidence(f.directory, f.observer.summary(), events.filter(event => event.name !== name))).rejects.toThrow('唯一证据')
  }
  const broken = structuredClone(events)
  delete broken.find(event => event.name === 'uni.snapshot').details.selection.processFiles
  await expect(verifyUniInputEvidence(f.directory, f.observer.summary(), broken)).rejects.toThrow('选择证据')
  const missingLayer = structuredClone(events)
  const begin = missingLayer.find(event => event.name === 'uni.snapshot')
  missingLayer.push({ sequence: begin.sequence + 0.5, name: 'uni.phase.runtime.processViteCssBundleEntry.start', phase: begin.phase, details: { bundleId: 1, file: 'a.wxss' } })
  await expect(verifyUniInputEvidence(f.directory, f.observer.summary(), missingLayer)).rejects.toThrow('处理层缺证')
  delete events.find(event => event.name === 'uni.plan.complete').details.timingDetails.tasks
  await expect(verifyUniInputEvidence(f.directory, f.observer.summary(), events)).rejects.toThrow('阶段成本')
})

it.each([false, undefined, 0, null])('原操作抛出 %s 且 writer 失败时保留原抛出值并标记缺证', async (thrown) => {
  let writes = 0
  const observer = createUniInputObserver({ root: '.', operations: { emit() { if (++writes > 1) throw new Error('writer limit'); return writes } } })
  await expect(observer.bundle(async () => { throw thrown })).rejects.toBe(thrown)
  expect(observer.summary().recordingError).toContain('保留原抛出值')
})

it('缺少 bundle 或未知原始资产不允许静默跳过', async () => {
  const f = await fixture()
  expect(() => f.observer.note('cache', {})).toThrow('上下文')
  await expect(f.observer.bundle(async () => f.observer.rawBundle({ unknown: { type: 'unknown' } }))).rejects.toThrow('未知')
})


it('bundle 开始阶段固定，依赖观察期间 controller 切 rollback 不会错归后续事件', async () => {
  const f = await fixture()
  let phase = { type: 'mutation-write', round: 1 }
  const observer = createUniInputObserver({ root: f.directory, operations: f.operations, phase: () => phase, dependencies: { snapshot() { phase = { type: 'rollback-write', round: 1 }; return { loaded: [], resolved: [], missingEvidence: [] } } } })
  f.observer = observer
  await observer.bundle(async () => {
    const asset = { type: 'asset', source: 'before' }
    observer.rawBundle({ 'a.wxss': asset })
    observer.snapshot(snapshot(asset), {})
    await complete(f, 1)
  })
  expect(phase.type).toBe('rollback-write')
  const events = await eventsAt(f.directory)
  expect(events.every(event => event.phase.type === 'mutation-write' && event.phase.round === 1)).toBe(true)
  await expect(verifyUniInputEvidence(f.directory, observer.summary(), events)).resolves.toMatchObject({ bundles: 1 })
})

it('原始资产在二进制编码和 Buffer 拷贝前执行固定预算', async () => {
  const f = await fixture()
  const value = new Uint8Array(1)
  Object.defineProperty(value, 'byteLength', { value: 17 * 1024 * 1024 })
  Object.defineProperty(value, 'buffer', { get() { throw new Error('不应读取底层 buffer') } })
  await expect(f.observer.bundle(async () => f.observer.rawBundle({ big: { type: 'asset', source: value } }))).rejects.toThrow('编码前')
})


it.each([
  ['posix', '/base', '/current', '/base/src/entry.css', '/current/src/entry.css'],
  ['win32', 'C:\\base', 'D:\\current', 'C:\\base\\src\\entry.css', 'D:\\current\\src\\entry.css'],
])('Uni 结构化来源路径在 %s 跨根比较，内容 SHA 与相对 module id 保持原值', (platform, baseRoot, currentRoot, beforeFile, afterFile) => {
  function controller(root, file, hash) {
    return { identity: { root, platform }, operationEvidence: { inputFiles: ['operation-1.json'], inputs: [{ name: 'uni.plan', phase: { type: 'mutation-write', round: 1 }, details: { file: 'pages/index.js', plan: { sourceFile: file, outputFile: 'pages/index.wxss', rawSource: { text: { sha256: hash } } } } }] } }
  }
  expect(compareOperationInputs(controller(baseRoot, beforeFile, 'same'), controller(currentRoot, afterFile, 'same')).sameRecordedOperationsAndInputs).toBe(true)
  expect(compareOperationInputs(controller(baseRoot, beforeFile, 'before'), controller(currentRoot, afterFile, 'after')).sameRecordedOperationsAndInputs).toBe(false)
})
