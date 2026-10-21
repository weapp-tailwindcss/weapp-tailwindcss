import process from 'node:process'
import { chromium, firefox, webkit } from 'playwright'
import { expect, it } from 'vitest'
import { finalizeWebCssPropertyFallbacks, transformWebCssCompat } from '../packages/postcss/src/transform'

const engines = { chromium, firefox, webkit }
const requested = process.env.LYNX_THEME_BROWSER ?? 'chromium'
if (requested !== 'all' && !(requested in engines)) {
  throw new Error(`未知注册默认值语义浏览器：${requested}`)
}
const selected = Object.entries(engines).filter(([name]) => requested === 'all' || requested === name)

it.each(selected)('%s：完整资产的注册默认值保持正向、反向和恢复后的间距', async (_name, engine) => {
  const registration = '@property --tw-space-y-reverse{syntax:"*";inherits:false;initial-value:0}'
  const utility = ':where(.reverse > :not(:last-child)){--tw-space-y-reverse:1}'
  const fragment = (css: string) => transformWebCssCompat(css, true, { deferPropertyFallback: true })
  const css = finalizeWebCssPropertyFallbacks([
    `${fragment(registration + utility)}${fragment(`${registration}.unrelated{color:red}`)}`,
  ], true)[0]!
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(`<style>${css}
      .stack{display:flex;flex-direction:column}
      .stack>div{height:10px}
      .stack>:not(:last-child){margin-top:calc(12px * var(--tw-space-y-reverse));margin-bottom:calc(12px * (1 - var(--tw-space-y-reverse)))}
      </style><button onclick="document.querySelector('.stack').classList.toggle('reverse')">切换</button><div class="stack"><div></div><div></div></div>`)
    for (const [index, expected] of [[0, 12, 0], [12, 0, 12], [0, 12, 0]].entries()) {
      if (index) {
        await page.getByRole('button', { name: '切换' }).click()
      }
      const actual = await page.locator('.stack').evaluate((stack) => {
        const child = stack.firstElementChild!
        const style = getComputedStyle(child)
        return [Number.parseFloat(style.marginTop), Number.parseFloat(style.marginBottom), child.getBoundingClientRect().top - stack.getBoundingClientRect().top]
      })
      expect(actual).toEqual(expected)
    }
  }
  finally {
    await browser.close()
  }
}, 60_000)

it.each(selected)('%s：框架零长度注册的 ring 与独立参考相同', async (_name, engine) => {
  const registration = '@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0rem}'
  const css = finalizeWebCssPropertyFallbacks([`${registration}.probe{box-shadow:0 0 0 calc(2px + var(--tw-ring-offset-width)) red}`], true)[0]!
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    for (const fixture of [css, css.replace(registration, '')]) {
      await page.setContent(`<style>${fixture}.reference{box-shadow:0 0 0 2px red}</style><div class="probe"></div><div class="reference"></div>`)
      const values = await page.locator('.probe,.reference').evaluateAll(elements => elements.map(element => getComputedStyle(element).boxShadow))
      expect(values[0]).toBe(values[1])
      expect(values[0]).not.toBe('none')
    }
  }
  finally {
    await browser.close()
  }
}, 60_000)
