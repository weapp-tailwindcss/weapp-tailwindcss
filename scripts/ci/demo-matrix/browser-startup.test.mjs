import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { closeBrowserInspection, createBrowserStartup, launchBrowserPage } from './browser-startup.mjs'

afterEach(() => vi.useRealTimers())

it('浏览器启动各阶段共享原截止，不为新阶段重置预算', async () => {
  vi.useFakeTimers()
  const startup = createBrowserStartup(100)
  const first = startup.run('navigation', () => new Promise(resolve => setTimeout(resolve, 60)))
  await vi.advanceTimersByTimeAsync(60)
  await first
  const second = startup.run('transport', () => new Promise(() => {}))
  const failure = expect(second).rejects.toThrow(/deadline exceeded.*transport.*"elapsed":100/)
  await vi.advanceTimersByTimeAsync(40)
  await failure
  expect(vi.getTimerCount()).toBe(0)
  expect(() => startup.session.ensureRunning()).toThrow(/deadline exceeded/)
})

it('页面创建阻塞时关闭已归属的浏览器并保留阶段错误', async () => {
  vi.useFakeTimers()
  let rejectPage
  const pending = new Promise((resolve, reject) => {
    rejectPage = reject
  })
  const browser = {
    newPage: vi.fn(() => pending),
    close: vi.fn(async () => rejectPage(new Error('Parent browser closed'))),
  }
  const launch = vi.fn(async () => browser)
  const opening = launchBrowserPage({ launch }, createBrowserStartup(100))
  const failure = expect(opening).rejects.toThrow(/page creation failed.*newPage/)
  await vi.advanceTimersByTimeAsync(100)
  await failure
  expect(launch).toHaveBeenCalledWith({ headless: true, timeout: 100 })
  expect(browser.close).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('页面创建与浏览器关闭同时失败时保留两个原因', async () => {
  const creation = new Error('page creation rejected')
  const cleanup = new Error('browser close rejected')
  const close = vi.fn(async () => {
    throw cleanup
  })
  const opening = launchBrowserPage({
    launch: async () => ({
      newPage: async () => {
        throw creation
      },
      close,
    }),
  }, createBrowserStartup(1000))
  await expect(opening).rejects.toMatchObject({ errors: [creation, cleanup] })
  expect(close).toHaveBeenCalledTimes(1)
})

it('成功创建后清除启动定时器并继续保留原会话健康检查', async () => {
  vi.useFakeTimers()
  const ensureRunning = vi.fn()
  const startup = createBrowserStartup(100, { ensureRunning, log: () => 'owned session' })
  const page = {}
  const browser = { newPage: vi.fn(async () => page) }
  await expect(launchBrowserPage({ launch: async () => browser }, startup)).resolves.toEqual({ browser, page })
  expect(vi.getTimerCount()).toBe(0)
  startup.session.ensureRunning()
  expect(ensureRunning).toHaveBeenCalledTimes(1)
  expect(startup.session.log()).toBe('owned session')
})

it('总启动预算大于原 launcher 上限时仍保持 30 秒上限', async () => {
  const browser = { newPage: async () => ({}) }
  const launch = vi.fn(async () => browser)
  await launchBrowserPage({ launch }, createBrowserStartup(180_000))
  expect(launch).toHaveBeenCalledWith({ headless: true, timeout: 30_000 })
})

it('检查证据无法写入时仍关闭当前浏览器', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'browser-inspection-close-'))
  const blocked = path.join(root, 'not-a-directory')
  const close = vi.fn(async () => {})
  try {
    await writeFile(blocked, 'file')
    await expect(closeBrowserInspection({ close }, blocked, {})).rejects.toThrow(/evidence or cleanup failed/)
    expect(close).toHaveBeenCalledTimes(1)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
