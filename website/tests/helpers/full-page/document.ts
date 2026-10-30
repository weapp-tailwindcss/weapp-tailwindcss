import type { Frame, Page } from '@playwright/test'

/** 整次采样期间固定主 document，覆盖两张截图观察窗口之间的导航和同 URL reload。 */
export function watchCaptureDocument(page: Page) {
  const main = page.mainFrame()
  let failure: Error | undefined
  const navigated = (frame: Frame) => {
    if (frame === main) {
      failure ??= new Error('整页截图采样期间主 document 已导航或重新加载')
    }
  }
  const unavailable = () => {
    failure ??= new Error('整页截图采样期间页面已关闭或崩溃')
  }
  page.on('framenavigated', navigated)
  page.on('close', unavailable)
  page.on('crash', unavailable)
  return {
    assert() {
      if (failure) {
        throw failure
      }
    },
    close() {
      page.off('framenavigated', navigated)
      page.off('close', unavailable)
      page.off('crash', unavailable)
    },
  }
}
