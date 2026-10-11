import type { Page } from 'playwright'

export async function collectStyleText(page: Page) {
  return await page.evaluate(() => {
    const doc = (globalThis as any).document
    return Array.from(doc.querySelectorAll('style') as ArrayLike<{ textContent: string | null }>)
      .map(style => style.textContent ?? '')
      .join('\n')
  })
}
