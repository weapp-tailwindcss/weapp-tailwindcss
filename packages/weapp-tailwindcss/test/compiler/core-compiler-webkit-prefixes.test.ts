import type { Compiler, CompilerCssTransformOptions } from '@/core/compiler'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompiler } from '@/core/compiler'
import { resolveTailwindV4Source } from '@/generator'

const source = '.icon{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-tap-highlight-color:transparent;-webkit-appearance:none}'
const property = '-webkit-tap-highlight-color'

describe('Issue 1286 compiler WebKit preservation', () => {
  const compilers: Compiler[] = []
  afterEach(async () => {
    await Promise.all(compilers.splice(0).map(compiler => compiler.dispose()))
  })

  function createCase(properties: string[] = []) {
    const compiler = createCompiler({
      cssOptions: { cssPreflight: false, preserveWebkitProperties: properties },
    })
    compilers.push(compiler)
    const snapshot = compiler.createSnapshot({ id: 'issue-1286', target: 'weapp', classSet: [] })
    return { compiler, snapshot }
  }

  it.each(['string', 'root'] as const)('keeps defaults and instance extensions through %s finalization', async (kind) => {
    const { compiler, snapshot } = createCase([property])
    const root = postcss.parse(source)
    const result = kind === 'string'
      ? await compiler.transformCss(source, snapshot)
      : await compiler.transformCssRoot(root, snapshot)
    expect(result.css).toContain('-webkit-font-smoothing:antialiased')
    expect(result.css).toContain('-moz-osx-font-smoothing:grayscale')
    expect(result.css).toContain(`${property}:transparent`)
    expect(result.css).not.toContain('-webkit-appearance')
    expect(root.toString()).toBe(source)
  })

  it.each(['string', 'root'] as const)('uses call overrides and restores instance extensions for %s', async (kind) => {
    const { compiler, snapshot } = createCase([property])
    const transform = (options?: CompilerCssTransformOptions) => kind === 'string'
      ? compiler.transformCss(source, snapshot, options)
      : compiler.transformCssRoot(postcss.parse(source), snapshot, options)
    const overridden = await transform({ cssOptions: { preserveWebkitProperties: [] } })
    expect(overridden.css).toContain('-webkit-font-smoothing:antialiased')
    expect(overridden.css).not.toContain(property)
    expect((await transform()).css).toContain(`${property}:transparent`)
  })

  it('invalidates repeated transformations when the call array changes in place', async () => {
    const { compiler, snapshot } = createCase()
    const properties: string[] = []
    const options = { cssOptions: { preserveWebkitProperties: properties } }
    expect((await compiler.transformCss(source, snapshot, options)).css).not.toContain(property)
    properties.push(property)
    expect((await compiler.transformCss(source, snapshot, options)).css).toContain(`${property}:transparent`)
    properties.splice(0)
    expect((await compiler.transformCss(source, snapshot, options)).css).not.toContain(property)
  })

  it.each(['string', 'root'] as const)('does not apply mini-program extensions to a Web snapshot through %s', async (kind) => {
    const { compiler } = createCase(['-webkit-flex', property])
    const snapshot = compiler.createSnapshot({ id: 'issue-1286-web', target: 'web', classSet: [] })
    const css = `${source}.flex{-webkit-flex:1}`
    const transform = (options?: CompilerCssTransformOptions) => kind === 'string'
      ? compiler.transformCss(css, snapshot, options)
      : compiler.transformCssRoot(postcss.parse(css), snapshot, options)
    const result = await transform()
    expect(result.css).not.toContain(property)
    expect(result.css).not.toContain('-webkit-flex:')
    expect((await transform({ cssOptions: { preserveWebkitProperties: [property] } })).css).toBe(result.css)
  })

  it.each(['string', 'root'] as const)('shares one configuration snapshot across asynchronous %s stages', async (kind) => {
    const { compiler, snapshot } = createCase()
    const properties = [property]
    const options = { cssOptions: { preserveWebkitProperties: properties } }
    const transform = () => kind === 'string'
      ? compiler.transformCss(source, snapshot, options)
      : compiler.transformCssRoot(postcss.parse(source), snapshot, options)
    const pending = transform()
    properties.splice(0)
    expect((await pending).css).toContain(`${property}:transparent`)
    expect((await transform()).css).not.toContain(property)
  })

  it('preserves explicit finalizer options without changing the input Root', () => {
    const { compiler } = createCase()
    const root = postcss.parse(source)
    const options = { preserveWebkitProperties: [property] }
    expect(compiler.finalizeCss(source, options)).toContain(`${property}:transparent`)
    expect(compiler.finalizeCssRoot(root, options).toString()).toContain(`${property}:transparent`)
    expect(root.toString()).toBe(source)
  })

  it('regenerates utility output when the preservation array changes in place', async () => {
    const { compiler } = createCase()
    const properties: string[] = []
    const utilitySource = await resolveTailwindV4Source({
      base: process.cwd(),
      css: '@utility issue-1286-highlight{-webkit-tap-highlight-color:transparent} @tailwind utilities;',
    })
    const request = {
      id: 'issue-1286-utility',
      source: utilitySource,
      candidates: ['issue-1286-highlight', 'antialiased', 'subpixel-antialiased'],
      scanSources: false,
      target: 'weapp' as const,
      styleOptions: { cssOptions: { preserveWebkitProperties: properties } },
    }
    const first = await compiler.generate(request)
    expect(first.css).toContain('-webkit-font-smoothing')
    expect(first.css).not.toContain(property)
    properties.push(property)
    const changed = await compiler.generate(request)
    expect(changed.cache.output).toBe(false)
    expect(changed.css).toContain(property)
    properties.splice(0)
    const removed = await compiler.generate(request)
    expect(removed.css).toBe(first.css)
    expect(removed.css).not.toContain(property)
  })
})
