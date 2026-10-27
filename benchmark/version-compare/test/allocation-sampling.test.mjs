import { describe, expect, it, vi } from 'vitest'
import { compareInputSnapshots } from '../scripts/diagnostics/compare.mjs'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { createAllocationSampler } from '../scripts/diagnostics/sampling.mjs'

function fakeSession(error) {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    post: vi.fn((method, parameters, callback) => callback(error?.(method), { profile: { head: { children: [] }, samples: [] } })),
  }
}

describe('包含已回收对象的独立分配采样', () => {
  it('固定双方相同参数，完成后关闭本进程 inspector，不发送 GC 或 heap snapshot 请求', async () => {
    const session = fakeSession()
    const sampler = await createAllocationSampler({ session })
    expect(session.post.mock.calls[0].slice(0, 2)).toEqual(['HeapProfiler.startSampling', { samplingInterval: limits.samplingInterval, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }])
    const result = await sampler.capture()
    expect(result.sampledAllocatedBytesIncludingCollected).toBe(true)
    await sampler.capture(true)
    await sampler.close()
    expect(session.post.mock.calls.map(([method]) => method)).toEqual(['HeapProfiler.startSampling', 'HeapProfiler.getSamplingProfile', 'HeapProfiler.stopSampling'])
    expect(session.disconnect).toHaveBeenCalledOnce()
    await expect(sampler.capture()).rejects.toThrow('关闭')
  })

  it('协议不支持或关闭失败仍断开诊断会话', async () => {
    const startFailure = fakeSession(() => new Error('unsupported'))
    await expect(createAllocationSampler({ session: startFailure })).rejects.toThrow('unsupported')
    expect(startFailure.disconnect).toHaveBeenCalledOnce()
    const stopFailure = fakeSession(method => method.endsWith('stopSampling') ? new Error('stop failure') : undefined)
    const sampler = await createAllocationSampler({ session: stopFailure })
    await expect(sampler.close()).rejects.toThrow('stop failure')
    expect(stopFailure.disconnect).toHaveBeenCalledOnce()
  })

  it('阶段有固定上限，超限不再向 inspector 发采样请求', async () => {
    const session = fakeSession()
    const sampler = await createAllocationSampler({ session })
    for (let i = 0; i < limits.maxSnapshots; i++) {
      await sampler.capture()
    }
    await expect(sampler.capture()).rejects.toThrow('上限')
    expect(session.post).toHaveBeenCalledTimes(limits.maxSnapshots + 1)
    await sampler.close()
  })
})

describe('等量输入证据比较', () => {
  const snapshot = (root, candidates, hash) => ({
    sources: [{ storeId: 1, maps: {
      candidatesById: [{ key: `${root}/a.vue`, comparableKey: '<root>/a.vue', candidates }],
      sourceById: [{ key: `${root}/a.vue`, comparableKey: '<root>/a.vue', sha256: hash }],
    } }],
    compilationCandidates: { sourceCandidates: candidates },
  })
  it('根不同但来源 key 与实际哈希相同可对应；额外候选列出准确来源和哈希', () => {
    expect(compareInputSnapshots(snapshot('/base', ['flex'], 'same'), snapshot('/current', ['flex'], 'same')).sameActualCandidatesAndSourceHashes).toBe(true)
    const result = compareInputSnapshots(snapshot('/base', ['flex'], 'same'), snapshot('/current', ['flex', 'extra'], 'different'))
    expect(result.sameActualCandidatesAndSourceHashes).toBe(false)
    expect(result.candidateDifferences[0].added).toEqual([{ value: 'extra', origins: [{ storeId: 1, layer: 'candidatesById', key: '/current/a.vue', comparableKey: '<root>/a.vue', sourceHashes: [{ layer: 'sourceById', sha256: 'different' }] }] }])
    expect(result.sourceDifferences).toHaveLength(1)
  })
})
