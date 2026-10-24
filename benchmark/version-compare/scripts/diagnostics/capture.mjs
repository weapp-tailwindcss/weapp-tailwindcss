import { performance } from 'node:perf_hooks'
import { candidateEvidence, compilationCandidates } from './evidence.mjs'
import { annotateAllocationFrames } from './frames.mjs'

export function persistCompilationEvidence({ identity, phase, index, sampling, stores, collections, writer, started, compilationId }) {
  // 原始 profile 与输入先持久保存；归因失败仍保留首败数据，不把缺失映射当作成功。
  const profileFile = sampling ? `allocation-${index}.json` : undefined
  const framesFile = sampling ? `allocation-frames-${index}.json` : undefined
  const profileReceipt = sampling ? writer.write(profileFile, { identity, phase, index, sampling, framesFile }) : undefined
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
    compilationId,
    sources,
    compilationCandidates: collections ? compilationCandidates(collections) : undefined,
    profileFile,
    profileReceipt,
    framesFile,
    observationDurationMs: performance.now() - started,
    samplingIncludesPreviousObservationAllocations: Boolean(sampling) && index > 1,
  })
  if (sampling) {
    const allocationFrames = annotateAllocationFrames(sampling.profile, identity)
    return {
      file: framesFile,
      receipt: writer.write(framesFile, { identity, phase, index, profileFile, profileReceipt, allocationFrames }),
    }
  }
}
