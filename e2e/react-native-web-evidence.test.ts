import fs from 'node:fs/promises'
import { Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runWebRuntime } from './react-native/web-runtime'

const mock = vi.hoisted(() => {
  const state = {
    card: { width: '180px', height: '48px', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)' },
    theme: null,
  }
  const screenshot = vi.fn().mockResolvedValue(undefined)
  const box = { x: 0, y: 0, width: 180, height: 48 }
  const background = vi.fn().mockResolvedValue('rgb(43, 127, 255)')
  const color = vi.fn().mockResolvedValue('rgb(255, 255, 255)')
  const card = { boundingBox: vi.fn().mockResolvedValue(box), evaluate: background }
  const page = {
    on: vi.fn(),
    goto: vi.fn().mockResolvedValue(undefined),
    getByText: () => ({ waitFor: vi.fn().mockResolvedValue(undefined) }),
    getByTestId: (id: string) => id === 'tw-rn-card' ? card : id === 'tw-rn-theme' ? { evaluate: color } : { screenshot },
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(state),
  }
  const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined) }
  return { page, browser, background, color, card, screenshot, launch: vi.fn().mockResolvedValue(browser) }
})

vi.mock('playwright', () => ({ chromium: { launch: mock.launch } }))

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
  vi.clearAllMocks()
})

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-web-evidence-'))
  roots.push(root)
  await fs.writeFile(path.join(root, 'bundle.js'), '"bg-blue-500" "#2b7fff" "text-white"')
  return runWebRuntime(root, path.join(root, 'runtime.png'))
}

it('有 manifest 字符串和尺寸也不能把缺失的样式伪装成蓝底白字', async () => {
  const timeout = new Error('computedStyle timeout')
  mock.page.waitForFunction.mockRejectedValueOnce(timeout)
  await expect(run()).rejects.toMatchObject({ message: expect.stringContaining('styles did not become measurable'), cause: timeout })
  expect(mock.browser.close).toHaveBeenCalledOnce()
})

it('同时保留样式超时和截图失败，并完成本轮浏览器清理', async () => {
  const timeout = new Error('computedStyle timeout')
  const capture = new Error('screenshot failed')
  mock.page.waitForFunction.mockRejectedValueOnce(timeout)
  mock.screenshot.mockRejectedValueOnce(capture)
  await expect(run()).rejects.toMatchObject({ errors: [timeout, capture] })
  expect(mock.browser.close).toHaveBeenCalledOnce()
})

it.each([
  ['background', 'rgb(255, 0, 0)'],
  ['color', 'rgb(0, 0, 0)'],
] as const)('非透明但错误的 %s 不算真实样式验收', async (key, value) => {
  mock[key].mockResolvedValueOnce(value)
  await expect(run()).rejects.toThrow(/style|color/i)
  expect(mock.browser.close).toHaveBeenCalledOnce()
})

it('正确颜色和真实布局通过，并使用明确的 light 媒体环境', async () => {
  await expect(run()).resolves.toMatchObject({ background: 'rgb(43, 127, 255)', textColor: 'rgb(255, 255, 255)' })
  expect(mock.launch).toHaveBeenCalledWith({ headless: true })
  expect(mock.browser.newPage).toHaveBeenCalledWith(expect.objectContaining({ colorScheme: 'light' }))
  expect(mock.screenshot).toHaveBeenCalledOnce()
  expect(mock.browser.close).toHaveBeenCalledOnce()
})

it.each(['launch', 'close'] as const)('浏览器 %s 失败仍关闭本轮 HTTP 服务', async (phase) => {
  const failure = new Error(`browser ${phase} failed`)
  const listen = vi.spyOn(Server.prototype, 'listen')
  const close = vi.spyOn(Server.prototype, 'close')
  const operation = phase === 'launch' ? mock.launch : mock.browser.close
  operation.mockRejectedValueOnce(failure)
  try {
    await expect(run()).rejects.toBe(failure)
    expect(close).toHaveBeenCalledOnce()
    expect(listen.mock.contexts[0]?.listening).toBe(false)
  }
  finally {
    for (const server of listen.mock.contexts) {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      }
    }
    listen.mockRestore()
    close.mockRestore()
  }
})
