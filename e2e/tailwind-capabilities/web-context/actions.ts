import type { Page } from 'playwright'
import type { ContextAction, ContextProfile } from './fixtures'

/** 表单状态只通过原生键盘、点击、提交与 reset 生命周期改变。 */
export async function activateContextState(page: Page, action: ContextAction | undefined, profile: ContextProfile) {
  if (action === 'pointer') {
    if (profile === 'touch') {
      await page.locator('#probe').tap()
    }
    else {
      await page.locator('#probe').click()
    }
  }
  else if (action === 'invalid-input' || action === 'valid-input') {
    await page.locator('#probe').click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.locator('#probe').pressSequentially(action === 'valid-input' ? 'valid@example.com' : 'invalid')
    await page.keyboard.press('Tab')
  }
  else if (action === 'invalid-submit' || action === 'valid-submit') {
    await page.locator('#submit').click()
  }
  else if (action === 'reset') {
    await page.locator('#reset').click()
  }
}
