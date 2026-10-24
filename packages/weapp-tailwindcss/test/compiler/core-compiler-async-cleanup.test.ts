import { setImmediate } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

const source = { projectRoot: '/workspace', base: '/workspace', baseFallbacks: [], css: '', dependencies: [] }
const generated = { css: '', rawCss: '', classSet: new Set(), rawCandidates: new Set(), dependencies: [], sources: [], root: null, target: 'web' }

afterEach(() => {
  vi.doUnmock('@/generator/runtime')
  vi.resetModules()
})

describe('公开 compiler 的异步生成器释放', () => {
  it('替换旧生成器不会阻塞新输出，最终关闭等待旧释放并汇总失败', async () => {
    const failure = new Error('retired generator cleanup failed')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const oldDispose = vi.fn(async () => {
      await gate
      throw failure
    })
    const currentDispose = vi.fn()
    vi.doMock('@/generator/runtime', async importOriginal => ({
      ...await importOriginal<typeof import('@/generator/runtime')>(),
      createWeappTailwindcssGenerator: vi.fn()
        .mockReturnValueOnce({ dispose: oldDispose, generate: async () => generated })
        .mockReturnValueOnce({ dispose: currentDispose, generate: async () => generated }),
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    await compiler.generate({ id: 'root', source, candidates: [], scanSources: false })
    await compiler.generate({ id: 'root', source: { ...source, css: '.new {}' }, candidates: [], scanSources: false })
    const closing = compiler.dispose()
    let closed = false
    const outcome = closing.catch((error) => {
      closed = true
      return error
    })
    try {
      expect(compiler.dispose()).toBe(closing)
      await setImmediate()
      expect(oldDispose).toHaveBeenCalledTimes(1)
      expect(currentDispose).toHaveBeenCalledTimes(1)
      expect(closed).toBe(false)
      release()
      await expect(outcome).resolves.toMatchObject({ errors: [failure] })
      expect(() => compiler.createSnapshot({ id: 'closed', classSet: [] })).toThrow('已释放')
    }
    finally {
      release()
      await outcome
    }
  })

  it('生成失败仍等待临时生成器释放，并同时保留生成与清理错误', async () => {
    const generationFailure = new Error('generation failed')
    const cleanupFailure = new Error('cleanup failed')
    const dispose = vi.fn(async () => {
      throw cleanupFailure
    })
    vi.doMock('@/generator/runtime', async importOriginal => ({
      ...await importOriginal<typeof import('@/generator/runtime')>(),
      createWeappTailwindcssGenerator: () => ({
        dispose,
        generate: async () => {
          throw generationFailure
        },
      }),
    }))
    const { createCompiler } = await import('@/core/compiler')
    const compiler = createCompiler()
    await expect(compiler.generate({ id: 'root', source, candidates: [], scanSources: false }))
      .rejects
      .toMatchObject({ errors: [generationFailure, cleanupFailure] })
    expect(dispose).toHaveBeenCalledTimes(1)
    await compiler.dispose()
  })
})
