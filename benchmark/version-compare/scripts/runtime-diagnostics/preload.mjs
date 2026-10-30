import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { constants, performance, PerformanceObserver } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { workerModuleNames } from './binding.mjs'
import { readRuntimeControlFile } from './bounded-file.mjs'
import { createInspectorObserver } from './inspector-observer.mjs'
import { createModuleObserver, sourcePackages } from './module-observer.mjs'
import { createWorkerEvidence, describeFailure, failureText, jsonBytes, limits } from './worker-evidence.mjs'
import { verifyRuntimeWorkerIdentity } from './worker-identity.mjs'

const helperFiles = workerModuleNames
const samePath = (left, right) => path.isAbsolute(left) && path.isAbsolute(right) && path.relative(left, right) === ''
async function start() {
  const expected = process.env.WEAPP_TW_BENCH_RUNTIME_EXPECTED_ENTRY
  const serialized = process.env.WEAPP_TW_BENCH_RUNTIME_SESSION
  if (!expected || !serialized || !process.argv[1]) {
    return
  }
  // wrapper、pnpm 和其他后代不创建 inspector、定时器或证据文件。
  const actualEntry = fs.realpathSync(process.argv[1])
  if (!samePath(actualEntry, fs.realpathSync(expected))) {
    return
  }
  if (Buffer.byteLength(serialized) > 96 * 1024) {
    throw new Error('运行时诊断序列化身份超限')
  }
  const identity = JSON.parse(serialized)
  const root = fs.realpathSync(identity.root)
  const directory = fs.realpathSync(identity.sessionDirectory)
  const writer = createWorkerEvidence(directory)
  const snapshots = []
  let firstFailure
  const failures = []
  let phase = {
    type: 'worker-start',
  }
  let inspector
  let modules
  let gcObserver
  let timer
  let queue = Promise.resolve()
  let lastSequence = 0
  let pendingSequence = 0
  let complete = false
  let stopped = false
  let gcEvents = 0
  const moduleHashes = {}
  function fail(error) {
    const text = failureText(error)
    firstFailure ??= text
    failures.push(describeFailure(error))
    try {
      status()
    }
    catch (statusError) {
      process.stderr.write(`[benchmark-runtime] 状态写入失败：${failureText(statusError)}\n`)
    }
  }
  function status() {
    writer.json('status.json', {
      pid: process.pid,
      actualEntry,
      complete,
      firstFailure,
      failures,
      moduleHashes,
      snapshots,
      eventFiles: writer.eventFiles(),
      phase,
      parameters: inspector?.parameters,
      inspector: inspector?.summary(),
      modules: modules?.summary(),
      gcEvents,
      diagnosticOnly: true,
      budgetAcceptance: false,
      accounting: writer.accounting(),
    }, true)
  }
  function recordGc(entries) {
    if (!entries.length || stopped) {
      return
    }
    if (gcEvents + entries.length > limits.maxEvents) {
      throw new Error('自然 GC 事件数超过固定上限')
    }
    gcEvents += entries.length
    writer.append('gc.ndjson', {
      type: 'natural-gc-batch',
      phase,
      atEpochMs: Date.now(),
      atMonotonicMs: performance.now(),
      events: entries.map(entry => ({
        startTime: entry.startTime,
        startEpochMs: performance.timeOrigin + entry.startTime,
        durationMs: entry.duration,
        kind: entry.detail.kind,
        flags: entry.detail.flags,
      })),
      majorCallbackMemory: entries.some(entry => entry.detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR)
        ? {
            ...process.memoryUsage(),
            samplePoint: 'PerformanceObserver callback，非 GC 结束瞬间',
          }
        : undefined,
      interpretation: '未主动请求 GC；没有事件不证明未发生 GC',
    })
  }
  async function close() {
    if (stopped) {
      return
    }
    const failures = []
    try {
      if (gcObserver) {
        recordGc(gcObserver.takeRecords())
      }
    }
    catch (error) {
      failures.push(error)
    }
    gcObserver?.disconnect()
    try {
      await inspector?.close()
    }
    catch (error) {
      failures.push(error)
    }
    try {
      modules?.stop()
    }
    catch (error) {
      failures.push(error)
    }
    stopped = true
    clearInterval(timer)
    if (failures.length) {
      throw new AggregateError(failures, '运行时诊断关闭失败')
    }
  }
  async function capture(command) {
    if (firstFailure || complete || stopped) {
      throw new Error(firstFailure ?? '运行时诊断已关闭')
    }
    if (!Number.isSafeInteger(command.sequence) || command.sequence <= lastSequence || !['capture', 'stop'].includes(command.type) || typeof command.phase?.type !== 'string') {
      throw new Error('运行时诊断命令无效')
    }
    lastSequence = command.sequence
    phase = command.phase
    const index = snapshots.length + 1
    if (index > limits.maxSnapshots || command.type === 'stop' !== (index === limits.maxSnapshots)) {
      throw new Error('运行时诊断阶段数量或停止次序无效')
    }
    const startedAtEpochMs = Date.now()
    const before = process.memoryUsage()
    const profile = await inspector.capture(command.type === 'stop')
    const document = {
      schemaVersion: 1,
      pid: process.pid,
      sequence: command.sequence,
      phase,
      sampling: {
        parameters: inspector.parameters,
        sampledAllocatedBytesIncludingCollected: true,
        profile,
      },
      startedAtEpochMs,
      completedAtEpochMs: Date.now(),
      before,
      after: process.memoryUsage(),
      interpretation: '包含已回收对象的累计统计分配，非存活堆/RSS；诊断序列化和模块源码观测影响后续样本，不用于正式预算',
      phaseScope: '收到的 controller 输出观测 checkpoint 窗口，非精确业务操作或 finalizer',
    }
    const uncompressedBytes = jsonBytes(document)
    const compressed = gzipSync(Buffer.from(JSON.stringify(document)), {
      maxOutputLength: limits.maxFileBytes,
    })
    const file = `profile-${index}.json.gz`
    const receipt = {
      ...writer.write(file, compressed),
      uncompressedBytes,
      encoding: 'gzip-json',
    }
    snapshots.push({
      sequence: command.sequence,
      phase,
      file,
      receipt,
    })
    if (command.type === 'stop') {
      await close()
      if (firstFailure) {
        throw new Error(firstFailure)
      }
      complete = true
    }
    status()
    writer.json('reply.json', {
      sequence: command.sequence,
      complete: true,
      stopped: complete,
    }, true)
  }
  process.once('exit', () => {
    if (!complete) {
      fail(new Error('业务进程退出时运行时诊断尚未完成；不把缺失 stop 当成功'))
    }
    try {
      status()
      writer.close()
    }
    catch (error) {
      process.stderr.write(`[benchmark-runtime] 退出证据失败：${failureText(error)}\n`)
    }
  })
  try {
    const { bindingReceipt, manifestSha256, entrySha256 } = verifyRuntimeWorkerIdentity({ identity, root, actualEntry, moduleHashes, helperFiles, preloadUrl: import.meta.url })
    writer.json('process-start.json', {
      pid: process.pid,
      actualEntry,
      entrySha256,
      manifestSha256,
      moduleHashes,
      bindingReceipt,
      identity,
      nodeVersion: process.version,
      execPath: fs.realpathSync(process.execPath),
      preloadPath: fileURLToPath(import.meta.url),
      parameters: {
        samplingInterval: limits.samplingInterval,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      },
      limits,
      atEpochMs: Date.now(),
      sourcePackages,
      sourceScope: 'Node load 与 Debugger 源码仅限准备根内声明目标包的各物理实例，最多 512 份/32MiB；其他脚本保留解析/加载元数据并标记 scope-out，虚拟或不存在文件明确 unknown；sourceMapURL 仅保留声明，未读取或应用映射',
      phaseScope: '模块与 GC 使用最后收到的 controller checkpoint phase，非精确业务操作',
      interpretation: 'node.resolve/node.load/V8 parsed 各为不同证据层；均不单独证明模块求值或函数执行；不建立候选 store 或业务 finalizer 关系',
    })
    modules = createModuleObserver({
      writer,
      root,
      phase: () => phase,
      onFailure: fail,
    })
    inspector = await createInspectorObserver({
      root,
      modules,
      onFailure: fail,
    })
    gcObserver = new PerformanceObserver((list) => {
      try {
        recordGc(list.getEntries())
      }
      catch (error) {
        fail(error)
      }
    })
    gcObserver.observe({
      entryTypes: ['gc'],
    })
    // 空事件文件仍有首条身份记录；零 GC 事件不会被误认为文件缺失。
    writer.append('gc.ndjson', {
      type: 'observer-start',
      atEpochMs: Date.now(),
      interpretation: '仅自然 GC 通知；回调缺失不证明没有 GC',
    })
    status()
    timer = setInterval(() => {
      let command
      try {
        const file = path.join(directory, 'command.json')
        if (!fs.existsSync(file)) {
          return
        }
        command = JSON.parse(readRuntimeControlFile(file).toString('utf8'))
        if (command.sequence <= lastSequence) {
          return
        }
        // 同步领取序号，避免异步采样期间重复入队同一命令。
        const sequence = command.sequence
        if (pendingSequence === sequence) {
          return
        }
        pendingSequence = sequence
      }
      catch (error) {
        fail(error)
        clearInterval(timer)
        queue = queue.then(close).catch(fail)
        return
      }
      queue = queue.then(() => capture(command)).catch(async (error) => {
        fail(error)
        try {
          await close()
        }
        catch (cleanupError) {
          fail(cleanupError)
        }
        try {
          status()
          writer.json('reply.json', {
            sequence: command.sequence,
            complete: false,
            error: firstFailure,
          }, true)
        }
        catch (replyError) {
          process.stderr.write(`[benchmark-runtime] 错误回执失败：${failureText(replyError)}\n`)
        }
      })
    }, 20)
    timer.unref()
  }
  catch (error) {
    fail(error)
    try {
      await close()
    }
    catch (cleanupError) {
      fail(cleanupError)
    }
    status()
    throw error
  }
}
await start()
