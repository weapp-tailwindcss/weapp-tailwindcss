import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from 'weapp-tailwindcss/generator'
import { transformLynxCssCompat } from '../packages/postcss/src/compat/lynx-css'
import { transformWebCssCompat } from '../packages/postcss/src/compat/web-css'
import { compatibilityVersions, exampleDir } from './lynx/catalog'

interface TasmCodec {
  getEncodeMode: () => (options: unknown) => Promise<{ buffer: Uint8Array, css_diagnostics?: string }>
  decode_wasm: (buffer: Uint8Array) => Promise<{ css: { text?: string } }>
}

interface EncodedRule {
  selectorText?: { value: string }
  style?: Array<{ name: string, defaultValueMap?: Record<string, string> }>
}

async function encodeCss(css: string) {
  const exampleRequire = createRequire(new URL('../examples/react-lynx/package.json', import.meta.url))
  const reactRequire = createRequire(exampleRequire.resolve('@lynx-js/react-rsbuild-plugin/package.json'))
  const templateRequire = createRequire(reactRequire.resolve('@lynx-js/template-webpack-plugin/package.json'))
  // 使用生产 encoder 和独立 WASM decoder，避免不同版本的原生库在同一进程发生 ABI 冲突。
  const encoder = templateRequire('@lynx-js/tasm') as TasmCodec
  const decoder = createRequire(import.meta.url)('@lynx-js/tasm') as TasmCodec
  const { cssChunksToMap } = await import(pathToFileURL(templateRequire.resolve('@lynx-js/css-serializer')).href)
  const { cssMap, cssSource } = cssChunksToMap([css], [], true)
  const encoded = await encoder.getEncodeMode()({
    compilerOptions: {
      enableFiberArch: true,
      useLepusNG: true,
      enableReuseContext: true,
      bundleModuleMode: 'ReturnByFunction',
      enableCSSSelector: true,
      targetSdkVersion: compatibilityVersions.engineVersion,
    },
    sourceContent: { dsl: 'react_nodiff', appType: 'card', config: { lepusStrict: true } },
    css: { cssMap, cssSource },
    lepusCode: { root: '', lepusChunk: {}, filename: 'main.js' },
    manifest: {},
    customSections: {},
  })
  const decoded = await decoder.decode_wasm(encoded.buffer)
  return {
    css: decoded.css.text ?? '',
    rules: Object.values(cssMap).flat() as EncodedRule[],
    diagnostics: JSON.parse(encoded.css_diagnostics ?? '[]') as Array<{ type: string, name: string }>,
  }
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

  it('continues to report unsupported peer selectors instead of rewriting their meaning', async () => {
    const encoded = await encodeCss(await generateCss('peer-checked:opacity-100'))

    expect(encoded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'selector', name: expect.stringContaining(':checked') }),
    ]))
    expect(encoded.css).not.toContain('peer-checked')
  })
})
