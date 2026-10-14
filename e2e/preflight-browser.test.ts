import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { web } from '../scripts/e2e-preflight/probes/web'

const mocks = vi.hoisted(() => ({ chromium: vi.fn(), firefox: vi.fn(), webkit: vi.fn(), image: vi.fn() }))
vi.mock('playwright', () => Object.fromEntries(['chromium', 'firefox', 'webkit'].map(name => [name, {
  executablePath: () => `${name}-executable`,
  launch: mocks[name as keyof typeof mocks],
}])))
vi.mock('../e2e/hbuilderx-local/process', () => ({ resolveChromeExecutable: async () => 'chromium-executable' }))
vi.mock('../scripts/e2e-preflight/io', () => ({ assertImage: mocks.image }))

const context = { root: process.cwd(), dir: os.tmpdir(), runId: 'synthetic', url: 'http://127.0.0.1', phase: 'prepare' as const }
const closes: Array<ReturnType<typeof vi.fn>> = []

function browser() {
  const close = vi.fn(async () => undefined)
  closes.push(close)
  return {
    close,
    version: () => '1.0',
    newPage: async () => ({
      setDefaultTimeout: vi.fn(),
      goto: async () => undefined,
      locator: () => ({ textContent: async () => context.runId, fill: async () => undefined, click: async () => undefined }),
      getByText: () => ({ waitFor: async () => undefined }),
      screenshot: async () => undefined,
    }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  closes.length = 0
  for (const launch of [mocks.chromium, mocks.firefox, mocks.webkit]) {
    launch.mockImplementation(async () => browser())
  }
  vi.stubEnv('E2E_HBUILDERX_CHROME_PATH', undefined)
  vi.stubEnv('PLAYWRIGHT_CHROMIUM_CHANNEL', undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('扩展三浏览器的真实交互预检范围', () => {
  it('普通预检保持 Chromium 范围，实例按后台模式启动并关闭', async () => {
    await web(context)
    expect(mocks.firefox).not.toHaveBeenCalled()
    expect(mocks.webkit).not.toHaveBeenCalled()
    expect(mocks.chromium).toHaveBeenCalledWith(expect.objectContaining({ headless: true }))
    expect(closes[0]).toHaveBeenCalledOnce()
  })

  it('扩展模式逐个交互、截图并绑定 Firefox/WebKit 的路径与版本', async () => {
    const output = await web({ ...context, extended: true })
    expect(output.binding).toMatchObject({ firefox: 'firefox-executable', firefoxVersion: '1.0', webkit: 'webkit-executable', webkitVersion: '1.0' })
    expect(mocks.image).toHaveBeenCalledTimes(3)
    expect(closes).toHaveLength(3)
    expect(closes.every(close => close.mock.calls.length === 1)).toBe(true)
  })

  it('Firefox 缺失时阻断，已启动的 Chromium 已关闭且不启动 WebKit', async () => {
    mocks.firefox.mockRejectedValue(new Error('Firefox missing'))
    await expect(web({ ...context, extended: true })).rejects.toThrow('Firefox missing')
    expect(closes[0]).toHaveBeenCalledOnce()
    expect(mocks.webkit).not.toHaveBeenCalled()
  })

  it('网站覆盖 Chromium channel 时预检相同入口并绑定版本', async () => {
    vi.stubEnv('PLAYWRIGHT_CHROMIUM_CHANNEL', 'chrome')
    const output = await web({ ...context, extended: true })
    expect(mocks.chromium).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'chrome', headless: true }))
    expect(output.binding).toMatchObject({ websiteChannel: 'chrome', websiteChannelVersion: '1.0' })
    expect(closes).toHaveLength(4)
    expect(closes.every(close => close.mock.calls.length === 1)).toBe(true)
  })

  it('交互或截图失败时仍关闭本轮实例，不继续后续浏览器', async () => {
    mocks.image.mockRejectedValue(new Error('截图无效'))
    await expect(web({ ...context, extended: true })).rejects.toThrow('截图无效')
    expect(closes[0]).toHaveBeenCalledOnce()
    expect(mocks.firefox).not.toHaveBeenCalled()
  })

  it('同时保留交互与清理失败，不将清理错误覆盖首次失败', async () => {
    const instance = browser()
    instance.close.mockRejectedValue(new Error('关闭失败'))
    mocks.chromium.mockResolvedValue(instance)
    mocks.image.mockRejectedValue(new Error('截图无效'))
    const failure = await web({ ...context, extended: true }).catch(error => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure.errors.map((error: Error) => error.message)).toEqual(['截图无效', '关闭失败'])
    expect(mocks.firefox).not.toHaveBeenCalled()
  })
})
