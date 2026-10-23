import type { CompilerRootSession } from '@/core/compiler/root-store'
import { setImmediate } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
import { CompilerRootStore } from '@/core/compiler/root-store'

function attachGenerator(entry: CompilerRootSession, dispose: () => void) {
  entry.generator = { dispose } as NonNullable<CompilerRootSession['generator']>
}

describe('compiler root eviction cleanup', () => {
  it.each(['get', 'trim'] as const)('reports a settled %s eviction failure when closing and releases remaining roots', async (trigger) => {
    const failure = new Error('evicted generator cleanup failed')
    const failedRelease = vi.fn(() => { throw failure })
    const remainingRelease = vi.fn()
    const store = new CompilerRootStore(1)
    const first = store.get('first')
    attachGenerator(first, failedRelease)
    if (trigger === 'trim') {
      first.pendingCount = 1
    }
    attachGenerator(store.get('second'), remainingRelease)
    if (trigger === 'trim') {
      first.pendingCount = 0
      store.trim()
    }

    // 跨过事件循环，证明后台拒绝已被接住且不会因释放完成而丢失。
    await setImmediate()
    expect(failedRelease).toHaveBeenCalledTimes(1)
    expect(remainingRelease).not.toHaveBeenCalled()
    await expect(store.dispose()).rejects.toMatchObject({ errors: [failure] })
    expect(remainingRelease).toHaveBeenCalledTimes(1)
  })

  it('retains eviction callback failures after the generator has been released', async () => {
    const failure = new Error('eviction callback failed')
    const onRootEvicted = vi.fn(() => { throw failure })
    const released = vi.fn()
    const remainingRelease = vi.fn()
    const store = new CompilerRootStore(1, onRootEvicted)
    attachGenerator(store.get('first'), released)
    attachGenerator(store.get('second'), remainingRelease)

    await setImmediate()
    expect(released).toHaveBeenCalledTimes(1)
    expect(onRootEvicted).toHaveBeenCalledWith('first')
    await expect(store.dispose()).rejects.toMatchObject({ errors: [failure] })
    expect(remainingRelease).toHaveBeenCalledTimes(1)
  })

  it('waits for a pending eviction and reports its failure once alongside remaining cleanup failures', async () => {
    const evictionFailure = new Error('evicted generator cleanup failed')
    const closingFailure = new Error('remaining generator cleanup failed')
    const failedRelease = vi.fn(() => { throw evictionFailure })
    const remainingRelease = vi.fn(() => { throw closingFailure })
    let release!: () => void
    const store = new CompilerRootStore(1)
    const first = store.get('first')
    first.pending = new Promise<void>((resolve) => { release = resolve })
    attachGenerator(first, failedRelease)
    attachGenerator(store.get('second'), remainingRelease)

    const closing = store.dispose()
    const result = closing.catch(error => error as AggregateError)
    await setImmediate()
    expect(failedRelease).not.toHaveBeenCalled()
    expect(remainingRelease).toHaveBeenCalledTimes(1)
    release()
    const error = await result
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toHaveLength(2)
    expect((error as AggregateError).errors).toEqual(expect.arrayContaining([evictionFailure, closingFailure]))
    expect(failedRelease).toHaveBeenCalledTimes(1)
  })
})
