import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { describe, expect, it, vi } from 'vitest'
import { runCompilerOwnerActivity, runCompilerOwnerDisposal, runCompilerOwnerExternalActivity } from '@/compiler/compiler-owner-state'

function observeOwnerScope(owner: object) {
  const run = AsyncLocalStorage.prototype.run
  let readScope: (() => unknown) | undefined
  const observer = vi.spyOn(AsyncLocalStorage.prototype, 'run').mockImplementation(function (this: AsyncLocalStorage<unknown>, store, callback, ...args) {
    if (Array.isArray(store) && store.some(lease => lease?.owner === owner)) {
      readScope = () => this.getStore()
    }
    return run.call(this, store, callback, ...args)
  })
  return {
    read: () => readScope?.(),
    restore: () => observer.mockRestore(),
  }
}

describe('编译活动空闲作用域', () => {
  it.each(['success', 'throw', 'reject', 'thenable', 'external throw'] as const)('%s 完成后退出已失活的继承上下文', async (outcome) => {
    const owner = {}
    const observation = observeOwnerScope(owner)
    const failure = new Error('activity failed')
    let inherited!: () => unknown
    const activity = () => {
      inherited = AsyncResource.bind(observation.read)
      expect(inherited()).toEqual([expect.objectContaining({ owner, active: true })])
      if (outcome === 'throw' || outcome === 'external throw') {
        throw failure
      }
      if (outcome === 'reject') {
        return Promise.reject(failure)
      }
      if (outcome === 'thenable') {
        return Promise.resolve({ then: (_resolve: unknown, reject: (reason: unknown) => void) => reject(failure) })
      }
    }
    try {
      const execution = outcome === 'external throw'
        ? runCompilerOwnerExternalActivity(owner, activity)
        : runCompilerOwnerActivity(owner, activity)
      if (outcome === 'success') {
        await execution
      }
      else {
        await expect(execution).rejects.toBe(failure)
      }
      expect(inherited()).toBeUndefined()
    }
    finally {
      observation.restore()
      await runCompilerOwnerDisposal(owner, async () => {})
    }
  })

  it('一个实例结束后保留其他实例在关闭期间的合法内部工作', async () => {
    const first = {}
    const second = {}
    const firstGate = Promise.withResolvers<void>()
    const secondGate = Promise.withResolvers<void>()
    const events: string[] = []
    const firstExecution = runCompilerOwnerActivity(first, () => firstGate.promise)
    const secondExecution = runCompilerOwnerActivity(second, async () => {
      await secondGate.promise
      await runCompilerOwnerActivity(second, () => events.push('second nested'))
    })
    const firstClosing = runCompilerOwnerDisposal(first, async () => {
      events.push('first closed')
    })
    const secondClosing = runCompilerOwnerDisposal(second, async () => {
      events.push('second closed')
    })
    try {
      firstGate.resolve()
      await Promise.all([firstExecution, firstClosing])
      expect(events).toEqual(['first closed'])
      secondGate.resolve()
      await Promise.all([secondExecution, secondClosing])
      expect(events).toEqual(['first closed', 'second nested', 'second closed'])
    }
    finally {
      firstGate.resolve()
      secondGate.resolve()
      await Promise.allSettled([firstExecution, secondExecution, firstClosing, secondClosing])
    }
  })

  it('宿主重入同步异常不清除祖先租约或用户自有上下文', async () => {
    const userScope = new AsyncLocalStorage<string>()
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const failure = new Error('external failed')
    try {
      await userScope.run('user', async () => {
        const execution = runCompilerOwnerActivity(owner, async () => {
          await gate.promise
          await expect(runCompilerOwnerExternalActivity({}, () => {
            throw failure
          })).rejects.toBe(failure)
          await runCompilerOwnerActivity(owner, () => {
            expect(userScope.getStore()).toBe('user')
          })
        })
        const closing = runCompilerOwnerDisposal(owner, async () => {})
        gate.resolve()
        await Promise.all([execution, closing])
        expect(userScope.getStore()).toBe('user')
      })
    }
    finally {
      gate.resolve()
      userScope.disable()
      await runCompilerOwnerDisposal(owner, async () => {})
    }
  })

  it('用户上下文复制的旧租约在重新启用后不能取得关闭权限', async () => {
    const userScope = new AsyncLocalStorage<string>()
    const owner = {}
    const gate = Promise.withResolvers<void>()
    const failure = new Error('activity failed')
    let inherited!: () => Promise<unknown>
    try {
      await expect(runCompilerOwnerActivity(owner, () => userScope.run('user', () => {
        inherited = AsyncResource.bind(() => {
          expect(userScope.getStore()).toBe('user')
          return runCompilerOwnerActivity(owner, () => 'unexpected')
        })
        throw failure
      }))).rejects.toBe(failure)
      const execution = runCompilerOwnerActivity(owner, () => gate.promise)
      const closing = runCompilerOwnerDisposal(owner, async () => {})
      try {
        await expect(inherited()).rejects.toThrow('正在释放')
      }
      finally {
        gate.resolve()
        await Promise.all([execution, closing])
      }
      await expect(inherited()).rejects.toThrow('已释放')
    }
    finally {
      gate.resolve()
      userScope.disable()
      await runCompilerOwnerDisposal(owner, async () => {})
    }
  })
})
