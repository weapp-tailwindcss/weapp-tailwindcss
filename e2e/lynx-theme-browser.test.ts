import process from 'node:process'
import { chromium, firefox, webkit } from 'playwright'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { transformLynxCssCompat, transformWebCssCompat } from '../packages/postcss/src/index'

const cases = [
  {
    id: 'direct',
    css: ':root { --color-brand: #f00; } .theme-dark { --color-brand: #00f; } .probe { background-color: var(--color-brand); }',
    colors: ['rgb(255, 0, 0)', 'rgb(0, 0, 255)', 'rgb(255, 0, 0)'],
  },
  {
    id: 'escaped',
    css: String.raw`:root { --color-brand: #f00; } .theme-dark { --color-br\61nd: #00f; } .probe { background-color: var(--color-brand); }`,
    colors: ['rgb(255, 0, 0)', 'rgb(0, 0, 255)', 'rgb(255, 0, 0)'],
  },
  {
    id: 'fallback-cycle',
    css: ':root { --color-base: #f00; --color-brand: var(--color-base, var(--color-brand)); } .probe { background-color: var(--color-brand, #00f); }',
    colors: ['rgb(255, 0, 0)', 'rgb(255, 0, 0)', 'rgb(255, 0, 0)'],
  },
  {
    id: 'used-cycle',
    css: ':root { --color-brand: var(--color-brand); } .probe { background-color: var(--color-brand, #00f); }',
    colors: ['rgb(0, 0, 255)', 'rgb(0, 0, 255)', 'rgb(0, 0, 255)'],
  },
]

const engines = { chromium, firefox, webkit }
const requested = process.env.LYNX_THEME_BROWSER ?? 'chromium'
if (requested !== 'all' && !(requested in engines)) {
  throw new Error(`未知 Lynx 主题浏览器：${requested}`)
}
const selected = Object.entries(engines).filter(([name]) => requested === 'all' || requested === name)

it.each(selected)('%s：无效描述符、公开 tw 前缀和保留层的独立语义回归', async (_name, engine) => {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const fixtures = [
      {
        id: 'invalid-initial',
        css: '@property --color-brand { syntax: "<color>"; inherits: false; initial-value: var(--color-base); } :root { --color-base: #00f; --color-brand: #f00; } .probe { color: var(--color-brand, #0f0); }',
        color: 'rgb(255, 0, 0)',
      },
      {
        id: 'public-prefix',
        css: '@property --tw-color-brand { syntax: "*"; inherits: false; } :root { --tw-color-brand: #f00; } .probe { color: var(--tw-color-brand, #00f); }',
        color: 'rgb(0, 0, 255)',
      },
      {
        id: 'invalid-layer-descriptors',
        css: '@property --color-brand { @layer x { syntax: "<color>"; inherits: false; initial-value: #00f; } } :root { --color-brand: #f00; } .probe { color: var(--color-brand); }',
        color: 'rgb(255, 0, 0)',
      },
      {
        id: 'author-same-name',
        css: '@property --tw-border-style { syntax: "*"; inherits: true; initial-value: solid; } :root { --tw-border-style: #f00; } .probe { color: var(--tw-border-style, #00f); }',
        color: 'rgb(255, 0, 0)',
      },
    ]
    for (const fixture of fixtures) {
      for (const [pipeline, transform] of [
        ['原始', (css: string) => css],
        ['Web', (css: string) => transformWebCssCompat(css, true)],
        ['Lynx', transformLynxCssCompat],
        ['组合', (css: string) => transformLynxCssCompat(transformWebCssCompat(css, true))],
      ] as const) {
        await page.setContent(`<style>${transform(fixture.css)}</style><div class="probe"></div>`)
        expect(await page.locator('.probe').evaluate(element => getComputedStyle(element).color), `${fixture.id}/${pipeline}`).toBe(fixture.color)
      }
    }
    const layered = '@property --tw-translate-x { syntax: "*"; inherits: false; initial-value: 0; } @layer app { .probe { --tw-translate-x: 10px; width: var(--tw-translate-x); } }'
    const converted = transformWebCssCompat(layered, { features: { layer: false } })
    const withoutRegistrations = postcss.parse(converted)
    // 模拟目标忽略注册，证明默认兼容并非借助现代浏览器注册语义才成立。
    withoutRegistrations.walkAtRules('property', rule => rule.remove())
    for (const css of [layered, converted, withoutRegistrations.toString()]) {
      await page.setContent(`<style>${css}</style><div class="probe"></div>`)
      expect(await page.locator('.probe').evaluate(element => getComputedStyle(element).width)).toBe('10px')
    }
    for (const options of [true, { features: { layer: false } }] as const) {
      const importedRule = '.probe{--tw-translate-x:10px;width:10px}'
      const importedCss = options === true ? importedRule : `@layer app{${importedRule}}`
      const imported = `@layer app; @import url("data:text/css,${encodeURIComponent(importedCss)}"); @property --tw-translate-x { syntax: "*"; inherits: false; initial-value: 0; }`
      const css = transformWebCssCompat(imported, options)
      await page.setContent(`<style>${css}</style><div class="probe"></div>`)
      expect(await page.locator('.probe').evaluate(element => getComputedStyle(element).width), '默认块不能使 import 失效').toBe('10px')
      expect(await page.locator('.probe').evaluate(element => getComputedStyle(element).getPropertyValue('--tw-translate-x')), '默认层不能压过 import 的作者层').toBe('10px')
    }
  }
  finally {
    await browser.close()
  }
}, 60_000)

