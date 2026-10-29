import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { constants, performance, PerformanceObserver } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isMainThread } from 'node:worker_threads'
import { sameFilesystemPath } from '../../gc-paths.mjs'

const maxEvents = 2048
const maxBatchEvents = 256
const maxBytes = 2 * 1024 * 1024

function start() {
  if (!isMainThread) return
  const expectedEntry = process.env.WEAPP_TW_BENCH_GC_EXPECTED_ENTRY
  const session = process.env.WEAPP_TW_BENCH_GC_SESSION
  if (!expectedEntry || !session || !process.argv[1]) {
    return
  }
  let actualEntry
  try {
    actualEntry = fs.realpathSync(process.argv[1])
    if (!sameFilesystemPath(actualEntry, fs.realpathSync(expectedEntry))) {
      return
    }
  }
  catch {
    return
  }
  const identity = JSON.parse(session)
  const preloadPath = fileURLToPath(import.meta.url)
  const preloadSha256 = createHash('sha256').update(fs.readFileSync(preloadPath)).digest('hex')
  const pathHelperSha256 = createHash('sha256').update(fs.readFileSync(fileURLToPath(new URL('../../gc-paths.mjs', import.meta.url)))).digest('hex')
  const fd = fs.openSync(path.join(identity.sessionDirectory, `gc-${process.pid}.ndjson`), 'wx')
  const counts = { batchesObserved: 0, eventsObserved: 0, eventsRecorded: 0, eventsTruncated: 0, major: 0, minor: 0, other: 0 }
  const costs = { dataWrites: 0, dataWriteMsTotal: 0, dataWriteMsMax: 0, accountingWriteMsTotal: 0, bytesWritten: 0 }
  let observationStopped = false
  let recordingFailed = false

  function write(record, accounting = false) {
    const payload = Buffer.from(`${JSON.stringify(record)}\n`)
    if (costs.bytesWritten + payload.length > maxBytes) {
      throw new Error('GC diagnostic byte limit reached')
    }
    const start = performance.now()
    let offset = 0
    while (offset < payload.length) {
      const written = fs.writeSync(fd, payload, offset, payload.length - offset)
      if (written === 0) {
        throw new Error('GC diagnostic write made no progress')
      }
      offset += written
      costs.bytesWritten += written
    }
    const duration = performance.now() - start
    if (accounting) {
      costs.accountingWriteMsTotal += duration
    }
    else {
      costs.dataWrites += 1
      costs.dataWriteMsTotal += duration
      costs.dataWriteMsMax = Math.max(costs.dataWriteMsMax, duration)
    }
  }

  try {
    write({
      type: 'process-start',
      protocol: 'compiler-ab-gc-v1',
      schemaVersion: 1,
      identity,
      pid: process.pid,
      ppid: process.ppid,
      timeOrigin: performance.timeOrigin,
      atEpochMs: Date.now(),
      actualEntry,
      execPath: fs.realpathSync(process.execPath),
      nodeVersion: process.version,
      preloadPath,
      preloadSha256,
      pathHelperSha256,
      preloadMatchesController: preloadSha256 === identity.expectedPreloadSha256,
      pathHelperMatchesController: pathHelperSha256 === identity.expectedPathHelperSha256,
      limits: { maxEvents, maxBatchEvents, maxBytes },
    })
  }
  catch (error) {
    fs.closeSync(fd)
    throw error
  }

  function consume(entries) {
    if (!entries.length) return
    const callbackAtMonotonicMs = performance.now()
    const callbackAtEpochMs = performance.timeOrigin + callbackAtMonotonicMs
    counts.batchesObserved += 1
    counts.eventsObserved += entries.length
    let hasMajor = false
    for (const entry of entries) {
      if (entry.detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR) {
        counts.major += 1
        hasMajor = true
      }
      else if (entry.detail.kind === constants.NODE_PERFORMANCE_GC_MINOR) {
        counts.minor += 1
      }
      else {
        counts.other += 1
      }
    }
    const retained = entries.slice(0, Math.min(maxBatchEvents, maxEvents - counts.eventsRecorded)).map(entry => ({
      startTime: entry.startTime,
      startEpochMs: performance.timeOrigin + entry.startTime,
      durationMs: entry.duration,
      kind: entry.detail.kind,
      flags: entry.detail.flags,
    }))
    const record = {
      type: 'gc-batch',
      callbackAtMonotonicMs,
      callbackAtEpochMs,
      events: retained,
      // major 内存为 observer 回调时的快照，不能解释为 GC 刚结束时的内存。
      majorCallbackMemory: hasMajor ? { atEpochMs: Date.now(), samplePoint: 'observer-callback', ...process.memoryUsage() } : undefined,
    }
    if (costs.bytesWritten + Buffer.byteLength(JSON.stringify(record)) + 2048 > maxBytes) {
      record.events = []
      record.majorCallbackMemory = undefined
      observationStopped = true
    }
    counts.eventsRecorded += record.events.length
    counts.eventsTruncated += entries.length - record.events.length
    observationStopped ||= counts.eventsRecorded >= maxEvents
    write(record)
    write({
      type: 'accounting',
      atEpochMs: Date.now(),
      counts,
      costs,
      observationStopped,
      // 当前 accounting 写入耗时无法包含自身，只包含先前 accounting 写入。
      accountingCostExcludesCurrentRecord: true,
      complete: false,
    }, true)
    if (observationStopped) observer.disconnect()
  }

  function failed(error) {
    recordingFailed = true
    observationStopped = true
    observer.disconnect()
    try {
      write({ type: 'recording-error', atEpochMs: Date.now(), counts, costs, error: error instanceof Error ? error.message : String(error) })
    }
    catch {}
    process.stderr.write(`[benchmark-gc] 诊断写入失败：${error instanceof Error ? error.message : String(error)}\n`)
  }

  const observer = new PerformanceObserver((list) => {
    try { consume(list.getEntries()) }
    catch (error) { failed(error) }
  })
  observer.observe({ entryTypes: ['gc'] })
  process.once('exit', (exitCode) => {
    try {
      if (!recordingFailed && !observationStopped) consume(observer.takeRecords())
      observer.disconnect()
      // 只结算结束前 observer 收到的事件，不声称覆盖 VM 或其它线程。
      write({
        type: 'process-exit', schemaVersion: 1, identity,
        pid: process.pid, ppid: process.ppid, timeOrigin: performance.timeOrigin,
        actualEntry, execPath: fs.realpathSync(process.execPath), nodeVersion: process.version,
        preloadSha256, pathHelperSha256, atEpochMs: Date.now(), exitCode,
        counts, costs, observationStopped,
        complete: exitCode === 0 && !recordingFailed && !observationStopped && counts.eventsTruncated === 0,
        completenessScope: 'main-process-observer-received',
        accountingCostExcludesCurrentRecord: true,
      }, true)
    }
    catch (error) { failed(error) }
    finally {
      try { fs.closeSync(fd) }
      catch (error) { failed(error) }
    }
  })
}

try {
  start()
}
catch (error) {
  process.stderr.write(`[benchmark-gc] 诊断未启用：${error instanceof Error ? error.message : String(error)}\n`)
}
