import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { normalizeModernColorValue, protectDynamicColorMixAlpha } from '../src/compat/color-mix'
import { finalizeMiniProgramCss, finalizeMiniProgramCssRoot, pruneMiniProgramGeneratedCss } from '../src/compat/mini-program-css'
import { transformTailwindV4CssToWeapp } from '../src/compat/tailwindcss-v4/generated-output'
import { transformGeneratorUserCss } from '../src/compat/tailwindcss-v4/user-css/transform'
import { getDefaultOptions } from '../src/defaults'
import { createStyleHandler } from '../src/handler'

const cssOptions = { colorMixDynamicAlpha: 'rgba' as const }
const mix = (weight = 'var(--opacity)', color = '#123456') => `color-mix(in srgb, ${color} ${weight}, transparent)`
const css = (weight?: string, color?: string) => `.probe{color:${mix(weight, color)};display:block}`
const expected = (weight = 'var(--opacity)') => `rgba(18, 52, 86, ${weight})`

async function outputs(source: string, options = cssOptions as { colorMixDynamicAlpha?: 'strict' | 'rgba' }) {
  const root = postcss.parse(source)
  finalizeMiniProgramCssRoot(root, { cssOptions: options })
  return [
    root.toString(),
    finalizeMiniProgramCss(source, { cssOptions: options }),
    pruneMiniProgramGeneratedCss(source, { cssOptions: options }),
    await transformTailwindV4CssToWeapp(source, { cssOptions: options }),
    (await createStyleHandler({ majorVersion: 4, cssOptions: options })(source)).css,
  ]
}

