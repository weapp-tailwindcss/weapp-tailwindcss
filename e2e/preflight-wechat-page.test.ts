import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { describe, expect, it, vi } from 'vitest'
import { isWechatProtocolUnavailable, waitForWechatPage } from '../scripts/e2e-preflight/probes/wechat-page'

describe('微信探针页面生命周期', () => {
  it('连接建立后等待页面元数据就绪，再确认本轮 marker', async () => {
    const data = vi.fn(async () => 'current-run')
    const page = { data }
    const currentPage = vi.fn().mockRejectedValueOnce(new Error('page metadata not ready')).mockResolvedValue(page)
    const promise = waitForWechatPage({ currentPage } as Pick<MiniProgram, 'currentPage'>, 'current-run', 1000)
    await expect(promise).resolves.toBe(page)
    expect(currentPage).toHaveBeenCalledTimes(2)
    expect(data).toHaveBeenCalledWith('marker', { timeout: expect.any(Number), fallback: false })
  })

  it('持续错误有界失败并保留原始诊断', async () => {
    const currentPage = vi.fn().mockRejectedValue(new Error('rawPath metadata missing'))
    await expect(waitForWechatPage({ currentPage }, 'current-run', 10)).rejects.toThrow('rawPath metadata missing')
  })

  it('真实协议超时按单次请求预算重试，不启用 SDK 内部重试与兜底', async () => {
    const page = { data: async () => 'current-run' }
    const currentPage = vi.fn().mockRejectedValueOnce(Object.assign(new Error('protocol timeout'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'App.getCurrentPage' })).mockResolvedValue(page)
    await expect(waitForWechatPage({ currentPage } as Pick<MiniProgram, 'currentPage'>, 'current-run', 1000)).resolves.toBe(page)
    expect(currentPage).toHaveBeenCalledTimes(2)
    expect(currentPage).toHaveBeenCalledWith({ timeout: 1000, retries: 1, pageStackFallback: false, appFunctionFallback: false })
  })

  it('页面数据协议短暂超时也在探针预算内重试', async () => {
    const data = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('data timeout'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'Page.getData' }))
      .mockResolvedValue('current-run')
    const page = { data }
    const currentPage = vi.fn().mockResolvedValue(page)
    await expect(waitForWechatPage({ currentPage } as Pick<MiniProgram, 'currentPage'>, 'current-run', 1000)).resolves.toBe(page)
    expect(data).toHaveBeenCalledTimes(2)
  })

  it('缺少 marker 时只执行有界数据读取，不回退到无超时的元素文本查询', async () => {
    const data = vi.fn(async () => undefined)
    const page = { data, $: vi.fn() }
    const currentPage = vi.fn().mockResolvedValue(page)
    await expect(waitForWechatPage({ currentPage } as Pick<MiniProgram, 'currentPage'>, 'current-run', 10)).rejects.toThrow('未在 10ms 内就绪')
    expect(data).toHaveBeenCalledOnce()
    expect(data).toHaveBeenCalledWith('marker', { timeout: expect.any(Number), fallback: false })
    expect(page.$).not.toHaveBeenCalled()
  })

  it('读取到其他页面立即失败，不以重试等待代替项目身份校验', async () => {
    const page = { data: async () => 'old-run' }
    const currentPage = vi.fn().mockResolvedValue(page)
    await expect(waitForWechatPage({ currentPage }, 'current-run', 1000)).rejects.toThrow('actual=old-run')
    expect(currentPage).toHaveBeenCalledOnce()
  })

  it('聚合错误中的协议超时说明连接不可继续使用', () => {
    const error = new AggregateError([Object.assign(new Error('protocol timeout'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT' })], 'page unavailable')
    expect(isWechatProtocolUnavailable(error)).toBe(true)
    expect(isWechatProtocolUnavailable(new Error('old-run'))).toBe(false)
  })
})
