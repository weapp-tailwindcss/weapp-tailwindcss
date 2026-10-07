import { describe, expect, it, vi } from 'vitest'
import { createWebpackLoaderRuntimePreparation } from '@/bundlers/webpack/shared/create-framework-plugin/runtime-preparation'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

describe('Webpack loader preparation revisions', () => {
  it('serializes replacement preparation and gives waiting loaders the latest class set', async () => {
    const firstStarted = deferred<void>()
    const firstResult = deferred<Set<string>>()
    const next = new Set(['new-class'])
    const currentChecks: Array<() => boolean> = []
    const prepare = vi.fn(async (isCurrent: () => boolean) => {
      currentChecks.push(isCurrent)
      if (currentChecks.length === 1) {
        firstStarted.resolve()
        return firstResult.promise
      }
      return next
    })
    const preparation = createWebpackLoaderRuntimePreparation(prepare)
    const oldLoader = preparation.getRuntimeSet()
    await firstStarted.promise
    preparation.invalidate()
    const newLoader = preparation.getRuntimeSet()
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(currentChecks[0]()).toBe(false)
    firstResult.resolve(new Set(['old-class']))
    const results = await Promise.all([oldLoader, newLoader])
    expect(results).toEqual([next, next])
    expect(results[0]).toBe(results[1])
    expect(prepare).toHaveBeenCalledTimes(2)
    expect(currentChecks[1]()).toBe(true)
  })

  it('skips obsolete queued preparations without releasing callers with stale data', async () => {
    const next = new Set(['new-class'])
    const prepare = vi.fn(async () => next)
    const preparation = createWebpackLoaderRuntimePreparation(prepare)
    const oldLoader = preparation.getRuntimeSet()
    preparation.invalidate()
    const middleLoader = preparation.getRuntimeSet()
    preparation.invalidate()
    const latestLoader = preparation.getRuntimeSet()
    expect(await Promise.all([oldLoader, middleLoader, latestLoader])).toEqual([next, next, next])
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('propagates one failure to all waiting loaders and permits a later retry', async () => {
    const failure = new Error('准备失败')
    const next = new Set<string>()
    const prepare = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(next)
    const preparation = createWebpackLoaderRuntimePreparation(prepare)
    const results = await Promise.allSettled([preparation.getRuntimeSet(), preparation.getRuntimeSet()])
    expect(results).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ])
    expect(await preparation.getRuntimeSet()).toBe(next)
    expect(prepare).toHaveBeenCalledTimes(2)
  })
})
