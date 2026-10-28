import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { persistCompilationEvidence } from './capture.mjs'
import { diagnosticSymbol, limits, mpxProject } from './constants.mjs'
import { createEvidenceWriter, sha256 } from './evidence.mjs'
import { createOperationRecorder } from './operations.mjs'
import { createViteTailObserver, viteTailProject } from './vite-tail-observer.mjs'
import { createUniInputObserver, uniInputProject } from './uni-observer.mjs'

async function start() {
  const serialized = process.env.WEAPP_TW_BENCH_ALLOCATION_SESSION
  const expectedEntry = process.env.WEAPP_TW_BENCH_GC_EXPECTED_ENTRY
  if (!serialized || !expectedEntry || !process.argv[1]) {
    return
  }
  if (fs.realpathSync(process.argv[1]) !== fs.realpathSync(expectedEntry)) {
    return
  }
  const identity = JSON.parse(serialized)
  const writer = createEvidenceWriter(identity.sessionDirectory)
  const preloadPath = fileURLToPath(import.meta.url)
  const moduleHashes = Object.fromEntries(Object.keys(identity.moduleHashes).map((name) => {
    if (path.basename(name) !== name) {
      throw new Error('诊断模块路径超出会话目录')
    }
    return [name, sha256(fs.readFileSync(path.join(identity.sessionDirectory, name)))]
  }))
  if (Object.entries(moduleHashes).some(([name, hash]) => hash !== identity.moduleHashes[name])) {
    throw new Error('分配诊断模块哈希与控制器不一致')
  }
  const stores = new Map()
  let storeId = 0
  let compilationId = 0
  let webpackCreatedCount = 0
  let webpackCompletedCount = 0
  let viteCompletedCount = 0
  const webpackPhases = new WeakMap()
  const capturedPhases = new Set()
  let complete = false
  let recordingError
  let queue = Promise.resolve()
  let lastCommand = 0
  const frameReceipts = []
  const startedAt = performance.now()
  const operations = createOperationRecorder({ writer, root: identity.root, phase: stage })
  const uniInput = identity.project === uniInputProject && identity.mode === 'inputs' ? createUniInputObserver({ operations, root: identity.root, phase: stage }) : undefined
  const viteTail = identity.project === viteTailProject && identity.kind === 'build' ? createViteTailObserver({ operations }) : undefined
  const sampler = identity.mode === 'allocation' ? await (await import('./sampling.mjs')).createAllocationSampler() : undefined
  writer.write('process-start.json', {
    identity,
    pid: process.pid,
    nodeVersion: process.version,
    executable: fs.realpathSync(process.execPath),
    actualEntry: fs.realpathSync(process.argv[1]),
    preloadSha256: sha256(fs.readFileSync(preloadPath)),
    moduleHashes,
    mode: identity.mode,
    parameters: sampler?.parameters,
    limits,
    startedAtEpochMs: Date.now(),
    interpretation: sampler ? '包含已回收对象的统计分配采样，不是存活堆或 RSS，不用于正式门禁' : '仅采集输入证据，不启用 inspector，不用于正式门禁',
  })

  function stage() {
    return JSON.parse(fs.readFileSync(path.join(identity.sessionDirectory, 'stage.json'), 'utf8'))
  }

  function writeStatus() {
    fs.writeFileSync(path.join(identity.sessionDirectory, 'status.json'), JSON.stringify({
      identity,
      pid: process.pid,
      complete,
      recordingError,
      compilationCount: identity.project === mpxProject ? webpackCreatedCount : viteCompletedCount,
      snapshotCount: compilationId,
      ...(identity.project === mpxProject ? { webpackCreatedCount, webpackCompletedCount } : { viteCompletedCount }),
      operations: operations.summary(),
      ...(uniInput ? { uniInput: uniInput.summary() } : {}),
      storeCount: storeId,
      frameReceipts,
      ...(viteTail ? { viteTail: viteTail.summary() } : {}),
      elapsedMs: performance.now() - startedAt,
      ...writer.accounting(),
    }))
  }

  async function fail(error) {
    recordingError = error instanceof Error ? error.message : String(error)
    try {
      await sampler?.close()
    }
    finally {
      writeStatus()
    }
    throw error
  }

  async function capture(collections, stop = false, completedPhase, rootCompilationId, finalizationId) {
    if (recordingError || complete) {
      throw new Error(recordingError ?? '诊断会话已关闭')
    }
    const phase = completedPhase ?? stage()
    const index = ++compilationId
    if (index > limits.maxSnapshots) {
      return fail(new Error('诊断阶段快照超过上限'))
    }
    const started = performance.now()
    try {
      // 先取 profile，再序列化来源；观测自身分配会进入下一份累计 profile，按诊断栈单独标识。
      viteTail?.point('snapshot.before')
      const sampling = await sampler?.capture(stop)
      const frames = persistCompilationEvidence({ identity, phase, index, sampling, stores, collections, writer, started, compilationId: rootCompilationId, finalizationId, operations })
      if (frames) {
        frameReceipts.push(frames)
      }
      complete = stop
      viteTail?.point('snapshot.after')
      writeStatus()
    }
    catch (error) {
      await fail(error)
    }
  }

  globalThis[Symbol.for(diagnosticSymbol)] = {
    operations,
    ...(uniInput ? { uniInput } : {}),
    viteTail,
    webpackCreated(compilation) {
      if (!operations || webpackPhases.has(compilation)) {
        throw new Error('Webpack compilation 身份缺失或重复')
      }
      const current = stage()
      const type = current.type === 'watch-ready' ? 'watch-start' : current.type.replace(/-observed$/, '-write')
      const isChild = compilation.compiler?.isChild?.() ?? false
      const id = operations.identity(compilation)
      webpackPhases.set(compilation, { phase: { ...current, type }, isChild, id })
      webpackCreatedCount++
      operations.emit('webpack.created', { compilationId: id, isChild })
    },
    webpackCompleted(compilation, collections) {
      const recorded = webpackPhases.get(compilation)
      if (!operations || !recorded) {
        throw new Error('Webpack 完成缺少创建事件')
      }
      webpackPhases.delete(compilation)
      webpackCompletedCount++
      const { phase, isChild, id } = recorded
      const key = `${phase.type}:${phase.round ?? ''}`
      const selectedForSnapshot = !isChild && !capturedPhases.has(key)
      operations.emit('webpack.completed', { compilationId: id, isChild, selectedForSnapshot, collections, startedPhase: phase })
      if (!selectedForSnapshot) {
        return queue
      }
      capturedPhases.add(key)
      queue = queue.then(() => capture(collections, identity.kind === 'build', phase, id))
      return queue
    },
    registerStore(store) {
      if (++storeId > limits.maxStores) {
        throw new Error('候选 store 数超过诊断上限')
      }
      stores.set(storeId, new WeakRef(store))
    },
    compilation(collections) {
      const current = uniInput?.phase() ?? stage()
      const phase = { ...current, type: current.type === 'watch-ready' ? 'watch-start' : current.type.replace(/-observed$/, '-write') }
      const key = `${phase.type}:${phase.round ?? ''}`
      const id = ++viteCompletedCount
      uniInput?.finalization(id)
      const selectedForSnapshot = phase.type !== 'watch-stop' && !capturedPhases.has(key)
      viteTail?.point('main-finalizer')
      operations.emit('vite.completed', { finalizationId: id, selectedForSnapshot, collections }, undefined, undefined, phase)
      if (!selectedForSnapshot) {
        return queue
      }
      capturedPhases.add(key)
      queue = queue.then(() => capture(collections, identity.kind === 'build', phase, undefined, id))
      return queue
    },
  }

  // 仅诊断控制器在结束 watch 前请求 stopSampling，不改变业务信号处理或生产关闭顺序。
  const timer = setInterval(() => {
    const commandPath = path.join(identity.sessionDirectory, 'command.json')
    if (!fs.existsSync(commandPath)) {
      return
    }
    let command
    try {
      command = JSON.parse(fs.readFileSync(commandPath, 'utf8'))
    }
    catch {
      return
    }
    if (command.sequence <= lastCommand || command.type !== 'stop') {
      return
    }
    lastCommand = command.sequence
    queue = queue.then(() => capture(undefined, true)).then(() => {
      fs.writeFileSync(path.join(identity.sessionDirectory, 'reply.json'), JSON.stringify({ sequence: command.sequence, complete }))
      clearInterval(timer)
    }).catch((error) => {
      fs.writeFileSync(path.join(identity.sessionDirectory, 'reply.json'), JSON.stringify({ sequence: command.sequence, error: String(error) }))
      clearInterval(timer)
    })
  }, 20)
  timer.unref()
  if (operations) {
    // 不添加信号处理或业务关闭；exit 只写最后实际观测状态，强制终止仍可能缺证。
    process.once('exit', () => {
      try {
        writeStatus()
      }
      catch (error) {
        process.stderr.write(`操作诊断末尾状态写入失败：${String(error)}\n`)
      }
    })
  }
  writeStatus()
}

await start()
