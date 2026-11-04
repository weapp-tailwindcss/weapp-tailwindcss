import { setTimeout as delay } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { awaitNativeReportWithLaunch } from './react-native/native-wait'

it('启动先失败时取消并排空报告等待，收尾后不能再次恢复应用', async () => {
  const failure = new Error('invalid scratch receipt')
  const recover = vi.fn()
  let stopped = false
  let signal!: AbortSignal
  const result = awaitNativeReportWithLaunch(Promise.reject(failure), async (owner) => {
    signal = owner
    try {
      await delay(180_000, undefined, { signal: owner })
      recover()
    }
    finally { stopped = true }
  })
  await expect(result).rejects.toBe(failure)
  expect(signal.aborted).toBe(true)
  expect(stopped).toBe(true)
  expect(recover).not.toHaveBeenCalled()
})

it('报告等待取消后的真实收尾错误必须与原启动错误一起保留', async () => {
  const failure = new Error('original launch error')
  const cleanup = new Error('report waiter cleanup failed')
  const result = awaitNativeReportWithLaunch(Promise.reject(failure), async (signal) => {
    try {
      await delay(180_000, undefined, { signal })
    }
    catch {
      throw cleanup
    }
  }).catch(error => error)
  expect(await result).toBeInstanceOf(AggregateError)
  expect((await result).errors).toEqual([failure, cleanup])
})

it('报告先失败时不必等待仍在构建的 CLI，保留报告首错并观察迟到启动失败', async () => {
  const failure = new Error('runtime report failed')
  let reject!: (error: Error) => void
  const launch = new Promise<void>((_resolve, fail) => reject = fail)
  await expect(awaitNativeReportWithLaunch(launch, async () => {
    throw failure
  })).rejects.toBe(failure)
  reject(new Error('late CLI cancellation'))
  await expect(launch).rejects.toThrow('late CLI cancellation')
})

it('提前报告仍需等待完整启动门禁，成功时保留报告原值', async () => {
  let complete!: () => void
  const launch = new Promise<void>(resolve => complete = resolve)
  const report = { marker: 'current-baseline' }
  let finished = false
  const result = awaitNativeReportWithLaunch(launch, async () => report).then((value) => {
    finished = true
    return value
  })
  await Promise.resolve()
  expect(finished).toBe(false)
  complete()
  await expect(result).resolves.toBe(report)
})
