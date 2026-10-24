import { setImmediate } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

const source = { projectRoot: '/workspace', base: '/workspace', baseFallbacks: [], css: '', dependencies: [] }
const result = { css: '', rawCss: '', classSet: new Set(), rawCandidates: new Set(), dependencies: [], target: 'web' }

afterEach(() => {
  vi.doUnmock('@/generator/runtime')
  vi.resetModules()
})

describe('生成器池的关闭所有权', () => {
  it('失效后的在途任务与异步释放仍由同一关闭结果排空', async () => {
    let releaseGeneration!: () => void
    let releaseCleanup!: () => void
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve
    })
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve
    })
    const oldDispose = vi.fn(() => cleanupGate)
    const currentDispose = vi.fn()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn()
        .mockReturnValueOnce({ generate: async () => {
          await generationGate
          return result
        }, dispose: oldDispose })
        .mockReturnValueOnce({ generate: async () => result, dispose: currentDispose }),
    }))
    const { TailwindGenerationSessionPool } = await import('@/compiler/tailwind-generation-session-pool')
    const pool = new TailwindGenerationSessionPool()
    const accepted = pool.generate(source)
    pool.invalidate({ type: 'source', source })
    await pool.generate(source)
    const closing = pool.dispose()
    let closed = false
    const finished = Promise.resolve(closing).then(() => {
      closed = true
    })
    try {
      expect(pool.dispose()).toBe(closing)
      await expect(pool.generate(source)).rejects.toThrow('已释放')
      await setImmediate()
      expect(currentDispose).toHaveBeenCalledTimes(1)
      expect(oldDispose).not.toHaveBeenCalled()
      expect(closed).toBe(false)
      releaseGeneration()
      await accepted
      await setImmediate()
      expect(oldDispose).toHaveBeenCalledTimes(1)
      expect(closed).toBe(false)
      releaseCleanup()
      await finished
    }
    finally {
      releaseGeneration()
      releaseCleanup()
      await Promise.allSettled([accepted, finished])
    }
  })

  it('owner 等待已淘汰生成器的失败并继续释放其余状态', async () => {
    const failure = new Error('retired generator cleanup failed')
    const disposals: ReturnType<typeof vi.fn>[] = []
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: () => {
        const dispose = disposals.length === 0
          ? vi.fn(async () => {
              throw failure
            })
          : vi.fn()
        disposals.push(dispose)
        return { dispose, generate: async () => result }
      },
    }))
    const { disposeCompilerOwner, getTailwindGenerationSessionPool, getCompilerShadowReportSession } = await import('@/compiler')
    const owner = {}
    const pool = getTailwindGenerationSessionPool(owner)
    const shadow = getCompilerShadowReportSession(owner)
    // 超过 LRU 容量，旧生成器的失败先于 owner 关闭完成。
    for (let index = 0; index < 33; index++) {
      await pool.generate({ ...source, css: `source-${index}` })
    }
    await setImmediate()
    const closing = disposeCompilerOwner(owner)
    await expect(closing).rejects.toThrow('编译会话释放失败')
    expect(disposeCompilerOwner(owner)).toBe(closing)
    expect(disposals).toHaveLength(33)
    expect(disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
    expect(() => shadow.snapshot()).toThrow('已释放')
    expect(() => getTailwindGenerationSessionPool(owner)).toThrow('已释放')
  })
})
