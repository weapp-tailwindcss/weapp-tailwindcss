import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { jsHandler } from '@/js/babel'
import { getOxcSourceAnalysis } from '@/js/fast-path/analysis'
import { oxcJsHandler } from '@/js/fast-path/oxc'

const options = {
  escapeMap: MappingChars2String,
  experimentalJsFastPath: 'oxc' as const,
  filename: 'entry.js',
  classNameSet: new Set(['w-[100px]']),
}

describe('compact Oxc analysis cache', () => {
  it('isolates explicit parenthesized AST mode when the same source is cached', () => {
    const source = 'const cls = ("w-[100px]") ? "w-[100px]" : "plain"'
    const defaults = { ...options, generateMap: false }
    const explicit = { ...defaults, babelParserOptions: { createParenthesizedExpressions: true } }
    for (const current of [defaults, explicit, defaults, explicit]) {
      expect(oxcJsHandler(source, current)?.code).toBe(jsHandler(source, current).code)
    }
    expect(oxcJsHandler(source, defaults)?.code).toContain('("w-[100px]")')
    expect(oxcJsHandler(source, explicit)?.code).toContain('("w-_b100px_B")')
    expect(getOxcSourceAnalysis(source, defaults)).not.toBe(getOxcSourceAnalysis(source, explicit))
  })

  it('reuses literal facts while applying the current class set and escaping options', () => {
    // eslint-disable-next-line no-template-curly-in-string -- 输入必须保留模板插值。
    const source = 'const cls = "w-[100px] h-[20px]"; const tpl = `w-[100px] ${value}`'
    const analysis = getOxcSourceAnalysis(source, options)
    expect(analysis).toBeDefined()
    expect(Object.keys(analysis!)).toEqual(['literals', 'hasModuleDeclarations', 'hasTaggedTemplate'])
    const classNameSet = new Set(['w-[100px]'])
    const first = oxcJsHandler(source, { ...options, classNameSet })
    expect(first?.code).toContain('w-_b100px_B h-[20px]')

    classNameSet.clear()
    classNameSet.add('h-[20px]')
    expect(oxcJsHandler(source, { ...options, classNameSet })?.code).toContain('w-[100px] h-_b20px_B')
    expect(getOxcSourceAnalysis(source, options)).toBe(analysis)
    expect(oxcJsHandler(source, { ...options, classNameSet, escapeMap: { '[': '_L', ']': '_R' } })?.code).toContain('h-_L20px_R')
  })

  it('isolates parser language, source type and modified source', () => {
    const source = 'const cls: string = "w-[100px]"'
    expect(getOxcSourceAnalysis(source, { ...options, filename: 'entry.ts' })).toBeDefined()
    expect(getOxcSourceAnalysis(source, options)).toBeUndefined()
    const moduleSource = 'export const cls = "w-[100px]"'
    const moduleAnalysis = getOxcSourceAnalysis(moduleSource, options)
    expect(moduleAnalysis).toBeDefined()
    expect(getOxcSourceAnalysis(moduleSource, { ...options, babelParserOptions: { sourceType: 'script' } })).not.toBe(moduleAnalysis)
    expect(oxcJsHandler('const cls = "h-[20px]"', options)?.code).toBe('const cls = "h-[20px]"')
  })

  it('retains tagged template fallback when options change after caching', () => {
    const source = 'const cls = keep`w-[100px]`'
    expect(oxcJsHandler(source, options)?.code).toContain('w-_b100px_B')
    expect(oxcJsHandler(source, { ...options, ignoreTaggedTemplateExpressionIdentifiers: ['keep'] })).toBeUndefined()
  })

  it('bounds retained entries and does not cache oversized sources', () => {
    const source = 'const firstCacheEntry = "w-[100px]"'
    const initial = getOxcSourceAnalysis(source, options)
    for (let index = 0; index < 130; index++) {
      getOxcSourceAnalysis(`const cacheEntry${index} = "w-[100px]"`, options)
    }
    expect(getOxcSourceAnalysis(source, options)).not.toBe(initial)
    const largeSource = `const large = "${'a'.repeat(600_000)}"`
    expect(getOxcSourceAnalysis(largeSource, options)).not.toBe(getOxcSourceAnalysis(largeSource, options))
  })
})