it.each(selected)('%s：作者注册属性的初值、不继承与局部切换保持独立浏览器语义', async (_name, engine) => {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const fixtures = [
      ['wildcard', 'syntax: "*"; inherits: false;'],
      ['typed', 'syntax: "<color>"; inherits: false; initial-value: #00f;'],
    ] as const
    for (const [id, descriptors] of fixtures) {
      const property = `--color-registered-${id}`
      const css = `@property ${property} { ${descriptors} } :root { ${property}: #f00; } .probe { background-color: var(${property}, #00f); } .theme-dark .probe { ${property}: #0f0; }`
      for (const [pipeline, transform] of [
        ['原始', (value: string) => value],
        ['Web', (value: string) => transformWebCssCompat(value, true)],
        ['Lynx', transformLynxCssCompat],
        ['Web → Lynx', (value: string) => transformLynxCssCompat(transformWebCssCompat(value, true))],
      ] as const) {
        await page.setContent(`<style>${transform(css)}</style><button onclick="document.body.classList.toggle('theme-dark')">切换</button><div class="probe"></div>`)
        for (const [index, color] of ['rgb(0, 0, 255)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)'].entries()) {
          if (index) {
            await page.getByRole('button', { name: '切换' }).click()
          }
          expect(await page.locator('.probe').evaluate(element => getComputedStyle(element).backgroundColor), `${id}/${pipeline}/${index}`).toBe(color)
        }
      }
    }
  }
  finally {
    await browser.close()
  }
}, 60_000)

it.each(selected)('%s：原始与 decoder 的颜色 token 写法具有独立浏览器等价证据', async (_name, engine) => {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const result = await page.evaluate(() => {
      const values = ['oklch(63% 0.2 40)', 'oklch(63% .2 40)', 'oklch(63%0.2 40)', 'oklch(63%.2 40)', 'oklch(.63 .2 40)']
      const colors = values.map((value) => {
        const element = document.createElement('div')
        element.style.backgroundColor = value
        document.body.append(element)
        return { supported: CSS.supports('background-color', value), color: getComputedStyle(element).backgroundColor }
      })
      return { colors, incompleteAccepted: CSS.supports('background-color', 'oklch(63%0.240)') }
    })
    expect(result.colors.every(item => item.supported && item.color === result.colors[0]!.color)).toBe(true)
    expect(result.incompleteAccepted).toBe(false)
  }
  finally {
    await browser.close()
  }
}, 30_000)

it.each(selected)('%s：真实主题切换、恢复与循环 fallback 符合独立参考', async (_name, engine) => {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    for (const fixture of cases) {
      const transformed = transformLynxCssCompat(transformWebCssCompat(fixture.css, true))
      await page.setContent(`<style>${fixture.css}</style><div class="probe"></div>`)
      expect(await page.locator('.probe').evaluate(element => getComputedStyle(element).backgroundColor)).toBe(fixture.colors[0])
      await page.setContent(`<style>${transformed}\n.probe,#control { width:24px;height:24px; }</style>
<button id="toggle" onclick="document.getElementById('scope').classList.toggle('theme-dark')">切换主题</button>
<div id="scope"><div class="probe"></div></div><div id="control"></div>`)
      for (const [index, phase] of ['before', 'after', 'restored'].entries()) {
        if (index) {
          await page.locator('#toggle').click()
        }
        await page.locator('#control').evaluate((element, color) => {
          (element as HTMLElement).style.backgroundColor = color!
        }, fixture.colors[index])
        const actual = await page.locator('.probe').evaluate(element => getComputedStyle(element).backgroundColor)
        const control = await page.locator('#control').evaluate(element => getComputedStyle(element).backgroundColor)
        expect(actual, `${engine.name()}/${fixture.id}/${phase}`).toBe(fixture.colors[index])
        expect(actual).toBe(control)
      }
    }
  }
  finally {
    await browser.close()
  }
}, 60_000)
