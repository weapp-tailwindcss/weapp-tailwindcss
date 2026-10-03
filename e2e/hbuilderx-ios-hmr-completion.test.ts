import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { observeHmrStep } from './hbuilderx-local/hmr-lifecycle'

const transfer = '开始差量编译...\n项目 demo 编译成功。\n同步手机端程序文件成功\n'

function createStep() {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = Object.assign(new ChildProcess(), { stdout, stderr })
  return { stdout, stderr, observer: observeHmrStep(child, 'app-ios') }
}

describe('iOS 本轮 HMR 完成契约', () => {
  it('缺少设备取证回调立即拒绝，不能用 pending 表示通过', async () => {
    const { stdout, observer } = createStep()
    try {
      stdout.emit('data', transfer)
      await expect(observer.waitForCompletion(100, () => {})).rejects.toThrow('iOS HMR 缺少运行时验证')
    }
    finally { observer.dispose() }
  })

  it.each([
    '开始差量编译...\n',
    '开始差量编译...\n项目 demo 编译成功。\n正在同步手机端程序文件...\n',
    '同步手机端程序文件成功\n',
    '项目 demo 编译成功。\n同步手机端程序文件成功\n',
    `${transfer}开始差量编译...\n`,
  ])('只有中间产物或未完成传输不得执行设备验收：%s', async (output) => {
    const { stdout, observer } = createStep()
    const runtime = vi.fn(async () => {})
    try {
      stdout.emit('data', output)
      await expect(observer.waitForCompletion(10, () => {}, runtime)).rejects.toThrow('编译与同步完成')
      expect(runtime).not.toHaveBeenCalled()
      expect(observer.snapshot().state).toBe('pending')
    }
    finally { observer.dispose() }
  })

  it('不同输出流不能把早于编译的同步完成拼成正确顺序', async () => {
    const { stdout, stderr, observer } = createStep()
    const runtime = vi.fn(async () => {})
    try {
      stderr.emit('data', '同步手机端程序文件成功\n')
      stdout.emit('data', '项目 demo 编译成功。\n')
      await expect(observer.waitForCompletion(10, () => {}, runtime)).rejects.toThrow('编译与同步完成')
      expect(runtime).not.toHaveBeenCalled()
    }
    finally { observer.dispose() }
  })

  it('当轮编译、传输、设备取证全部完成后才记录 updated', async () => {
    const { stdout, observer } = createStep()
    let release!: () => void
    const runtime = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    try {
      stdout.emit('data', transfer)
      const completed = observer.waitForCompletion(100, () => {}, runtime)
      await vi.waitFor(() => expect(runtime).toHaveBeenCalledTimes(1))
      expect(observer.snapshot().state).toBe('pending')
      release()
      await completed
      expect(observer.snapshot()).toMatchObject({ state: 'updated', runtimeVerified: true })
    }
    finally { observer.dispose() }
  })

  it('同步完成后、设备取证期间到达的重启仍使严格 HMR 失败', async () => {
    const { stdout, observer } = createStep()
    try {
      stdout.emit('data', transfer)
      await expect(observer.waitForCompletion(100, () => {}, async () => {
        stdout.emit('data', 'App Launch\n')
      })).rejects.toThrow('restarted')
      expect(observer.snapshot().state).toBe('restarted')
    }
    finally { observer.dispose() }
  })

  it.each([false, true])('取证期间新编译 complete=%s 必须作废旧证据', async (complete) => {
    const { stdout, observer } = createStep()
    const runtime = vi.fn(async () => 'current').mockImplementationOnce(async () => {
      stdout.emit('data', complete ? transfer : '开始差量编译...\n')
      return 'stale'
    })
    try {
      stdout.emit('data', transfer)
      const completed = observer.waitForCompletion(complete ? 1000 : 10, () => {}, runtime)
      if (complete) {
        await expect(completed).resolves.toBe('current')
        expect(runtime).toHaveBeenCalledTimes(2)
      }
      else {
        await expect(completed).rejects.toThrow('编译与同步完成')
        expect(runtime).toHaveBeenCalledTimes(1)
        expect(observer.snapshot()).toMatchObject({ state: 'pending', runtimeVerified: false })
      }
    }
    finally { observer.dispose() }
  })

  it('设备证明返回后再次开始编译会使完成状态失效', async () => {
    const { stdout, observer } = createStep()
    try {
      stdout.emit('data', transfer)
      await observer.waitForCompletion(100, () => {}, async () => {})
      stdout.emit('data', '开始差量编译...\n')
      expect(observer.snapshot()).toMatchObject({ state: 'pending', runtimeVerified: false })
      expect(observer.assertNoFallback).toThrow('旧运行时证据已失效')
    }
    finally { observer.dispose() }
  })
})