describe('小程序动态 alpha 默认使用 rgba 兼容模式', () => {
  it.each(['var(--opacity)', 'var(--opacity, 50%)', 'var(--opacity, var(--fallback, 25%))', 'var(--opacity, .5)', 'var(--opacity,)', 'var(--opacity, calc(50% / 2))', 'var(--opacity, fn(!))'])('各入口保留完整权重 %s', async (weight) => {
    for (const output of await outputs(css(weight))) {
      expect(output).toContain(expected(weight))
      expect(output).not.toContain('color-mix(')
    }
  })

  it('单声明没有不透明兜底也保留，重复清理幂等', async () => {
    for (const output of await outputs(`.probe{color:${mix()}}`)) {
      expect(output).toContain(expected())
      expect(finalizeMiniProgramCss(output, { cssOptions })).toContain(expected())
    }
  })

  it('显式 strict finalizer 保持原能力分支边界', () => {
    const source = '.probe{@supports (color: color-mix(in lab,red,red)){color:color-mix(in srgb,#123456 50%,transparent)}}'
    expect(finalizeMiniProgramCss(source, { cssOptions: { colorMixDynamicAlpha: 'strict' } })).not.toContain('color:')
  })

  it('各小程序入口默认兼容，显式 strict 与通用颜色解析保留严格语义', async () => {
    for (const output of await outputs(css(), {})) {
      expect(output).toContain(expected())
    }
    expect(finalizeMiniProgramCss(css())).toContain(expected())
    expect((await createStyleHandler({ majorVersion: 4 })(css())).css).toContain(expected())
    expect(finalizeMiniProgramCss(css(), { cssOptions: { colorMixDynamicAlpha: 'strict' } })).not.toContain('color:')
    expect(normalizeModernColorValue(mix()).value).toBe(mix())
  })

  it.each([{ platform: 'h5' }, { uniAppX: true, uniAppXCssTarget: 'uvue' as const }])('生成与作者 CSS 预处理尊重实际目标 %j', async (target) => {
    for (const mode of [undefined, 'rgba'] as const) {
      const options = { majorVersion: 4, ...target, cssOptions: { colorMixDynamicAlpha: mode } }
      expect(await transformTailwindV4CssToWeapp(css(), options)).not.toContain(expected())
      for (const processed of [false, true]) {
        const result = await transformGeneratorUserCss(css(), {
          processed,
          generatorTarget: 'weapp',
          generatorStyleOptions: options,
          cssUserHandlerOptions: { ...getDefaultOptions(), ...options },
          styleHandler: createStyleHandler(options),
          importFallback: false,
        })
        expect(result).not.toContain(expected())
      }
    }
  })

  it('静态百分比仍走原路径，乘以底色自身透明度', async () => {
    for (const output of await outputs(css('50%', 'rgba(18,52,86,.4)'))) {
      expect(output).toContain('rgba(18, 52, 86, 0.2)')
    }
    for (const output of await outputs(`:root{--opacity:50%}${css()}`)) {
      expect(output).toContain('rgba(18, 52, 86, 0.5)')
    }
  })

  it('稳定根变量可证明不透明底色', async () => {
    for (const output of await outputs(`:root{--brand:#123456}${css(undefined, 'var(--brand)')}`)) {
      expect(output).toContain(expected())
    }
  })

  it.each(['currentColor', 'var(--missing)', 'var(--missing, #123456)', 'rgba(18,52,86,.5)', 'transparent'])('拒绝未知或半透明底色 %s', async (color) => {
    for (const output of (await outputs(css(undefined, color))).slice(0, 4)) {
      expect(output).not.toContain('color:')
    }
  })

  it.each([
    '.theme{--brand:red}',
    '@media print{:root{--brand:red}}',
    '@supports (display:grid){:root{--brand:red}}',
    '@property --brand{syntax:"<color>";inherits:false;initial-value:red}',
  ])('分析动态底色证据后再清理 %s', async (override) => {
    for (const output of (await outputs(`:root{--brand:#123456}${override}${css(undefined, 'var(--brand)')}`)).slice(0, 4)) {
      expect(output).not.toContain('color:')
    }
  })

  it.each(['.5', '50px', '-1%', '101%'])('已知非法静态权重不能退回动态模式 %s', (weight) => {
    for (const alpha of ['var(--opacity)', 'var(--opacity,var(--missing))']) {
      expect(finalizeMiniProgramCss(`:root{--opacity:${weight}}${css(alpha)}`, { cssOptions })).not.toContain('color:')
    }
  })

  it.each([
    'var(opacity)',
    'var(--)',
    'var(--opacity extra)',
    'var(--opacity) extra',
    'var(--opacity, oklch(50% .1 30))',
    String.raw`var(--opacity, okl\63 h(50% .1 30))`,
    String.raw`var(--opacity, color(d\69 splay-p3 1 0 0))`,
    String.raw`var(--opacity, r\67 b(0 0 0 / .5))`,
    String.raw`var(--opacity, h\73 l(20 50% 50%))`,
    String.raw`var(--opacity, hw\62 (20 10% 10%))`,
    'var(--opacity, var(--fallback extra))',
  ])('不支持的 alpha 不得绕过终端清理 %s', (weight) => {
    expect(finalizeMiniProgramCss(css(weight), { cssOptions })).not.toContain('color:')
  })

  it.each([
    'color-mix(in srgb,#123456 var(--opacity),transparent',
    'color-mix(in srgb,#123456 var(--opacity, var(--fallback),transparent)',
    'color-mix(in invalid,#123456 var(--opacity),transparent)',
    'color-mix(in srgb,#123456 var(--opacity),transparent,red)',
    'color-mix(in srgb,#123456 var(--opacity),transparent 50%)',
  ])('不修补非法 mix：%s', (source) => {
    expect(normalizeModernColorValue(source, new Map(), cssOptions).value).toBe(source)
  })

  it('仅降低 Tailwind 单一颜色能力分支，并保持媒体、顺序和 important', () => {
    const source = `@media print{.probe{color:blue;@supports (color: color-mix(in lab, red, red)){color:${mix()}!important}color:green}}`
    expect(protectDynamicColorMixAlpha(source, { ...cssOptions, lowerStaticSupports: true }).css)
      .toBe(`@media print{.probe{color:blue;color:${expected()}!important;color:green}}`)
    for (const query of ['not (color: color-mix(in lab, red, red))', '(color: color-mix(in lab, red, red)) and (display:grid)']) {
      expect(protectDynamicColorMixAlpha(`.probe{@supports ${query}{color:${mix()}}}`, { ...cssOptions, lowerStaticSupports: true }).css).toContain(`@supports ${query}`)
    }
  })

  it.each([false, true])('用户 CSS 预处理传递配置 processed=%s', async (processed) => {
    const result = await transformGeneratorUserCss(css('var(--opacity, 50%)'), {
      processed,
      generatorTarget: 'weapp',
      generatorStyleOptions: { majorVersion: 4, cssOptions },
      cssUserHandlerOptions: { ...getDefaultOptions(), cssOptions },
      styleHandler: createStyleHandler({ majorVersion: 4 }),
      importFallback: false,
    })
    expect(result).toContain(expected('var(--opacity, 50%)'))
  })

  it.each([false, true])('无关作者配置不能覆盖生成请求的 strict，processed=%s', async (processed) => {
    for (const userCssOptions of [undefined, {}, { rem2rpx: false }]) {
      const result = await transformGeneratorUserCss(css(), {
        processed,
        generatorTarget: 'weapp',
        generatorStyleOptions: { majorVersion: 4, cssOptions: { colorMixDynamicAlpha: 'strict' } },
        cssUserHandlerOptions: { ...getDefaultOptions(), cssOptions: userCssOptions },
        styleHandler: createStyleHandler({ majorVersion: 4 }),
        importFallback: false,
      })
      expect(result).not.toContain(expected())
    }
  })

  it('单位和选择器配置不改变颜色策略，保留条件与 important', async () => {
    const handler = createStyleHandler({ majorVersion: 4, cssOptions: { ...cssOptions, rem2rpx: true, cssSelectorReplacement: { root: 'page' } } })
    const source = `@media print{.probe{width:1rem;color:${mix()}!important}}`
    const output = (await handler(source)).css
    expect(output).toContain('@media print')
    expect(output).toContain(`color:${expected()}!important`)
    expect(output).not.toContain('1rem')
  })

  it('同实例模式往返与原位配置修改隔离缓存', async () => {
    const handler = createStyleHandler({ majorVersion: 4 })
    const options = { cssOptions: { colorMixDynamicAlpha: 'strict' as 'strict' | 'rgba' } }
    for (const mode of ['strict', 'rgba', 'strict', 'rgba'] as const) {
      options.cssOptions.colorMixDynamicAlpha = mode
      const output = (await handler(css(), options)).css
      expect(output.includes(expected())).toBe(mode === 'rgba')
    }
  })
})
