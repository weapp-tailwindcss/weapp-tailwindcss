import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { assertStylesheetMarker } from '../stylesheet-marker.mjs'

it('读取 Vite 的已挂载内联样式，拒绝旧标识和已经移除的 style', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<style>.probe { color: red } /* current-marker */</style><div class="probe">probe</div>')
    const state = { linkedStyles: async urls => { expect(urls).toEqual([]); return [] } }
    await assertStylesheetMarker(page, state, 'current-marker')
    await expect(assertStylesheetMarker(page, state, 'old-marker')).rejects.toThrow('缺少本轮')
    await page.locator('style').evaluate(element => element.remove())
    await expect(assertStylesheetMarker(page, state, 'current-marker')).rejects.toThrow('缺少本轮')
  }
  finally { await browser.close() }
})
