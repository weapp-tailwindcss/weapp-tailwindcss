import type { NodePath } from '@babel/traverse'
import type { CallExpression, TemplateElement } from '@babel/types'
import { NodePath as BabelNodePath } from '@babel/traverse'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it, vi } from 'vitest'
import { parse, traverse } from '@/babel'
import * as babel from '@/js/babel'
import * as sourceAnalysis from '@/js/sourceAnalysis'
import * as nameMatcher from '@/utils/nameMatcher'

function prepareEval(code: string) {
  const ast = parse(code, { sourceType: 'module' })
  let callPath: NodePath<CallExpression> | undefined
  traverse(ast, {
    CallExpression(path) {
      const callee = path.get('callee')
      if (callee.isIdentifier({ name: 'eval' })) {
        callPath = path
        path.stop()
      }
    },
  })
  if (!callPath) {
    throw new Error('eval call not found in snippet')
  }
  return { ast, callPath }
}

describe('babel helpers branch coverage', () => {
  it('serialises functions when generating cache keys', () => {
    const fn = () => 'demo'
    const withFn = babel.genCacheKey('source', { fn })
    const withoutFn = babel.genCacheKey('source', {})
    expect(withFn).not.toBe(withoutFn)
  })

  it('skips eval string tokens when location metadata is missing', () => {
    const rawSource = 'eval(\'w-[100px]\')'
    const { ast, callPath } = prepareEval(rawSource)
    const literal = callPath.get('arguments')[0]
    literal.node.start = undefined as any
    literal.node.end = undefined as any

    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'tw-a' })
    const analysis = babel.analyzeSource(ast, {})
    const result = babel.processUpdatedSource(rawSource, {}, analysis)

    expect(result.toString()).toBe(rawSource)
    spy.mockRestore()
  })

  it('skips eval string tokens when start and end collapse', () => {
    const rawSource = 'eval(\'w-[100px]\')'
    const { ast, callPath } = prepareEval(rawSource)
    const literal = callPath.get('arguments')[0]
    literal.node.start = 10
    literal.node.end = 10

    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'tw-a' })
    const analysis = babel.analyzeSource(ast, {})
    const result = babel.processUpdatedSource(rawSource, {}, analysis)

    expect(result.toString()).toBe(rawSource)
    spy.mockRestore()
  })

  it('adds tokens for eval template literals', () => {
    const rawSource = 'eval(`const cls = "w-[100px]"` )'
    const ast = parse(rawSource, { sourceType: 'module' })
    const options = {
      classNameSet: new Set(['w-[100px]']),
      escapeMap: MappingChars2String,
      alwaysEscape: true,
    }
    const analysis = babel.analyzeSource(ast, options)
    const result = babel.processUpdatedSource(rawSource, options, analysis)

    expect(result.toString()).toContain('w-_b100px_B')
  })

  it('ignores eval string tokens when the handler produces empty output', () => {
    const rawSource = 'eval(\'w-[100px]\')'
    const { ast } = prepareEval(rawSource)
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: '' })
    const analysis = babel.analyzeSource(ast, {})
    const result = babel.processUpdatedSource(rawSource, {}, analysis)

    expect(result.toString()).toBe(rawSource)
    spy.mockRestore()
  })

  it('ignores eval template tokens when the handler produces empty output', () => {
    const rawSource = 'eval(`w-[100px]` )'
    const { ast } = prepareEval(rawSource)
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: '' })
    const analysis = babel.analyzeSource(ast, {})
    const result = babel.processUpdatedSource(rawSource, {}, analysis)

    expect(result.toString()).toBe(rawSource)
    spy.mockRestore()
  })

  it('skips eval string tokens when the nested source is empty', () => {
    const rawSource = 'eval(\'\')'
    const ast = parse(rawSource, { sourceType: 'module' })
    const analysis = babel.analyzeSource(ast, {})
    const result = babel.processUpdatedSource(rawSource, {}, analysis)

    expect(result.toString()).toBe(rawSource)
  })

  it('skips eval template tokens when the nested source is empty', () => {
    const rawSource = 'eval(`` )'
    const ast = parse(rawSource, { sourceType: 'module' })
    const analysis = babel.analyzeSource(ast, {})
    const result = babel.processUpdatedSource(rawSource, {}, analysis)

    expect(result.toString()).toBe(rawSource)
  })

  it('ignores eval string tokens when the transformed code matches the original', () => {
    const rawSource = 'eval(\'w-[100px]\')'
    const { ast } = prepareEval(rawSource)
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'w-[100px]' })

    const analysis = babel.analyzeSource(ast, {})
    const result = babel.processUpdatedSource(rawSource, {}, analysis)

    expect(result.toString()).toBe(rawSource)
    spy.mockRestore()
  })

  it('returns early when there are no target paths or replacement sources', () => {
    const collectSpy = vi.spyOn(sourceAnalysis, 'collectModuleSpecifierReplacementTokens')
    const rawSource = 'const noop = 1'
    const ast = parse(rawSource, { sourceType: 'module' })
    const analysis = {
      ...babel.analyzeSource(ast, {}),
      targetPaths: [],
    }

    const result = babel.processUpdatedSource(rawSource, {}, analysis)

    expect(result.toString()).toBe(rawSource)
    expect(collectSpy).not.toHaveBeenCalled()
  })

  it('respects ignored tagged template identifiers', () => {
    const ast = parse('styled`w-[100px]`', { sourceType: 'module' })
    const analysis = babel.analyzeSource(ast, {
      ignoreTaggedTemplateExpressionIdentifiers: ['styled'],
    })

    expect(analysis.targetPaths).toHaveLength(0)
  })

  it('processes tagged templates when ignore identifiers are not provided', () => {
    const ast = parse('styled`w-[100px]`', { sourceType: 'module' })
    const analysis = babel.analyzeSource(ast, {})

    expect(analysis.targetPaths).toHaveLength(1)
  })

  it('retains tagged templates when the ignore list does not match', () => {
    const ast = parse('tw`w-[100px]`', { sourceType: 'module' })
    const analysis = babel.analyzeSource(ast, {
      ignoreTaggedTemplateExpressionIdentifiers: ['styled'],
    })

    expect(analysis.targetPaths).toHaveLength(1)
  })

  it('does not build ignore matchers when tagged templates are absent', () => {
    const spy = vi.spyOn(nameMatcher, 'createNameMatcher')
    const ast = parse('const cls = `w-[100px]`', { sourceType: 'module' })

    const analysis = babel.analyzeSource(ast, {
      ignoreTaggedTemplateExpressionIdentifiers: ['styled'],
    })

    expect(analysis.targetPaths).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not build ignore matchers for tagged templates when ignore identifiers are absent', () => {
    const spy = vi.spyOn(nameMatcher, 'createNameMatcher')
    const ast = parse('styled`w-[100px]`', { sourceType: 'module' })

    const analysis = babel.analyzeSource(ast, {})

    expect(analysis.targetPaths).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('reuses ignored tag matchers for the same options object', () => {
    const spy = vi.spyOn(nameMatcher, 'createNameMatcher')
    const options = {
      ignoreTaggedTemplateExpressionIdentifiers: ['styled'],
    }

    const firstAst = parse('styled`w-[100px]`', { sourceType: 'module' })
    const secondAst = parse('styled`w-[200px]`', { sourceType: 'module' })

    expect(babel.analyzeSource(firstAst, options).targetPaths).toHaveLength(0)
    expect(babel.analyzeSource(secondAst, options).targetPaths).toHaveLength(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('falls back to an empty original value for unexpected eval nodes', () => {
    const rawSource = 'eval(`__coverage__` )'
    const ast = parse(rawSource, { sourceType: 'module' })
    const options = {
      alwaysEscape: true,
      classNameSet: new Set(['__coverage__']),
      escapeMap: MappingChars2String,
    }
    const proto = BabelNodePath.prototype as any
    const originalIsTemplateElement = proto.isTemplateElement

    try {
      proto.isTemplateElement = function patched(this: NodePath<TemplateElement>) {
        if (this.node.type === 'TemplateElement' && this.node.value?.raw === '__coverage__') {
          return false
        }
        return originalIsTemplateElement.call(this)
      }

      const analysis = babel.analyzeSource(ast, options)
      const result = babel.processUpdatedSource(rawSource, options, analysis)

      expect(result.toString()).toBe(rawSource)
    }
    finally {
      proto.isTemplateElement = originalIsTemplateElement
    }
  })
})
