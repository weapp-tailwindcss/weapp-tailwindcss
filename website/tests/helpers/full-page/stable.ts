import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import { PNG } from 'pngjs'
import { captureFullPageSample, createCaptureBudget } from './capture'

/** 至少两次连续完整 RGBA 样本逐像素相等后才编码，不消费快照序号或写基线。 */
export async function captureStableFullPage(page: Page, options: {
  timeout?: number
  tileSize?: number
  budget?: CaptureBudget
} = {}) {
  const budget = options.budget ?? createCaptureBudget(options.timeout ?? 60_000)
  let previous: PNG | undefined
  const intervals = [0, 100, 250, 500]
  for (;;) {
    const interval = intervals.shift() ?? 1_000
    if (interval) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await budget.run(() => Promise.all([
          new Promise<void>((resolve) => { timer = setTimeout(resolve, interval) }),
          page.evaluate(() => new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          })),
        ]))
      }
      finally {
        clearTimeout(timer)
      }
    }
    const image = await captureFullPageSample(page, budget, options.tileSize)
    if (image && previous && image.width === previous.width && image.height === previous.height && image.data.equals(previous.data)) {
      previous = undefined
      budget.remaining()
      const buffer = PNG.sync.write(image)
      budget.remaining()
      return buffer
    }
    previous = image
  }
}
