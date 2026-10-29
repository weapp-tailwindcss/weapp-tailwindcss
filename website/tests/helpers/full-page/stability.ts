import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import type { CaptureEvidence } from './observed-sample'
import { PNG } from 'pngjs'
import { watchCaptureDocument } from './document'
import { captureSemantic } from './observed-sample'

export class FullPageCaptureError extends Error {
  constructor(cause: unknown, readonly evidence: CaptureEvidence[], readonly attempts: number) {
    super(`整页截图未取得连续两张未受扰动的完整样本；${cause instanceof Error ? cause.message : String(cause)}`, { cause })
    this.name = 'FullPageCaptureError'
  }
}

/** 两条捕获路径共享 document、语义和完整 RGBA 配对；受扰动样本清空前张。 */
export async function captureStableObservedFullPage(page: Page, budget: CaptureBudget, capture: (evidence: CaptureEvidence) => Promise<PNG | undefined>, waitForNext = () => budget.run(() => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))))) {
  let previous: PNG | undefined
  let previousSemantic: string | null = null
  let attempts = 0
  const evidence: CaptureEvidence[] = []
  const document = watchCaptureDocument(page)
  try {
    for (;;) {
      document.assert()
      attempts += 1
      const observation: CaptureEvidence = { window: null, before: null, after: null }
      evidence.push(observation)
      if (evidence.length > 4) {
        evidence.shift()
      }
      const image = await capture(observation)
      document.assert()
      const semantic = captureSemantic(observation)
      if (image && previous && semantic === previousSemantic && image.width === previous.width && image.height === previous.height && image.data.equals(previous.data)) {
        const buffer = PNG.sync.write(image)
        budget.remaining()
        document.assert()
        return buffer
      }
      previous = image
      previousSemantic = image ? semantic : null
      await waitForNext()
    }
  }
  catch (cause) {
    throw new FullPageCaptureError(cause, evidence, attempts)
  }
  finally {
    document.close()
  }
}
