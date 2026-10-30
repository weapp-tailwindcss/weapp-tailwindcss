import type { AcceptedPlugin } from '@weapp-tailwindcss/postcss/transform'
import type { UserDefinedOptions } from '../packages/weapp-tailwindcss/src/types'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { runInNewContext } from 'node:vm'
import { applyConfiguredCssUnits, postcss, transformWebCssCompat } from '@weapp-tailwindcss/postcss/transform'
import { satisfies } from 'semver'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import { createWebpackHtmlScript } from './taro-template-web-target/html-script'
import { loadTemplate } from './taro-template-web-target/template-config'
import { runWebpackCssStages } from './taro-template-web-target/webpack-css-stages'

const repoRoot = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const templates = ['taro-vite-tailwindcss-v4', 'taro-webpack-tailwindcss-v4'] as const
type Template = typeof templates[number]

function cssRuntime(template: Template) {
  if (process.env.E2E_TARO_TEMPLATE_PUBLISHED !== '1') {
    return { createWeappTailwindcssGenerator, resolveTailwindV4Source, applyConfiguredCssUnits, postcss, transformWebCssCompat, webpack: require('webpack') as typeof import('webpack'), base: repoRoot }
  }
  const base = path.join(repoRoot, 'templates', template)
  const templateRequire = createRequire(path.join(base, 'package.json'))
  const version = templateRequire('weapp-tailwindcss/package.json').version as string
  const declaration = templateRequire('./package.json').devDependencies['weapp-tailwindcss'] as string
  expect(version, '独立验证必须加载 npm 正式版').toMatch(/^\d+\.\d+\.\d+$/)
  expect(satisfies(version, declaration), '独立验证必须满足模板依赖声明').toBe(true)
  const packageRequire = createRequire(templateRequire.resolve('weapp-tailwindcss/package.json'))
  const runnerRequire = createRequire(templateRequire.resolve(template === 'taro-vite-tailwindcss-v4' ? '@tarojs/vite-runner' : '@tarojs/webpack5-runner'))
  return {
    ...templateRequire('weapp-tailwindcss/generator') as { createWeappTailwindcssGenerator: typeof createWeappTailwindcssGenerator, resolveTailwindV4Source: typeof resolveTailwindV4Source },
    ...packageRequire('@weapp-tailwindcss/postcss/transform') as { applyConfiguredCssUnits: typeof applyConfiguredCssUnits, postcss: typeof postcss, transformWebCssCompat: typeof transformWebCssCompat },
    webpack: template === 'taro-webpack-tailwindcss-v4' ? templateRequire('webpack') as typeof import('webpack') : undefined,
    taroPxtransform: runnerRequire('postcss-pxtransform') as (options: Record<string, unknown>) => AcceptedPlugin,
    getHtmlScript: template === 'taro-vite-tailwindcss-v4'
      ? (runnerRequire('./dist/utils/html') as { getHtmlScript: (entry: string, options: unknown, platform: string) => string }).getHtmlScript
      : createWebpackHtmlScript(templateRequire),
    base,
  }
}

async function transformTemplateWebUnits(runtime: ReturnType<typeof cssRuntime>, template: Template, loaded: Awaited<ReturnType<typeof loadTemplate>>, css: string) {
  const option = loaded.options[0]!
  if (template === 'taro-vite-tailwindcss-v4') {
    return runtime.applyConfiguredCssUnits(css, option)
  }
  expect(loaded.config.h5.postcss).not.toHaveProperty('postcss-rule-unit-converter')
  expect(option.cssOptions?.unitConversion).toBeUndefined()
  // 使用真实 Webpack 的阶段排序；生成样式在 SUMMARIZE 才进入资产图。
  return runWebpackCssStages(runtime.webpack!, loaded.webpackPlugins, css)
}

