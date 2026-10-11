import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it } from 'vitest'
import { composeFrameworkProcessedCss } from '@/generation/framework-css-composition'

describe('framework CSS rule composition', () => {
  it('preserves generated output verbatim when framework inputs are empty', () => {
    const generated = '@charset "UTF-8";\n.vendor { color: red }\n.vendor { color: blue }'
    expect(composeFrameworkProcessedCss(' \n', generated, '\t')).toBe(generated)
  })

  it('normalizes charset while preserving framework overrides when generated CSS is empty', () => {
    const before = '@charset "UTF-8";.vendor{color:red}'
    const after = '@charset "UTF-8";.vendor{color:blue}.vendor{color:red}'
    const css = composeFrameworkProcessedCss(before, '', after)
    expect(css.match(/@charset/g)).toHaveLength(1)
    expect(css.startsWith('@charset "UTF-8";')).toBe(true)
    const values: string[] = []
    postcss.parse(css).walkDecls('color', (decl) => {
      values.push(decl.value)
    })
    expect(values).toEqual(['red', 'blue', 'red'])
  })

  it('keeps existing layer positions when the generated output contains the full override sequence', () => {
    const generated = '.base{color:red}.utility{color:green}.base{color:blue}'
    const source = '.base { color:red }.base { color:blue }'
    expect(composeFrameworkProcessedCss('', generated, source).trim()).toBe(generated)
  })

  it('coalesces adjacent identical generated rules without removing later overrides', () => {
    const generated = '.component{color:red}.component{color:red}.component{color:blue}.component{color:red}'
    const css = composeFrameworkProcessedCss('', generated, '.component{color:red}')
    const values: string[] = []
    postcss.parse(css).walkDecls('color', (decl) => {
      values.push(decl.value)
    })
    expect(values).toEqual(['red', 'blue', 'red'])
  })

  it('keeps user overrides across other selectors and repeated declarations', () => {
    const source = '.a{color:red}.b{color:blue}.a{color:red}.a{color:green}.a{color:red}'
    const css = composeFrameworkProcessedCss('', '.a { color: red }.b{color:blue}.utility{display:flex}', source)
    expect(postcss.parse(css).nodes.filter(node => node.type === 'rule').map(node => node.selector))
      .toEqual(['.a', '.b', '.utility', '.a', '.a', '.a'])
    const values: string[] = []
    postcss.parse(css).walkDecls('color', (decl) => {
      values.push(decl.value)
    })
    expect(values).toEqual(['red', 'blue', 'red', 'green', 'red'])
  })

  it('preserves overrides shared by a selector list and a single selector', () => {
    const css = composeFrameworkProcessedCss('', '.a,.b{color:red}.a{color:blue}', '.a{color:blue}.a,.b{color:red}')
    const declarations: string[] = []
    postcss.parse(css).walkRules((rule) => {
      if (rule.selectors.includes('.a')) {
        rule.walkDecls('color', (decl) => {
          declarations.push(decl.value)
        })
      }
    })
    expect(declarations).toEqual(['blue', 'red'])
  })

  it('matches full declarations and conditional context without crossing layers', () => {
    const source = '@media (min-width:1px){.vendor{color:red!important}}'
    const generated = '.vendor{color:red!important}@media (min-width:2px){.vendor{color:red!important}}'
      + '@media (min-width:1px){.vendor{color:red}.vendor{color:red!important}}'
      + '@layer theme{.vendor{color:red!important}}'
    const css = composeFrameworkProcessedCss('', generated, source)
    const root = postcss.parse(css)
    const rules: string[] = []
    root.walkRules('.vendor', (rule) => {
      rules.push(rule.toString())
    })
    expect(rules).toHaveLength(5)
    expect(css).toContain('@layer theme')
    expect(css).toContain('@media (min-width:2px)')
    expect(css).toContain('.vendor{color:red}')
    expect(css.match(/@media \(min-width:1px\)/g)).toHaveLength(1)
  })

  it('preserves anonymous layer identity and the first named layer declaration', () => {
    const before = '@layer first{.a{color:red}}@layer second{.b{color:blue}}'
    const generated = '@layer second{.b{color:blue}}@layer first{.a{color:red}}'
    const css = composeFrameworkProcessedCss(before, generated, '')
    expect(css.indexOf('@layer first')).toBeLessThan(css.indexOf('@layer second'))
    const anonymous = '@layer{.a{color:red}}'
    expect(composeFrameworkProcessedCss(anonymous, anonymous, anonymous).match(/@layer/g)).toHaveLength(3)
  })

  it('preserves font and animation definitions with distinct declarations and conditions', () => {
    const font = '@font-face{font-family:vendor;src:url(a.woff2)}'
    const animation = '@keyframes fade{from{opacity:0}to{opacity:1}}'
    const source = `${font}@font-face{font-family:vendor;src:url(b.woff2)}${animation}`
    const css = composeFrameworkProcessedCss('', `${font}${animation}@media print{${animation}}`, source)
    expect(css.match(/@font-face/g)).toHaveLength(2)
    expect(css.match(/@keyframes/g)).toHaveLength(2)
    expect(css).toContain('@media print')
    expect(css.indexOf('url(a.woff2)')).toBeLessThan(css.indexOf('url(b.woff2)'))
  })

  it('does not conflate spaces in strings, descendant selectors or declaration order', () => {
    const generated = '.label{content:"a b"}.a .b{color:red}.fallback{display:block;display:flex}'
    const source = '.label{content:"ab"}.a.b{color:red}.fallback{display:flex;display:block}'
    const css = composeFrameworkProcessedCss('', generated, source)
    expect(css).toContain(generated)
    expect(css).toContain(source)
  })

  it('preserves vendor rules and charset above the former size cutoff', () => {
    const generated = Array.from({ length: 8_000 }, (_, index) => `.utility-${index}{color:rgb(1,2,3);height:1px}`).join('')
    const source = '@charset "UTF-8";:root{--brand-color:purple}.vendor{width:16rpx}.vendor{width:32rpx}.vendor{width:16rpx}'
    expect(generated.length).toBeGreaterThan(250_000)
    const css = composeFrameworkProcessedCss('@charset "UTF-8";.before{display:block}', generated, source)
    expect(css).toMatch(/^@charset "UTF-8";/)
    expect(css.match(/@charset/g)).toHaveLength(1)
    expect(css).toContain(source.slice(source.indexOf(':root')))
    expect(css.indexOf('.before')).toBeLessThan(css.indexOf('.utility-0'))
    expect(css.indexOf('.utility-7999')).toBeLessThan(css.indexOf('.vendor'))
  })

  it('preserves incomplete source instead of dropping it on parse failure', () => {
    expect(composeFrameworkProcessedCss('', '.generated{display:flex}', '.user{color:red'))
      .toContain('.user{color:red')
  })
})
