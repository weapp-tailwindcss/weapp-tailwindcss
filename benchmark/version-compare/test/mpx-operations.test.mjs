import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { createEvidenceWriter, sha256 } from '../scripts/diagnostics/evidence.mjs'
import { createOperationRecorder } from '../scripts/diagnostics/operations.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

function memoryRecorder() {
  const records = []
  const recorder = createOperationRecorder({ root: '/project', phase: () => ({ type: 'mutation-write', round: 3 }), writer: { write(name, value) {
    records.push({ name, value })
    return { sha256: sha256(JSON.stringify(value)) }
  } } })
  return { recorder, records }
}

describe('Mpx 有界操作与全文证据', () => {
  it('同步返回、Promise 身份、同步抛错和拒绝保持，开始/完成通过操作 ID 对应', async () => {
    const { recorder, records } = memoryRecorder()
    const object = {}
    expect(recorder.observe('create', {}, () => object)).toBe(object)
    let complete
    const pending = new Promise((resolve) => {
      complete = resolve
    })
    expect(recorder.observe('dispose', {}, () => pending)).toBe(pending)
    expect(records.filter(item => item.value.name === 'dispose.success')).toHaveLength(0)
    complete()
    await pending
    await Promise.resolve()
    expect(records.find(item => item.value.name === 'dispose.success').value.details.operationId).toBe(records.find(item => item.value.name === 'dispose.start').value.sequence)
    const error = new Error('释放失败')
    expect(() => recorder.observe('throw', {}, () => {
      throw error
    })).toThrow(error)
    const rejected = Promise.reject(error)
    expect(recorder.observe('reject', {}, () => rejected)).toBe(rejected)
    await expect(rejected).rejects.toBe(error)
    await Promise.resolve()
    expect(records.find(item => item.value.name === 'reject.failure').value.details.error).toContain('释放失败')
  })

  it('来源不重新读取，原始字节内容去重存储，路径只在独立字段归一化', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpx-operations-'))
    roots.push(root)
    const writer = createEvidenceWriter(root)
    const recorder = createOperationRecorder({ root, writer, phase: () => ({ type: 'mutation-write', round: 3 }) })
    const source = `中文\r\n${root}\n.flex{color:red}`
    const missingFile = path.join(root, 'never-created.mpx')
    recorder.source(missingFile, source)
    recorder.source(missingFile, source)
    const summary = recorder.summary()
    expect(summary.textFiles).toHaveLength(1)
    expect(summary.textFiles[0].sha256).toBe(sha256(source))
    expect(JSON.parse(await fs.readFile(path.join(root, summary.textFiles[0].file), 'utf8')).text).toBe(source)
    const first = JSON.parse(await fs.readFile(path.join(root, 'operation-1.json'), 'utf8'))
    expect(first.details).toMatchObject({ file: missingFile, comparableFile: '<root>/never-created.mpx' })
    await expect(fs.access(missingFile)).rejects.toThrow()
  })

  it('操作事件、身份和候选集合超限均失败，不返回截断的完整证据', () => {
    const first = memoryRecorder()
    for (let index = 0; index < limits.maxOperationEvents; index++) {
      first.recorder.emit('event')
    }
    expect(() => first.recorder.emit('event')).toThrow('上限')
    expect(first.recorder.summary().recordingError).toContain('上限')
    const second = memoryRecorder()
    for (let index = 0; index < limits.maxOperationIdentities; index++) {
      second.recorder.identity({})
    }
    expect(() => second.recorder.identity({})).toThrow('身份超过上限')
    const third = memoryRecorder()
    expect(() => third.recorder.emit('request', { candidates: Array.from({ length: limits.maxCandidates + 1 }).fill('flex') })).toThrow('集合超过上限')
  })

  it('六段计时记录实际执行次数、结果 key，观测序列化不进入调用耗时', () => {
    const { recorder, records } = memoryRecorder()
    for (const name of ['matches.key', 'acquire.key', 'request.key', 'acquire.sourceSnapshot', 'request.snapshot', 'result.copy']) {
      expect(recorder.sync(name, {}, () => 'result')).toBe('result')
      const event = records.find(item => item.value.name === `${name}.success`).value
      expect(event.durationMs).toBeGreaterThanOrEqual(0)
      expect(event.observationPreparationMs).toBeGreaterThanOrEqual(0)
      if (name.endsWith('.key')) {
        expect(event.details.key).toBe('result')
      }
    }
    expect(recorder.summary().totals.filter(total => total.name.endsWith('.success'))).toHaveLength(6)
  })

  it('重复引用和闭包只能描述进程内身份，未知候选迭代器不额外消费', () => {
    const { recorder, records } = memoryRecorder()
    const object = {}
    recorder.emit('input', { first: object, second: object, callback: () => {} })
    expect(records[0].value.details.second).toMatchObject({ comparableAcrossWorkers: false })
    expect(records[0].value.details.callback).toMatchObject({ comparableAcrossWorkers: false })
    let consumed = false
    function* candidates() {
      consumed = true
      yield 'flex'
    }
    expect(() => recorder.emit('input', { candidates: candidates() })).toThrow('未知候选迭代器')
    expect(consumed).toBe(false)
  })
})
