import type { IStyleHandlerOptions } from '../src/types'
import postcss from 'postcss'
import { finalizeMiniProgramCss, finalizeMiniProgramCssRoot } from '../src/compat/mini-program-css/finalize'
import { transformTailwindV4GeneratedCss } from '../src/compat/tailwindcss-v4/generated-output'
import { normalizeSkylineTypographyReset } from '../src/compat/tailwindcss-v4/skyline-typography'
import { createStyleHandler } from '../src/handler'

const reset = 'view,text{--tw-leading:initial;--tw-font-weight:initial}'
const theme = ':root,:host{--text-header-md:20px;--text-header-md--line-height:32px;--text-header-md--font-weight:500}'
const utility = '.text-header-md{font-size:var(--text-header-md);line-height:var(--tw-leading,var(--text-header-md--line-height));font-weight:var(--tw-font-weight,var(--text-header-md--font-weight))}'
const source = theme + reset + utility

function handler(options: Partial<IStyleHandlerOptions> = {}) {
  return createStyleHandler({ majorVersion: 4, appType: 'uni-app-vite', platform: 'mp-weixin', cssPreflight: false, ...options })
}

function values(css: string, property: string, selector?: string) {
  const result: string[] = []
  postcss.parse(css).walkDecls(property, (decl) => {
    if (!selector || (decl.parent?.type === 'rule' && decl.parent.selector === selector)) {
      result.push(decl.value)
    }
  })
  return result
}

