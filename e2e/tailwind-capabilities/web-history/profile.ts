import type { BrowserContext, BrowserType } from 'playwright'
import type { BrowserEngine } from '../types'
import type { HistoryProfile, HistorySidecar } from './types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { digest } from '../identity'
import { bounded } from '../web-native-media/deadline'

/** 只操作独占临时 persistent profile；失败时保留无法确认关闭的目录。 */
export async function withHistoryProfile<T>(browserType: BrowserType, engine: BrowserEngine, name: HistoryProfile['name'], raw: HistorySidecar, run: (context: BrowserContext, profile: HistoryProfile) => Promise<T>) {
  if (browserType.name() !== engine) {
    throw new Error('历史夹具实际 BrowserType 与目标引擎不匹配')
  }
  const directory = await mkdtemp(path.join(tmpdir(), `weapp-tailwind-visited-${engine}-`))
  const profile: HistoryProfile = { name, id: digest({ runId: raw.runId, engine, directory }), directory, browserType: engine, persistent: true, headless: true, channel: engine === 'chromium' ? 'chromium' : 'default', executable: browserType.executablePath(), created: true, closed: false, removed: false }
  raw.profiles.push(profile)
  raw.lifecycle.push(`${name}:created`)
  let context: BrowserContext | undefined
  const errors: unknown[] = []
  let result: T | undefined
  try {
    context = await browserType.launchPersistentContext(directory, { headless: true, ...(engine === 'chromium' ? { channel: 'chromium' } : {}), timeout: 5_000, viewport: { width: 640, height: 480 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', forcedColors: 'none', serviceWorkers: 'block' })
    raw.lifecycle.push(`${name}:launched`)
    const version = context.browser()?.version()
    if (!version || (raw.browserVersion && raw.browserVersion !== version)) {
      throw new Error('历史夹具浏览器版本发生变化或缺失')
    }
    raw.browserVersion = version
    result = await run(context, profile)
  }
  catch (error) {
    errors.push(error)
  }
  finally {
    if (context) {
      try {
        await bounded('关闭独占历史 profile', () => context!.close())
        profile.closed = true
        raw.cleanup.closedProfiles.push(name)
        raw.lifecycle.push(`${name}:closed`)
      }
      catch (error) {
        raw.cleanup.errors.push(`profile ${name} 关闭失败：${String(error)}`)
        errors.push(error)
      }
    }
    if (profile.closed) {
      try {
        await rm(directory, { recursive: true, force: false })
        profile.removed = true
        raw.cleanup.removedProfiles.push(name)
        raw.lifecycle.push(`${name}:removed`)
      }
      catch (error) {
        raw.cleanup.errors.push(`profile ${name} 清理失败：${String(error)}`)
        errors.push(error)
      }
    }
    else {
      raw.cleanup.errors.push(`保留未确认关闭的自有 profile：${directory}`)
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, errors.map(String).join('；'))
  }
  return result as T
}
