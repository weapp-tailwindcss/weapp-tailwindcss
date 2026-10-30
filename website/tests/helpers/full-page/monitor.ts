import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import type { BrowserMonitor } from './monitor/model'
import { randomUUID } from 'node:crypto'
import { createCaptureBudget } from './capture'
import { installMonitor } from './monitor/browser'

export type { CaptureWindow } from './monitor/model'
export { validCaptureWindow } from './monitor/model'

/** 清理预算只释放监听器，不进行超时后的额外采样。 */
export async function startCaptureMonitor(page: Page, budget: CaptureBudget) {
  const key = `weapp-full-page-monitor:${randomUUID()}`
  const close = () => createCaptureBudget(1000).run(() => page.evaluate((key) => {
    const state = Reflect.get(window, Symbol.for(key)) as BrowserMonitor | undefined
    state?.dispose()
  }, key))
  try {
    await budget.run(() => page.evaluate(installMonitor, key))
  }
  catch (error) {
    try {
      await close()
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], '捕获期观察器初始化或清理失败')
    }
    throw error
  }
  return {
    settle: () => budget.run(() => page.evaluate(async (key) => {
      const state = Reflect.get(window, Symbol.for(key)) as BrowserMonitor | undefined
      if (!state) {
        throw new Error('捕获期观察器状态丢失')
      }
      await state.settle()
    }, key)),
    finish: () => budget.run(() => page.evaluate((key) => {
      const state = Reflect.get(window, Symbol.for(key)) as BrowserMonitor | undefined
      if (!state) {
        throw new Error('捕获期观察器状态丢失')
      }
      return state.finish()
    }, key)),
    close,
  }
}
