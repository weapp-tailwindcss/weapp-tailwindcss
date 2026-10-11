import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { describe, expect, it, vi } from 'vitest'
import { waitForWechatPage } from '../scripts/e2e-preflight/probes/wechat-page'

describe('微信探针页面生命周期', () => {
  it('连接建立后等待页面元数据就绪，再确认本轮 marker', async () => {
    const page = { $: async () => ({ text: async () => 'current-run' }) }
    const currentPage = vi.fn().mockRejectedValueOnce(new Error('page metadata not ready')).mockResolvedValue(page)
    const promise = waitForWechatPage({ currentPage } as Pick<MiniProgram, 'currentPage'>, 'current-run', 1000)
    await expect(promise).resolves.toBe(page)
    expect(currentPage).toHaveBeenCalledTimes(2)
  })

  it('持续错误有界失败并保留原始诊断', async () => {
    const currentPage = vi.fn().mockRejectedValue(new Error('rawPath metadata missing'))
    await expect(waitForWechatPage({ currentPage }, 'current-run', 10)).rejects.toThrow('rawPath metadata missing')
  })

  it('读取到其他页面立即失败，不以重试等待代替项目身份校验', async () => {
    const page = { $: async () => ({ text: async () => 'old-run' }) }
    const currentPage = vi.fn().mockResolvedValue(page)
    await expect(waitForWechatPage({ currentPage }, 'current-run', 1000)).rejects.toThrow('actual=old-run')
    expect(currentPage).toHaveBeenCalledOnce()
  })
})
