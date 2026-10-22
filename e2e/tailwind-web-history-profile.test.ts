import type { BrowserContext, BrowserType } from 'playwright'
import { access, rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { withHistoryProfile } from './tailwind-capabilities/web-history/profile'
import { syntheticHistory } from './tailwind-capabilities/web-history/test-fixture'

const ownedDirectories: string[] = []
afterEach(async () => {
  await Promise.all(ownedDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
function prepared(failure?: 'launch' | 'close', engine = 'chromium') {
  const raw = syntheticHistory().raw
  raw.profiles = []
  raw.lifecycle = []
  raw.cleanup = { closedProfiles: [], removedProfiles: [], serverClosed: false, errors: [] }
  const close = vi.fn(async () => {
    if (failure === 'close') {
      throw new Error('close failed')
    }
  })
  const context = { close, browser: () => ({ version: () => 'unit-browser' }) }
  const launchPersistentContext = vi.fn(async (directory: string, _options: Record<string, unknown>) => {
    ownedDirectories.push(directory)
    if (failure === 'launch') {
      throw new Error('launch failed')
    }
    return context
  })
  const browserType = { name: () => engine, executablePath: () => '/unit-browser', launchPersistentContext } as unknown as BrowserType
  return { raw, context, close, browserType, launchPersistentContext }
}

it.each(['chromium', 'firefox', 'webkit'] as const)('%s 顺序关闭两份独占persistent profile，普通用户profile不参与', async (engine) => {
  const { raw, close, browserType, launchPersistentContext } = prepared(undefined, engine)
  for (const name of ['history', 'fresh'] as const) {
    await withHistoryProfile(browserType, engine, name, raw, async (_context, profile) => {
      expect(profile.closed).toBe(false)
      await expect(access(profile.directory)).resolves.toBeUndefined()
    })
  }
  expect(launchPersistentContext).toHaveBeenCalledTimes(2)
  expect(close).toHaveBeenCalledTimes(2)
  expect(new Set(raw.profiles.map(profile => profile.directory)).size).toBe(2)
  expect(raw.lifecycle).toEqual(['history:created', 'history:launched', 'history:closed', 'history:removed', 'fresh:created', 'fresh:launched', 'fresh:closed', 'fresh:removed'])
  for (const profile of raw.profiles) {
    expect(profile).toMatchObject({ persistent: true, headless: true, closed: true, removed: true })
    await expect(access(profile.directory)).rejects.toThrow()
  }
  expect(launchPersistentContext.mock.calls[0]![1]).toMatchObject({ headless: true, ...(engine === 'chromium' ? { channel: 'chromium' } : {}), timeout: 5_000 })
})

it('语义或截图失败仍先关闭本profile再移除自有目录', async () => {
  const { raw, close, browserType } = prepared()
  await expect(withHistoryProfile(browserType, 'chromium', 'history', raw, async () => {
    throw new Error('pixels failed')
  })).rejects.toThrow('pixels failed')
  expect(close).toHaveBeenCalledTimes(1)
  expect(raw.profiles[0]).toMatchObject({ closed: true, removed: true })
})

it.each(['launch', 'close'] as const)('%s失败保留原始异常及未确认关闭的独占目录', async (failure) => {
  const { raw, browserType } = prepared(failure)
  await expect(withHistoryProfile(browserType, 'chromium', 'history', raw, async () => {})).rejects.toThrow(`${failure} failed`)
  expect(raw.profiles[0]).toMatchObject({ closed: false, removed: false })
  await expect(access(raw.profiles[0]!.directory)).resolves.toBeUndefined()
  expect(raw.cleanup.errors.join('；')).toContain('保留未确认关闭')
})

it('关闭失败与先前语义错误一起保留，不用cleanup覆盖原始错误', async () => {
  const { raw, browserType } = prepared('close')
  const error = await withHistoryProfile(browserType, 'chromium', 'history', raw, async (_context: BrowserContext) => {
    throw new Error('native history failed')
  }).catch(error => error)
  expect(String(error)).toContain('native history failed')
  expect(String(error)).toContain('close failed')
})

it('实际BrowserType不匹配时拒绝跨引擎冒用且不创建profile', async () => {
  const { raw, browserType, launchPersistentContext } = prepared()
  await expect(withHistoryProfile(browserType, 'webkit', 'history', raw, async () => {})).rejects.toThrow('BrowserType')
  expect(launchPersistentContext).not.toHaveBeenCalled()
  expect(raw.profiles).toHaveLength(0)
})
