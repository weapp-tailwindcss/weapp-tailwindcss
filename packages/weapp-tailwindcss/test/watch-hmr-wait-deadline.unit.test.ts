import type { CliOptions, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
import { waitForCompileSettled, waitForOutputFilesUpdatedWithDiagnostics } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'
import { waitFor } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'

describe('Watch 等待的绝对截止和生命周期', () => {
  it('输出检查已过截止时，不能为了补充语义错误而执行回调', async () => {
    const accepts = vi.fn(async () => true)
    const output = path.resolve('expired-output.wxml')
    await expect(waitForOutputFilesUpdatedWithDiagnostics(
      { label: '语义截止' } as WatchCase,
      [output],
      new Map([[output, 0]]),
      { timeoutMs: 30, pollMs: 2 } as CliOptions,
      { ensureRunning() {} } as WatchSession,
      Date.now() - 100,
      accepts,
    )).rejects.toThrow('output files were not updated after source change')
    expect(accepts).not.toHaveBeenCalled()
  })

  it('异步检查跨过截止后不能接受 true', async () => {
    await expect(waitFor(async () => {
      await delay(30)
      return true
    }, { timeoutMs: 1_000, deadlineAt: Date.now() + 10, pollMs: 1, message: '本轮截止' })).rejects.toThrow('本轮截止')
  })

  it('异步检查期间进程失败，成功分支也须保留原异常', async () => {
    const failure = new Error('真实 watch 进程失败')
    let exited = false
    await expect(waitFor(async () => {
      exited = true
      return true
    }, {
      timeoutMs: 100,
      pollMs: 1,
      message: '不能覆盖进程异常',
      onTick() {
        if (exited) {
          throw failure
        }
      },
    })).rejects.toBe(failure)
  })

  it('轮询睡眠期间取消，保留原取消原因', async () => {
    const controller = new AbortController()
    const reason = new Error('用户取消本轮')
    const cancellation = delay(10).then(() => controller.abort(reason))
    await expect(waitFor(() => false, {
      timeoutMs: 1_000,
      pollMs: 500,
      message: '不能覆盖取消原因',
      signal: controller.signal,
    })).rejects.toBe(reason)
    await cancellation
  })

  it('输出等待已耗尽本轮截止时，编译稳定不能重启预算或扫描', async () => {
    const lastCompileSuccessAt = vi.fn(() => Date.now())
    await expect(waitForCompileSettled(
      { label: '截止回归', outputWxml: 'missing.wxml' } as WatchCase,
      { timeoutMs: 60_000, pollMs: 1 } as CliOptions,
      { ensureRunning() {}, lastCompileSuccessAt } as unknown as WatchSession,
      Date.now() - 100,
      undefined,
      Date.now() - 1,
    )).rejects.toThrow('watch compile did not settle in time')
    expect(lastCompileSuccessAt).not.toHaveBeenCalled()
  })

  it('编译稳定期间 hash 产物换名，按当前消费表达式继续验证', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'compile-hash-'))
    const previous = path.join(root, 'bundle-a.ttss')
    const current = path.join(root, 'bundle-b.ttss')
    await writeFile(previous, '.original{}')
    const startedAt = Date.now()
    let compileAt = startedAt
    const replacement = delay(20).then(async () => {
      await rm(previous)
      await writeFile(current, '.restored{}')
      compileAt = Date.now()
    })
    try {
      await waitForCompileSettled(
        { label: 'hash 回归' } as WatchCase,
        { timeoutMs: 1_500, pollMs: 5 } as CliOptions,
        { ensureRunning() {}, lastCompileSuccessAt: () => compileAt } as unknown as WatchSession,
        startedAt,
        [path.join(root, 'bundle-*.ttss')],
      )
      expect(Date.now() - compileAt).toBeGreaterThanOrEqual(600)
    }
    finally {
      await replacement
      await rm(root, { recursive: true, force: true })
    }
  })
})
