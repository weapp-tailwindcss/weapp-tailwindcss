import type { CliOptions, StyleMutationConfig, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as shared from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'
import { runStyleMutation } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/style'
import * as output from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/outputs/read'
import * as text from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(mode: 'clear' | 'retain' | 'missing' | 'hashed' = 'clear') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'style-rollback-'))
  roots.push(root)
  const sourceFile = path.join(root, 'entry.css')
  const primary = path.join(root, 'consumed.acss')
  const secondary = path.join(root, 'shared-a.acss')
  const replacement = path.join(root, 'shared-b.acss')
  const original = '.original{color:blue}'
  await Promise.all([sourceFile, primary, secondary].map(file => writeFile(file, original)))
  let lastCompileSuccessAt = 0
  let mutated = ''
  let rollback = false
  const session = {
    ensureRunning() {},
    lastCompileSuccessAt: () => lastCompileSuccessAt,
    pluginProcessSamplesSince: () => [],
  } as unknown as WatchSession
  vi.spyOn(text, 'writeWatchedFilePreserveEol').mockImplementation(async (file, source) => {
    await writeFile(file, source)
    rollback = source === original && mutated.length > 0
    await writeFile(primary, source)
    if (source !== original) {
      mutated = source
      await writeFile(secondary, source)
    }
    else if (mode === 'missing' || mode === 'hashed') {
      await rm(secondary)
      if (mode === 'hashed') {
        await writeFile(replacement, original)
      }
    }
    else if (mode !== 'retain') {
      await writeFile(secondary, source)
    }
    lastCompileSuccessAt = Date.now()
  })
  const mutation: StyleMutationConfig = {
    sourceFile,
    validateApply: false,
    validateFunction: false,
    mutate: (source, payload) => `${source}\n${payload.styleNeedle}{color:red}`,
  }
  const watchCase = { name: 'taro-webpack-vue3-tailwindcss-v4', label: '真实文件回滚' } as WatchCase
  const candidates = [primary, mode === 'hashed' ? path.join(root, 'shared-*.acss') : secondary]
  return {
    original,
    primary,
    secondary,
    sourceFile,
    session,
    getMutated: () => mutated,
    isRollback: () => rollback,
    markCompiled: () => lastCompileSuccessAt = Date.now(),
    run: (timeoutMs = 1_200) => runStyleMutation(watchCase, { timeoutMs, pollMs: 5 } as CliOptions, session, mutation, original, candidates),
  }
}

describe('Style 回滚的真实产物清理边界', () => {
  it('第一个候选已清除，另一个真实消费产物仍有 marker 时不能通过', async () => {
    const { run, sourceFile, original } = await fixture('retain')
    await expect(run()).rejects.toThrow(/rollback needles|compile did not settle/)
    await expect(readFile(sourceFile, 'utf8')).resolves.toBe(original)
  })

  it('所有产物稳定并清除后，记录真实有效耗时', async () => {
    const { run, primary, secondary, original } = await fixture()
    const metric = await run()
    expect(metric.rollbackNeedleCleared).toBe(true)
    expect(metric.rollbackEffectiveMs).toBeGreaterThanOrEqual(600)
    await expect(readFile(primary, 'utf8')).resolves.toBe(original)
    await expect(readFile(secondary, 'utf8')).resolves.toBe(original)
  })

  it('稳定阶段又写回 marker 时，必须重新读取并拒绝', async () => {
    const { run, secondary, getMutated } = await fixture()
    const settle = shared.waitForCompileSettled
    vi.spyOn(shared, 'waitForCompileSettled').mockImplementation(async (...args) => {
      const elapsed = await settle(...args)
      await writeFile(secondary, getMutated())
      return elapsed
    })
    await expect(run()).rejects.toThrow(/rollback needles|compile did not settle/)
  })

  it('固定消费产物消失不能当作 marker 清理成功', async () => {
    const { run } = await fixture('missing')
    await expect(run()).rejects.toThrow(/rollback needles|compile did not settle/)
  })

  it('content-hash glob 允许当前编译更换文件名，并验证新产物', async () => {
    const { run } = await fixture('hashed')
    await expect(run()).resolves.toMatchObject({ rollbackNeedleCleared: true })
  })

  it('回滚进程失败不能被 fallback 吞掉', async () => {
    const { run, session, isRollback } = await fixture('retain')
    const failure = new Error('真实 rollback 进程退出')
    session.ensureRunning = () => {
      if (isRollback()) {
        throw failure
      }
    }
    await expect(run()).rejects.toBe(failure)
  })

  it('读取与稳定判断之间的改写须经过新稳定窗口并重新读取', async () => {
    const { run, secondary, original } = await fixture()
    const settle = shared.waitForCompileSettled
    let settled = 0
    let rewrittenAt = 0
    vi.spyOn(shared, 'waitForCompileSettled').mockImplementation(async (...args) => {
      const elapsed = await settle(...args)
      if (++settled === 2) {
        rewrittenAt = Date.now()
        await writeFile(secondary, original)
      }
      return elapsed
    })
    const metric = await run(2_000)
    expect(Date.now() - rewrittenAt).toBeGreaterThanOrEqual(600)
    expect(metric.rollbackNeedleCleared).toBe(true)
  })

  it('第二次读取期间仅出现新编译信号时，也须重新经过稳定窗口', async () => {
    const { run, isRollback, markCompiled } = await fixture()
    const read = output.readOutputFileOnce
    const settle = shared.waitForCompileSettled
    let settled = 0
    let signaledAt = 0
    vi.spyOn(shared, 'waitForCompileSettled').mockImplementation(async (...args) => {
      const elapsed = await settle(...args)
      settled += 1
      return elapsed
    })
    vi.spyOn(output, 'readOutputFileOnce').mockImplementation(async (...args) => {
      const content = await read(...args)
      if (isRollback() && settled === 3 && signaledAt === 0) {
        signaledAt = Date.now()
        markCompiled()
      }
      return content
    })
    const metric = await run(2_000)
    expect(signaledAt).toBeGreaterThan(0)
    expect(Date.now() - signaledAt).toBeGreaterThanOrEqual(600)
    expect(metric.rollbackNeedleCleared).toBe(true)
  })

  it('回滚读取期间取消时保留原始 reason，并保留已恢复的源码', async () => {
    const { run, session, isRollback, sourceFile, original } = await fixture()
    const controller = new AbortController()
    session.signal = controller.signal
    const reason = new Error('回滚读取被取消')
    const read = output.readOutputFileOnce
    vi.spyOn(output, 'readOutputFileOnce').mockImplementation(async (...args) => {
      if (isRollback()) {
        controller.abort(reason)
      }
      return read(...args)
    })
    await expect(run()).rejects.toBe(reason)
    await expect(readFile(sourceFile, 'utf8')).resolves.toBe(original)
  })
})
