import { setImmediate } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

const source = { projectRoot: '/workspace', base: '/workspace', baseFallbacks: [], css: '', dependencies: [] }

afterEach(() => {
  vi.doUnmock('@weapp-tailwindcss/engine')
  vi.doUnmock('@/tailwindcss/v4-engine/generator/native-session')
  vi.resetModules()
})

describe('主包生成器的关闭所有权', () => {
  it('等待两种后端的释放并汇总全部异常', async () => {
    const nativeFailure = new Error('native cleanup failed')
    const validationFailure = new Error('validation cleanup failed')
    const nativeDispose = vi.fn(async () => {
      throw nativeFailure
    })
    const validationDispose = vi.fn(() => {
      throw validationFailure
    })
    vi.doMock('@weapp-tailwindcss/engine', async importOriginal => ({
      ...await importOriginal<typeof import('@weapp-tailwindcss/engine')>(),
      createTailwindV4Engine: () => ({ dispose: validationDispose }),
    }))
    vi.doMock('@/tailwindcss/v4-engine/generator/native-session', async importOriginal => ({
      ...await importOriginal<typeof import('@/tailwindcss/v4-engine/generator/native-session')>(),
      TailwindV4NativeSessionPool: class {
        dispose = nativeDispose
      },
    }))
    const { createTailwindV4Engine } = await import('@/tailwindcss/v4-engine/generator/engine')
    const engine = createTailwindV4Engine(source)
    const closing = engine.dispose?.()
    await expect(closing).rejects.toMatchObject({ errors: [nativeFailure, validationFailure] })
    expect(engine.dispose?.()).toBe(closing)
    expect(nativeDispose).toHaveBeenCalledTimes(1)
    expect(validationDispose).toHaveBeenCalledTimes(1)
  })

  it('排空已接受的校验，等待异步释放并复用唯一关闭结果', async () => {
    let finishValidation!: () => void
    let finishDisposal!: () => void
    const validationGate = new Promise<void>((resolve) => {
      finishValidation = resolve
    })
    const disposalGate = new Promise<void>((resolve) => {
      finishDisposal = resolve
    })
    const dispose = vi.fn(() => disposalGate)
    vi.doMock('@weapp-tailwindcss/engine', async importOriginal => ({
      ...await importOriginal<typeof import('@weapp-tailwindcss/engine')>(),
      createTailwindV4Engine: () => ({
        dispose,
        validateCandidates: async () => {
          await validationGate
          return new Set(['flex'])
        },
      }),
    }))
    const { createTailwindV4Engine } = await import('@/tailwindcss/v4-engine/generator/engine')
    const engine = createTailwindV4Engine(source)
    const accepted = engine.validateCandidates(['flex'])
    const closing = engine.dispose?.()
    let closed = false
    const result = Promise.resolve(closing).then(() => {
      closed = true
    })
    try {
      expect(engine.dispose?.()).toBe(closing)
      await expect(engine.validateCandidates(['grid'])).rejects.toThrow('已释放')
      await setImmediate()
      expect(dispose).not.toHaveBeenCalled()
      expect(closed).toBe(false)
      finishValidation()
      await accepted
      await setImmediate()
      expect(dispose).toHaveBeenCalledTimes(1)
      expect(closed).toBe(false)
      finishDisposal()
      await result
    }
    finally {
      finishValidation()
      finishDisposal()
      await Promise.allSettled([accepted, result])
    }
  })
})
