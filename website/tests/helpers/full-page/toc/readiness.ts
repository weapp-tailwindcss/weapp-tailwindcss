import type { Page } from '@playwright/test'
import type { CaptureBudget } from '../capture'
import type { TocObservation, TocReadiness } from './model'
import type { TocOptions } from './observe'
import { evaluateTocReadiness } from './model'
import { observeToc } from './observe'

export class TocReadinessError extends Error {
  constructor(cause: unknown, readonly evidence: { observation: TocObservation | null, readiness: TocReadiness | null }) {
    super('整页截图 TOC 未就绪；保留最后只读观测，未增加截图预算', { cause })
    this.name = 'TocReadinessError'
  }
}

/** 与图片和截图共用同一预算，逐帧观察正常生命周期，不主动触发高亮更新。 */
export async function waitForTocReadiness(page: Page, budget: CaptureBudget, options: TocOptions | null) {
  let observation: TocObservation | null = null
  let readiness: TocReadiness | null = null
  try {
    for (;;) {
      await budget.run(async () => {
        observation = await observeToc(page, options)
        readiness = evaluateTocReadiness(observation)
      })
      if (readiness!.ready) {
        return
      }
      await budget.run(() => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))))
    }
  }
  catch (cause) {
    throw new TocReadinessError(cause, { observation, readiness })
  }
}
