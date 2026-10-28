import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import type { TocObservation } from './toc/model'
import type { TocOptions } from './toc/observe'
import { expect, test } from '@playwright/test'
import { createCaptureBudget, readDocumentGeometry } from './capture'
import { prepareFullPageImages } from './images'
import { captureStableFullPage } from './stable'
import { evaluateTocReadiness } from './toc/model'
import { observeToc } from './toc/observe'
import { TocReadinessError, waitForTocReadiness } from './toc/readiness'

type TocPolicy = TocOptions | null | (() => Promise<TocOptions | null>)

/** 失败附件来自预算内的最后观测，不在超时后额外读取页面。 */
export async function prepareFullPageToc(page: Page, budget: CaptureBudget, options: TocPolicy) {
  let preliminary: TocObservation | null = null
  try {
    let policy: TocOptions | null
    if (typeof options === 'function') {
      preliminary = await budget.run(() => observeToc(page, null))
      if (evaluateTocReadiness(preliminary).ready) {
        return
      }
      policy = await budget.run(() => options())
    }
    else {
      policy = options
    }
    await waitForTocReadiness(page, budget, policy)
  }
  catch (cause) {
    const error = cause instanceof TocReadinessError ? cause : new TocReadinessError(cause, { observation: preliminary, readiness: preliminary ? evaluateTocReadiness(preliminary) : null })
    await test.info().attach('full-page-toc-observation', { body: JSON.stringify({ ...error.evidence, failure: String(error.cause) }, null, 2), contentType: 'application/json' })
    throw error
  }
}

/** 仅 Firefox 的协议尺寸超限使用分片，其余整页截图保留原生断言。 */
export async function expectFullPageScreenshot(page: Page, tocOptions: TocPolicy = null) {
  const budget = createCaptureBudget(test.info().timeout || 60_000)
  await prepareFullPageImages(page, budget)
  await prepareFullPageToc(page, budget, tocOptions)
  if (page.context().browser()?.browserType().name() !== 'firefox') {
    await expect(page).toHaveScreenshot({ fullPage: true, timeout: budget.remaining() })
    return
  }
  const geometry = await budget.run(() => readDocumentGeometry(page))
  if (geometry.width <= 32_767 && geometry.height <= 32_767) {
    await expect(page).toHaveScreenshot({ fullPage: true, timeout: budget.remaining() })
    return
  }
  const name = '__full-page-template-check__.png'
  if (test.info().snapshotPath(name, { kind: 'screenshot' }) !== test.info().snapshotPath(name, { kind: 'snapshot' })) {
    throw new Error('整页截图与 PNG 快照模板必须一致，禁止改变既有快照路径')
  }
  const buffer = await captureStableFullPage(page, { budget })
  // 只比较整张图一次，全部分片合计最多 5 像素；匿名名称沿用原生截图计数。
  expect(buffer).toMatchSnapshot({ maxDiffPixels: 5 })
  budget.remaining()
}
