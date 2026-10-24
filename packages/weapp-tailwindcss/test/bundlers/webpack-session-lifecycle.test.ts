import type { Compiler } from 'webpack'
import { describe, expect, it, vi } from 'vitest'
import { createWebpackSessionLifecycle } from '@/bundlers/webpack/shared/create-framework-plugin/session-lifecycle'
import { runCompilerOwnerActivity } from '@/compiler/compiler-owner-state'
import { createCompilerRuntimeState } from '@/compiler/runtime-state'

function setup(cleanups: Array<() => void | Promise<void>>) {
  const errors = vi.fn()
  const compiler = {
    hooks: { watchClose: { tap: vi.fn() }, shutdown: { tapPromise: vi.fn() } },
    getInfrastructureLogger: () => ({ error: errors }),
  } as unknown as Compiler
  const runtime = createCompilerRuntimeState({ tailwindRuntime: {} as any, refreshTailwindcssRuntime: vi.fn() })
  return { runtime, compiler, errors, lifecycle: createWebpackSessionLifecycle(compiler, runtime, cleanups) }
}

describe('Webpack 编译会话关闭', () => {
  it('排空已接受任务并保持重复关闭的同一完成结果', async () => {
    const released = vi.fn()
    const { runtime, lifecycle } = setup([released])
    let finish!: () => void
    const task = runCompilerOwnerActivity(runtime, () => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const first = lifecycle.close()
    expect(lifecycle.close()).toBe(first)
    await Promise.resolve()
    expect(released).not.toHaveBeenCalled()
    await expect(runCompilerOwnerActivity(runtime, () => undefined)).rejects.toThrow('正在释放')
    finish()
    await task
    await first
    expect(released).toHaveBeenCalledTimes(1)
    await expect(runCompilerOwnerActivity(runtime, () => undefined)).rejects.toThrow('已释放')
  })

  it('释放失败仍清理其他图关系并关闭核心', async () => {
    const released = vi.fn()
    const { runtime, lifecycle } = setup([() => {
      throw new Error('extension')
    }, released])
    const closed = lifecycle.close()
    await expect(closed).rejects.toThrow('释放失败')
    expect(released).toHaveBeenCalledTimes(1)
    expect(lifecycle.close()).toBe(closed)
    await expect(runCompilerOwnerActivity(runtime, () => undefined)).rejects.toThrow('已释放')
  })

  it('watch 结束与 shutdown 共用关闭协调者', async () => {
    const released = vi.fn()
    const { compiler, lifecycle } = setup([released])
    const watchClose = (compiler.hooks.watchClose.tap as any).mock.calls[0][1]
    const shutdown = (compiler.hooks.shutdown.tapPromise as any).mock.calls[0][1]
    expect(watchClose()).toBe(lifecycle.close())
    await shutdown()
    expect(released).toHaveBeenCalledTimes(1)
  })

  it('同时保留核心与上下文释放错误，清空清理回调后重复关闭不重跑', async () => {
    const extensionFailure = new Error('extension failure')
    const contextFailure = new Error('context failure')
    const cleanups = [() => {
      throw extensionFailure
    }]
    const { compiler, runtime } = setup([])
    const releaseContext = vi.fn(() => {
      throw contextFailure
    })
    const lifecycle = createWebpackSessionLifecycle(compiler, runtime, cleanups, releaseContext)
    const closed = lifecycle.close()
    const failure = await closed.catch(error => error as AggregateError)
    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure.errors).toContain(contextFailure)
    expect(failure.errors[0].errors[0].errors).toContain(extensionFailure)
    expect(cleanups).toEqual([])
    expect(releaseContext).toHaveBeenCalledTimes(1)
    expect(lifecycle.close()).toBe(closed)
  })
})
