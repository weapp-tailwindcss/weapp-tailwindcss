import { describe, expect, it, vi } from 'vitest'
import { createCache } from '@/cache'

describe('cache process transaction', () => {
  it('does not certify the old value with a failed transform hash', async () => {
    const cache = createCache()
    await cache.process({ key: 'output', hash: 'old', transform: async () => '.old{}' })
    await expect(cache.process({ key: 'output', hash: 'new', transform: async () => {
      throw new Error('cancelled')
    } })).rejects.toThrow('cancelled')
    const transform = vi.fn(async () => '.new{}')
    expect(await cache.process({ key: 'output', hash: 'new', transform })).toBe('.new{}')
    expect(transform).toHaveBeenCalledOnce()
  })

  it('keeps the newer successful task hash when an older task fails', async () => {
    const cache = createCache()
    let rejectOld!: (reason: unknown) => void
    const old = cache.process({
      key: 'output',
      hash: 'old',
      transform: () => new Promise<string>((_resolve, reject) => {
        rejectOld = reject
      }),
    })
    const failure = expect(old).rejects.toThrow('cancelled')
    await cache.process({ key: 'output', hash: 'new', transform: async () => '.new{}' })
    const currentHash = cache.getHashValue('output')
    rejectOld(new Error('cancelled'))
    await failure
    expect(cache.getHashValue('output')).toBe(currentHash)
    const transform = vi.fn(async () => '.unexpected{}')
    expect(await cache.process({ key: 'output', hash: 'new', transform })).toBe('.new{}')
    expect(transform).not.toHaveBeenCalled()
  })

  it('returns an older success to its caller without overwriting the newer cached result', async () => {
    const cache = createCache()
    let finishOld!: (value: string) => void
    const old = cache.process({
      key: 'output',
      hash: 'old',
      transform: () => new Promise<string>((resolve) => {
        finishOld = resolve
      }),
    })
    await cache.process({ key: 'output', hash: 'new', transform: async () => '.new{}' })
    finishOld('.old{}')
    expect(await old).toBe('.old{}')
    expect(cache.get('output')).toBe('.new{}')
    expect(cache.getHashValue('output')?.hash).toBe('new')
  })
})