describe('Skyline Tailwind v4 字体变量', () => {
  it.each([undefined, false])('默认或显式关闭时保持现有输出：%s', async (skyline) => {
    const result = await handler({ cssOptions: { skyline } })(source)
    expect(values(result.css, '--tw-leading')).toEqual(['initial'])
    expect(values(result.css, '--tw-font-weight')).toEqual(['initial'])
  })

  it.each([true, false])('主资产和局部资产保留消费端 fallback，仅替换 initial：isMainChunk=%s', async (isMainChunk) => {
    const { css } = await handler({ isMainChunk, cssOptions: { skyline: true } })(source)
    expect(values(css, '--tw-leading')).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(values(css, '--tw-font-weight')).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(values(css, 'line-height', '.text-header-md')).toEqual(['var(--tw-leading,var(--text-header-md--line-height))'])
    expect(values(css, 'font-weight', '.text-header-md')).toEqual(['var(--tw-font-weight,var(--text-header-md--font-weight))'])
  })

  it('保持有效 setter、作者空值、条件作用域、important 和其他变量', async () => {
    const author = '.leading{--tw-leading:44px;line-height:44px}.font{--tw-font-weight:700;font-weight:700}.empty{--tw-leading:;--tw-font-weight: }@media(min-width:1px){.reset{--tw-leading:initial!important;--tw-font-weight: INITIAL }}.other{--author:initial;--tw-tracking:initial;--tw-leading-extra:initial}'
    const { css } = await handler({ cssOptions: { skyline: true } })(source + author)
    expect(values(css, '--tw-leading', '.leading')).toEqual(['44px'])
    expect(values(css, '--tw-font-weight', '.font')).toEqual(['700'])
    expect(values(css, '--tw-leading', '.empty')).toEqual([''])
    expect(values(css, '--tw-font-weight', '.empty')).toEqual([' '])
    expect(values(css, '--author')).toEqual(['initial'])
    expect(values(css, '--tw-tracking', '.other')).toEqual(['initial'])
    expect(values(css, '--tw-leading-extra')).toEqual(['initial'])
    let important = false
    postcss.parse(css).walkRules('.reset', (rule) => {
      expect(rule.parent?.type).toBe('atrule')
      rule.walkDecls('--tw-leading', (decl) => { important = Boolean(decl.important) })
    })
    expect(important).toBe(true)
    expect(values(css, '--tw-leading', '.reset')).toEqual(['var(--weapp-tw-invalid-reset)'])
  })

  it('按 CSS 标识符身份处理转义属性和纯 initial，不把字符串当关键词', () => {
    const root = postcss.parse(String.raw`.x{--\74 w-leading:/*说明*/ i\6e itial;--tw-font-weight:"initial"}`)
    root.walkDecls((decl) => { normalizeSkylineTypographyReset(decl) })
    expect(root.first?.toString()).toContain('var(--weapp-tw-invalid-reset)')
    expect(values(root.toString(), '--tw-font-weight')).toEqual(['"initial"'])
  })

  it.each([false, true])('插件自有缺失默认值使用无环 reset，覆盖额外注入路径：%s', async (injectAdditionalCssVarScope) => {
    const { css } = await handler({ injectAdditionalCssVarScope, cssOptions: { skyline: true } })(theme + utility)
    expect(values(css, '--tw-leading')).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(values(css, '--tw-font-weight')).toEqual(['var(--weapp-tw-invalid-reset)'])
  })

  it('不把作者的全局空值替换为插件默认值', async () => {
    const { css } = await handler({ cssOptions: { skyline: true } })(theme + 'view,text{--tw-leading:;--tw-font-weight: }' + utility)
    expect(values(css, '--tw-leading')).toEqual([''])
    expect(values(css, '--tw-font-weight')).toEqual([' '])
  })

  it.each(['h5', 'web', 'app-plus'])('Web 平台显式开启也保持默认输出：%s', async (platform) => {
    const base = await handler({ platform })(source)
    const enabled = await handler({ platform, cssOptions: { skyline: true, cssRemoveProperty: false } })(source)
    expect(enabled.css).toBe(base.css)
  })

  it.each(['uvue', 'webview'] as const)('原生 App 分支不启用兼容：%s', async (uniAppXCssTarget) => {
    const options = { uniAppX: true, uniAppXCssTarget } as const
    const base = await handler(options)(source)
    const enabled = await handler({ ...options, cssOptions: { skyline: true } })(source)
    expect(enabled.css).toBe(base.css)
  })

  it('v3 不启用，v4 不允许同时保留 property 注册', async () => {
    const v3 = await handler({ majorVersion: undefined, cssOptions: { skyline: true, cssRemoveProperty: false } })(reset)
    expect(values(v3.css, '--tw-leading')).toEqual(['initial'])
    await expect(async () => handler({ cssOptions: { skyline: true, cssRemoveProperty: false } })(source)).rejects.toThrow('cssRemoveProperty: false')
    await expect(async () => handler({ cssRemoveProperty: false, cssOptions: { skyline: true } })(source)).rejects.toThrow('cssRemoveProperty: false')
  })

  it('同一处理器开关及输入变化不会复用错误的结果', async () => {
    const transform = handler()
    const options = { cssOptions: { skyline: true } }
    const enabled = await transform(source, options)
    options.cssOptions.skyline = false
    const disabled = await transform(source, options)
    options.cssOptions.skyline = true
    const restored = await transform(source, options)
    expect(values(enabled.css, '--tw-leading')).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(values(disabled.css, '--tw-leading')).toEqual(['initial'])
    expect(restored.css).toBe(enabled.css)
    expect((await transform(enabled.css, options)).css).toBe(enabled.css)
  })

  it.each(['property', 'PROPERTY', String.raw`p\72 operty`])('局部注册按 CSS 身份清理并补齐自有默认值：%s', async (name) => {
    const input = `@${name} --tw-leading{syntax:"*";inherits:false}` + theme + utility
    const { css } = await handler({ isMainChunk: false, cssOptions: { skyline: true } })(input)
    expect(css).not.toContain(`@${name}`)
    expect(values(css, '--tw-leading')).toEqual(['var(--weapp-tw-invalid-reset)'])
    const finalized = finalizeMiniProgramCss(input, { isTailwindcssV4: true, cssOptions: { skyline: true } })
    expect(finalized).not.toContain(`@${name}`)
    expect(values(finalized, '--tw-leading')).toEqual(['var(--weapp-tw-invalid-reset)'])
  })

  it('直接生成器按目标分流，Web 即使开启开关也不修改', async () => {
    const options = { cssOptions: { skyline: true } }
    const weapp = await transformTailwindV4GeneratedCss(source, 'weapp', options)
    expect(values(weapp, '--tw-leading')).toEqual(['var(--weapp-tw-invalid-reset)'])
    const web = await transformTailwindV4GeneratedCss(source, 'web', options)
    expect(web).toBe(source)
  })

  it('直接 finalizer 与 Root 入口共享兼容，同时保留作者空值', () => {
    const options = { isTailwindcssV4: true, cssOptions: { skyline: true } }
    const input = source + '.empty{--tw-leading:}'
    const css = finalizeMiniProgramCss(input, options)
    expect(values(css, '--tw-leading')).toEqual(['var(--weapp-tw-invalid-reset)', ''])
    const root = postcss.parse(input)
    finalizeMiniProgramCssRoot(root, options)
    expect(root.toString()).toBe(css)
    expect(finalizeMiniProgramCss(css, options)).toBe(css)
    const defaults = finalizeMiniProgramCss(theme + utility, options)
    expect(values(defaults, '--tw-leading')).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(values(defaults, '--tw-font-weight')).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(() => finalizeMiniProgramCss(input, { ...options, cssRemoveProperty: false })).toThrow('cssRemoveProperty: false')
  })
})
