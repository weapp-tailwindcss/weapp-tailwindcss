import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import { jsHandler } from '@/js/babel'
import { oxcJsHandler } from '@/js/fast-path/oxc'

function createOptions() {
  return {
    escapeMap: MappingChars2String,
    classNameSet: new Set(['w-[100px]']),
    generateMap: false,
    experimentalJsFastPath: 'oxc' as const,
    filename: 'runtime.js',
    babelParserOptions: { sourceType: 'unambiguous' as const },
    moduleGraph: { resolve: vi.fn(), load: vi.fn() },
  }
}

describe('Oxc module graph eligibility', () => {
  it.each([
    'const vendor = require("./vendor.js"); const cls = "w-[100px]"; const other = "h-[20px]"',
    'const vendor = require /* comment */ ("./vendor.js"); exports.cls = `w-[100px]`',
    'const text = "import from require("; export const cls = "w-[100px]"',
  ])('preserves Babel output without constructing a Babel AST for %s', (source) => {
    const options = createOptions()
    const expected = jsHandler(source, options)
    expect(oxcJsHandler(source, options)).toEqual(expected)
    const result = createJsHandler(options)(source, options.classNameSet, options)

    expect(result).toEqual(expected)
    expect(result.code).toContain('w-_b100px_B')
    expect(result.code).not.toContain('h-_b20px_B')
    expect(options.moduleGraph.resolve).not.toHaveBeenCalled()
    expect(options.moduleGraph.load).not.toHaveBeenCalled()
  })

  it.each([
    'import value from "./vendor.js"; const cls = "w-[100px]"',
    'import "./vendor.js"; const cls = "w-[100px]"',
    'export * from "./vendor.js"',
    'export { value } from "./vendor.js"',
  ])('defers ESM graph handling to Babel for %s', (source) => {
    expect(oxcJsHandler(source, createOptions())).toBeUndefined()
  })

  it('retains scope analysis for ignored calls', () => {
    const source = 'const cls = "w-[100px]"; ignore(cls); require("./vendor.js")'
    const options = { ...createOptions(), ignoreCallExpressionIdentifiers: ['ignore'] }
    expect(oxcJsHandler(source, options)).toBeUndefined()
    expect(createJsHandler(options)(source, options.classNameSet, options).code).toBe(source)
  })
})
