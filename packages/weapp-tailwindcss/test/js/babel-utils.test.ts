import type { NodePath } from '@babel/traverse'
import type { CallExpression } from '@babel/types'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { afterEach, describe, expect, it } from 'vitest'
import { parse, traverse } from '@/babel'
import * as babel from '@/js/babel'

describe('babel helpers additional coverage', () => {
  afterEach(() => {
    babel.parseCache.clear()
  })

  it('memoises parsed ASTs when parser caching is enabled', () => {
    const code = 'const value = 1'
    const parserOptions = { sourceType: 'module' as const, cache: true }
    const first = babel.babelParse(code, parserOptions)
    const second = babel.babelParse(code, parserOptions)

    expect(second).toBe(first)
    expect(babel.parseCache.size).toBe(1)
  })

  it('uses hashed parser cache keys instead of retaining source text in keys', () => {
    const source = 'const secretClass = "text-red-500"'
    const cacheKey = babel.genCacheKey(source, { sourceType: 'module' })

    expect(cacheKey).not.toContain(source)
    expect(cacheKey).toContain('sourceType')
  })

  it('skips parser caching for sources over the configured source length limit', () => {
    const code = 'const value = "text-red-500"'
    const first = babel.babelParse(code, {
      sourceType: 'module' as const,
      cache: true,
      cacheMaxSourceLength: code.length - 1,
    })
    const second = babel.babelParse(code, {
      sourceType: 'module' as const,
      cache: true,
      cacheMaxSourceLength: code.length - 1,
    })

    expect(second).not.toBe(first)
    expect(babel.parseCache.size).toBe(0)
  })

  it('trims parser cache entries to the configured entry limit', () => {
    const first = babel.babelParse('const first = 1', {
      sourceType: 'module' as const,
      cache: true,
      cacheMaxEntries: 1,
    })
    const second = babel.babelParse('const second = 2', {
      sourceType: 'module' as const,
      cache: true,
      cacheMaxEntries: 1,
    })
    const third = babel.babelParse('const first = 1', {
      sourceType: 'module' as const,
      cache: true,
      cacheMaxEntries: 1,
    })

    expect(second).not.toBe(first)
    expect(third).not.toBe(first)
    expect(babel.parseCache.size).toBe(1)
  })

  it('does not retain parsed ASTs when parser caching is disabled', () => {
    const code = 'const value = 1'
    const first = babel.babelParse(code, { sourceType: 'module' as const, cache: false })
    const second = babel.babelParse(code, { sourceType: 'module' as const, cache: false })

    expect(second).not.toBe(first)
    expect(babel.parseCache.size).toBe(0)
  })

  it('detects eval call expressions', () => {
    const ast = parse('eval("a"); other("b")', { sourceType: 'module' as const })
    const calls: NodePath<CallExpression>[] = []

    traverse(ast, {
      CallExpression(path) {
        calls.push(path)
      },
    })

    expect(calls).toHaveLength(2)
    expect(babel.isEvalPath(calls[0])).toBe(true)
    expect(babel.isEvalPath(calls[1])).toBe(false)
  })

  it('filters ignored paths when updating the source', () => {
    const code = 'cn("w-[100px]")'
    const options = {
      classNameSet: new Set(['w-[100px]']),
      escapeMap: MappingChars2String,
      ignoreCallExpressionIdentifiers: ['cn'],
      alwaysEscape: true,
    }
    const ast = parse(code, { sourceType: 'module' as const })
    const analysis = babel.analyzeSource(ast, options)
    const [firstTarget] = analysis.targetPaths

    expect(firstTarget).toBeDefined()
    expect(analysis.ignoredPaths.has(firstTarget)).toBe(true)

    analysis.jsTokenUpdater.addToken({
      start: firstTarget.node.start!,
      end: firstTarget.node.end!,
      value: 'should-remove',
      path: firstTarget,
    } as any)

    const ms = babel.processUpdatedSource(code, options, analysis)
    expect(ms.toString()).toBe(code)
  })

  it('reuses an empty ignored path set when call ignore identifiers are disabled', () => {
    const firstCode = 'const first = "w-[100px]"'
    const secondCode = 'const second = "w-[200px]"'
    const firstAnalysis = babel.analyzeSource(parse(firstCode, { sourceType: 'module' as const }), {})
    const secondAnalysis = babel.analyzeSource(parse(secondCode, { sourceType: 'module' as const }), {})

    const [firstTarget] = firstAnalysis.targetPaths
    const [secondTarget] = secondAnalysis.targetPaths

    expect(firstAnalysis.ignoredPaths).toBe(secondAnalysis.ignoredPaths)
    expect(firstAnalysis.ignoredPaths.has(firstTarget)).toBe(false)
    expect(secondAnalysis.ignoredPaths.has(secondTarget)).toBe(false)
  })

  it('can skip module metadata collection while keeping target path analysis', () => {
    const code = `
      import foo from './foo'
      export * from './bar'
      const lib = require('./baz')
      const cls = "w-[100px]"
    `
    const ast = parse(code, { sourceType: 'module' as const })
    const analysis = babel.analyzeSource(ast, {}, undefined, false)

    expect(analysis.targetPaths.length).toBeGreaterThan(0)
    expect(analysis.importDeclarations.size).toBe(0)
    expect(analysis.exportDeclarations.size).toBe(0)
    expect(analysis.requireCallPaths).toHaveLength(0)
    expect(analysis.walker.imports.size).toBe(0)
  })

  it('keeps eval handling when module metadata collection is skipped', () => {
    const code = 'eval(`const cls = "w-[100px]"`)'
    const options = {
      classNameSet: new Set(['w-[100px]']),
      escapeMap: MappingChars2String,
      alwaysEscape: true,
    }
    const analysis = babel.analyzeSource(parse(code, { sourceType: 'module' as const }), options, undefined, false)
    const ms = babel.processUpdatedSource(code, options, analysis)

    expect(ms.toString()).toContain('w-_b100px_B')
  })

  it('returns the original source when parsing fails', () => {
    const raw = 'const = 1'
    const result = babel.jsHandler(raw, {})

    expect(result.code).toBe(raw)
    expect(result.error).toBeTruthy()
  })

  it('collects import/export declarations and exposes lazy source maps', () => {
    const code = `
      import foo from './foo'
      export { foo }
      export default foo
      export * from './utils'
      const cls = "w-[100px]"
    `
    const ast = parse(code, { sourceType: 'module' as const })
    const options = {
      classNameSet: new Set(['w-[100px]']),
      escapeMap: MappingChars2String,
      alwaysEscape: true,
      babelParserOptions: {
        sourceType: 'module' as const,
      },
    }

    const analysis = babel.analyzeSource(ast, options)
    expect(analysis.importDeclarations.size).toBe(1)
    expect(analysis.exportDeclarations.size).toBe(3)

    const handled = babel.jsHandler(code, {
      ...options,
      generateMap: true,
    })

    expect(handled.code).toContain('const cls')
    expect(handled.error).toBeUndefined()
    expect(handled.map).toBeDefined()
  })

  it('does not define a source map getter unless generateMap is enabled', () => {
    const handled = babel.jsHandler('const cls = "w-[100px]"', {
      classNameSet: new Set(['w-[100px]']),
      escapeMap: MappingChars2String,
      alwaysEscape: true,
    })

    expect(handled.code).toContain('w-_b100px_B')
    expect(Object.hasOwn(handled, 'map')).toBe(false)
    expect(handled.map).toBeUndefined()
  })
})
