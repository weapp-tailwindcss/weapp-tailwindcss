import { describe, expect, it } from 'vitest'
import { WechatEnvironmentError } from '../scripts/wechat/errors'
import { cleanupFailure, withCleanup } from './framework-ide/cleanup'
import { frameworkIdeProbeExitCode, IDE_PROBE_BLOCKED_EXIT_CODE } from './framework-ide/probe-failure'

describe('framework IDE probe failure boundary', () => {
  it('穿过 HMR 包装和聚合异常保留微信环境阻断', () => {
    const protocol = Object.assign(new Error('DevTools did not respond to protocol method App.captureScreenshot within 1812ms'), {
      code: 'DEVTOOLS_PROTOCOL_TIMEOUT',
      method: 'App.captureScreenshot',
    })
    const environment = new WechatEnvironmentError('本轮请求终态失败，重新预检', { cause: protocol })
    const wrapped = new Error('recent watch logs contain a transient launch timeout', { cause: environment })
    expect(frameworkIdeProbeExitCode(new AggregateError([new Error('product assertion'), wrapped], '聚合探针失败'))).toBe(IDE_PROBE_BLOCKED_EXIT_CODE)
    expect(frameworkIdeProbeExitCode(protocol)).toBe(IDE_PROBE_BLOCKED_EXIT_CODE)
  })

  it.each(['close project', 'restore source', 'stop watcher'])('%s 清理失败独立于主错误并阻断调度', async (label) => {
    const primary = new Error('page "fixture" is not found')
    const cleanup = new Error('disk or process failure')
    const error = await withCleanup(async () => {
      throw primary
    }, [{
      label,
      run: async () => { throw cleanup },
    }]).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1].cause).toBe(cleanup)
    expect(frameworkIdeProbeExitCode(error)).toBe(IDE_PROBE_BLOCKED_EXIT_CODE)
    expect(frameworkIdeProbeExitCode(cleanupFailure(label, cleanup))).toBe(IDE_PROBE_BLOCKED_EXIT_CODE)
  })

  it('普通产品失败和日志中的环境错误名称不升级为环境阻断', () => {
    for (const error of [
      new Error('page "fixture" is not found'),
      new Error('WechatEnvironmentError: product fixture includes an error log'),
      Object.assign(new Error('ordinary failure'), { name: 'WechatEnvironmentError' }),
      { name: 'WechatEnvironmentError', code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'App.captureScreenshot' },
    ]) {
      expect(frameworkIdeProbeExitCode(error)).toBe(1)
    }
  })

  it('循环 cause 不会阻止检查其他聚合分支', () => {
    const cyclic = new Error('ordinary failure')
    cyclic.cause = cyclic
    expect(frameworkIdeProbeExitCode(cyclic)).toBe(1)
    expect(frameworkIdeProbeExitCode(new AggregateError([cleanupFailure('close', 'failed'), cyclic], '聚合清理失败'))).toBe(IDE_PROBE_BLOCKED_EXIT_CODE)
  })
})
