import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { createCaptureBudget, readDocumentGeometry } from './capture'
import { captureStableFullPage } from './stable'

/** 仅 Firefox 的协议尺寸超限使用分片，其余整页截图保留原生断言。 */
export async function expectFullPageScreenshot(page: Page) {
  if (page.context().browser()?.browserType().name() !== 'firefox') {
    await expect(page).toHaveScreenshot({ fullPage: true })
    return
  }
  const budget = createCaptureBudget(test.info().timeout || 60_000)
  const geometry = await budget.run(() => readDocumentGeometry(page))
  if (geometry.width <= 32_767 && geometry.height <= 32_767) {
    await expect(page).toHaveScreenshot({ fullPage: true })
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
