import type { BrowserEngine } from '../types'
import { chromium, firefox, webkit } from 'playwright'

/** 案例筛选不能改变实际二进制；Chromium统一使用支持原生域的完整浏览器。 */
export function launchCapabilityBrowser(engine: BrowserEngine) {
  return { chromium, firefox, webkit }[engine].launch({ headless: true, ...(engine === 'chromium' ? { executablePath: chromium.executablePath() } : {}) })
}
