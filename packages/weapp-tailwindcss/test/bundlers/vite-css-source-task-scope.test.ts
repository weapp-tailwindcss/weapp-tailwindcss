import type { ViteCssSourceLease } from '@/bundlers/vite/css-memory/source-lifecycle'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { createViteCssSourceLifecycle } from '@/bundlers/vite/css-memory/source-lifecycle'
import { createViteCssSourceTaskScope } from '@/bundlers/vite/css-memory/source-task-scope'

type CaptureSource = (file: string) => ViteCssSourceLease

describe('CSS 来源轮次服务', () => {
  it('宿主长期持有已关闭的轮次服务仍释放来源私有资源', async ({ signal }) => {
    await promisify(execFile)(process.execPath, [
      '--expose-gc',
      '--import',
      import.meta.resolve('tsx'),
      fileURLToPath(new URL('./fixtures/css-source-round-retention.mjs', import.meta.url)),
    ], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      timeout: 20_000,
      signal,
    })
  }, 25_000)

  it('旧轮次保存的服务拒绝迟到申请，不借用新轮次的同名来源', async () => {
    const lifecycle = createViteCssSourceLifecycle()
    const scope = createViteCssSourceTaskScope(lifecycle.capture)
    let captureOld!: CaptureSource
    let oldLease!: ViteCssSourceLease
    await scope.run(async (capture) => {
      captureOld = capture!
      oldLease = captureOld('/repo/view.css')
      expect(oldLease()).toBe(true)
    })
    expect(oldLease()).toBe(false)
    expect(lifecycle.getStats().pendingCssSourceOwners).toBe(0)
    await scope.run(async (capture) => {
      const current = capture!('/repo/view.css')
      const late = captureOld('/repo/view.css')
      expect(late()).toBe(false)
      expect(current()).toBe(true)
      expect(lifecycle.getStats().pendingCssSourceOwners).toBe(1)
    })
    expect(lifecycle.getStats().pendingCssSourceOwners).toBe(0)
  })

  it('交错轮次只释放自己接收的来源', async () => {
    const lifecycle = createViteCssSourceLifecycle()
    const scope = createViteCssSourceTaskScope(lifecycle.capture)
    const firstGate = Promise.withResolvers<void>()
    const secondGate = Promise.withResolvers<void>()
    const leases: ViteCssSourceLease[] = []
    const first = scope.run(async (capture) => {
      leases[0] = capture!('/repo/shared.css')
      await firstGate.promise
    })
    const second = scope.run(async (capture) => {
      leases[1] = capture!('/repo/shared.css')
      await secondGate.promise
    })
    try {
      firstGate.resolve()
      await first
      expect(leases[0]!()).toBe(false)
      expect(leases[1]!()).toBe(true)
      expect(lifecycle.getStats().pendingCssSourceOwners).toBe(1)
    }
    finally {
      firstGate.resolve()
      secondGate.resolve()
      await Promise.allSettled([first, second])
    }
    expect(lifecycle.getStats().pendingCssSourceOwners).toBe(0)
  })

  it('嵌套轮次不会把显式传入的外层服务归入内层', async () => {
    const lifecycle = createViteCssSourceLifecycle()
    const scope = createViteCssSourceTaskScope(lifecycle.capture)
    let outer!: ViteCssSourceLease
    let inner!: ViteCssSourceLease
    await scope.run(async (captureOuter) => {
      await scope.run(async (captureInner) => {
        outer = captureOuter!('/repo/outer.css')
        inner = captureInner!('/repo/inner.css')
      })
      expect(inner()).toBe(false)
      expect(outer()).toBe(true)
      expect(lifecycle.getStats().pendingCssSourceOwners).toBe(1)
    })
    expect(outer()).toBe(false)
    expect(lifecycle.getStats().pendingCssSourceOwners).toBe(0)
  })

  it.each([false, true])('规划失败或未执行任务仍释放全部凭据：failure=%s', async (fails) => {
    const lifecycle = createViteCssSourceLifecycle()
    const scope = createViteCssSourceTaskScope(lifecycle.capture)
    const failure = new Error('planning failed')
    let queued!: () => boolean
    const execution = scope.run(async (capture) => {
      const lease = capture!('/repo/planned.css')
      queued = () => lease()
      if (fails) {
        throw failure
      }
    })
    if (fails) {
      await expect(execution).rejects.toBe(failure)
    }
    else {
      await execution
    }
    expect(queued()).toBe(false)
    expect(lifecycle.getStats().pendingCssSourceOwners).toBe(0)
  })

  it.each([false, true])('清理失败仍释放其余来源并保留原错误：taskFailure=%s', async (taskFails) => {
    const cleanupFailure = new Error('release failed')
    const taskFailure = new Error('task failed')
    const releases = [vi.fn(() => {
      throw cleanupFailure
    }), vi.fn()]
    let index = 0
    const scope = createViteCssSourceTaskScope(() => Object.assign(() => true, { release: releases[index++]! }))
    let lateCapture!: CaptureSource
    const execution = scope.run(async (capture) => {
      lateCapture = capture!
      capture!('/repo/first.css')
      capture!('/repo/second.css')
      if (taskFails) {
        throw taskFailure
      }
    })
    if (taskFails) {
      const error = await execution.catch(error => error)
      expect(error).toBeInstanceOf(AggregateError)
      expect(error.errors).toHaveLength(2)
      expect(error.errors[0]).toBe(taskFailure)
      expect(error.errors[1]).toBe(cleanupFailure)
    }
    else {
      await expect(execution).rejects.toBe(cleanupFailure)
    }
    expect(releases.map(release => release.mock.calls.length)).toEqual([1, 1])
    const lateRelease = vi.fn()
    releases.push(lateRelease)
    const late = lateCapture('/repo/late.css')
    expect(late()).toBe(false)
    late.release()
    late.release()
    expect(late()).toBe(false)
    expect(lateRelease).not.toHaveBeenCalled()
  })

  it('没有来源服务时仍返回任务结果', async () => {
    await expect(createViteCssSourceTaskScope().run(async (capture) => {
      expect(capture).toBeUndefined()
      return 'complete'
    })).resolves.toBe('complete')
  })

  it('任务抛出 undefined 时仍拒绝并释放来源', async () => {
    const release = vi.fn()
    const scope = createViteCssSourceTaskScope(() => Object.assign(() => true, { release }))
    await expect(scope.run(async (capture) => {
      capture!('/repo/source.css')
      // eslint-disable-next-line no-throw-literal -- 验证调用者抛出空值时仍保留拒绝语义。
      throw undefined
    })).rejects.toBeUndefined()
    expect(release).toHaveBeenCalledOnce()
  })

  it('清理抛出 false 时仍拒绝并释放其余来源', async () => {
    const release = vi.fn()
    let calls = 0
    const scope = createViteCssSourceTaskScope(() => Object.assign(() => true, {
      release: calls++ === 0
        ? () => {
            // eslint-disable-next-line no-throw-literal -- 验证清理失败不能被真值判断吞掉。
            throw false
          }
        : release,
    }))
    await expect(scope.run(async (capture) => {
      capture!('/repo/first.css')
      capture!('/repo/second.css')
    })).rejects.toBe(false)
    expect(release).toHaveBeenCalledOnce()
  })
})
