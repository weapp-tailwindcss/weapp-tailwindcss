import type { ReviewedConversionOracle } from './tailwind-capabilities/conversion-audit'
import { describe, expect, it } from 'vitest'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import { transformLynxCssCompat } from '../packages/postcss/src/compat/lynx-css'
import { transformWebCssCompat } from '../packages/postcss/src/compat/web-css'
import { encodeLynxCss } from './lynx/batch-encode'
import { exampleDir } from './lynx/catalog'
import { conversionCaseResult } from './tailwind-capabilities/conversion-audit'
import { lynxLiteralOracles, reviewedLynxOracles } from './tailwind-capabilities/conversion-oracles/lynx'
import { cssDeclarations } from './tailwind-capabilities/css'
import { lynxLiteralObservation } from './tailwind-capabilities/lynx/decoder-literal'
import { lynxRejectedDisplayValues } from './tailwind-capabilities/lynx/display-contract'

async function encodeCss(css: string, mode?: 'wasm') {
  return encodeLynxCss(css, { mode, applyCompatibility: false })
}

async function generateCss(candidates: string) {
  const source = await resolveTailwindV4Source({
    base: exampleDir,
    css: [
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" layer(utilities) source(none);',
      `@source inline("${candidates}");`,
    ].join('\n'),
  })
  const generator = createWeappTailwindcssGenerator(source)
  const generated = await generator.generate({ target: 'web' })
  return transformLynxCssCompat(transformWebCssCompat(generated.css, true))
}

