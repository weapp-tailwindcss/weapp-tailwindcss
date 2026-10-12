import type { IStyleHandlerOptions } from '@/types'
import type { WeappTailwindcssPostcssPluginAdapters } from '@/generator-plugin'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { finalizeMiniProgramCss, finalizeMiniProgramCssRoot, normalizeMiniProgramGeneratedCssForPostcss, pruneMiniProgramGeneratedCss } from '@/compat/mini-program-css'
import { normalizeMiniProgramPrefixedDeclaration, normalizePreservedWebkitProperties } from '@/compat/mini-program-prefixes'
import { transformTailwindV4CssToWeapp } from '@/compat/tailwindcss-v4/generated-output'
import { createWeappTailwindcssPostcssPlugin } from '@/generator-plugin'
import { createStyleHandler } from '@/handler'
import { postcssWeappTailwindcssPostPlugin } from '@/plugins/post'

const transforms = ['post', 'handler-v3', 'handler-v4', 'finalize', 'finalize-root', 'prune', 'deferred', 'generated-v4'] as const
type Transform = typeof transforms[number]

async function transform(css: string, method: Transform, preserveWebkitProperties?: string[]) {
  const cssOptions = { preserveWebkitProperties }
  const options = { isMainChunk: true, cssPreflight: false, autoprefixer: false, cssOptions } satisfies Partial<IStyleHandlerOptions>
  switch (method) {
    case 'post':
      return (await postcss([postcssWeappTailwindcssPostPlugin(options)]).process(css, { from: undefined })).css
    case 'handler-v3':
      return (await createStyleHandler(options)(css)).css
    case 'handler-v4':
      return (await createStyleHandler({ ...options, majorVersion: 4 })(css)).css
    case 'finalize':
      return finalizeMiniProgramCss(css, { cssPreflight: false, preserveWebkitProperties })
    case 'finalize-root': {
      const root = postcss.parse(css)
      finalizeMiniProgramCssRoot(root, { cssPreflight: false, preserveWebkitProperties })
      return root.toString()
    }
    case 'prune':
      return pruneMiniProgramGeneratedCss(css, { cssOptions })
    case 'deferred':
      return normalizeMiniProgramGeneratedCssForPostcss(css, { cssOptions, preserveRawClassRules: true })
    case 'generated-v4':
      return transformTailwindV4CssToWeapp(css, options)
  }
}

