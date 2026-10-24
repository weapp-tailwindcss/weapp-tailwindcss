import { performance } from 'node:perf_hooks'
import { limits } from './constants.mjs'
import { rootRelativeKey, sha256 } from './evidence.mjs'

/** 仅诊断副本使用；对象身份由弱映射保存，全文按内容寻址落盘。 */
export function createOperationRecorder({ writer, root, phase }) {
  const identities = new WeakMap()
  const blobs = new Map()
  const totals = new Map()
  let nextIdentity = 0
  let sequence = 0
  let recordingError

  function identity(value) {
    if (!value || !['object', 'function'].includes(typeof value)) {
      return undefined
    }
    if (!identities.has(value)) {
      if (++nextIdentity > limits.maxOperationIdentities) {
        throw new Error('诊断对象身份超过上限')
      }
      identities.set(value, nextIdentity)
    }
    return identities.get(value)
  }

  function text(value) {
    const hash = sha256(value)
    let result = blobs.get(hash)
    if (!result) {
      const file = `text-${hash}.json`
      result = { file, sha256: hash, utf16Length: value.length, receipt: writer.write(file, { sha256: hash, text: value }) }
      blobs.set(hash, result)
    }
    return result
  }

  function serialize(value, key = '', seen = new WeakSet(), depth = 0) {
    if (depth > 32) {
      throw new Error('诊断输入嵌套超过上限')
    }
    if (key === 'candidates' && value !== undefined && !Array.isArray(value) && !(value instanceof Set)) {
      throw new Error('诊断不能完整读取未知候选迭代器')
    }
    if (typeof value === 'string') {
      if (['css', 'rawCss', 'source', 'content'].includes(key)) {
        return { text: text(value) }
      }
      return value
    }
    if (value === undefined || value === null || ['boolean', 'number'].includes(typeof value)) {
      return value
    }
    if (typeof value === 'function') {
      return { opaqueFunction: identity(value), comparableAcrossWorkers: false }
    }
    if (seen.has(value)) {
      return { reference: identity(value), comparableAcrossWorkers: false }
    }
    seen.add(value)
    if (Array.isArray(value) || value instanceof Set || value instanceof Map) {
      if (value.size > limits.maxCandidates || value.length > limits.maxCandidates) {
        throw new Error('诊断集合超过上限')
      }
      return [...value].map(item => serialize(item, key === 'candidates' ? '' : key, seen, depth + 1))
    }
    if (value instanceof RegExp) {
      return { regexp: value.source, flags: value.flags }
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      return { opaqueObject: identity(value), comparableAcrossWorkers: false }
    }
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, serialize(item, name, seen, depth + 1)]))
  }

  function emit(name, details = {}, timing, startedPhase) {
    try {
      if (recordingError) {
        throw new Error(recordingError)
      }
      if (++sequence > limits.maxOperationEvents) {
        throw new Error('诊断操作事件超过上限')
      }
      const started = performance.now()
      const currentPhase = phase()
      const data = serialize(details)
      const totalKey = `${currentPhase.type}:${currentPhase.round ?? ''}:${name}`
      const total = totals.get(totalKey) ?? { phase: currentPhase, name, count: 0, durationMs: 0, maxDurationMs: 0 }
      total.count++
      total.durationMs += timing ?? 0
      total.maxDurationMs = Math.max(total.maxDurationMs, timing ?? 0)
      totals.set(totalKey, total)
      writer.write(`operation-${sequence}.json`, {
        sequence,
        name,
        phase: currentPhase,
        startedPhase,
        atMonotonicMs: performance.now(),
        durationMs: timing,
        details: data,
        observationPreparationMs: performance.now() - started,
      })
      return sequence
    }
    catch (error) {
      recordingError = String(error)
      throw error
    }
  }

  function measured(name, details, run, asynchronous = false) {
    const startedPhase = phase()
    const operationId = emit(`${name}.start`, details)
    const start = performance.now()
    const finish = (result) => {
      const duration = performance.now() - start
      emit(`${name}.success`, { operationId, resultId: identity(result), ...(name.endsWith('.key') ? { key: result } : {}), ...(['generator.generate', 'native.generate', 'service.matches'].includes(name) ? { result } : {}), ...(name === 'engine.build' ? { css: result } : {}) }, duration, startedPhase)
      return result
    }
    const fail = (error) => {
      emit(`${name}.failure`, { operationId, error: String(error) }, performance.now() - start, startedPhase)
      throw error
    }
    try {
      const result = run()
      return asynchronous ? Promise.resolve(result).then(finish, fail) : finish(result)
    }
    catch (error) {
      return fail(error)
    }
  }

  return {
    identity,
    emit,
    sync: (name, details, run) => measured(name, details, run),
    async: (name, details, run) => measured(name, details, run, true),
    observe(name, details, run) {
      const startedPhase = phase()
      const operationId = emit(`${name}.start`, details)
      const start = performance.now()
      const finish = result => emit(`${name}.success`, { operationId, resultId: identity(result) }, performance.now() - start, startedPhase)
      try {
        const result = run()
        if (result && typeof result.then === 'function') {
          // 只旁观既有 Promise，不改变生产返回身份、排空与异常传播。
          void result.then(finish, error => emit(`${name}.failure`, { operationId, error: String(error) }, performance.now() - start, startedPhase)).catch((error) => {
            recordingError = String(error)
          })
        }
        else {
          finish(result)
        }
        return result
      }
      catch (error) {
        emit(`${name}.failure`, { operationId, error: String(error) }, performance.now() - start, startedPhase)
        throw error
      }
    },
    source(file, source) {
      emit('scan.source', { file, comparableFile: rootRelativeKey(file, root), source })
    },
    summary() {
      return { events: sequence, identities: nextIdentity, textFiles: [...blobs.values()], recordingError, totals: [...totals.values()], releaseInterpretation: '仅记录实际调用及返回；不证明 V8 或 Rust 内存已归还。未观测到的关闭事件不推断为成功。' }
    },
  }
}
