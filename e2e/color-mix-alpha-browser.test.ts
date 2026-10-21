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

it.each(selected)('%s：任意运行时权重不能直接改写为 rgba alpha', async (_name, engine) => {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    // 0.4 可精确表示为 102/255，避免原色量化差异混入权重语义断言。
    for (const originalAlpha of [1, 0.4]) {
      await page.setContent(`<style>
        .original{background-color:color-mix(in srgb, rgba(255,0,0,${originalAlpha}) var(--weight), transparent)}
        .unsafe{background-color:rgba(255,0,0,var(--weight))}
      </style><div class="original"></div><div class="unsafe"></div>`)
      for (const [weight, expectedAlpha] of [
        ['20%', 0.2 * originalAlpha],
        ['50%', 0.5 * originalAlpha],
        ['100%', originalAlpha],
        ['20%', 0.2 * originalAlpha],
        ['0%', 0],
        ['-10%', 0],
        ['110%', 0],
        ['0.5', 0],
        ['invalid', 0],
        ['', 0],
      ] as const) {
        const result = await page.evaluate(({ weight, expectedAlpha }) => {
          if (weight) {
            document.documentElement.style.setProperty('--weight', weight)
          }
          else {
            document.documentElement.style.removeProperty('--weight')
          }
          const alpha = (selector: string) => {
            const value = getComputedStyle(document.querySelector(selector)!).backgroundColor
            if (!value.startsWith('rgba(') && !value.includes('/')) {
              return 1
            }
            const token = value.slice(0, -1).split(/[,/]/).at(-1)!.trim()
            return Number.parseFloat(token) / (token.endsWith('%') ? 100 : 1)
          }
          return {
            actual: alpha('.original'),
            unsafe: alpha('.unsafe'),
            expected: expectedAlpha,
          }
        }, { weight, expectedAlpha })
        expect(result.actual, `原色alpha=${originalAlpha}，权重=${weight || '未定义'}`).toBeCloseTo(result.expected, 6)
        if (weight === '0.5' || weight === '110%' || (originalAlpha < 1 && weight === '50%')) {
          expect(result.unsafe, '简单 rgba 改写会改变原色 alpha、无效数值或越界语义').not.toEqual(result.expected)
        }
      }
    }
  }
  finally {
    await browser.close()
  }
}, 60_000)
