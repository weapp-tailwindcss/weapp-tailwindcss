import type { CliOptions, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForInitialWarmup } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'

const tempDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function warmupFixture(options: {
  requireInitialCompileSuccess: boolean
  updatedOutputs?: boolean
  successAt?: (now: number, startedAt: number) => number
  building?: (now: number, startedAt: number) => boolean
}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-initial-warmup-'))
  tempDirs.push(directory)
  const outputWxml = path.join(directory, 'entry.wxml')
  const outputJs = path.join(directory, 'entry.js')
  await Promise.all([
    writeFile(outputWxml, '<view>partial</view>'),
    writeFile(outputJs, 'Page({})'),
  ])
  const startedAt = Date.now()
  const outputTime = new Date(startedAt + (options.updatedOutputs === false ? -100 : 100))
  await Promise.all([
    utimes(outputWxml, outputTime, outputTime),
    utimes(outputJs, outputTime, outputTime),
  ])

  let now = startedAt
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const session = {
    ensureRunning() {
      // 只推进观测时钟；实际轮询仍使用真实计时器，保留异步文件读取与截止判断。
      now += 100
    },
    lastCompileSuccessAt: () => options.successAt?.(now, startedAt) ?? 0,
    ...(options.building && {
      compileState: () => ({
        generation: 1,
        building: options.building!(now, startedAt),
        idleAt: 0,
      }),
    }),
  } as WatchSession
  const watchCase = {
    label: 'fixture/initial-warmup',
    requireInitialCompileSuccess: options.requireInitialCompileSuccess,
    outputWxml,
    outputJs,
  } as WatchCase

  return (timeoutMs = 6000) => waitForInitialWarmup(
    watchCase,
    { timeoutMs, pollMs: 1 } as CliOptions,
    session,
    startedAt,
  )
}

describe('首次 watch warmup 的编译成功合同', () => {
  it.each([
    { label: '没有成功信号', successAt: () => 0 },
    { label: '只有旧轮次成功信号', successAt: (_now: number, startedAt: number) => startedAt - 1 },
  ])('严格模式下新产物不能绕过$label', async ({ successAt }) => {
    const warmup = await warmupFixture({ requireInitialCompileSuccess: true, successAt })
    await expect(warmup(2500)).rejects.toThrow('initial watch warmup did not finish in time')
  })

  it('严格模式等待本轮成功信号及其稳定窗口，而不是部分产物的稳定窗口', async () => {
    const warmup = await warmupFixture({
      requireInitialCompileSuccess: true,
      successAt: (now, startedAt) => now >= startedAt + 3000 ? startedAt + 3000 : 0,
    })

    expect(await warmup()).toBeGreaterThanOrEqual(4500)
  })

  it('编译仍在进行时，即使已有稳定的成功信号也不放行', async () => {
    const warmup = await warmupFixture({
      requireInitialCompileSuccess: true,
      successAt: (_now, startedAt) => startedAt + 100,
      building: (now, startedAt) => now < startedAt + 4000,
    })

    expect(await warmup()).toBeGreaterThanOrEqual(4000)
  })

  it('未要求编译成功信号时继续接受稳定的新产物', async () => {
    const warmup = await warmupFixture({ requireInitialCompileSuccess: false })
    const elapsed = await warmup()

    expect(elapsed).toBeGreaterThanOrEqual(1600)
    expect(elapsed).toBeLessThan(5000)
  })

  it('未要求编译成功信号时继续允许已有产物经过原宽限窗口', async () => {
    const warmup = await warmupFixture({ requireInitialCompileSuccess: false, updatedOutputs: false })

    expect(await warmup()).toBeGreaterThanOrEqual(5000)
  })
})
