import { expect, it, vi } from 'vitest'
import { verifyBrowserRendering, verifyImageVersion } from '../scripts/ci/verify-playwright-image.mjs'

const info = { driverVersion: '1.64.1', dockerImageName: 'mcr.microsoft.com/playwright:v1.64.1-noble' }

it('镜像和三个实际解析版本必须精确一致，缺项或漂移不能降级', () => {
  expect(() => verifyImageVersion(info, ['1.64.1', '1.64.1', '1.64.1'])).not.toThrow()
  for (const versions of [['1.64.2', '1.64.2', '1.64.2'], ['1.64.1', '1.64.1', '1.64.2'], ['1.64.1', undefined, '1.64.1']]) {
    expect(() => verifyImageVersion(info, versions)).toThrow()
  }
  for (const marker of [null, {}, { ...info, driverVersion: '1.64.1-extra' }, { ...info, dockerImageName: 'untrusted' }]) {
    expect(() => verifyImageVersion(marker, ['1.64.1', '1.64.1', '1.64.1'])).toThrow()
  }
})

it('浏览器缺失时传播失败，不执行下载兜底', async () => {
  const launch = vi.fn().mockRejectedValue(new Error('executable missing'))
  await expect(verifyBrowserRendering({ webkit: { launch } }, ['webkit'])).rejects.toThrow('executable missing')
  expect(launch).toHaveBeenCalledTimes(1)
  expect(launch).toHaveBeenCalledWith({ headless: true, timeout: 30_000 })
})

it('真实页面初始化失败时仍关闭本轮浏览器', async () => {
  const close = vi.fn()
  const launch = vi.fn().mockResolvedValue({ newPage: vi.fn().mockRejectedValue(new Error('render failed')), close })
  await expect(verifyBrowserRendering({ firefox: { launch } }, ['firefox'])).rejects.toThrow('render failed')
  expect(close).toHaveBeenCalledTimes(1)
})

it.each([[], ['unknown'], ['chromium', 'unknown']])('拒绝无效引擎集合 %j', async (...engines) => {
  await expect(verifyBrowserRendering({}, engines)).rejects.toThrow('必须指定受支持的浏览器')
})
