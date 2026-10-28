import { AsyncLocalStorage } from 'node:async_hooks'
import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
import { limits } from './constants.mjs'
import { createUniDependencyObserver } from './uni-dependencies.mjs'
import { sha256 } from './evidence.mjs'
import { createUniSpanRecorder } from './uni-spans.mjs'
import { runWithCleanup } from './failures.mjs'

export const uniInputProject = 'demo-uni-app-vite-tailwindcss-v4__mp-weixin'

/** 只在 Uni inputs worker 注册；归档目录属于控制器，不是 bundler 输出。 */
export function createUniInputObserver({ operations, root, phase = () => ({ type: 'unknown' }), dependencies = createUniDependencyObserver({ root }), onBundleSettled }) {
  const storage = new AsyncLocalStorage()
  const bundles = []
  let recordingError
  const spans = createUniSpanRecorder({ emit, current, failed(message) { recordingError = message } })
  function current() {
    const context = storage.getStore()
    if (!context) throw new Error('Uni 观察事件缺少所属 bundle 上下文')
    return context
  }
  function emit(name, details = {}, durationMs) {
    try {
      const context = current()
      return operations.emit(`uni.${name}`, { bundleId: context.id, ...details }, durationMs, undefined, context.phase)
    }
    catch (error) {
      recordingError = 'Uni 观察事件写入失败'
      throw error
    }
  }
  function measured(name, details, run, asynchronous, preservePromise = false) {
    if (name.startsWith('phase.')) return spans.measure(name, details, run, asynchronous, preservePromise)
    const operationId = emit(`${name}.start`, details)
    const started = performance.now()
    function finish(result) {
      emit(`${name}.success`, { operationId }, performance.now() - started)
      return result
    }
    function failure(error) {
      try { emit(`${name}.failure`, { operationId, errorType: typeof error }, performance.now() - started) }
      catch { recordingError = 'Uni 原操作失败且诊断写入失败；保留原抛出值' }
      throw error
    }
    let result
    try { result = run() }
    catch (error) { return failure(error) }
    if (preservePromise && result instanceof Promise) {
      // 旁观已有 Promise，保留原返回身份；观察失败由末尾状态阻断，不覆盖原拒绝值。
      void result.then(finish, error => {
        try { failure(error) }
        catch { /* 原 Promise 的拒绝保持原样。 */ }
      }).catch(() => { recordingError = 'Uni Promise 完成观察写入失败' })
      return result
    }
    return asynchronous ? Promise.resolve(result).then(finish, failure) : finish(result)
  }
  function rawDescriptor(file, output) {
    if (output?.type !== 'asset' && output?.type !== 'chunk') throw new Error('Uni 观察到未知 bundle 产物类型')
    const value = output.type === 'chunk' ? output.code : output.source
    if (typeof value !== 'string' && !(value instanceof Uint8Array)) throw new Error('Uni bundle 输入缺少可归档原文')
    const rawBytes = typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength
    const encodedBytes = typeof value === 'string' ? rawBytes : Math.ceil(rawBytes / 3) * 4
    if (rawBytes > limits.maxProfileBytes || encodedBytes > limits.maxProfileBytes) throw new Error('Uni 原始资产在编码前超过单文件上限')
    return { file, outputType: output.type, value, rawBytes, encodedBytes }
  }
  function rawAsset({ file, outputType, value, rawBytes }) {
    const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    return { file, outputType, encoding: typeof value === 'string' ? 'utf8-string' : 'base64', rawByteSha256: sha256(bytes), rawBytes, content: typeof value === 'string' ? value : bytes.toString('base64') }
  }
  return {
    bundle(run) {
      if (bundles.length >= 64) throw new Error('Uni bundle 数超过固定上限')
      const started = phase()
      const fixedPhase = { ...started, type: started.type === 'watch-ready' ? 'watch-start' : started.type.replace(/-observed$/, '-write') }
      const context = { id: bundles.length + 1, phase: fixedPhase, raw: false, snapshot: false, completed: false, closed: false }
      bundles.push(context)
      return storage.run(context, () => runWithCleanup(() => measured('bundle', {}, async () => {
        try { return await run() }
        finally { context.closed = true }
      }, true), [() => onBundleSettled?.()]))
    },
    phase() { return { ...current().phase } },
    rawBundle(bundle) {
      const entries = Object.entries(bundle)
      if (entries.length > limits.maxSourceEntries) throw new Error('Uni 原始 bundle 资产超过固定上限')
      const pending = []
      let total = 0
      for (const [file, output] of entries) {
        const descriptor = rawDescriptor(file, output)
        total += descriptor.encodedBytes
        if (total > limits.maxTotalBytes) throw new Error('Uni 原始资产在编码前超过会话总量上限')
        pending.push(descriptor)
      }
      emit('bundle.input', { entries: pending.map(rawAsset) })
      current().raw = true
    },
    snapshot(snapshot, flags) {
      if (!Array.isArray(snapshot.entries) || snapshot.entries.length > limits.maxSourceEntries) throw new Error('Uni snapshot 条目缺失或超限')
      const selection = {}
      for (const name of ['processFiles', 'changedByType', 'runtimeAffectingChangedByType', 'linkedImpactsByEntry', 'removedFiles']) {
        if (snapshot[name] === undefined) throw new Error(`Uni snapshot 缺少选择证据：${name}`)
        selection[name] = snapshot[name]
      }
      const entries = snapshot.entries.map(entry => {
        if (typeof entry.source !== 'string') throw new Error('Uni entry 缺少实际处理器输入字符串')
        return { file: entry.file, type: entry.type, outputType: entry.output.type, runtimeCandidate: entry.runtimeCandidate, source: entry.source, sourceSha256: sha256(entry.source), utf8Bytes: Buffer.byteLength(entry.source), utf16Length: entry.source.length }
      })
      emit('snapshot', { flags, hasOmittedKnownFiles: snapshot.hasOmittedKnownFiles, selection, entries })
      current().snapshot = true
    },
    note(name, details) { return emit(name, details) },
    sync(name, details, run) { return measured(name, details, run, false) },
    async(name, details, run) { return measured(name, details, run, true) },
    observe(name, details, run) { return measured(name, details, run, false, true) },
    completed(details) {
      emit('plan.complete', details)
      emit('dependencies', dependencies.snapshot())
      current().completed = true
    },
    finalization(finalizationId) {
      const context = current()
      if (!context.raw || !context.snapshot || !context.completed || context.finalizationId !== undefined) throw new Error('Uni finalization 缺少输入、规划完成或发生重复绑定')
      context.finalizationId = finalizationId
      emit('finalization', { finalizationId })
    },
    summary() {
      return { bundles: bundles.map(item => ({ ...item })), spans: spans.summary(), recordingError, interpretation: '只用于输入诊断；同步归档、SHA、AsyncLocalStorage 和 Promise 计时包装均有观测开销。阶段为重叠墙钟，不能相加当 CPU 成本。' }
    },
  }
}