describe('小程序 WebKit 属性保留与 Issue 1286', () => {
  it('名单归一化保留完整合法名称，并忽略空名单与错误运行时形状', () => {
    expect(normalizePreservedWebkitProperties()).toBeUndefined()
    expect(normalizePreservedWebkitProperties([])).toBeUndefined()
    expect(normalizePreservedWebkitProperties('-webkit-user-select' as unknown as string[])).toBeUndefined()
    expect(normalizePreservedWebkitProperties(['', 'display', '-webkit-*', '-webkit-', '-webkit-test;'])).toBeUndefined()
    expect(normalizePreservedWebkitProperties([' -WEBKIT-USER-SELECT ', '-webkit-user-select'])).toEqual(new Set(['-webkit-user-select']))
  })

  it('默认 helper 保留附着在规则中的字体平滑声明', () => {
    const root = postcss.parse('.icon{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}')
    const rule = root.first!
    const declaration = (rule as postcss.Rule).first as postcss.Declaration
    normalizeMiniProgramPrefixedDeclaration(declaration)
    expect(declaration.parent).toBe(rule)
    expect(root.toString()).toBe('.icon{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}')
  })

  it.each(transforms)('%s 默认保留字体平滑及声明的值和 important', async (method) => {
    const css = '.icon{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.only{-WebKit-Font-Smoothing:subpixel-antialiased!important}.auto{-webkit-font-smoothing:auto}'
    const result = postcss.parse(await transform(css, method))
    const properties: Array<[string, string, boolean]> = []
    result.walkDecls(declaration => {
      if (declaration.prop.toLowerCase().includes('font-smoothing')) {
        properties.push([declaration.prop, declaration.value, Boolean(declaration.important)])
      }
    })
    expect(properties).toEqual([
      ['-webkit-font-smoothing', 'antialiased', false],
      ['-moz-osx-font-smoothing', 'grayscale', false],
      ['-WebKit-Font-Smoothing', 'subpixel-antialiased', true],
      ['-webkit-font-smoothing', 'auto', false],
    ])
  })

  it('默认 Tailwind v4 autoprefixer 保留输入的两种字体平滑声明', async () => {
    const handler = createStyleHandler({ majorVersion: 4, isMainChunk: true, cssPreflight: false })
    const css = '.icon{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}'
    expect((await handler(css)).css).toBe(css)
  })

  it.each([true, false])('Web 分支不受小程序扩展名单影响，isMainChunk=%s', async (isMainChunk) => {
    const handler = createStyleHandler({ majorVersion: 4, isMainChunk, cssPreflight: false })
    const css = '.icon{-webkit-user-select:none;-webkit-flex:1;display:-webkit-inline-flex}'
    const cssOptions = { platform: 'web', autoprefixer: false } as const
    const original = await handler(css, { cssOptions })
    const extended = await handler(css, {
      cssOptions: { ...cssOptions, preserveWebkitProperties: ['-webkit-user-select', '-webkit-flex'] },
    })
    expect(extended.css).toBe(original.css)
    expect(extended.css).not.toContain('-webkit-flex:')
  })

  it.each(transforms)('%s 扩展仅按完整属性匹配并继续保留默认属性', async (method) => {
    const css = '.icon{-webkit-user-select:none;-webkit-user-select-extra:none;-webkit-font-smoothing:antialiased;-webkit-transform:translateX(1px);transform:translateX(1px)}'
    const result = await transform(css, method, ['-webkit-user-select'])
    expect(result).toContain('-webkit-user-select:none')
    expect(result).toContain('-webkit-font-smoothing:antialiased')
    expect(result).not.toContain('-webkit-user-select-extra')
    expect(result).not.toContain('-webkit-transform:')
    expect(result).toContain('transform:translateX(1px)')
  })

  it.each(transforms)('%s 不用属性名单放行关键词值、transition 项或 keyframes', async (method) => {
    const css = '.icon{-webkit-flex:1;-webkit-transform:translateX(1px);display:-webkit-flex;display:flex;appearance:-webkit-button;-webkit-appearance:-webkit-button;transition-property:transform,-webkit-transform;transition:transform .2s,-webkit-transform .2s}@-webkit-keyframes spin{to{transform:rotate(1turn)}}'
    const result = await transform(css, method, ['-webkit-flex', '-webkit-transform', '-webkit-appearance'])
    expect(result).toContain('-webkit-flex:1')
    expect(result).toContain('-webkit-transform:translateX(1px)')
    expect(result).toContain('display:flex')
    expect(result).not.toContain('display:-webkit-flex')
    expect(result).not.toContain('appearance:')
    expect(result).toContain('transition-property:transform')
    expect(result).toContain('transition:transform .2s')
    expect(result).not.toContain(',-webkit-transform')
    expect(result).not.toContain('@-webkit-keyframes')
  })

  it('修剪与最终清理重复执行时保留配置仍然有效', () => {
    const css = '.icon{-webkit-user-select:none;-webkit-font-smoothing:antialiased}'
    const cssOptions = { preserveWebkitProperties: ['-webkit-user-select'] }
    const first = finalizeMiniProgramCss(pruneMiniProgramGeneratedCss(css, { cssOptions }), { cssPreflight: false, ...cssOptions })
    const second = finalizeMiniProgramCss(pruneMiniProgramGeneratedCss(first, { cssOptions }), { cssPreflight: false, ...cssOptions })
    expect(second).toBe(first)
    expect(second).toContain('-webkit-user-select:none')
  })

  it('归一化大小写、空白与重复项，忽略非法名称且不修改配置数组', async () => {
    const entries = [' -WEBKIT-USER-SELECT ', '-webkit-user-select', '', 'display', '-moz-osx-font-smoothing', '-webkit-*', '-webkit-', '-webkit-user-select: none', 42] as string[]
    const original = [...entries]
    const result = await transform('.icon{-WebKit-User-Select:none;-webkit-transform:none;-webkit-font-smoothing:antialiased;display:-webkit-flex}', 'handler-v4', entries)
    expect(result).toContain('-WebKit-User-Select:none')
    expect(result).toContain('-webkit-font-smoothing:antialiased')
    expect(result).not.toContain('-webkit-transform')
    expect(result).not.toContain('display:')
    expect(entries).toEqual(original)
  })

  it('空名单覆盖调用基线扩展，但不删除内置字体平滑属性', async () => {
    const handler = createStyleHandler({
      cssPreflight: false,
      autoprefixer: false,
      isMainChunk: true,
      cssOptions: { preserveWebkitProperties: ['-webkit-user-select'] },
    })
    const css = '.icon{-webkit-user-select:none;-webkit-font-smoothing:antialiased}'
    expect((await handler(css)).css).toContain('-webkit-user-select:none')
    const result = await handler(css, { cssOptions: { preserveWebkitProperties: [] } })
    expect(result.css).not.toContain('-webkit-user-select')
    expect(result.css).toContain('-webkit-font-smoothing:antialiased')
  })

  it('名单原位增删使处理器与结果缓存失效', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ isMainChunk: true, cssPreflight: false, autoprefixer: false, onDiagnostic })
    const options = { cssOptions: { preserveWebkitProperties: [] as string[] } }
    const css = '.icon{-webkit-user-select:none;-webkit-font-smoothing:antialiased}'
    expect((await handler(css, options)).css).not.toContain('-webkit-user-select')
    await handler(css, options)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    options.cssOptions.preserveWebkitProperties.push('-webkit-user-select')
    expect((await handler(css, options)).css).toContain('-webkit-user-select:none')
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    options.cssOptions.preserveWebkitProperties.splice(0)
    expect((await handler(css, options)).css).not.toContain('-webkit-user-select')
  })

  it('不同处理器实例的扩展名单互不污染', async () => {
    const options = { isMainChunk: true, cssPreflight: false, autoprefixer: false }
    const extended = createStyleHandler({ ...options, cssOptions: { preserveWebkitProperties: ['-webkit-user-select'] } })
    const defaults = createStyleHandler(options)
    const css = '.icon{-webkit-user-select:none;-webkit-font-smoothing:antialiased}'
    const outputs = await Promise.all([extended(css), defaults(css), extended(css), defaults(css)])
    expect(outputs.map(result => result.css.includes('-webkit-user-select'))).toEqual([true, false, true, false])
    expect(outputs.every(result => result.css.includes('-webkit-font-smoothing'))).toBe(true)
  })

  it('独立生成插件的最终清理透传属性扩展', async () => {
    const css = '.icon{-webkit-user-select:none;-webkit-font-smoothing:antialiased}'
    const adapters: WeappTailwindcssPostcssPluginAdapters = {
      normalizeGeneratorOptions: () => ({ target: 'weapp', importFallback: true }),
      resolveTailwindV4Source: async options => ({ version: 4, ...options }),
      createGenerator: () => ({ generate: async () => ({ css, rawCss: css, target: 'weapp', classSet: new Set<string>(), dependencies: [] }) }),
    }
    const plugin = createWeappTailwindcssPostcssPlugin(adapters)
    const result = await postcss([plugin({ scanSources: false, styleOptions: { cssOptions: { preserveWebkitProperties: ['-webkit-user-select'] } } })]).process('@tailwind utilities;', { from: undefined })
    expect(result.css).toContain('-webkit-user-select:none')
    expect(result.css).toContain('-webkit-font-smoothing:antialiased')
  })
})
