import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { createEvidenceWriter, isOperationEvidenceFilename, terminalReceiptBytes } from '../scripts/diagnostics/evidence.mjs'
import { verifyOperationEvidence } from '../scripts/diagnostics/operation-evidence.mjs'
import { createOperationRecorder } from '../scripts/diagnostics/operations.mjs'
import { operationTerminalReceipt } from '../scripts/diagnostics/operation-terminal.mjs'
import { createWorkerEvidence } from '../scripts/diagnostics/worker-evidence.mjs'

const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'operation-terminal-'))
  roots.push(root)
  const writer = createEvidenceWriter(root)
  let failureState
  const recorder = createOperationRecorder({ writer, root, phase: () => ({ type: 'mutation-write', round: 3, sequence: 11 }), onFailure() { failureState = recorder.summary() } })
  return { root, writer, recorder, state: () => failureState }
}

it('4097首次超限现场落盘且不被后续错误覆盖，回执计入原字节预算', async () => {
  const f = await fixture()
  for (let index = 0; index < limits.maxOperationEvents; index++) f.recorder.emit('fixture.actual')
  const details = { bundleId: 6, file: 'pages/home.wxss', sourceModule: 'css-entry-transform.ts' }
  expect(() => f.recorder.emit('uni.phase.css-decision.signature.span', details)).toThrow('超过上限')
  const file = path.join(f.root, 'operation-terminal.json')
  const first = await fs.readFile(file)
  expect(first.length).toBeLessThanOrEqual(terminalReceiptBytes)
  expect(JSON.parse(first)).toMatchObject({ complete: false, attempt: { sequence: 4097, name: { prefix: 'uni.phase.css-decision.signature.span' }, phase: { type: { prefix: 'mutation-write' }, round: 3 }, bundleId: 6, file: { prefix: 'pages/home.wxss' } }, recordingFailure: { message: { prefix: '诊断操作事件超过上限' } } })
  expect(f.state().terminalReceipt.attempt.sequence).toBe(4097)
  expect(() => f.recorder.emit('later')).toThrow('超过上限')
  expect(await fs.readFile(file)).toEqual(first)
  const files = (await fs.readdir(f.root)).filter(isOperationEvidenceFilename)
  const bytes = (await Promise.all(files.map(name => fs.stat(path.join(f.root, name)).then(stat => stat.size)))).reduce((a, b) => a + b, 0)
  expect(f.writer.accounting()).toEqual({ bytesWritten: bytes, filesWritten: 4097 })
  await expect(verifyOperationEvidence(f.root, { operations: f.recorder.summary(), ...f.writer.accounting() })).rejects.toThrow('首败回执')
})

it.each([false, new Error('original operation failed')])('原操作%s与记录超限同时失败，原值与两项错误现场保留', async (original) => {
  const f = await fixture()
  for (let index = 0; index < limits.maxOperationEvents - 1; index++) f.recorder.emit('fixture.actual')
  let thrown
  let failed = false
  try { f.recorder.sync('fixture.leaf', { bundleId: 6, file: 'pages/home.js' }, () => { throw original }) }
  catch (error) { thrown = error; failed = true }
  expect(failed).toBe(true)
  expect(thrown).toBe(original)
  let caught
  try { f.recorder.sync('never-entered', {}, () => 1) }
  catch (error) { caught = error }
  expect(caught.message).toContain('超过上限')
  const receipt = JSON.parse(await fs.readFile(path.join(f.root, 'operation-terminal.json')))
  expect(receipt.attempt.name.prefix).toBe('fixture.leaf.failure')
  expect(receipt.attempt.file.prefix).toBe('pages/home.js')
  expect(receipt.originalFailure.message.prefix).toBe(original instanceof Error ? original.message : 'false')
})

it('固定回执的大字段明确缩写并保留SHA，不能突破4096字节', () => {
  const value = '中文'.repeat(10000)
  const receipt = operationTerminalReceipt({ sequence: 4097, name: value, phase: { type: value, round: value }, details: { file: value, sourceModule: value, bundleId: value, error: new Error(value) }, error: new Error(value) })
  expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThanOrEqual(terminalReceiptBytes)
  expect(receipt.attempt.file).toMatchObject({ abbreviated: true, bytes: Buffer.byteLength(value), sha256: expect.stringMatching(/^[a-f\d]{64}$/) })
})

it('原64MiB内的4096字节预留在普通输出已满时仍可保存首败回执', async () => {
  const f = await fixture()
  const overhead = Buffer.byteLength(`${JSON.stringify({ padding: '' })}\n`)
  for (let index = 0; index < 4; index++) {
    const target = limits.maxProfileBytes - (index === 3 ? terminalReceiptBytes : 0)
    f.writer.write(`fixture-large-${index}.json`, { padding: 'x'.repeat(target - overhead) })
  }
  expect(f.writer.accounting().bytesWritten).toBe(limits.maxTotalBytes - terminalReceiptBytes)
  expect(() => f.recorder.emit('fixture.byte-limit', { file: 'asset.wxss', bundleId: 7 })).toThrow('超过固定上限')
  const raw = await fs.readFile(path.join(f.root, 'operation-terminal.json'))
  expect(raw.length).toBeLessThanOrEqual(terminalReceiptBytes)
  expect(f.writer.accounting().bytesWritten).toBe(limits.maxTotalBytes - terminalReceiptBytes + raw.length)
  expect(f.writer.accounting().bytesWritten).toBeLessThanOrEqual(limits.maxTotalBytes)
})

it('worker总量读取实际工件，早期status低报不能减少计费', async () => {
  const f = await fixture()
  f.recorder.emit('fixture', { source: 'actual bytes' })
  const expected = f.writer.accounting().bytesWritten
  await createWorkerEvidence(f.root).finish({ failed: false }, { failures: [] }, { bytesWritten: 1 })
  const report = JSON.parse(await fs.readFile(path.join(f.root, 'worker-result.json')))
  expect(report.operationAccounting).toEqual({ actualBytes: expected, statusBytes: 1, consistent: false })
})
