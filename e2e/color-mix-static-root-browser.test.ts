import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'
import { expect, it } from 'vitest'
import { escape } from 'weapp-tailwindcss/escape'
import { withGeneratorFixture } from './tailwind-capabilities/fixture'

const root = fileURLToPath(new URL('..', import.meta.url))
const engines = { chromium, firefox, webkit }
const requested = process.env.LYNX_THEME_BROWSER ?? 'chromium'
if (requested !== 'all' && !(requested in engines)) {
  throw new Error(`未知颜色语义浏览器：${requested}`)
}

it.each(Object.entries(engines).filter(([name]) => requested === 'all' || requested === name))('%s：完整生成的静态 root 权重符合独立原色 alpha 参考', async (_name, engine) => {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const cases = [
      { name: 'zero', percentage: '0%', alpha: 0 },
      { name: 'quarter', percentage: '25%', alpha: 0.1 },
      { name: 'half', percentage: '50%', alpha: 0.2 },
      { name: 'full', percentage: '100%', alpha: 0.4 },
      { name: 'fraction', percentage: '12.5%', alpha: 0.05 },
    ]
    const declarations = cases.map(({ name, percentage }) => `--weight-${name}:${percentage};--alias-${name}:var(--weight-${name})`).join(';')
    const css = `@import "tailwindcss" source(none);:root{${declarations}}@theme inline{--color-probe:rgba(255,0,0,.4)}`
    await withGeneratorFixture(root, css, {}, async (generator) => {
      const candidates = cases.map(({ name }) => `bg-probe/(--alias-${name})`)
      const generated = await generator.generate({ target: 'weapp', candidates, scanSources: false })
      for (const [index, { percentage, alpha }] of cases.entries()) {
        const candidate = candidates[index]!
        expect(generated.classSet.has(candidate)).toBe(true)
        await page.setContent(`<style>${generated.css}
          .original{background-color:color-mix(in oklab,rgba(255,0,0,.4) ${percentage},transparent)}
          .reference{background-color:rgba(255,0,0,${alpha})}
        </style><div class="lowered ${escape(candidate)}"></div><div class="original"></div><div class="reference"></div>`)
        const colors = await page.evaluate(() => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')!
          return ['lowered', 'original', 'reference'].map((name) => {
            const value = getComputedStyle(document.querySelector(`.${name}`)!).backgroundColor
            context.clearRect(0, 0, 1, 1)
            context.fillStyle = value
            context.fillRect(0, 0, 1, 1)
            const alpha = value.match(/(?:,|\/)\s*([\d.]+)(%)?\s*\)$/)
            return {
              computed: value,
              alpha: alpha ? Number(alpha[1]) / (alpha[2] ? 100 : 1) : undefined,
              pixels: [...context.getImageData(0, 0, 1, 1).data],
            }
          })
        })
        expect(colors[0]?.pixels, candidate).toEqual(colors[2]?.pixels)
        expect(colors[0]?.alpha, candidate).toBe(alpha)
        // 原始 oklab 计算值再次写入 Canvas 会引入浏览器色彩转换和量化，不将其当成生成器像素 oracle。
        expect(colors[1]?.alpha, `原始 mix/${percentage}\n${JSON.stringify(colors)}`).toBe(alpha)
      }
    })
  }
  finally {
    await browser.close()
  }
}, 60_000)
