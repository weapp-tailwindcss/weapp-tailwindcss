import { expect, it, vi } from 'vitest'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { createIosLaunchPublication } from './react-native/ios-launch-publication'
import { headers, pair, withReporter } from './react-native/reporter-fixture'

it('CLI 尚未绑定或只退出但未完成时不授予 context，等待不消耗采集预算', async () => {
  const publication = syntheticRuntimeInstallation().publication
  const read = vi.fn(async () => publication)
  const launch = createIosLaunchPublication(read)
  let entered!: () => void
  const requested = new Promise<void>(resolve => entered = resolve)
  let complete!: () => void
  const cli = new Promise<void>(resolve => complete = resolve)
  await withReporter(async ({ endpoint, post, reporter, capture }) => {
    const context = fetch(`${endpoint}/context`, { headers })
    await requested
    expect((await post('/case', pair())).status).toBe(409)
    expect(read).not.toHaveBeenCalled()
    launch.bind(cli)
    expect((await post('/case', pair())).status).toBe(409)
    expect(read).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    expect(reporter.captureElapsed()).toBe(0)
    complete()
    expect((await context).status).toBe(200)
    expect((await post('/case', pair())).status).toBe(200)
    expect(capture).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledOnce()
    // 启动门禁只完成一次，下一次 HMR 仍读取当前 publication。
    reporter.setRevision('next-phase')
    expect((await fetch(`${endpoint}/context`, { headers })).status).toBe(425)
    expect(read).toHaveBeenCalledTimes(2)
  }, (signal) => {
    entered()
    return launch.read(signal)
  })
})

it('首个请求之前的 CLI 失败保留原错误，publication 和采集均不执行', async () => {
  const failure = new Error('original CLI build failure')
  const read = vi.fn(async () => syntheticRuntimeInstallation().publication)
  const launch = createIosLaunchPublication(read)
  launch.bind(Promise.reject(failure))
  await expect(launch.ready).rejects.toBe(failure)
  await withReporter(async ({ endpoint, reporter, post, capture }) => {
    expect((await fetch(`${endpoint}/context`, { headers })).status).toBe(500)
    const error = (() => {
      try {
        reporter.assertReady()
      }
      catch (error) { return error as AggregateError }
    })()
    expect(error?.errors).toEqual([failure])
    expect((await post('/case', pair())).status).toBe(409)
    expect(capture).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  }, signal => launch.read(signal))
})

it.each(['resolve', 'reject'] as const)('owner 关闭取消未绑定的 context，迟到 CLI %s 不授予 publication', async (outcome) => {
  const read = vi.fn(async () => syntheticRuntimeInstallation().publication)
  const launch = createIosLaunchPublication(read)
  let entered!: () => void
  const requested = new Promise<void>(resolve => entered = resolve)
  await withReporter(async ({ endpoint, reporter, capture }) => {
    const context = fetch(`${endpoint}/context`, { headers })
    await requested
    reporter.stop()
    expect((await context).status).toBe(409)
    const failure = new Error('late launch failure')
    launch.bind(outcome === 'resolve' ? Promise.resolve() : Promise.reject(failure))
    if (outcome === 'resolve') {
      await launch.ready
    }
    else {
      await expect(launch.ready).rejects.toBe(failure)
    }
    expect(read).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    expect(() => reporter.assertReady()).not.toThrow()
    await reporter.drain()
  }, (signal) => {
    entered()
    return launch.read(signal)
  })
})
