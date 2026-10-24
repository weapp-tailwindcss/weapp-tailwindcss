import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { diagnosticSymbol, limits } from './constants.mjs'
import { candidateEvidence, compilationCandidates, createEvidenceWriter, sha256 } from './evidence.mjs'
import { annotateAllocationFrames } from './frames.mjs'

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
  let complete = false
  let recordingError
  let queue = Promise.resolve()
  let lastCommand = 0
  const startedAt = performance.now()
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
      compilationCount: compilationId,
      storeCount: storeId,
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

  async function capture(collections, stop = false) {
    if (recordingError || complete) {
      throw new Error(recordingError ?? '诊断会话已关闭')
    }
    const phase = stage()
    const index = ++compilationId
    const started = performance.now()
    try {
      // 先取 profile，再序列化来源；观测自身分配会进入下一份累计 profile，按诊断栈单独标识。
      const sampling = await sampler?.capture(stop)
      const allocationFrames = sampling ? annotateAllocationFrames(sampling.profile, identity) : undefined
      const profileFile = sampling ? `allocation-${index}.json` : undefined
      const profileReceipt = sampling ? writer.write(profileFile, { identity, phase, index, sampling, allocationFrames }) : undefined
      const sources = []
      for (const [id, reference] of stores) {
        const store = reference.deref()
        if (store) {
          sources.push({ storeId: id, ...candidateEvidence(store, identity.root) })
        }
        else {
          stores.delete(id)
        }
      }
      if (sources.length === 0) {
        throw new Error('没有活动候选 store，拒绝空证据')
      }
      writer.write(`inputs-${index}.json`, {
        identity,
        phase,
        index,
        sources,
        compilationCandidates: collections ? compilationCandidates(collections) : undefined,
        profileFile,
        profileReceipt,
        observationDurationMs: performance.now() - started,
        samplingIncludesPreviousObservationAllocations: Boolean(sampling) && index > 1,
      })
      complete = stop
      writeStatus()
    }
    catch (error) {
      await fail(error)
    }
  }

  globalThis[Symbol.for(diagnosticSymbol)] = {
    registerStore(store) {
      if (++storeId > limits.maxStores) {
        throw new Error('候选 store 数超过诊断上限')
      }
      stores.set(storeId, new WeakRef(store))
    },
    compilation(collections) {
      queue = queue.then(() => capture(collections, identity.kind === 'build'))
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
  writeStatus()
}

await start()
