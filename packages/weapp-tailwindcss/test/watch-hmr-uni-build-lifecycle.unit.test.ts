import type { CliOptions, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogLineBuffer, createPollingCompileTracker } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/compile-state'
import { waitForCompileSettled } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'
import * as outputEntries from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/outputs/file-entries'
import * as outputRead from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/outputs/read'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('uni polling build 的编译世代边界', () => {
  it('初始扫描与旧世代 idle 都不能释放当前构建', () => {
    const tracker = createPollingCompileTracker()
    tracker.observe('[uni-e2e-watch] mode=polling-build platform=mp-weixin', 1)
    expect(tracker.current()?.building).toBe(true)
    tracker.observe('[uni-e2e-watch:build] {"generation":1,"status":"start"}', 2)
    tracker.observe('[uni-e2e-watch:build] {"generation":2,"status":"start"}', 3)
    tracker.observe('[uni-e2e-watch:build] {"generation":1,"status":"idle"}', 4)
    tracker.observe('DONE Build complete.', 5)
    tracker.observe('[uni-e2e-watch:build] {"generation":2,"status":"invalid"}', 6)
    expect(tracker.current()).toEqual({ generation: 2, building: true, idleAt: 0 })
    tracker.observe('[uni-e2e-watch:build] {"generation":2,"status":"idle"}', 7)
    tracker.observe('[uni-e2e-watch:build] {"generation":2,"status":"idle"}', 8)
    expect(tracker.current()).toEqual({ generation: 2, building: false, idleAt: 7 })
  })

  it('UTF-8、CRLF 与 JSON 分块按完整行解析，两个流保持独立', () => {
    const lines: string[] = []
    const stdout = createLogLineBuffer(line => lines.push(line))
    const stderr = createLogLineBuffer(line => lines.push(`stderr:${line}`))
    const bytes = Buffer.from('编译成功\r\n[uni-e2e-watch:build] {"generation":1,"status":"idle"}\n')
    for (const byte of bytes) {
      stdout(Buffer.from([byte]))
    }
    stdout('out')
    stderr('err\n')
    stdout('put')
    stdout.flush()
    stderr.flush()
    expect(lines).toEqual(['编译成功', '[uni-e2e-watch:build] {"generation":1,"status":"idle"}', 'stderr:err', 'output'])
  })

  it('上一轮成功不能在下一轮全量构建中放行', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(5_000)
    let state = { generation: 2, building: true, idleAt: 4_300 }
    let settled = false
    const waiting = waitForCompileSettled(
      { label: 'uni polling build' } as WatchCase,
      { timeoutMs: 3_000, pollMs: 20 } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => 4_300,
        compileState: () => state,
      } as unknown as WatchSession,
      4_200,
    ).then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(650)
    expect(settled).toBe(false)
    state = { generation: 2, building: false, idleAt: Date.now() }
    await vi.advanceTimersByTimeAsync(650)
    await waiting
    expect(settled).toBe(true)
  })

  it('默认声明产物在入口暂缺时仍为必需，style-only override 保留范围', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'uni-build-missing-'))
    const wxml = path.join(root, 'index.wxml')
    const js = path.join(root, 'index.js')
    const style = path.join(root, 'app.wxss')
    const startedAt = Date.now() - 1_000
    const watchCase = { label: '产物暂缺', outputWxml: wxml, outputJs: js } as WatchCase
    const options = { timeoutMs: 30, pollMs: 1 } as CliOptions
    const session = { ensureRunning() {}, lastCompileSuccessAt: () => startedAt } as unknown as WatchSession
    try {
      await expect(waitForCompileSettled(watchCase, options, session, startedAt))
        .rejects
        .toThrow('watch compile did not settle in time')
      await writeFile(style, '.ready{}')
      await waitForCompileSettled(watchCase, { ...options, timeoutMs: 1_500 }, session, startedAt, [style])
      await Promise.all([writeFile(wxml, '<view/>'), writeFile(js, 'Page({})')])
      await waitForCompileSettled(watchCase, { ...options, timeoutMs: 1_500 }, session, startedAt)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('新产物或 plugin 信号不能替代本轮 managed idle', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(6_000)
    let state = { generation: 1, building: false, idleAt: 4_300 }
    let settled = false
    const waiting = waitForCompileSettled(
      { label: 'native fallback' } as WatchCase,
      { timeoutMs: 3_000, pollMs: 20 } as CliOptions,
      {
        ensureRunning() {},
        lastCompileSuccessAt: () => 4_300,
        compileState: () => state,
        pluginProcessSamplesSince: () => [{ at: 5_000, metric: 'total' }],
      } as unknown as WatchSession,
      5_000,
    ).then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(650)
    expect(settled).toBe(false)
    state = { generation: 2, building: false, idleAt: Date.now() }
    await vi.advanceTimersByTimeAsync(650)
    await waiting
    expect(settled).toBe(true)
  })

  it('异步产物扫描中启动新世代时重新等待', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(5_000)
    let state = { generation: 1, building: false, idleAt: 4_300 }
    let scans = 0
    vi.spyOn(outputEntries, 'expandOutputFileEntries').mockImplementation(async () => {
      scans += 1
      if (scans === 2) {
        state = { generation: 2, building: true, idleAt: 4_300 }
      }
      return ['output.wxss']
    })
    vi.spyOn(outputRead, 'getOutputMtimeOnce').mockResolvedValue(4_300)
    let settled = false
    const waiting = waitForCompileSettled(
      { label: '扫描世代变化' } as WatchCase,
      { timeoutMs: 3_000, pollMs: 20 } as CliOptions,
      { ensureRunning() {}, lastCompileSuccessAt: () => 4_300, compileState: () => state } as unknown as WatchSession,
      4_200,
      ['output.wxss'],
    ).then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(650)
    expect(settled).toBe(false)
    state = { generation: 2, building: false, idleAt: Date.now() }
    await vi.advanceTimersByTimeAsync(650)
    await waiting
    expect(settled).toBe(true)
  })

  it('可选 CSS 出现后消失，必须等待当前表达式恢复', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(5_000)
    let scans = 0
    let restored = false
    let restoredAt = 0
    vi.spyOn(outputEntries, 'expandOutputFileEntries').mockImplementation(async () => {
      scans += 1
      return scans === 2 || restored ? ['bundle-current.wxss'] : []
    })
    vi.spyOn(outputRead, 'getOutputMtimeOnce').mockImplementation(async () => restoredAt || 4_300)
    let settled = false
    const waiting = waitForCompileSettled(
      { label: '可选 CSS 生命周期' } as WatchCase,
      { timeoutMs: 3_000, pollMs: 20 } as CliOptions,
      { ensureRunning() {}, lastCompileSuccessAt: () => 5_000 } as unknown as WatchSession,
      4_200,
      ['bundle-*.wxss'],
    ).then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(650)
    expect(settled).toBe(false)
    restored = true
    restoredAt = Date.now()
    await vi.advanceTimersByTimeAsync(650)
    await waiting
    expect(settled).toBe(true)
  })
})
