import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'
import postcss from 'postcss'
// eslint-disable-next-line antfu/no-import-dist -- 验证实际公开构建产物。
import { compileCascadeLayers } from '../dist/index.mjs'
import { conflicts, safeCases } from '../test/fixtures.mjs'

const properties = ['color', 'background-color', 'margin-top', 'margin-left', 'padding-top']
async function computed(page, css) {
  await page.setContent(`<style>${css}</style><div id="card"><div id="probe" class="probe">layer probe</div></div>`)
  return page.locator('#probe').evaluate((node, names) => Object.fromEntries(names.map(name => [name, getComputedStyle(node).getPropertyValue(name)])), properties)
}

// 每种引擎只创建一个后台 browser/context/page，依次验证后定向释放。
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch({ headless: true })
  let context
  try {
    context = await browser.newContext()
    const page = await context.newPage()
    let comparisons = 0
    for (const fixture of safeCases) {
      const { root, diagnostics } = compileCascadeLayers(postcss.parse(fixture.css), { mode: 'ordered', onConflict: 'error' })
      assert.deepEqual(diagnostics, [])
      for (const width of [390, 1000]) {
        await page.setViewportSize({ width, height: 844 })
        assert.deepEqual(await computed(page, root.toString()), await computed(page, fixture.css), `${name}: ${fixture.name}, width=${width}`)
        comparisons++
      }
    }
    for (const fixture of conflicts) {
      const root = postcss.parse(fixture.css)
      const result = compileCascadeLayers(root, { mode: 'ordered' })
      assert.ok(result.diagnostics.some(item => item.code === 'LAYER_SPECIFICITY'))
      assert.notDeepEqual(await computed(page, root.toString()), await computed(page, fixture.css), `${name}: ${fixture.name} 应保留语义差异反例`)
      assert.throws(() => compileCascadeLayers(postcss.parse(fixture.css), { mode: 'ordered', onConflict: 'error' }), /LAYER_SPECIFICITY/)
      comparisons++
    }
    console.log(JSON.stringify({ engine: name, version: browser.version(), headless: true, comparisons, safe: safeCases.length, conflicts: conflicts.length }))
  }
  finally {
    try {
      if (context) {
        await context.close()
      }
    }
    finally { await browser.close() }
  }
  console.log(`${name}: 已关闭本任务 browser/context/page`)
}
