import process from 'node:process'
import { chromium, firefox, webkit } from 'playwright'
import { expect, it } from 'vitest'
import { createStyleHandler, transformLynxCssCompat, transformWebCssCompat } from '../packages/postcss/src/index'

const engines = { chromium, firefox, webkit }
const requested = process.env.LYNX_THEME_BROWSER ?? 'chromium'
if (requested !== 'all' && !(requested in engines)) {
  throw new Error(`未知颜色语义浏览器：${requested}`)
}
const selected = Object.entries(engines).filter(([name]) => requested === 'all' || requested === name)

it.each(selected)('%s：颜色、权重和 currentColor 切换保留独立 RGBA 参考', async (_name, engine) => {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const fixtures = [
      { id: 'original-alpha', declarations: '', value: 'rgba(255,0,0,.5) 50%', colors: ['rgba(255,0,0,.25)', 'rgba(255,0,0,.25)', 'rgba(255,0,0,.25)'] },
      { id: 'theme', declarations: ':root{--brand:red}.changed{--brand:blue}', value: 'var(--brand) 50%', colors: ['rgba(255,0,0,.5)', 'rgba(0,0,255,.5)', 'rgba(255,0,0,.5)'] },
      { id: 'fallback', declarations: '.changed{--brand:blue}', value: 'var(--brand, red) 50%', colors: ['rgba(255,0,0,.5)', 'rgba(0,0,255,.5)', 'rgba(255,0,0,.5)'] },
      { id: 'weight', declarations: ':root{--weight:50%}.changed{--weight:25%}', value: 'rgba(255,0,0,.5) var(--weight)', colors: ['rgba(255,0,0,.25)', 'rgba(255,0,0,.125)', 'rgba(255,0,0,.25)'] },
      { id: 'current-color', declarations: '.scope{color:red}.changed{color:blue}', value: 'currentColor 50%', colors: ['rgba(255,0,0,.5)', 'rgba(0,0,255,.5)', 'rgba(255,0,0,.5)'] },
      { id: 'supports', declarations: ':root{--brand:white}.changed{--brand:red}', value: 'var(--brand) 70%', colors: ['rgba(255,255,255,.7)', 'rgba(255,0,0,.7)', 'rgba(255,255,255,.7)'] },
    ]
    const handler = createStyleHandler({ majorVersion: 4, cssSelectorReplacement: { root: ':root', universal: '*' } })
    for (const fixture of fixtures) {
      const space = fixture.id === 'original-alpha' ? 'oklab' : 'srgb'
      const rule = `.probe{background-color:color-mix(in ${space}, ${fixture.value}, transparent)}`
      const css = fixture.declarations + (fixture.id === 'supports' ? `@supports(color:color-mix(in lch,red,blue)){${rule}}` : rule)
      const processed = (await handler(css)).css
      const pipelines = [
        ['原始', css],
        ['Web', transformWebCssCompat(css, true)],
        ['Lynx', transformLynxCssCompat(css)],
        ['Web → Lynx', transformLynxCssCompat(transformWebCssCompat(css, true))],
      ]
      if (fixture.id === 'supports') {
        // 小程序处理器按既有合同删除现代颜色 supports；Web/Lynx 另行验证实际颜色。
        expect(processed).not.toContain('.probe')
      }
      else {
        pipelines.push(['样式处理器（Web 根选择器）', processed])
      }
      for (const [pipeline, transformed] of pipelines) {
        await page.setContent(`<style>${transformed}</style><button onclick="document.querySelector('.scope').classList.toggle('changed')">切换</button><div class="scope"><div class="probe"></div></div>`)
        for (const [index, color] of fixture.colors.entries()) {
          if (index) {
            await page.getByRole('button', { name: '切换' }).click()
          }
          const result = await page.locator('.probe').evaluate((element, reference) => {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = 1
            const context = canvas.getContext('2d')!
            const sample = (value: string) => {
              context.clearRect(0, 0, 1, 1)
              context.fillStyle = value
              context.fillRect(0, 0, 1, 1)
              return [...context.getImageData(0, 0, 1, 1).data]
            }
            return { actual: sample(getComputedStyle(element).backgroundColor), expected: sample(reference) }
          }, color)
          expect(result.actual, `${fixture.id}/${pipeline}/${index}`).toEqual(result.expected)
        }
      }
    }
  }
  finally {
    await browser.close()
  }
}, 60_000)
