import type { TailwindGenerationSession } from '@weapp-tailwindcss/engine'
import { setImmediate } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
import { TailwindV4NativeSessionPool } from '@/tailwindcss/v4-engine/generator/native-session'

const source = { projectRoot: '/workspace', base: '/workspace', baseFallbacks: [], css: '', dependencies: [] }
const artifact = { fragments: [], classSet: new Set<string>(), rawCandidates: new Set<string>(), dependencies: [], sourceEntries: [] }

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function session(generate = async () => artifact, dispose: () => void | Promise<void> = () => {}) {
  return { source, generate: vi.fn(generate), dispose: vi.fn(dispose), invalidate: vi.fn() } satisfies TailwindGenerationSession
}

describe('native session 的关闭所有权', () => {
  it('汇总已替换与当前会话的同步、异步释放失败并继续清理其余会话', async () => {
    const oldFailure = new Error('old native cleanup failed')
    const currentFailure = new Error('current native cleanup failed')
    const old = session(undefined, () => {
      throw oldFailure
    })
    const current = session(undefined, async () => {
      throw currentFailure
    })
    const otherTarget = session()
    const create = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current).mockReturnValueOnce(otherTarget)
    const pool = new TailwindV4NativeSessionPool(create)
    await pool.generate('web', 'old', source, {})
    await pool.generate('web', 'current', source, {})
    // 已完成的后台失败不能丢失，也不能先触发 unhandledRejection。
    await setImmediate()
    await pool.generate('weapp', 'other-target', source, {})
    const closing = pool.dispose()
    await expect(closing).rejects.toMatchObject({ errors: [oldFailure, currentFailure] })
    expect(pool.dispose()).toBe(closing)
    expect(old.dispose).toHaveBeenCalledTimes(1)
    expect(current.dispose).toHaveBeenCalledTimes(1)
    expect(otherTarget.dispose).toHaveBeenCalledTimes(1)
  })

  it('返回同一关闭结果并排空所有已接受请求，关闭期间拒绝新请求', async () => {
    const generationGate = deferred()
    const cleanupGate = deferred()
    const entry = session(async () => {
      await generationGate.promise
      return artifact
    }, () => cleanupGate.promise)
    const pool = new TailwindV4NativeSessionPool(() => entry)
    const first = pool.generate('web', 'source', source, {})
    const second = pool.generate('web', 'source', source, {})
    await Promise.resolve()
    const closing = pool.dispose()
    let closed = false
    const result = Promise.resolve(closing).then(() => {
      closed = true
    })
    try {
      expect(pool.dispose()).toBe(closing)
      expect(() => pool.generate('web', 'source', source, {})).toThrow('已释放')
      await setImmediate()
      expect(closed).toBe(false)
      expect(entry.dispose).not.toHaveBeenCalled()
      generationGate.resolve()
      await Promise.all([first, second])
      await setImmediate()
      expect(entry.generate).toHaveBeenCalledTimes(2)
      expect(entry.dispose).toHaveBeenCalledTimes(1)
      expect(closed).toBe(false)
      cleanupGate.resolve()
      await result
      expect(closed).toBe(true)
    }
    finally {
      generationGate.resolve()
      cleanupGate.resolve()
      await Promise.allSettled([first, second, result])
    }
  })

  it('替换后的旧 session 仍由最终关闭排空', async () => {
    const generationGate = deferred()
    const old = session(async () => {
      await generationGate.promise
      return artifact
    })
    const current = session()
    const create = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current)
    const pool = new TailwindV4NativeSessionPool(create)
    const accepted = pool.generate('web', 'old', source, {})
    await pool.generate('web', 'current', source, {})
    const closing = pool.dispose()
    let closed = false
    const result = Promise.resolve(closing).then(() => {
      closed = true
    })
    try {
      await setImmediate()
      expect(current.dispose).toHaveBeenCalledTimes(1)
      expect(old.dispose).not.toHaveBeenCalled()
      expect(closed).toBe(false)
      generationGate.resolve()
      await Promise.all([accepted, result])
      expect(old.dispose).toHaveBeenCalledTimes(1)
    }
    finally {
      generationGate.resolve()
      await Promise.allSettled([accepted, result])
    }
  })
})
