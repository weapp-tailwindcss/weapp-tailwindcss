import assert from 'node:assert/strict'
import fs from 'node:fs'
import { constants } from 'node:perf_hooks'
import process from 'node:process'

function unavailable(cause) {
  if (cause.code === 'ERR_COMPILER_AB_GC_UNAVAILABLE') return cause
  const error = new Error(`GC evidence unavailable：${cause.message}`, { cause })
  error.code = 'ERR_COMPILER_AB_GC_UNAVAILABLE'
  return error
}

function validateCounts(counts, events, batches) {
  const major = events.filter(event => event.kind === constants.NODE_PERFORMANCE_GC_MAJOR).length
  const minor = events.filter(event => event.kind === constants.NODE_PERFORMANCE_GC_MINOR).length
  assert.deepEqual(counts, {
    batchesObserved: batches, eventsObserved: events.length, eventsRecorded: events.length,
    eventsTruncated: 0, major, minor, other: events.length - major - minor,
  }, 'GC 逐事件计数不守恒')
}

function validateCosts(costs, previous = {}) {
  assert.deepEqual(Object.keys(costs).sort(), ['accountingWriteMsTotal', 'bytesWritten', 'dataWriteMsMax', 'dataWriteMsTotal', 'dataWrites'])
  for (const [name, value] of Object.entries(costs)) {
    assert.ok(Number.isFinite(value) && value >= 0 && value >= (previous[name] ?? 0), `GC 开销无效或倒退：${name}`)
  }
  assert.ok(Number.isInteger(costs.bytesWritten) && Number.isInteger(costs.dataWrites))
}

/** 读取错误、缺失文件或部分尾行也统一进入不可用回执。 */
export function readGcEvidence(file, options) {
  try {
    const content = fs.readFileSync(file, 'utf8')
    assert.ok(content.endsWith('\n'), 'GC 观测尾行不完整')
    return validateGcEvidence(content.trimEnd().split('\n').map(line => JSON.parse(line)), options)
  }
  catch (cause) { throw unavailable(cause) }
}

/** 仅确认本进程 observer 在结束前收到的事件，不代表 VM 或其它线程的全部 GC。 */
export function validateGcEvidence(records, { pid, identity, actualEntry, stderr = '' }) {
  try {
    assert.ok(!stderr.includes('[benchmark-gc]'), 'GC preload 报告启动或写入错误')
    const start = records[0]
    const exit = records.at(-1)
    assert.equal(start?.type, 'process-start', '缺少 GC 起始身份')
    assert.equal(start.protocol, 'compiler-ab-gc-v1')
    assert.equal(start.schemaVersion, 1)
    assert.ok(Number.isInteger(pid) && pid > 0)
    assert.equal(start.pid, pid, 'GC 起始 PID 不匹配')
    assert.deepEqual(start.identity, identity, 'GC session 不匹配')
    assert.equal(start.actualEntry, actualEntry)
    assert.equal(start.preloadSha256, identity.expectedPreloadSha256)
    assert.equal(start.pathHelperSha256, identity.expectedPathHelperSha256)
    assert.equal(start.preloadMatchesController, true)
    assert.equal(start.pathHelperMatchesController, true)
    assert.equal(start.execPath, fs.realpathSync(process.execPath))
    assert.equal(start.nodeVersion, process.version)
    assert.equal(exit?.type, 'process-exit', '缺少 GC 正常结束回执')
    assert.equal(exit.schemaVersion, 1)
    for (const key of ['pid', 'ppid', 'identity', 'timeOrigin', 'actualEntry', 'execPath', 'nodeVersion', 'preloadSha256', 'pathHelperSha256']) {
      assert.deepEqual(exit[key], start[key], `GC 起止身份不一致：${key}`)
    }
    assert.equal(exit.exitCode, 0)
    assert.equal(exit.complete, true, 'GC observer 收到的事件没有完整结算')
    assert.equal(exit.completenessScope, 'main-process-observer-received')
    assert.ok(Number.isFinite(start.atEpochMs) && exit.atEpochMs >= start.atEpochMs)
    assert.ok(!records.some(item => item.type === 'recording-error' || item.counts?.eventsTruncated > 0 || item.observationStopped), 'GC 证据超限或停止')
    assert.deepEqual(start.limits, { maxEvents: 2048, maxBatchEvents: 256, maxBytes: 2 * 1024 * 1024 })
    const events = []
    let batches = 0
    let costs
    for (let index = 1; index < records.length - 1; index += 2) {
      const batch = records[index]
      const accounting = records[index + 1]
      assert.equal(batch.type, 'gc-batch', 'GC 事件顺序无效')
      assert.equal(accounting?.type, 'accounting', 'GC batch 缺少 accounting')
      assert.ok(Array.isArray(batch.events) && batch.events.length > 0 && batch.events.length <= start.limits.maxBatchEvents)
      for (const event of batch.events) {
        for (const key of ['startTime', 'startEpochMs', 'durationMs', 'kind', 'flags']) assert.ok(Number.isFinite(event[key]) && event[key] >= 0, `GC 事件字段无效：${key}`)
      }
      events.push(...batch.events)
      batches += 1
      validateCounts(accounting.counts, events, batches)
      validateCosts(accounting.costs, costs)
      costs = accounting.costs
    }
    assert.ok(events.length < start.limits.maxEvents)
    validateCounts(exit.counts, events, batches)
    validateCosts(exit.costs, costs)
    assert.equal(exit.costs.dataWrites, 1 + batches)
    assert.ok(exit.costs.bytesWritten > 0 && exit.costs.bytesWritten < start.limits.maxBytes)
    return { available: true, pid, events: events.length, completenessScope: exit.completenessScope, counts: exit.counts, costs: exit.costs }
  }
  catch (cause) {
    throw unavailable(cause)
  }
}
