import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import type { TocObservation } from './toc/model'
import type { TocOptions } from './toc/observe'
import { expect, test } from '@playwright/test'
import { supportsNativeFullPageCapture } from './capabilities'
import { createCaptureBudget, readDocumentGeometry } from './capture'
import { prepareFullPageImages } from './images'
import { captureStableNativeFullPage } from './native'
import { FullPageCaptureError } from './stability'
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
        return null
      }
      policy = await budget.run(() => options())
    }
    else {
      policy = options
    }
    await waitForTocReadiness(page, budget, policy)
    return policy
  }
  catch (cause) {
    const error = cause instanceof TocReadinessError ? cause : new TocReadinessError(cause, { observation: preliminary, readiness: preliminary ? evaluateTocReadiness(preliminary) : null })
    await test.info().attach('full-page-toc-observation', { body: JSON.stringify({ ...error.evidence, failure: String(error.cause) }, null, 2), contentType: 'application/json' })
    throw error
  }
}

/** 按浏览器尺寸能力分片，两条路径共享完整捕获期观测、语义和 RGBA 稳定合同。 */
export async function expectFullPageScreenshot(page: Page, tocOptions: TocPolicy = null) {
  const budget = createCaptureBudget(test.info().timeout || 60_000)
  await prepareFullPageImages(page, budget)
  const policy = await prepareFullPageToc(page, budget, tocOptions)
  const geometry = await budget.run(() => readDocumentGeometry(page))
  const tiled = !supportsNativeFullPageCapture(page.context().browser()?.browserType().name(), geometry)
  const name = '__full-page-template-check__.png'
  if (test.info().snapshotPath(name, { kind: 'screenshot' }) !== test.info().snapshotPath(name, { kind: 'snapshot' })) {
    throw new Error('整页截图与 PNG 快照模板必须一致，禁止改变既有快照路径')
  }
  let buffer
  try {
    buffer = tiled ? await captureStableFullPage(page, { budget, toc: policy }) : await captureStableNativeFullPage(page, budget, policy)
  }
  catch (error) {
    if (error instanceof FullPageCaptureError) {
      await test.info().attach('full-page-capture-observation', {
        body: JSON.stringify({ totalSamples: error.attempts, lastSamples: error.evidence, failure: String(error.cause) }, null, 2),
        contentType: 'application/json',
      })
    }
    throw error
  }
  // 只比较整张图一次，全部分片合计最多 5 像素；匿名名称沿用原生截图计数。
  expect(buffer).toMatchSnapshot({ maxDiffPixels: 5 })
  budget.remaining()
}
