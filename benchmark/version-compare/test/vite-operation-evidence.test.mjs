import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { persistCompilationEvidence } from '../scripts/diagnostics/capture.mjs'
import { allocationProject } from '../scripts/diagnostics/constants.mjs'
import { createEvidenceWriter, sha256 } from '../scripts/diagnostics/evidence.mjs'
import { compareOperationInputs, verifyOperationEvidence } from '../scripts/diagnostics/operation-evidence.mjs'
import { createOperationRecorder } from '../scripts/diagnostics/operations.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-operation-evidence-'))
  roots.push(root)
  const writer = createEvidenceWriter(root)
  const phase = { type: 'build-start' }
  const identity = { project: allocationProject, root }
  const recorder = createOperationRecorder({ root, writer, phase: () => phase })
  const file = path.join(root, 'source.css')
  const css = `/* ${root} */\r\n.flex { display: flex; }`
  const store = {
    snapshot: () => ({ candidatesById: [[file, ['flex']]], scanSourceById: [[file, css]], cssSourceById: [[file, css.replaceAll('\r\n', '\n')]] }),
    values: () => new Set(['flex']),
    getRevision: () => 1,
  }
  const source = { css, base: root }
  recorder.sync('native.create', { source }, () => ({}))
  recorder.sync('engine.compile', { source, css }, () => ({}))
  recorder.sync('generator.generate', { source, options: { candidates: store.values() } }, () => {
    recorder.sync('native.generate', { source, request: { candidates: store.values() } }, () => ({ css }))
    recorder.sync('engine.build', { source, candidates: store.values() }, () => css)
    return { css, rawCss: css }
  })
  const collections = { sourceCandidates: store.values() }
  recorder.emit('vite.completed', { finalizationId: 1, selectedForSnapshot: true, collections })
  persistCompilationEvidence({ identity, phase, index: 1, stores: new Map([[1, new WeakRef(store)]]), collections, writer, started: 0, finalizationId: 1, operations: recorder })
  async function status() {
    const files = await fs.readdir(root)
    return { bytesWritten: (await Promise.all(files.map(name => fs.stat(path.join(root, name))))).reduce((sum, stat) => sum + stat.size, 0), filesWritten: files.length, operations: recorder.summary(), snapshotCount: 1, compilationCount: 1, viteCompletedCount: 1 }
  }
  async function patch(name, mutate) {
    const value = JSON.parse(await fs.readFile(path.join(root, name), 'utf8'))
    mutate(value)
    await fs.writeFile(path.join(root, name), JSON.stringify(value))
  }
  async function events() {
    return Promise.all((await fs.readdir(root)).filter(name => /^operation-\d+\.json$/.test(name)).map(async file => ({ file, ...JSON.parse(await fs.readFile(path.join(root, file), 'utf8')) })))
  }
  return { root, store, css, phase, identity, recorder, status, patch, events }
}

it('Vite 完成关联同次来源各层全文，CRLF 和源码中的根文字完整保留', async () => {
  const item = await fixture()
  const result = await verifyOperationEvidence(item.root, await item.status(), item.identity)
  expect(result).toMatchObject({ viteCompleted: 1, snapshotCount: 1, finalizations: [{ file: 'inputs-1.json', finalizationId: 1 }] })
  const snapshot = (await item.events()).find(event => event.name === 'source.snapshot')
  expect(snapshot.details.layers).toHaveLength(2)
  for (const [index, text] of [item.css, item.css.replaceAll('\r\n', '\n')].entries()) {
    const reference = snapshot.details.layers[index].files[0].source.text
    expect(reference.sha256).toBe(sha256(text))
    expect(JSON.parse(await fs.readFile(path.join(item.root, reference.file), 'utf8')).text).toBe(text)
  }
  expect(result.inputFiles).toContain(snapshot.file)
  const controller = details => ({ identity: { root: item.root }, operationEvidence: { inputs: [{ name: 'source.snapshot', phase: item.phase, details }], inputFiles: [snapshot.file] } })
  const before = controller(snapshot.details)
  const changed = structuredClone(snapshot.details)
  changed.storeId = 99
  expect(compareOperationInputs(before, controller(changed)).sameRecordedOperationsAndInputs).toBe(true)
  changed.layers[0].files[0].source.text.sha256 = sha256('different')
  expect(compareOperationInputs(before, controller(changed)).sameRecordedOperationsAndInputs).toBe(false)
})

