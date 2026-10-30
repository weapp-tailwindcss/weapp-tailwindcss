import type { Page } from '@playwright/test'
import type { PNG } from 'pngjs'
import type { CaptureBudget } from './capture'
import type { CaptureWindow } from './monitor'
import type { TocReadiness } from './toc/model'
import type { TocOptions } from './toc/observe'
import { runWithCleanup } from '../../../../scripts/e2e-preflight/cleanup'
import { startCaptureMonitor, validCaptureWindow } from './monitor'
import { evaluateTocReadiness } from './toc/model'
import { observeToc } from './toc/observe'
import { waitForTocReadiness } from './toc/readiness'

export interface CaptureEvidence {
  window: CaptureWindow | null
  before: TocReadiness | null
  after: TocReadiness | null
}

function tocSemantic(value: TocReadiness | null) {
  return value ? JSON.stringify([value.expected, value.expectedHeading, value.actual]) : null
}

/** 语义正确和完整捕获期证据缺一不可，前后恢复不能覆盖中间的异常。 */
export function validCaptureSample(evidence: CaptureEvidence) {
  return validCaptureWindow(evidence.window) && evidence.before?.ready === true && evidence.after?.ready === true
    && tocSemantic(evidence.before) === tocSemantic(evidence.after)
}

/** 两个样本的完整几何、祖先合成状态和 TOC 语义必须一致。 */
export function captureSemantic(evidence: CaptureEvidence) {
  return JSON.stringify([tocSemantic(evidence.after), evidence.window?.fingerprint])
}

/** 一个观察窗口覆盖整个采样回调；分片不得逐片重建观察器或丢失扰动历史。 */
export async function captureObservedSample<T>(page: Page, budget: CaptureBudget, toc: TocOptions | null, evidence: CaptureEvidence, capture: () => Promise<T | undefined>, decode: (sample: T) => PNG) {
  await waitForTocReadiness(page, budget, toc)
  const monitor = await startCaptureMonitor(page, budget)
  return runWithCleanup(async () => {
    evidence.before = evaluateTocReadiness(await budget.run(() => observeToc(page, toc)))
    if (!evidence.before.ready) {
      evidence.window = await monitor.finish()
      return undefined
    }
    const sample = await capture()
    await monitor.settle()
    evidence.after = evaluateTocReadiness(await budget.run(() => observeToc(page, toc)))
    evidence.window = await monitor.finish()
    if (sample === undefined || !validCaptureSample(evidence)) {
      return undefined
    }
    const image = decode(sample)
    budget.remaining()
    const expected = evidence.window!.geometry
    if (image.width !== expected.width || image.height !== expected.height) {
      throw new Error(`整页截图尺寸不符：预期 ${expected.width}×${expected.height}，实际 ${image.width}×${image.height}`)
    }
    return image
  }, () => monitor.close())
}
