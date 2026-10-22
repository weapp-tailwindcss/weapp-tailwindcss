import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { protectDynamicColorMixAlpha } from '../src/compat/color-mix'
import { lowerStaticColorMixSupports } from '../src/compat/color-mix/supports'

const query = '(color: color-mix(in lab, red, red))'
const mix = 'color-mix(in oklab,rgba(255,0,0,.4) var(--weight),transparent)'

describe('小程序静态 mix 能力分支降低', () => {
  it('保留外层条件、层、选择器、顺序、注释和 important', () => {
    const root = postcss.parse(`@media print{@layer utilities{.probe:hover{color:blue;@supports ${query}{/* keep */color:${mix}!important}color:green}}}`)
    expect(lowerStaticColorMixSupports(root, new Map([['--weight', '50%']]))).toBe(true)
    expect(root.toString()).toBe('@media print{@layer utilities{.probe:hover{color:blue;/* keep */color:rgba(255, 0, 0, 0.2)!important;color:green}}}')
  })

  it.each([
    `not ${query}`,
    `${query} and (display:grid)`,
    `${query} or (display:grid)`,
    `(${query})`,
    '(background-color: color-mix(in lab, red, red))',
    '(color: color-mix(in oklab, red, blue))',
  ])('不把其它条件当作编译器能力分支：%s', (condition) => {
    const css = `.probe{@supports ${condition}{color:${mix}}}`
    const root = postcss.parse(css)
    expect(lowerStaticColorMixSupports(root, new Map([['--weight', '50%']]))).toBe(false)
    expect(root.toString()).toBe(css)
  })

  it('多声明与条件编译注释按原位置保留，前后声明不能重排', () => {
    const root = postcss.parse(`.probe{color:blue;@supports ${query}{/* #ifdef MP-WEIXIN */color:${mix};color:${mix}!important;/* #endif */}color:green}`)
    expect(lowerStaticColorMixSupports(root, new Map([['--weight', '50%']]))).toBe(true)
    expect(root.toString()).toBe('.probe{color:blue;/* #ifdef MP-WEIXIN */color:rgba(255, 0, 0, 0.2);color:rgba(255, 0, 0, 0.2)!important;/* #endif */color:green}')
  })

  it.each([
    `color:${mix};display:block`,
    `color:${mix};--author:red`,
    String.raw`\2d \2d author:${mix}`,
    `color:${mix};background-color:color-mix(in oklab,red var(--missing),transparent)`,
    `.child{color:${mix}}`,
    `color:linear-gradient(${mix},red)`,
    '/* empty */',
  ])('整个分支不能证明时不做部分提升：%s', (contents) => {
    const css = `.probe{@supports ${query}{${contents}}}`
    const root = postcss.parse(css)
    expect(lowerStaticColorMixSupports(root, new Map([['--weight', '50%']]))).toBe(false)
    expect(root.toString()).toBe(css)
  })

  it.each(['keyframes spin', 'scope (.x)', 'container card (width > 1px)', 'unknown', 'supports (display:grid)'])('未知祖先 @%s 不能让无效子树变成有效声明', (ancestor) => {
    const css = `@${ancestor}{.probe{@supports ${query}{color:${mix}}}}`
    const root = postcss.parse(css)
    expect(lowerStaticColorMixSupports(root, new Map([['--weight', '50%']]))).toBe(false)
    expect(root.toString()).toBe(css)
  })

  it('无 block 的 supports 保持原样', () => {
    const css = `.probe{@supports ${query};color:red}`
    const root = postcss.parse(css)
    expect(lowerStaticColorMixSupports(root, new Map([['--weight', '50%']]))).toBe(false)
    expect(root.toString()).toBe(css)
  })

  it.each([
    '.dark{--weight:25%}',
    '@media print{:root{--weight:25%}}',
    '@property --weight{syntax:"<percentage>";inherits:false;initial-value:25%}',
  ])('必须在任何提升前分析完整权重资格：%s', (override) => {
    const css = `:root{--weight:50%}${override}.probe{@supports ${query}{color:${mix}}}`
    expect(protectDynamicColorMixAlpha(css, { lowerStaticSupports: true }).css).toBe(css)
  })

  it('普通保护入口保留浏览器原有 feature query', () => {
    const css = `:root{--weight:50%}.probe{@supports ${query}{color:${mix}}}`
    expect(protectDynamicColorMixAlpha(css).css).toContain(`@supports ${query}`)
    expect(protectDynamicColorMixAlpha(css, { lowerStaticSupports: true }).css).not.toContain('@supports')
  })
})
