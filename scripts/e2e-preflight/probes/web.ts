import type { ProbeContext, ProbeOutput } from '../types'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'
import { resolveChromeExecutable } from '../../../e2e/hbuilderx-local/process'
import { assertImage } from '../io'

export async function web(ctx: ProbeContext): Promise<ProbeOutput> {
  const command = chromium.executablePath()
  const hbuilderxBrowser = ctx.binding?.hbuilderxBrowser ?? process.env.E2E_HBUILDERX_CHROME_PATH ?? await resolveChromeExecutable() ?? command
  const versions = new Map<string, string>()
  const evidence: string[] = []
  for (const executablePath of new Set([command, hbuilderxBrowser])) {
    const browser = await chromium.launch({ executablePath, timeout: 15_000 })
    try {
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
      versions.set(executablePath, browser.version())
      evidence.push(screenshot)
    }
    finally {
      await browser.close()
    }
  }
  return { detail: '测试使用的 Playwright Chromium/HBuilderX 浏览器均已验证 DOM、输入、点击和截图。', binding: { command, version: versions.get(command)!, hbuilderxBrowser, hbuilderxVersion: versions.get(hbuilderxBrowser)! }, evidence }
}