describe('独立 Taro 模板的输出目标边界', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(templates)('%s 的 H5/Hybrid 主题、间距与渐变使用 Web 语义', async (template) => {
    const runtime = cssRuntime(template)
    const source = await runtime.resolveTailwindV4Source({
      base: runtime.base,
      css: '@import "tailwindcss" source(none);@source inline("p-4 p-[40rpx] h-[72rpx] text-slate-800 bg-linear-to-r from-blue-400 to-purple-600");',
    })
    for (const target of ['h5', 'harmony-hybrid']) {
      vi.stubEnv('TARO_ENV', target)
      const engine = runtime.createWeappTailwindcssGenerator(source)
      try {
        const loaded = await loadTemplate(template, target)
        const { config, options } = loaded
        expect(options).toHaveLength(1)
        const option = options[0]!
        expect(option.disabled).toBe(false)
        expect(option.cssOptions?.cssSelectorReplacement).toEqual({ root: false, universal: false })
        const generator = option.generator as Exclude<UserDefinedOptions['generator'], false | undefined>
        expect(generator.target).toBe('web')
        expect(generator.webCompat).toBe(true)
        const generated = await engine.generate({ target: generator.target, styleOptions: generator.styleOptions })
        const css = await transformTemplateWebUnits(runtime, template, loaded, runtime.transformWebCssCompat(generated.css, generator.webCompat))
        const root = runtime.postcss.parse(css)
        const declarations = new Map<string, string>()
        const themeScopes: string[] = []
        root.walkRules((rule) => {
          rule.walkDecls((decl) => {
            declarations.set(`${rule.selector}|${decl.prop}`, decl.value)
            if (decl.prop === '--color-slate-800') {
              themeScopes.push(rule.selector)
            }
            expect(decl.value, `${target}: ${decl.toString()}`).not.toMatch(/(?:\d|\.)rpx\b/)
          })
        })
        expect(themeScopes.some(selector => selector.includes(':root'))).toBe(true)
        expect(themeScopes.join(',')).not.toContain('page')
        expect(css).not.toMatch(/_b[\w-]+_B/)
        expect(declarations.get('.text-slate-800|color')?.replace(/\s+/g, '')).toBe('rgb(29,41,61)')
        expect([...declarations.entries()].find(([key]) => key.endsWith('|--color-slate-800'))?.[1].replace(/\s+/g, '')).toBe('rgb(29,41,61)')
        expect(declarations.get('.p-\\[40rpx\\]|padding')).toBe('1.25rem')
        expect(declarations.get('.p-4|padding')).toBe('calc(var(--spacing) * 4)')
        const spacing = [...declarations.entries()].find(([key]) => key.endsWith('|--spacing'))?.[1]
        expect(spacing).toBe('0.25rem')
        expect(Number.parseFloat(spacing!) * 4).toBe(1)
        expect(declarations.get('.h-\\[72rpx\\]|height')).toBe('2.25rem')
        expect(declarations.get('.bg-linear-to-r|background-image')).toContain('linear-gradient(')
        const rootValue = config.h5.postcss.pxtransform.config.baseFontSize / config.deviceRatio[config.designWidth]! * 2
        expect(Number.parseFloat(declarations.get('.p-\\[40rpx\\]|padding')!) * rootValue).toBe(40)
        if ('taroPxtransform' in runtime) {
          // 作者样式先经模板 runner 的 Taro loader，再进入生成后的资产阶段。
          const input = '.source-px{padding:40px;height:72px}.source-rpx{padding:40rpx;height:72rpx}.source-rem{padding:1rem;height:1.8rem}'
          const transform = async (cssText: string, platform: string) => (await runtime.postcss([runtime.taroPxtransform({
            ...config.h5.postcss.pxtransform.config,
            designWidth: config.designWidth,
            deviceRatio: config.deviceRatio,
            platform,
          })]).process(cssText, { from: undefined })).css
          const sourceAfterTaro = await transformTemplateWebUnits(runtime, template, loaded, await transform(input, 'h5'))
          const values: string[] = []
          runtime.postcss.parse(sourceAfterTaro).walkDecls((decl) => {
            values.push(decl.value)
          })
          expect(values).toEqual(['1.25rem', '2.25rem', '1.25rem', '2.25rem', '1rem', '1.8rem'])
          const mini = await loadTemplate(template, 'weapp')
          const miniCss = await runtime.applyConfiguredCssUnits(await transform(input, 'weapp'), mini.options[0])
          const miniValues: string[] = []
          runtime.postcss.parse(miniCss).walkDecls((decl) => {
            miniValues.push(decl.value)
          })
          expect(miniValues).toEqual(['40rpx', '72rpx', '40rpx', '72rpx', '32rpx', '57.6rpx'])
          expect(runtime.getHtmlScript).toBeTypeOf('function')
          const html = runtime.getHtmlScript('/src/app.ts', { config: {
            ...config.h5.postcss.pxtransform.config,
            htmlPluginOption: config.h5.htmlPluginOption,
            designWidth: config.designWidth,
            deviceRatio: config.deviceRatio,
          } }, target)
          const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
          expect(script).toBeTruthy()
          const widthCases = [
            [320, target === 'h5' ? 16 : 32 * 320 / 750],
            [375, 16],
            [599, 32 * 599 / 750],
            [600, target === 'h5' ? 32 * 600 / 750 : 16],
            [750, target === 'h5' ? 32 : 16],
            [1280, target === 'h5' ? 32 : 16],
          ] as const
          for (const [width, expectedRoot] of widthCases) {
            const element = { style: { fontSize: '' }, getBoundingClientRect: () => ({ width, height: 812 }) }
            runInNewContext(script!, { window: { document: { documentElement: element }, addEventListener: () => {} }, setTimeout: () => {} })
            expect(Number.parseFloat(element.style.fontSize)).toBeCloseTo(expectedRoot!, 10)
            if (width === 375) {
              expect(Number.parseFloat(declarations.get('.p-\\[40rpx\\]|padding')!) * expectedRoot!).toBe(20)
            }
          }
        }
      }
      finally {
        await engine.dispose?.()
      }
    }
  })

  it.each(templates)('%s 保留小程序单位与 RN 独立链路', async (template) => {
    for (const target of ['weapp', 'alipay', 'harmony']) {
      const { options } = await loadTemplate(template, target)
      expect(options).toHaveLength(1)
      expect(options[0]?.rem2rpx).toBe(true)
      expect(options[0]?.cssOptions).toBeUndefined()
      expect(options[0]?.generator).toMatchObject({ target: 'weapp' })
      expect((options[0]?.generator as { styleOptions?: unknown }).styleOptions)
        .toEqual(template === 'taro-vite-tailwindcss-v4' ? { px2rpx: true } : undefined)
    }
    for (const target of ['rn', 'jdrn']) {
      const { config, options } = await loadTemplate(template, target)
      expect(config.rn).toHaveProperty('appName', 'taroDemo')
      expect(options.filter(option => !option.disabled)).toEqual([])
    }
  })
})
