import { describe, expect, it } from 'vitest'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import { transformLynxCssCompat } from '../packages/postcss/src/compat/lynx-css'
import { transformWebCssCompat } from '../packages/postcss/src/compat/web-css'
import { encodeLynxCss } from './lynx/batch-encode'
import { exampleDir } from './lynx/catalog'
import { cssDeclarations } from './tailwind-capabilities/css'

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

  it.each([undefined, 'wasm'] as const)('通过 %s 编码保留不支持属性的原始诊断', async (mode) => {
    const encoded = await encodeCss(await generateCss('columns-2'), mode)
    expect(encoded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'property', name: 'columns' }),
    ]))
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
