import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { createStyleHandler, normalizeMiniProgramGeneratedCssForPostcss } from '../src'

const rawClass = '.group-\\[\\:nth-of-type\\(3\\)_\\&\\]\\:block'
const rawCss = `${rawClass}:is(:nth-of-type(3) :where(.group) *){display:block}`

describe('generated selectors before framework PostCSS', () => {
  it('prepares universal selectors before a framework can discard their entire utility rule', async () => {
    const css = await normalizeMiniProgramGeneratedCssForPostcss(rawCss, { preserveRawClassRules: true })
    const frameworkCss = await postcss([{
      postcssPlugin: 'framework-universal-filter',
      Rule(rule) {
        // Taro postcss-html-transform 在小程序目标中使用相同的通配符过滤条件。
        if (/(?:^| )\*(?![=/*])/.test(rule.selector)) {
          rule.remove()
        }
      },
    }]).process(css, { from: undefined })

    expect(frameworkCss.css).toContain(rawClass)
    expect(frameworkCss.css).toContain('display:block')
    expect(css).toContain(':is(view,text)')
    const finalCss = await createStyleHandler()(frameworkCss.css)
    expect(finalCss.css).toContain('.group-_b_cnth-of-type_p3_P__n_B_cblock')
    expect(finalCss.css).toContain('display:block')
  })

  it.each([
    { options: { cssSelectorReplacement: { universal: 'custom-view' } }, expected: 'custom-view' },
    { options: { cssSelectorReplacement: { universal: 'view,text' } }, expected: ':is(view,text)' },
    { options: { cssOptions: { cssSelectorReplacement: { universal: ['view', 'custom-text'] } } }, expected: ':is(view,custom-text)' },
    { options: { cssSelectorReplacement: { universal: false as const } }, expected: '*' },
    { options: { cssSelectorReplacement: { universal: 'legacy' }, cssOptions: { cssSelectorReplacement: { universal: false as const } } }, expected: '*' },
  ])('honors configured universal replacement: $expected', async ({ options, expected }) => {
    const css = await normalizeMiniProgramGeneratedCssForPostcss(rawCss, { ...options, preserveRawClassRules: true })
    expect(css).toContain(rawClass)
    expect(css).toContain(`:where(.group) ${expected})`)
  })

  it('preserves stars in class identities, attributes and declarations', async () => {
    const css = await normalizeMiniProgramGeneratedCssForPostcss('.content-\\[\\*\\][data-value="*"]{content:"*"}', { preserveRawClassRules: true })
    expect(css).toBe('.content-\\[\\*\\][data-value="*"]{content:"*"}')
  })

  it.each([true, false])('retains the existing classless preflight policy with preservePreflight=%s', async (preservePreflight) => {
    const input = '*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid}'
    const css = await normalizeMiniProgramGeneratedCssForPostcss(input, { preservePreflight, preserveRawClassRules: true })
    const unchanged = await normalizeMiniProgramGeneratedCssForPostcss(input, { preservePreflight, preserveRawClassRules: true, cssSelectorReplacement: { universal: false } })
    expect(css).toBe(unchanged)
    expect(css.includes('box-sizing:border-box')).toBe(preservePreflight)
  })
})
