import { performance } from 'node:perf_hooks'
import { limits } from './constants.mjs'
import { describeFailure } from './failures.mjs'

/** 每次调用只落一份终结 span；未终结调用仍在最后状态中阻断完整性。 */
export function createUniSpanRecorder({ emit, current, failed }) {
  const pending = new Map()
  let started = 0
  let completed = 0
  function measure(name, details, run, asynchronous, preservePromise) {
    if (pending.size >= limits.maxOperationEvents) throw new Error('Uni 未终结 span 超过固定上限')
    const span = { spanId: ++started, name, bundleId: current().id, phase: current().phase, details: { ...details }, startedAtMonotonicMs: performance.now() }
    pending.set(span.spanId, span)
    function finish(outcome, value) {
      const endedAtMonotonicMs = performance.now()
      emit(`${name}.span`, { ...span.details, spanId: span.spanId, startedAtMonotonicMs: span.startedAtMonotonicMs, endedAtMonotonicMs, outcome, ...(outcome === 'failure' ? { error: describeFailure(value) } : {}) }, endedAtMonotonicMs - span.startedAtMonotonicMs)
      pending.delete(span.spanId)
      completed++
      if (outcome === 'failure') throw value
      return value
    }
    function failure(error) {
      try { return finish('failure', error) }
      catch (recordingError) {
        if (recordingError !== error) failed('Uni 原操作失败且 span 写入失败；保留原抛出值')
        throw error
      }
    }
    let result
    try { result = run() }
    catch (error) { return failure(error) }
    if (preservePromise && result instanceof Promise) {
      void result.then(value => finish('success', value), error => {
        try { failure(error) }
        catch { /* 原 Promise 的拒绝保持原样。 */ }
      }).catch(() => failed('Uni Promise 完成 span 写入失败'))
      return result
    }
    return asynchronous ? Promise.resolve(result).then(value => finish('success', value), failure) : finish('success', result)
  }
  return { measure, summary: () => ({ started, completed, pending: [...pending.values()] }) }
}
