import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import type { CaptureEvidence } from './observed-sample'
import type { TocOptions } from './toc/observe'
import { captureFullPageSample, createCaptureBudget } from './capture'
import { prepareFullPageImages } from './images'
import { captureObservedSample } from './observed-sample'
import { captureStableObservedFullPage } from './stability'

/** 整张二维分片只开启一个观察器，任何分片中的瞬态均拒绝完整样本。 */
export function captureTiledSample(page: Page, budget: CaptureBudget, toc: TocOptions | null, evidence: CaptureEvidence, tileSize?: number) {
  return captureObservedSample(page, budget, toc, evidence, () => captureFullPageSample(page, budget, tileSize), image => image)
}

/** 至少两次连续完整 RGBA 样本逐像素相等后才编码，不消费快照序号或写基线。 */
export async function captureStableFullPage(page: Page, options: {
  timeout?: number
  tileSize?: number
  budget?: CaptureBudget
  toc?: TocOptions | null
} = {}) {
  const budget = options.budget ?? createCaptureBudget(options.timeout ?? 60_000)
  await prepareFullPageImages(page, budget)
  const intervals = [100, 250, 500]
  return captureStableObservedFullPage(page, budget, evidence => captureTiledSample(page, budget, options.toc ?? null, evidence, options.tileSize), async () => {
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
  })
}
