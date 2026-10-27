import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { runCompilerOwnerActivity, runCompilerOwnerDisposal, runCompilerOwnerExternalActivity } from '@/compiler/compiler-owner-state'

describe('compiler activity scope', () => {
  it('external admission rejects inherited leases while accepted internal work drains', async () => {
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const events: string[] = []
    const accepted = runCompilerOwnerExternalActivity(owner, async () => {
      await gate.promise
      await expect(runCompilerOwnerExternalActivity(owner, () => events.push('unexpected'))).rejects.toThrow('正在释放')
      await runCompilerOwnerActivity(owner, () => events.push('internal'))
    })
    const closing = runCompilerOwnerDisposal(owner, async () => {
      events.push('closed')
    })
    gate.resolve()
    await Promise.all([accepted, closing])
    expect(events).toEqual(['internal', 'closed'])
    await expect(runCompilerOwnerExternalActivity(owner, () => undefined)).rejects.toThrow('已释放')
  })

  it('releases completed owners while preserving pending activity ownership', async ({ signal }) => {
    await promisify(execFile)(process.execPath, [
      '--expose-gc',
      fileURLToPath(new URL('./fixtures/owner-activity-retention.mjs', import.meta.url)),
    ], { timeout: 15_000, signal })
  }, 20_000)

  it('keeps sequential inherited activity scopes bounded', async () => {
    const run = AsyncLocalStorage.prototype.run
    let largestScope = 0
    const observe = vi.spyOn(AsyncLocalStorage.prototype, 'run').mockImplementation(function (this: AsyncLocalStorage<unknown>, store, callback, ...args) {
      if (Array.isArray(store) && store.some(lease => lease?.owner === owner)) {
        largestScope = Math.max(largestScope, store.length)
      }
      return run.call(this, store, callback, ...args)
    })
    const owner = {}
    let completed = 0
    try {
      await new Promise<void>((resolve, reject) => {
        function next() {
          if (completed === 1024) {
            resolve()
            return
          }
          void runCompilerOwnerActivity(owner, () => {
            setImmediate(next)
          }).then(() => completed++, reject)
        }
        next()
      })
      expect(largestScope).toBe(1)
    }
    finally {
      observe.mockRestore()
      await runCompilerOwnerDisposal(owner, async () => {})
    }
  })

  it('rejects new work inherited from completed activity while closing', async () => {
    const owner = {}
    let inherited!: () => Promise<unknown>
    await runCompilerOwnerActivity(owner, () => {
      inherited = AsyncResource.bind(() => runCompilerOwnerActivity(owner, () => undefined))
    })
    let release!: () => void
    const pending = runCompilerOwnerActivity(owner, () => new Promise<void>((resolve) => {
      release = resolve
    }))
    const closing = runCompilerOwnerDisposal(owner, async () => {})
    try {
      await expect(inherited()).rejects.toThrow('正在释放')
    }
    finally {
      release()
      await Promise.all([pending, closing])
    }
    await expect(inherited()).rejects.toThrow('已释放')
  })

  it('preserves accepted ancestors across nested owners during closing', async () => {
    const outer = {}
    const inner = {}
    let resume!: () => void
    const gate = new Promise<void>((resolve) => {
      resume = resolve
    })
    const events: string[] = []
    const accepted = runCompilerOwnerActivity(outer, () => runCompilerOwnerActivity(inner, async () => {
      await gate
      await runCompilerOwnerActivity(outer, () => {
        events.push('outer nested')
      })
      await runCompilerOwnerActivity(inner, () => {
        events.push('inner nested')
      })
    }))
    const closeOuter = runCompilerOwnerDisposal(outer, async () => {
      events.push('outer closed')
    })
    const closeInner = runCompilerOwnerDisposal(inner, async () => {
      events.push('inner closed')
    })
    try {
      await expect(runCompilerOwnerActivity(outer, () => undefined)).rejects.toThrow('正在释放')
      await expect(runCompilerOwnerActivity(inner, () => undefined)).rejects.toThrow('正在释放')
    }
    finally {
      resume()
      await Promise.all([accepted, closeOuter, closeInner])
    }
    expect(events.slice(0, 2)).toEqual(['outer nested', 'inner nested'])
    expect(events.slice(2).sort()).toEqual(['inner closed', 'outer closed'])
  })
})
