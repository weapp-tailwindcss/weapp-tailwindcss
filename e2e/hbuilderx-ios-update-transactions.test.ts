import { Buffer } from 'node:buffer'
import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { observeHmrStep } from './hbuilderx-local/hmr-lifecycle'

const start = '开始差量编译...\n'
const compiled = '项目 demo 编译成功。\n'
const syncing = '正在同步手机端程序文件...\n'
const synced = '同步手机端程序文件成功\n'
const noChange = '本次代码变更，编译结果未发生变化，跳过同步手机端程序文件。\n'
const transfer = start + compiled + syncing + synced

function createStep(mode: 'hmr' | 'native-reload') {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = Object.assign(new ChildProcess(), { stdout, stderr })
  return { stdout, stderr, observer: observeHmrStep(child, 'app-ios', mode) }
}

describe.each(['hmr', 'native-reload'] as const)('iOS 编译与同步事务归属：%s', (mode) => {
  it('旧事务同步与新事务无变化交错后，仍须取得本轮运行时证明', async () => {
    const { stdout, observer } = createStep(mode)
    const runtime = vi.fn(async () => 'current')
    try {
      stdout.emit('data', start + compiled + syncing + start + synced + noChange)
      await expect(observer.waitForCompletion(100, () => {}, runtime)).resolves.toBe('current')
      expect(runtime).toHaveBeenCalledTimes(1)
      expect(observer.snapshot()).toMatchObject({ state: 'updated', runtimeVerified: true })
    }
    finally { observer.dispose() }
  })

  it('旧事务同步成功不能冒充最新事务的编译完成', async () => {
    const { stdout, observer } = createStep(mode)
    const runtime = vi.fn(async () => {})
    try {
      stdout.emit('data', start + compiled + syncing + start + synced)
      await expect(observer.waitForCompletion(10, () => {}, runtime)).rejects.toThrow('编译与同步完成')
      expect(runtime).not.toHaveBeenCalled()
    }
    finally { observer.dispose() }
  })

  it.each([noChange, start + noChange, start + compiled + syncing + start + noChange])('没有本轮真实传输时无变化不能通过：%s', async (output) => {
    const { stdout, observer } = createStep(mode)
    const runtime = vi.fn(async () => {})
    try {
      stdout.emit('data', output)
      await expect(observer.waitForCompletion(10, () => {}, runtime)).rejects.toThrow('编译与同步完成')
      expect(runtime).not.toHaveBeenCalled()
    }
    finally { observer.dispose() }
  })

  it('新事务无变化时不能吞掉尚未完成的旧事务同步', async () => {
    const { stdout, observer } = createStep(mode)
    const runtime = vi.fn(async () => 'current')
    try {
      stdout.emit('data', start + compiled + syncing + start + noChange)
      const completed = observer.waitForCompletion(1000, () => {}, runtime)
      expect(runtime).not.toHaveBeenCalled()
      stdout.emit('data', synced)
      await expect(completed).resolves.toBe('current')
      expect(runtime).toHaveBeenCalledTimes(1)
    }
    finally { observer.dispose() }
  })

  it('无变化日志跨 UTF8 分片且其他流插入旁路日志时仍保留事务', async () => {
    const { stdout, stderr, observer } = createStep(mode)
    const runtime = vi.fn(async () => 'current')
    try {
      stdout.emit('data', transfer + start)
      const bytes = Buffer.from(noChange)
      stdout.emit('data', bytes.subarray(0, 5))
      stderr.emit('data', '设备旁路日志\n')
      stdout.emit('data', bytes.subarray(5))
      await expect(observer.waitForCompletion(100, () => {}, runtime)).resolves.toBe('current')
      expect(runtime).toHaveBeenCalledTimes(1)
    }
    finally { observer.dispose() }
  })

  it('取证期间开始并完成无变化事务，必须用新 identity 重新取证', async () => {
    const { stdout, observer } = createStep(mode)
    const runtime = vi.fn(async (_remainingMs: number, _identity: string) => 'current').mockImplementationOnce(async () => {
      stdout.emit('data', start + noChange)
      return 'stale'
    })
    try {
      stdout.emit('data', transfer)
      await expect(observer.waitForCompletion(1000, () => {}, runtime)).resolves.toBe('current')
      expect(runtime).toHaveBeenCalledTimes(2)
      expect(runtime.mock.calls[0]?.[1]).not.toBe(runtime.mock.calls[1]?.[1])
    }
    finally { observer.dispose() }
  })

  it('已返回的证据在新无变化事务后失效，显式重新等待才可恢复', async () => {
    const { stdout, observer } = createStep(mode)
    const runtime = vi.fn(async (_remainingMs: number, _identity: string) => 'current')
    try {
      stdout.emit('data', transfer)
      await observer.waitForCompletion(100, () => {}, runtime)
      stdout.emit('data', start + noChange)
      expect(observer.snapshot()).toMatchObject({ state: 'pending', runtimeVerified: false })
      expect(observer.assertNoFallback).toThrow('旧运行时证据已失效')
      await expect(observer.waitForCompletion(100, () => {}, runtime)).resolves.toBe('current')
      expect(runtime).toHaveBeenCalledTimes(2)
      expect(runtime.mock.calls[0]?.[1]).not.toBe(runtime.mock.calls[1]?.[1])
    }
    finally { observer.dispose() }
  })

  it('再次取证期间出现新无变化事务，也必须丢弃本次旧结果', async () => {
    const { stdout, observer } = createStep(mode)
    const runtime = vi.fn(async (_remainingMs: number, _identity: string) => 'current')
    try {
      stdout.emit('data', transfer)
      await observer.waitForCompletion(100, () => {}, runtime)
      runtime.mockImplementationOnce(async () => {
        stdout.emit('data', start + noChange)
        return 'stale'
      })
      await expect(observer.waitForCompletion(100, () => {}, runtime)).resolves.toBe('current')
      expect(runtime).toHaveBeenCalledTimes(3)
      expect(runtime.mock.calls[1]?.[1]).not.toBe(runtime.mock.calls[2]?.[1])
    }
    finally { observer.dispose() }
  })

  it('ANSI 跨片恢复后普通日志不能重放已消费的生命周期事件', async () => {
    const { stdout, stderr, observer } = createStep(mode)
    const runtime = vi.fn(async (_remainingMs: number, _identity: string) => 'current')
    try {
      stdout.emit('data', '\u001B[3')
      stderr.emit('data', '设备旁路日志\n')
      stdout.emit('data', `2m${transfer}\u001B[`)
      stdout.emit('data', '0m')
      await observer.waitForCompletion(100, () => {}, runtime)
      stdout.emit('data', '普通日志\n')
      stderr.emit('data', '\u001B[32m普通日志\u001B[0m\n')
      expect(observer.snapshot()).toMatchObject({ state: 'updated', runtimeVerified: true })
      expect(observer.assertNoFallback).not.toThrow()
      await observer.waitForCompletion(100, () => {}, runtime)
      expect(runtime.mock.calls[0]?.[1]).toBe(runtime.mock.calls[1]?.[1])
    }
    finally { observer.dispose() }
  })

  it('事务完成不能放宽重启、重装与失败边界', async () => {
    const { stdout, observer } = createStep(mode)
    try {
      stdout.emit('data', `${start}${compiled}${syncing}${start}${synced}${noChange}App Launch\n`)
      const completed = observer.waitForCompletion(100, () => {}, async () => {})
      if (mode === 'hmr') {
        await expect(completed).rejects.toThrow('restarted')
      }
      else {
        await expect(completed).resolves.toBeUndefined()
      }
      stdout.emit('data', '正在安装HBuilder调试基座...\n热更新失败\n')
      expect(observer.assertNoFallback).toThrow('failed')
    }
    finally { observer.dispose() }
  })
})
