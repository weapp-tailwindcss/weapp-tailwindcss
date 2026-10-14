import type { BrowserType } from 'playwright'
import type { ProbeContext, ProbeOutput } from '../types'
import path from 'node:path'
import process from 'node:process'
import { chromium, firefox, webkit } from 'playwright'
import { resolveChromeExecutable } from '../../../e2e/hbuilderx-local/process'
import { runWithCleanup } from '../cleanup'
import { assertImage } from '../io'

export async function web(ctx: ProbeContext): Promise<ProbeOutput> {
  const command = chromium.executablePath()
  const hbuilderxBrowser = ctx.binding?.hbuilderxBrowser ?? process.env.E2E_HBUILDERX_CHROME_PATH ?? await resolveChromeExecutable() ?? command
  const versions = new Map<string, string>()
  const evidence: string[] = []
  const websiteChannel = ctx.extended ? process.env.PLAYWRIGHT_CHROMIUM_CHANNEL : undefined
  const launches: Array<{ engine: BrowserType, executablePath?: string, channel?: string }> = [...new Set([command, hbuilderxBrowser])].map(executablePath => ({ engine: chromium, executablePath }))
  if (ctx.extended) {
    launches.push(...[firefox, webkit].map(engine => ({ engine, executablePath: engine.executablePath() })))
    if (websiteChannel) {
      launches.push({ engine: chromium, channel: websiteChannel })
    }
  }
  for (const { engine, executablePath, channel } of launches) {
    const browser = await engine.launch({ ...(executablePath ? { executablePath } : {}), ...(channel ? { channel } : {}), headless: true, timeout: 15_000 })
    await runWithCleanup(async () => {
      const page = await browser.newPage()
      page.setDefaultTimeout(10_000)
      await page.goto(`${ctx.url}?probe=web`, { timeout: 10_000 })
      if (await page.locator('#run').textContent() !== ctx.runId) {
        throw new Error('浏览器页面不属于本轮预检。')
      }
      await page.locator('#input').fill(ctx.runId)
      await page.locator('#submit').click()
      await page.getByText(`完成：${ctx.runId}`, { exact: true }).waitFor()
      const screenshot = path.join(ctx.dir, `web-${versions.size}.png`)
      await page.screenshot({ path: screenshot })
      await assertImage(screenshot)
      versions.set(executablePath ?? `channel:${channel}`, browser.version())
      evidence.push(screenshot)
    }, () => browser.close())
  }
  return {
    detail: `测试使用的 Playwright Chromium/HBuilderX${ctx.extended ? '/Firefox/WebKit' : ''} 浏览器均已验证 DOM、输入、点击和截图。`,
    binding: {
      command,
      version: versions.get(command)!,
      hbuilderxBrowser,
      hbuilderxVersion: versions.get(hbuilderxBrowser)!,
      ...(ctx.extended
        ? {
            firefox: firefox.executablePath(),
            firefoxVersion: versions.get(firefox.executablePath())!,
            webkit: webkit.executablePath(),
            webkitVersion: versions.get(webkit.executablePath())!,
            ...(websiteChannel ? { websiteChannel, websiteChannelVersion: versions.get(`channel:${websiteChannel}`)! } : {}),
          }
        : {}),
    },
    evidence,
  }
}
