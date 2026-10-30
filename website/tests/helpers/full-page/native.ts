import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import type { CaptureEvidence } from './observed-sample'
import type { TocOptions } from './toc/observe'
import { PNG } from 'pngjs'
import { captureObservedSample } from './observed-sample'
import { captureStableObservedFullPage } from './stability'

export type { CaptureEvidence as NativeCaptureEvidence } from './observed-sample'
export { validCaptureSample as validNativeSample } from './observed-sample'
export { FullPageCaptureError as NativeCaptureError } from './stability'

/** 原生 fullPage 完整绘制；观察器覆盖 Playwright 准备、截图与恢复阶段。 */
export async function captureNativeSample(page: Page, budget: CaptureBudget, toc: TocOptions | null, evidence: CaptureEvidence) {
  return captureObservedSample(page, budget, toc, evidence, () => budget.run(timeout => page.screenshot({
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    type: 'png',
    timeout,
  })), buffer => PNG.sync.read(buffer))
}

/** 连续两个完整 RGBA 必须严格相等；受扰动样本清空前张，禁止按黄金图挑选样本。 */
export async function captureStableNativeFullPage(page: Page, budget: CaptureBudget, toc: TocOptions | null) {
  return captureStableObservedFullPage(page, budget, evidence => captureNativeSample(page, budget, toc, evidence))
}
