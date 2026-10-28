import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import type { CaptureWindow } from './monitor'
import type { TocReadiness } from './toc/model'
import type { TocOptions } from './toc/observe'
import { PNG } from 'pngjs'
import { watchCaptureDocument } from './document'
import { startCaptureMonitor, validCaptureWindow } from './monitor'
import { evaluateTocReadiness } from './toc/model'
import { observeToc } from './toc/observe'
import { waitForTocReadiness } from './toc/readiness'

export interface NativeCaptureEvidence {
  window: CaptureWindow | null
  before: TocReadiness | null
  after: TocReadiness | null
}

export class NativeCaptureError extends Error {
  constructor(cause: unknown, readonly evidence: NativeCaptureEvidence[], readonly attempts: number) {
    super('原生整页截图未取得连续两张未受扰动的完整样本', { cause })
    this.name = 'NativeCaptureError'
  }
}

/** 语义正确和完整捕获期证据缺一不可，前后恢复不能覆盖中间的异常。 */
export function validNativeSample(evidence: NativeCaptureEvidence) {
  return validCaptureWindow(evidence.window) && evidence.before?.ready === true && evidence.after?.ready === true
    && tocSemantic(evidence.before) === tocSemantic(evidence.after)
}

function tocSemantic(value: TocReadiness | null) {
  return value ? JSON.stringify([value.expected, value.expectedHeading, value.actual]) : null
}

/** 原生 fullPage 完整绘制；观察器覆盖 Playwright 准备、截图与恢复阶段。 */
export async function captureNativeSample(page: Page, budget: CaptureBudget, toc: TocOptions | null, evidence: NativeCaptureEvidence) {
  await waitForTocReadiness(page, budget, toc)
  const monitor = await startCaptureMonitor(page, budget)
  let failure: unknown
  try {
    evidence.before = evaluateTocReadiness(await budget.run(() => observeToc(page, toc)))
    if (!evidence.before.ready) {
      evidence.window = await monitor.finish()
      return undefined
    }
    const buffer = await budget.run(timeout => page.screenshot({
      fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css', type: 'png', timeout,
    }))
    await monitor.settle()
    evidence.after = evaluateTocReadiness(await budget.run(() => observeToc(page, toc)))
    evidence.window = await monitor.finish()
    if (!validNativeSample(evidence)) {
      return undefined
    }
    const image = PNG.sync.read(buffer)
    budget.remaining()
    const expected = evidence.window!.geometry
    if (image.width !== expected.width || image.height !== expected.height) {
      throw new Error(`原生整页截图尺寸不符：预期 ${expected.width}×${expected.height}，实际 ${image.width}×${image.height}`)
    }
    return image
  }
  catch (error) {
    failure = error
    throw error
  }
  finally {
    try {
      await monitor.close()
    }
    catch (cleanupError) {
      if (failure) {
        throw new AggregateError([failure, cleanupError], '原生整页截图采样或观察器清理失败')
      }
      throw cleanupError
    }
  }
}

/** 连续两个完整 RGBA 必须严格相等；受扰动样本清空前张，禁止按黄金图挑选样本。 */
export async function captureStableNativeFullPage(page: Page, budget: CaptureBudget, toc: TocOptions | null) {
  let previous: PNG | undefined
  let previousSemantic: string | null = null
  let attempts = 0
  const evidence: NativeCaptureEvidence[] = []
  const document = watchCaptureDocument(page)
  try {
    for (;;) {
      document.assert()
      attempts += 1
      const observation: NativeCaptureEvidence = { window: null, before: null, after: null }
      evidence.push(observation)
      if (evidence.length > 4) {
        evidence.shift()
      }
      const image = await captureNativeSample(page, budget, toc, observation)
      document.assert()
      const semantic = JSON.stringify([tocSemantic(observation.after), observation.window?.fingerprint])
      if (image && previous && semantic === previousSemantic && image.width === previous.width && image.height === previous.height && image.data.equals(previous.data)) {
        const buffer = PNG.sync.write(image)
        budget.remaining()
        document.assert()
        return buffer
      }
      previous = image
      previousSemantic = image ? semantic : null
      await budget.run(() => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))))
    }
  }
  catch (cause) {
    throw new NativeCaptureError(cause, evidence, attempts)
  }
  finally {
    document.close()
  }
}
