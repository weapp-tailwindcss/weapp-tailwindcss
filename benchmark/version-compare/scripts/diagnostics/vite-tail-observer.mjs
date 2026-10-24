import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

export const viteTailProject = 'demo-taro-vite-react-tailwindcss-v4__mp-weixin'
const maximumEvents = 64
const maximumAssets = 4096
const phases = new Set(['css-finalizer', 'rollup-write', 'rollup-writeBundle', 'vite-reporter', 'rollup-close'])
const required = ['configuration', 'main-finalizer', 'snapshot.before', 'snapshot.after', 'css-finalizer.begin', 'css-finalizer.end', 'rollup-write.begin', 'rollup-write.end', 'rollup-writeBundle.begin', 'vite-reporter.begin', 'vite-reporter.end', 'rollup-writeBundle.end', 'rollup-close.begin', 'rollup-close.end']

function bundleStatistics(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return 'unknown'
  }
  const statistics = { assets: 0, chunks: 0, assetUtf8Bytes: 0, chunkUtf8Bytes: 0, maps: 0, unknownSources: 0, cssAssets: 'unknown', cssUtf8Bytes: 'unknown', mapSerializedBytes: 'unknown', styleHandlerCalls: 'unknown' }
  let count = 0
  for (const key in bundle) {
    if (!Object.hasOwn(bundle, key)) {
      continue
    }
    if (++count > maximumAssets) {
      throw new Error('尾部诊断资产数超过固定上限')
    }
    const asset = bundle[key]
    if (asset?.type === 'chunk') {
      statistics.chunks++
      statistics.chunkUtf8Bytes += typeof asset.code === 'string' ? Buffer.byteLength(asset.code) : 0
      statistics.maps += asset.map ? 1 : 0
    }
    else if (asset?.type === 'asset') {
      statistics.assets++
      const bytes = typeof asset.source === 'string' ? Buffer.byteLength(asset.source) : asset.source instanceof Uint8Array ? asset.source.byteLength : undefined
      if (bytes === undefined) {
        statistics.unknownSources++
      }
      else {
        statistics.assetUtf8Bytes += bytes
      }
    }
    else {
      throw new Error('尾部诊断遇到未知 Rollup 资产类型')
    }
  }
  return statistics
}

/** 后段只记录数值；不持有 bundle、CSS、handler 或宿主上下文。 */
export function createViteTailObserver({ operations }) {
  const events = []
  const pending = new Map()
  let token = 0
  let recordingError
  function record(phase, details = {}) {
    try {
      if (recordingError || events.length >= maximumEvents) {
        throw new Error(recordingError ?? '尾部诊断事件超过固定上限')
      }
      const atEpochMs = Date.now()
      const atMonotonicMs = performance.now()
      const memory = process.memoryUsage()
      const started = performance.now()
      const data = { ...details, ...(Object.hasOwn(details, 'bundle') ? { bundle: bundleStatistics(details.bundle) } : {}) }
      const sequence = operations.emit('vite.tail.phase', { phase, atEpochMs, atMonotonicMs, memory, ...data, observationPreparationMs: performance.now() - started })
      events.push({ phase, sequence })
    }
    catch (error) {
      recordingError = `尾部诊断记录失败（抛出类型：${typeof error}）`
      throw error
    }
  }
  return {
    configuration(config) {
      const value = name => config.build?.[name] ?? 'unknown'
      record('configuration', { configuration: { command: config.command ?? 'unknown', mode: config.mode ?? 'unknown', logLevel: config.logLevel ?? 'unknown', sourcemap: value('sourcemap'), reportCompressedSize: value('reportCompressedSize'), ssr: value('ssr'), write: value('write'), watch: config.build?.watch === undefined ? 'unknown' : Boolean(config.build.watch) } })
    },
    point: record,
    begin(phase, details) {
      if (!phases.has(phase)) {
        throw new Error(`未知尾部诊断阶段：${phase}`)
      }
      const id = ++token
      pending.set(id, phase)
      record(`${phase}.begin`, { token: id, ...details })
      return id
    },
    failure(id, error) {
      const phase = pending.get(id)
      if (!phase) {
        throw new Error('尾部诊断失败缺少开始事件')
      }
      record(`${phase}.failure`, { token: id, errorType: typeof error, error: '原抛出值不读取属性、不调用格式化方法。' })
      recordingError = `尾部阶段失败：${phase}`
    },
    end(id, details) {
      const phase = pending.get(id)
      if (!phase) {
        throw new Error('尾部诊断结束缺少开始事件')
      }
      pending.delete(id)
      if (!recordingError) {
        record(`${phase}.end`, { token: id, ...details })
      }
    },
    summary() {
      return { events: [...events], pending: pending.size, recordingError, limits: { maximumEvents, maximumAssets }, interpretation: '内存是当前 Node 进程，非进程树；阶段数值与已有 operation/source.snapshot 同序列对齐。候选和生成次数复用原操作记录；未读取或序列化的 sourcemap 大小为 unknown。allocation 停止点保持不变，snapshot 后只记录阶段数值。' }
    },
  }
}

/** 只接受一轮完整 Taro 冷构建；缺失阶段不能视为零开销。 */
export function verifyViteTailSummary(summary) {
  if (!summary || summary.recordingError || summary.pending !== 0 || summary.events?.length !== required.length
    || summary.events.some((event, index) => event.phase !== required[index] || !Number.isSafeInteger(event.sequence)
      || (index > 0 && event.sequence <= summary.events[index - 1].sequence))) {
    throw new Error(`Taro 冷构建尾部阶段缺失、失败或顺序不符：${JSON.stringify(summary)}`)
  }
  return summary
}
