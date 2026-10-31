import { describe, expect, it, vi } from 'vitest'
import { compareInputSnapshots } from '../scripts/diagnostics/compare.mjs'
import { createAllocationSampler } from '../scripts/diagnostics/sampling.mjs'

describe('隐式强制 GC 的分配采样入口', () => {
  it('默认入口立即拒绝，不创建 inspector 会话', async () => {
    await expect(createAllocationSampler()).rejects.toThrow('kSamplingForceGC')
  })

  it('注入会话也不能绕过禁用，不连接、发送请求或关闭他人会话', async () => {
    const session = { connect: vi.fn(), post: vi.fn(), disconnect: vi.fn() }
    await expect(createAllocationSampler({ session })).rejects.toThrow('kSamplingForceGC')
    for (const method of Object.values(session)) {
      expect(method).not.toHaveBeenCalled()
    }
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
