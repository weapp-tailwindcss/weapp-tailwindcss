import { expect, test } from '@playwright/test'
import { navigateWebsite } from './helpers/navigation'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tw.weapp.dev/'

for (const fixture of [{ route: '/zh-cn/ui', opacity: 0.75 }, { route: '/zh-cn/llms', opacity: 0.7 }]) {
  test(`${fixture.route} 面板背景随真实主题切换并恢复`, async ({ page }, info) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'light')
      localStorage.setItem('weapp-tailwindcss:website:locale', 'zh-cn')
    })
    await navigateWebsite(page, new URL(fixture.route, baseURL).href)
    const panel = page.locator(`[class~="bg-white/80"][class~="dark:bg-slate-900/${fixture.opacity * 100}"]`).first()
    await expect(panel).toBeVisible()
    for (const [index, mode] of ['light', 'dark', 'light'].entries()) {
      if (index) {
        await page.locator('button[aria-label*="浅色/暗黑模式"]:visible').click()
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
      // 来自默认 theme 的独立颜色字面量，不从被测生成 CSS 提取期望。
      const reference = mode === 'dark' ? `oklch(20.8% 0.042 265.755 / ${fixture.opacity})` : 'rgb(255 255 255 / .8)'
      const observation = () => panel.evaluate((element, reference) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        const raster = (color: string) => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          return [...context.getImageData(0, 0, 1, 1).data]
        }
        const color = getComputedStyle(element).backgroundColor
        return { color, actual: raster(color), expected: raster(reference) }
      }, reference)
      await expect.poll(async () => {
        const { actual, expected } = await observation()
        return actual.map((channel, index) => Math.abs(channel - expected[index]!))
      }, { message: `${fixture.route}/${mode} 必须消费对应的背景 utility` }).toEqual([0, 0, 0, 0])
      await info.attach(`panel-${index}-${mode}`, { body: JSON.stringify(await observation()), contentType: 'application/json' })
    }
  })
}
