import valueParser from 'postcss-value-parser'
import { describe, expect, it } from 'vitest'
import { normalizeModernColorValue, protectDynamicColorMixAlpha } from '../src/compat/color-mix'
import { resolveColorData } from '../src/compat/color-mix/parse'
import { tryResolveColorMix } from '../src/compat/color-mix/resolve'
import { finalizeMiniProgramCss, pruneMiniProgramGeneratedCss } from '../src/compat/mini-program-css'
import { transformTailwindV4CssToWeapp } from '../src/compat/tailwindcss-v4/generated-output'
import { transformGeneratorUserCss } from '../src/compat/tailwindcss-v4/user-css/transform'
import { getDefaultOptions } from '../src/defaults'
import { createStyleHandler } from '../src/handler'

function resolve(source: string) {
  const node = valueParser(source).nodes[0]
  return node?.type === 'function' ? tryResolveColorMix(node, new Map()) : undefined
}

describe('color-mix 透明度与未知值的语义边界', () => {
  it.each([
    ['rgba(255, 0, 0, .5)', '50%', 0.25],
    ['rgba(255, 0, 0, .2)', '25%', 0.05],
    ['transparent', '75%', 0],
    ['red', '0%', 0],
    ['red', '100%', 1],
  ])('原颜色 %s 的 alpha 与权重 %s 相乘', (color, weight, alpha) => {
    const resolved = resolve(`color-mix(in oklab, ${color} ${weight}, transparent)`)
    expect(resolved).toBeDefined()
    expect(resolveColorData(resolved!.value, new Map())?.alpha).toBeCloseTo(alpha as number, 6)
  })

  it.each([
    'color-mix(in oklab, currentColor 50%, transparent)',
    'color-mix(in oklab, var(--missing) 50%, transparent)',
    'color-mix(in oklab, var(--missing, red) 50%, transparent)',
    'color-mix(in oklab, rgba(255,0,0,.5) var(--alpha), transparent)',
    'color-mix(in oklab, red var(--alpha), transparent)',
    'color-mix(in invalid, red 50%, transparent)',
    'color-mix(in oklab, red 50%, transparent, blue)',
    'color-mix(in oklab, red 50% extra, transparent)',
    'color-mix(in oklab, red 50px, transparent)',
    'color-mix(in oklab, red 50%junk, transparent)',
    'color-mix(in oklab, red .5, transparent)',
    'color-mix(in oklab, red -10%, transparent)',
    'color-mix(in oklab, red 110%, transparent)',
    'color-mix(in oklch longer hue, red 50%, transparent)',
  ])('不能证明等价时保留完整表达式 %s', (source) => {
    expect(resolve(source)).toBeUndefined()
    expect(normalizeModernColorValue(source).value).toBe(source)
    const css = `@supports (color: color-mix(in oklab, red, blue)){.probe{color:${source}}}`
    const protectedCss = protectDynamicColorMixAlpha(css)
    expect(protectedCss.restore(protectedCss.css)).toBe(css)
  })

  it('保护阶段不把局部、条件或注册变量当成全局静态颜色', async () => {
    const mix = 'color-mix(in oklab, var(--brand) 50%, transparent)'
    for (const declaration of [
      '.theme-dark{--brand:blue}',
      '@media (min-width:1px){:root{--brand:blue}}',
      '@property --brand{syntax:"<color>";inherits:false;initial-value:blue}',
    ]) {
      const css = `:root{--brand:red}${declaration}.probe{color:${mix}}`
      const protectedCss = protectDynamicColorMixAlpha(css, { customPropertyValues: new Map([['--brand', 'green']]) })
      expect(protectedCss.restore(protectedCss.css)).toBe(css)
      const result = await createStyleHandler({ majorVersion: 4 })(css)
      expect(result.css).toContain(mix)
    }
  })

  it.each([
    ['0%', 'rgba(255, 0, 0, 0)'],
    ['25%', 'rgba(255, 0, 0, 0.1)'],
    ['50%', 'rgba(255, 0, 0, 0.2)'],
    ['100%', 'rgba(255, 0, 0, 0.4)'],
    ['12.5%', 'rgba(255, 0, 0, 0.05)'],
  ])('完整静态权重别名链 %s 可安全替换并乘以原色 alpha', async (weight, expected) => {
    const css = `:root{--weight:${weight};--alias:var(--weight)}.probe{color:color-mix(in oklab,rgba(255,0,0,.4) var(--alias),transparent);display:block}`
    expect(protectDynamicColorMixAlpha(css).css).toContain(`color:${expected}`)
    for (const output of [finalizeMiniProgramCss(css), pruneMiniProgramGeneratedCss(css), await transformTailwindV4CssToWeapp(css)]) {
      expect(output).toContain(`color:${expected}`)
      expect(output).not.toContain('color-mix(')
    }
  })

  it.each([
    '.dark{--weight:75%}',
    '@media (min-width:1px){:root{--weight:75%}}',
    '@supports (color:blue){:root{--weight:75%}}',
    '@property --weight{syntax:"<percentage>";inherits:false;initial-value:75%}',
    ':root{--weight:75%}',
    ':root{--weight:50%!important}',
    ':root{--alias:var(--missing)}',
    ':root{--alias:var(--cycle);--cycle:var(--alias)}',
  ])('权重依赖图存在不安全覆盖时不能固化透明度：%s', async (override) => {
    const mix = 'color-mix(in oklab,rgba(255,0,0,.4) var(--alias),transparent)'
    const css = `:root{--weight:50%;--alias:var(--weight)}${override}.probe{color:${mix};display:block}`
    expect(protectDynamicColorMixAlpha(css).css).toContain(`color:${mix}`)
    for (const output of [finalizeMiniProgramCss(css), pruneMiniProgramGeneratedCss(css), await transformTailwindV4CssToWeapp(css)]) {
      expect(output).toContain('display:block')
      expect(output).not.toContain('color:')
    }
  })

  it.each(['-1%', '100.1%', '.5', '50px', 'initial', 'var(--missing)', 'var(--missing,50%)'])('非法或未证明稳定的权重 %s 不能变为有效 rgba', (weight) => {
    const mix = 'color-mix(in oklab,red var(--weight),transparent)'
    const css = `:root{--weight:${weight}}.probe{color:${mix};display:block}`
    expect(protectDynamicColorMixAlpha(css).css).toContain(`color:${mix}`)
    expect(finalizeMiniProgramCss(css)).not.toContain('color:')
  })

  it('主权重存在也不能删除未知 fallback 的失效依赖', () => {
    const mix = 'color-mix(in oklab,red var(--weight,var(--missing)),transparent)'
    const css = `:root{--weight:50%}.probe{color:${mix};display:block}`
    expect(protectDynamicColorMixAlpha(css).css).toContain(`color:${mix}`)
  })

  it.each([
    ['局部主题', '.dark{--brand:blue}'],
    ['媒体覆盖', '@media (min-width:1px){:root{--brand:blue}}'],
    ['supports 覆盖', '@supports (color:blue){:root{--brand:blue}}'],
    ['注册变量', '@property --brand{syntax:"<color>";inherits:false;initial-value:blue}'],
  ])('小程序终端清理拒绝无法等价降级的%s，不在删除证据后固化颜色', async (_, override) => {
    const css = `:root{--brand:red}${override}.probe{color:color-mix(in oklab,var(--brand) 50%,transparent);display:block}`
    const outputs = [finalizeMiniProgramCss(css), pruneMiniProgramGeneratedCss(css), await transformTailwindV4CssToWeapp(css)]
    for (const output of outputs) {
      expect(output).toContain('.probe')
      expect(output).toContain('display:block')
      expect(output).not.toContain('color:')
      expect(output).not.toContain('color-mix(')
    }
  })

  it.each([false, true])('用户样式在首次删除注册证据前拒绝动态 mix，processed=%s', async (processed) => {
    const css = ':root{--brand:red}@property --brand{syntax:"<color>";inherits:false;initial-value:blue}.probe{color:color-mix(in oklab,var(--brand) 50%,transparent);display:block}'
    const result = await transformGeneratorUserCss(css, {
      processed,
      generatorTarget: 'weapp',
      generatorStyleOptions: { majorVersion: 4 },
      cssUserHandlerOptions: getDefaultOptions(),
      styleHandler: createStyleHandler({ majorVersion: 4 }),
      importFallback: false,
    })
    expect(result).toContain('display:block')
    expect(result).not.toContain('color:')
  })

  it.each([false, true])('作者函数先由编译器展开，之后才判断 mix 可否降级，processed=%s', async (processed) => {
    const expression = 'theme(colors.red.500)'
    let compilerInput = ''
    const result = await transformGeneratorUserCss(`.probe{color:color-mix(in oklab,${expression} 50%,transparent);display:block}`, {
      processed,
      generatorTarget: 'weapp',
      generatorStyleOptions: { majorVersion: 4 },
      cssUserHandlerOptions: getDefaultOptions(),
      styleHandler: createStyleHandler({ majorVersion: 4 }),
      importFallback: false,
      async compileAuthorCssFunctions(css) {
        compilerInput = css
        return css.replaceAll(expression, 'red')
      },
    })
    expect(compilerInput).toContain(expression)
    expect(result).toContain('rgba(255, 0, 0, 0.5)')
  })

  it.each([
    ['--color-base:oklch(62.3% .214 259.815);--color-alias:var(--color-base)', 'rgb(50, 128, 255)'],
    ['--color-alias:color-mix(in oklch longer hue,red 50%,transparent)', 'var(--color-alias)'],
  ])('渐变快照不重新注入被清理的现代颜色：%s', (theme, expected) => {
    const css = `:root,:host{${theme}}.bg-linear-to-r{--tw-gradient-position:to right;background-image:linear-gradient(var(--tw-gradient-stops))}.from-alias{--tw-gradient-from:var(--color-alias)}.to-black{--tw-gradient-to:black}`
    const result = finalizeMiniProgramCss(css, { isTailwindcssV4: true, tailwindcssV4GradientFallback: true })
    expect(result).toContain(`linear-gradient(to right, ${expected}, black)`)
    expect(result).not.toMatch(/oklch\(|color-mix\(/)
  })

  it('Tailwind source 包装不是真实媒体条件，静态颜色仍可安全降级', async () => {
    const css = '@media source(none){:root{--brand:red}}.probe{color:color-mix(in oklab,var(--brand) 50%,transparent)}'
    for (const output of [finalizeMiniProgramCss(css), pruneMiniProgramGeneratedCss(css), await transformTailwindV4CssToWeapp(css)]) {
      expect(output).toContain('rgba(255, 0, 0, 0.5)')
      expect(output).not.toContain('source(none)')
    }
  })

  it.each([
    '.dark{--color-probe:blue}',
    '@media (min-width:1px){:root{--color-probe:blue}}',
    '@supports (color:blue){:root{--color-probe:blue}}',
    '@property --color-probe{syntax:"<color>";inherits:false;initial-value:blue}',
  ])('渐变字面量兜底不能固化动态主题：%s', (override) => {
    const css = `:root,:host{--color-probe:red}${override}.bg-linear-to-r{--tw-gradient-position:to right;background-image:linear-gradient(var(--tw-gradient-stops))}.from-probe{--tw-gradient-from:var(--color-probe)}.to-black{--tw-gradient-to:black}`
    const result = finalizeMiniProgramCss(css, { isTailwindcssV4: true, tailwindcssV4GradientFallback: true })
    expect(result).toContain('linear-gradient(to right, var(--color-probe), black)')
    expect(result).not.toMatch(/linear-gradient\(to right, (red|blue), black\)/)
  })
})
