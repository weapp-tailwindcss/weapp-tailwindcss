import type { Page } from 'playwright'
import { writeFile } from 'node:fs/promises'

/** Playwright 无取消参数；先取字节再检查本轮取消，禁止迟到截图直接覆盖文件。 */
export async function captureWebScreenshot(page: Pick<Page, 'screenshot'>, filename: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const contents = await page.screenshot()
  signal.throwIfAborted()
  await writeFile(filename, contents, { signal, flag: 'wx' })
  return filename
}