it.each(['phase', 'stop', 'source', 'extra', 'count', 'generation', 'rawCss', 'duplicate', 'orphan', 'reused', 'source-phase', 'source-identity', 'reference'])('Vite 拒绝损坏关联或缺失逐请求证据：%s', async (kind) => {
  const item = await fixture()
  const events = await item.events()
  let status
  if (['phase', 'stop'].includes(kind)) {
    await item.patch('inputs-1.json', value => value.phase.type = kind === 'stop' ? 'watch-stop' : 'mutation-write')
  }
  if (kind === 'source') {
    await item.patch(events.find(event => event.name === 'source.snapshot').file, value => value.details.layers.pop())
  }
  if (kind === 'orphan') {
    await item.patch('inputs-1.json', value => {
      value.phase.type = 'watch-stop'
      delete value.finalizationId
      delete value.compilationCandidates
    })
    await item.patch(events.find(event => event.name === 'source.snapshot').file, value => value.phase.type = 'watch-stop')
  }
  if (kind === 'reused') {
    await fs.copyFile(path.join(item.root, 'inputs-1.json'), path.join(item.root, 'inputs-2.json'))
    status = { ...await item.status(), snapshotCount: 2 }
  }
  if (kind === 'source-phase' || kind === 'source-identity') {
    await item.patch(events.find(event => event.name === 'source.snapshot').file, value => {
      if (kind === 'source-phase') value.phase.type = 'mutation-write'
      else value.details.storeId = 99
    })
  }
  if (kind === 'reference') {
    await item.patch(events.find(event => event.name === 'source.snapshot').file, value => value.details.layers[0].files[0].source.text.utf16Length++)
  }
  if (kind === 'extra' || kind === 'duplicate') {
    item.recorder.emit('vite.completed', { finalizationId: 2, selectedForSnapshot: kind === 'duplicate', collections: { sourceCandidates: ['flex'] } })
    status = { ...await item.status(), compilationCount: 2, viteCompletedCount: 2 }
    if (kind === 'extra') {
      await expect(verifyOperationEvidence(item.root, status, item.identity)).resolves.toMatchObject({ viteCompleted: 2, snapshotCount: 1 })
      return
    }
  }
  if (kind === 'generation') {
    const event = events.find(event => event.name === 'generator.generate.success')
    await item.patch(event.file, value => value.name = 'generator.generate.failure')
  }
  if (kind === 'rawCss') {
    await item.patch(events.find(event => event.name === 'generator.generate.success').file, value => delete value.details.result.rawCss)
  }
  status ??= await item.status()
  if (kind === 'count') {
    status.viteCompletedCount++
  }
  await expect(verifyOperationEvidence(item.root, status, item.identity)).rejects.toThrow()
})

it('Vite 全文缺失、错误哈希或悬空开始均失败', async () => {
  for (const kind of ['missing', 'hash', 'pending']) {
    const item = await fixture()
    const snapshot = (await item.events()).find(event => event.name === 'source.snapshot')
    if (kind === 'pending') {
      item.recorder.emit('generator.generate.start', { source: { css: item.css }, options: {} })
    }
    else {
      const blob = snapshot.details.layers[0].files[0].source.text.file
      if (kind === 'missing') {
        await fs.unlink(path.join(item.root, blob))
      }
      else {
        await fs.writeFile(path.join(item.root, blob), '{"text":"wrong"}')
      }
    }
    await expect(verifyOperationEvidence(item.root, await item.status(), item.identity)).rejects.toThrow()
  }
})
