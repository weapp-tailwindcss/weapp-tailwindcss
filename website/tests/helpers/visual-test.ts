import { test as base } from '@playwright/test'

/** Firefox 的访问历史跨 context 共享，黄金截图需要独立浏览器。 */
export const visualTest = base.extend({
  context: async ({ context, browserName, playwright, video }, use) => {
    if (browserName !== 'firefox') {
      await use(context)
      return
    }
    if ((typeof video === 'string' ? video : video.mode) !== 'off') {
      throw new Error('Firefox 独立视觉 context 暂不支持 video；请保持 video: off，避免丢失录像附件。')
    }

    // Runner 为公开 launch/newContext API 注入当前测试的配置及 trace 记录。
    const browser = await playwright.firefox.launch()
    try {
      const isolated = await browser.newContext()
      try {
        await use(isolated)
      }
      finally {
        await isolated.close()
      }
    }
    finally {
      await browser.close()
    }
  },
})