describe('Lynx native CSS defaults', () => {
  it('真实生产 encoder 与 WASM decoder 逐项核对冻结的正向字面合同', async () => {
    const candidates = lynxLiteralOracles.map(item => item.candidate)
    const css = await generateCss(candidates.join(' '))
    const oracles = reviewedLynxOracles(candidates, css)
    expect(oracles).toHaveLength(candidates.length)
    const encoded = await encodeCss(css, 'wasm')
    expect(encoded.encodedByteLength).toBeGreaterThan(0)
    const results = oracles.map(oracle => conversionCaseResult({ id: oracle.candidate, candidate: oracle.candidate, features: [] }, 'lynx', lynxLiteralObservation(oracle.candidate, encoded), [], oracle))
    expect(results.filter(result => result.status !== 'passed')).toEqual([])
    expect(results.filter(result => result.status === 'passed')).toHaveLength(41)
  })

  it('官方不支持的 inline-flex 虽无诊断仍不能证明 Web 语义保留', async () => {
    // https://lynxjs.org/api/css/properties/display.html 明确排除 inline-flex，禁止映射为 flex 冒充兼容。
    const css = '.inline-flex{display:inline-flex}'
    const preservationOracle: ReviewedConversionOracle = {
      id: 'counterexample/web-display-preservation/inline-flex',
      target: 'lynx',
      candidate: 'inline-flex',
      support: 'supported',
      expected: { statements: [{ selector: '.inline-flex', conditions: [], property: 'display', value: 'inline-flex', important: false }], diagnostics: [] },
    }
    const encoded = await encodeCss(css, 'wasm')
    expect(encoded.diagnostics).toEqual([])
    expect(lynxLiteralObservation('inline-flex', encoded)).toMatchObject({ snapshot: { statements: [], diagnostics: [] } })
    expect(conversionCaseResult({ id: 'inline-flex', candidate: 'inline-flex', features: [] }, 'lynx', lynxLiteralObservation('inline-flex', encoded), [], preservationOracle)).toMatchObject({ status: 'failed', support: 'supported' })
    expect(reviewedLynxOracles(['inline-flex'], css)[0]?.support).toBe('unsupported')
  })

  it.each(lynxRejectedDisplayValues)('真实 WASM 对官方限制 %s 完成拒绝，错写 flex 则不满足负向合同', async (value) => {
    const css = `.${value}{display:${value}}`
    const fixed = reviewedLynxOracles([value], css)[0]!
    const encoded = await encodeCss(css, 'wasm')
    const item = { id: value, candidate: value, features: [] }
    expect(conversionCaseResult(item, 'lynx', lynxLiteralObservation(value, encoded), [], fixed)).toMatchObject({ status: 'passed', support: 'unsupported' })
    expect(conversionCaseResult(item, 'lynx', lynxLiteralObservation(value, { ...encoded, css: `.${value}{display:flex}` }), [], fixed).status).toBe('failed')
  })

  it('真实 decoder 产物篡改或 serializer 输入保留均不能掩盖输出丢失', async () => {
    const css = '.size-full{width:100%;height:100%}.other:is(.probe){width:32px}'
    const oracle = reviewedLynxOracles(['size-full'], css)[0]!
    const encoded = await encodeCss(css, 'wasm')
    expect(encoded.diagnostics.length).toBeGreaterThan(0)
    const item = { id: 'size-full', candidate: 'size-full', features: [] }
    const check = (output: typeof encoded) => conversionCaseResult(item, 'lynx', lynxLiteralObservation('size-full', output), [], oracle).status
    expect(check(encoded)).toBe('passed')
    expect(check({ ...encoded, css: encoded.css.replace('width: 100%;', '') })).toBe('failed')
    expect(check({ ...encoded, css: encoded.css.replace('width: 100%;', 'width: 90%;') })).toBe('failed')
    expect(check({ ...encoded, css: `${encoded.css}.size-full { width: 90%; }` })).toBe('failed')
    expect(check({ ...encoded, css: `${encoded.css}@media screen {.size-full { width: 90%; }}` })).toBe('not-run')
    expect(check({ ...encoded, css: '' })).toBe('failed')
  })

  it('真实 decoder 的变量展示文本不能作为标准 CSS 或 serializer 输入的语义替身', async () => {
    const input = '.probe{width:32px;color:var(--probe-color,red)}'
    const encoded = await encodeCss(input, 'wasm')
    expect(encoded.sourceCss).toBe(input)
    expect(encoded.sourceCss).not.toContain('{{')
    expect(encoded.encodedByteLength).toBeGreaterThan(0)
    expect(encoded.css).toContain('color: {{--probe-color}}')
    expect(encoded.css).not.toContain('var(--probe-color,red)')
    expect(() => cssDeclarations(encoded.css)).toThrow()
    expect(encoded.rules.find(rule => rule.selectorText?.value === '.probe')?.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'color', defaultValueMap: { '--probe-color': 'red' } }),
    ]))
  })

  it('将 Tailwind v4 百分比透明度编码为 Lynx 原生数值', async () => {
    const css = await generateCss('opacity-50')
    expect(css).toContain('opacity: 0.5')
    expect(css).not.toContain('opacity: 50%')
    const encoded = await encodeCss(css)
    expect(encoded.diagnostics).toEqual([])
    expect(encoded.css).toContain('opacity: 0.5')
  })

  it.each([
    ['border', ['--tw-border-style: solid', 'border-top-width: 1px']],
    ['border border-dashed', ['--tw-border-style: solid', '--tw-border-style: dashed', 'border-style: {{--tw-border-style}}']],
    ['shadow-lg', ['--tw-inset-shadow: 0 0', '--tw-ring-offset-shadow: 0 0', '--tw-shadow: 0 10px']],
  ])('retains the default variables needed by %s after production encoding', async (candidate, declarations) => {
    const encoded = await encodeCss(await generateCss(candidate))

    expect(encoded.diagnostics).toEqual([])
    for (const declaration of declarations) {
      expect(encoded.css).toContain(declaration)
    }
  })

  it('resolves transition theme defaults before their root scope is removed by the encoder', async () => {
    const css = await generateCss('transition-opacity')
    expect(css).toContain('var(--tw-duration, 150ms)')
    expect(css).not.toContain('--default-transition-')
    const encoded = await encodeCss(css)
    expect(encoded.diagnostics).toEqual([])
    expect(encoded.css).toContain('transition-property: opacity')
    expect(encoded.css).toContain('transition-duration: {{--tw-duration}}')
    expect(encoded.css).toContain('transition-timing-function: {{--tw-ease}}')
    // decoder 不展示 fallback；在真实 encoder 输入中核对默认值与动态变量的对应关系。
    const transition = encoded.rules.find(rule => rule.selectorText?.value === '.transition-opacity')
    expect(transition?.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'transition-duration', defaultValueMap: { '--tw-duration': '150ms' } }),
      expect.objectContaining({ name: 'transition-timing-function', defaultValueMap: { '--tw-ease': 'cubic-bezier(0.4,0,0.2,1)' } }),
    ]))
  })

  it.each([undefined, 'wasm'] as const)('通过 %s 编码固定 columns 的静默丢弃，输入与空诊断均不能冒充保留', async (mode) => {
    const encoded = await encodeCss(await generateCss('columns-2'), mode)
    expect(encoded.sourceCss).toContain('columns: 2')
    expect(encoded.rules.find(rule => rule.selectorText?.value === '.columns-2')?.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'columns', value: '2' }),
    ]))
    expect(encoded.encodedByteLength).toBeGreaterThan(0)
    expect(encoded.diagnostics).toEqual([])
    expect(encoded.css).not.toContain('columns:')
  })

  it.each([undefined, 'wasm'] as const)('通过 %s 编码保留不支持 selector 的原始诊断', async (mode) => {
    const encoded = await encodeCss(await generateCss('peer-checked:opacity-100'), mode)

    expect(encoded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'selector', name: expect.stringContaining(':checked') }),
    ]))
    expect(encoded.css).not.toContain('peer-checked')
  })
})
