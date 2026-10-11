import assert from 'node:assert/strict'

export async function assertStylesheetMarker(page, state, marker) {
  const installed = await page.evaluate(() => {
    const inline = []
    const urls = []
    for (const sheet of document.styleSheets) {
      if (sheet.disabled) continue
      if (sheet.href) urls.push(sheet.href)
      else if (sheet.ownerNode?.nodeName === 'STYLE') inline.push(sheet.ownerNode.textContent ?? '')
    }
    return { inline, urls }
  })
  const texts = [...installed.inline, ...await state.linkedStyles(installed.urls)]
  state.lastStylesheets = { marker, ...installed, texts }
  assert.ok(texts.some(text => text.includes(marker)), `当前挂载样式缺少本轮 marker ${marker}`)
}
