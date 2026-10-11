import type { Plugin, ResolvedConfig } from 'vite'
import path from 'node:path'
import { createStyleHandler, postcss, transformWebCssCompat } from '@weapp-tailwindcss/postcss'
import { chromium } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '@/generator'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

const utilities = {
  direction: 'bg-gradient-to-r',
  from: 'from-cyan-500',
  to: 'to-blue-500',
  via: 'via-red-500',
  position: 'from-20% to-80%',
  shadow: 'shadow-md',
  shadowColor: 'shadow-red-500',
  ring: 'ring-2 ring-blue-500',
  drop: 'drop-shadow-md',
}
const applyCss = Object.entries(utilities)
  .map(([name, utility]) => `.wtu-${name} { @apply ${utility}; }`)
  .join('\n')
const entryCss = '@import "tailwindcss" source(none);'

async function generate(code: string, webCompat: boolean) {
  const source = await resolveTailwindV4Source({
    base: process.cwd(),
    css: code.includes('@import') ? code : `${entryCss}\n${code}`,
  })
  const result = await createWeappTailwindcssGenerator(source).generate({
    target: 'web',
    candidates: [],
    scanSources: false,
  })
  return transformWebCssCompat(result.css, webCompat)
}

function createWebPlugin(webCompat: boolean) {
  const styleHandler = createStyleHandler({
    appType: 'uni-app-x',
    platform: 'h5',
    uniAppX: false,
    majorVersion: 4,
    cssPresetEnv: { features: { 'custom-properties': { preserve: false } } },
  })
  const plugins = createUniAppXPlugins({
    appType: 'uni-app-x',
    customAttributesEntities: [],
    disabledDefaultTemplateHandler: false,
    mainCssChunkMatcher: () => false,
    runtimeState: { readyPromise: Promise.resolve() },
    styleHandler,
    jsHandler: vi.fn(),
    ensureRuntimeClassSet: async () => new Set(),
    getResolvedConfig: () => ({
      root: process.cwd(),
      command: 'serve',
      build: { outDir: 'dist/h5' },
    }) as ResolvedConfig,
    isWebGeneratorTarget: () => true,
    generateCss: (_id, code) => generate(code, webCompat),
  })
  return plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css')!
}

async function transform(plugin: Plugin, source: string, id: string) {
  const hook = plugin.transform!
  const handler = typeof hook === 'function' ? hook : hook.handler
  return await handler.call({} as never, source, id) as { code: string, map: string }
}

describe('issue 1210: uni-app x Web runtime properties', () => {
  it.each([true, false])('preserves generated Web CSS and source maps with webCompat=%s', async (webCompat) => {
    const source = `${entryCss}\n${applyCss}`
    const plugin = createWebPlugin(webCompat)
    const result = await transform(plugin, source, path.resolve('theme.css'))
    expect(result.code).not.toMatch(/view,\s*text/)
    expect(result.code).toContain('var(--tw-gradient-via-stops,')
    expect(result.code.includes('@property')).toBe(!webCompat)
    expect(JSON.parse(result.map).sourcesContent).toHaveLength(1)
    expect(await transform(plugin, result.code, path.resolve('theme.css'))).toBeUndefined()
  })

  it.each([true, false])('keeps isolated local gradients and shadows composable with webCompat=%s', async (webCompat) => {
    const plugin = createWebPlugin(webCompat)
    const result = await transform(plugin, applyCss, `${path.resolve('Widget.uvue')}?vue&type=style&index=0&scoped=test&lang.css`)
    expect(result.code).not.toContain('box-sizing')
    expect(result.code).not.toContain('--color-cyan-500:')
    const defaults: string[] = []
    postcss.parse(result.code).walkDecls('--tw-inset-shadow', (decl) => {
      defaults.push(decl.value)
    })
    if (webCompat) {
      expect(defaults).not.toHaveLength(0)
    }
    else {
      expect(result.code).toContain('@property --tw-inset-shadow')
    }
    // 主题仍由应用入口提供；这里仅带入主题，不带入任何运行时默认值或注册。
    const theme = postcss.root()
    postcss.parse(await generate(`${entryCss}\n${applyCss}`, webCompat)).walkRules((rule) => {
      if (rule.selectors.includes(':root')) {
        theme.append(rule.clone())
      }
    })

    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(`<style>${theme.toString()}\n${result.code}</style>
        <uni-view id="two" class="wtu-direction wtu-from wtu-to"></uni-view>
        <uni-view id="three" class="wtu-direction wtu-from wtu-to wtu-via"></uni-view>
        <uni-view id="position" class="wtu-direction wtu-from wtu-to wtu-position"></uni-view>
        <uni-view id="shadow" class="wtu-shadow"></uni-view>
        <uni-view id="colored" class="wtu-shadow wtu-shadowColor"></uni-view>
        <uni-view id="ring" class="wtu-shadow wtu-ring"></uni-view>
        <uni-view id="drop" class="wtu-drop"></uni-view>`)
      const styles = await page.evaluate(() => Object.fromEntries(
        [...document.querySelectorAll('uni-view')].map((element) => {
          const style = getComputedStyle(element)
          return [element.id, {
            background: style.backgroundImage,
            shadow: style.boxShadow,
            filter: style.filter,
          }]
        }),
      ))
      expect(styles.two.background).toContain('linear-gradient')
      expect(styles.three.background).toContain('linear-gradient')
      expect(styles.three.background).not.toBe(styles.two.background)
      expect(styles.position.background).toContain('20%')
      expect(styles.position.background).toContain('80%')
      expect(styles.shadow.shadow).not.toBe('none')
      expect(styles.colored.shadow).not.toBe(styles.shadow.shadow)
      expect(styles.ring.shadow).not.toBe(styles.shadow.shadow)
      expect(styles.drop.filter).toContain('drop-shadow')
    }
    finally {
      await browser.close()
    }
  })
})
