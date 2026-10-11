import type { NodePath } from '@babel/traverse'
import type { NumericLiteral, StringLiteral, TemplateElement } from '@babel/types'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it, vi } from 'vitest'
import { parse, traverse } from '@/babel'
import * as classContext from '@/js/class-context'
import { replaceHandleValue } from '@/js/handlers'
import * as classNameTransform from '@/shared/classname-transform'
import * as wxmlShared from '@/wxml/shared'

type LiteralKind = 'StringLiteral' | 'TemplateElement'

function getLiteralPath(code: string, kind: LiteralKind, occurrence = 0) {
  const ast = parse(code, {
    sourceType: 'module',
  })
  let result: NodePath<StringLiteral | TemplateElement> | undefined
  let currentOccurrence = 0

  traverse(ast, {
    StringLiteral(path: NodePath<StringLiteral>) {
      if (kind !== 'StringLiteral' || result) {
        return
      }
      if (currentOccurrence !== occurrence) {
        currentOccurrence += 1
        return
      }
      result = path as NodePath<StringLiteral | TemplateElement>
      path.stop()
    },
    TemplateElement(path: NodePath<TemplateElement>) {
      if (kind !== 'TemplateElement' || result) {
        return
      }
      if (currentOccurrence !== occurrence) {
        currentOccurrence += 1
        return
      }
      result = path
      path.stop()
    },
  })

  if (!result) {
    throw new Error(`Unable to locate ${kind} in provided code snippet.`)
  }

  return result
}

function getNumericLiteralPath(code: string) {
  const ast = parse(code, {
    sourceType: 'module',
  })
  let result: NodePath<NumericLiteral> | undefined

  traverse(ast, {
    NumericLiteral(path: NodePath<NumericLiteral>) {
      if (!result) {
        result = path
        path.stop()
      }
    },
  })

  if (!result) {
    throw new Error('Unable to locate NumericLiteral in provided code snippet.')
  }

  return result as unknown as NodePath<StringLiteral | TemplateElement>
}

describe('replaceHandleValue branch coverage', () => {
  it('returns undefined when no usable tokens are extracted', () => {
    const literal = getLiteralPath('const blank = \'   \'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      alwaysEscape: true,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('forces escaping when alwaysEscape is enabled', () => {
    const literal = getLiteralPath('const cls = \'w-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      alwaysEscape: true,
      needEscaped: true,
    })

    expect(token?.value).toBe('w-_b100px_B')
    expect(token?.start).toBe(literal.node.start! + 1)
    expect(token?.end).toBe(literal.node.end! - 1)
  })

  it('honours inline ignore comments', () => {
    const literal = getLiteralPath('const ignored = /* weapp-tw ignore */ \'w-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('does not skip comments that do not contain the weapp-tw marker', () => {
    const literal = getLiteralPath('const ignored = /* ignore */ \'w-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: true,
    })

    expect(token?.value).toBe('w-_b100px_B')
  })

  it('respects jsPreserveClass and skips protected candidates', () => {
    const literal = getLiteralPath('const safe = \'w-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      jsPreserveClass: () => true,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('decodes unicode escape sequences before processing', () => {
    const literal = getLiteralPath('const unicodeCls = \'\\\\u0077-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: true,
      unescapeUnicode: true,
    })

    expect(token?.value).toBe('w-_b100px_B')
  })

  it('decodes unicode escape sequences in template raw values before processing', () => {
    const quasi = getLiteralPath('const tpl = `\\u0077-[100px]`', 'TemplateElement')
    const token = replaceHandleValue(quasi, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: true,
      unescapeUnicode: true,
    })

    expect(token?.value).toBe('w-_b100px_B')
  })

  it('transforms template elements without shifting offsets', () => {
    const quasi = getLiteralPath('const tpl = `w-[100px]`', 'TemplateElement')
    const token = replaceHandleValue(quasi, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: false,
    })

    expect(token?.value).toBe('w-_b100px_B')
    expect(token?.start).toBe(quasi.node.start)
  })

  it('skips transformation when the class is unchanged after escaping', () => {
    const literal = getLiteralPath('const plain = \'flex\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['flex']),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('replaces all repeated occurrences in a single pass', () => {
    const literal = getLiteralPath('const repeated = \'w-[100px] w-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: true,
    })

    expect(token?.value).toBe('w-_b100px_B w-_b100px_B')
  })

  it('keeps repeated escaped runtime-set hits stable in the same literal', () => {
    const quasi = getLiteralPath('const tpl = `gap-[20px] gap-[20px]`', 'TemplateElement')
    const token = replaceHandleValue(quasi, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['gap-_b20px_B']),
      needEscaped: false,
    })

    expect(token?.value).toBe('gap-_b20px_B gap-_b20px_B')
  })

  it('reuses the candidate plan for repeated candidates in one literal', () => {
    const literal = getLiteralPath('const repeated = \'w-[100px] w-[100px]\'', 'StringLiteral')
    const spy = vi.spyOn(classNameTransform, 'resolveClassNameTransformWithResult')
    spy.mockClear()

    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: true,
    })

    expect(token?.value).toBe('w-_b100px_B w-_b100px_B')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('reuses replacement cache entries across separate literals with the same escape map', () => {
    const firstLiteral = getLiteralPath('const first = \'h-[37px]\'', 'StringLiteral')
    const secondLiteral = getLiteralPath('const second = \'h-[37px]\'', 'StringLiteral')
    const spy = vi.spyOn(wxmlShared, 'replaceWxml')
    spy.mockClear()

    const firstToken = replaceHandleValue(firstLiteral, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['h-[37px]']),
      needEscaped: true,
    })
    const secondToken = replaceHandleValue(secondLiteral, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['h-[37px]']),
      needEscaped: true,
    })

    expect(firstToken?.value).toBe('h-_b37px_B')
    expect(secondToken?.value).toBe('h-_b37px_B')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('keeps reusing the candidate plan after promoting to a multi-candidate cache', () => {
    const literal = getLiteralPath('const repeated = \'w-[100px] gap-[20px] w-[100px]\'', 'StringLiteral')
    const spy = vi.spyOn(classNameTransform, 'resolveClassNameTransformWithResult')
    spy.mockClear()

    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]', 'gap-[20px]']),
      needEscaped: true,
    })

    expect(token?.value).toBe('w-_b100px_B gap-_b20px_B w-_b100px_B')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('keeps transformed output stable when escaped and skipped candidates coexist', () => {
    const literal = getLiteralPath('const mixed = \'w-[100px] keep-me\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: true,
    })

    expect(token?.value).toBe('w-_b100px_B keep-me')
  })

  it('evaluates unicode decoding guard when no escape is present', () => {
    const literal = getLiteralPath('const plain = \'flex\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['flex']),
      needEscaped: true,
      unescapeUnicode: true,
    })

    expect(token).toBeUndefined()
  })

  it('skips non-arbitrary candidates that are not part of the classNameSet', () => {
    const literal = getLiteralPath('const missing = \'flex\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['bg-red-500']),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('ignores non-arbitrary classes when neither alwaysEscape nor classNameSet applies', () => {
    const literal = getLiteralPath('const untouched = \'flex\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('skips class context detection when the default fast-return branch applies', () => {
    const literal = getLiteralPath('const untouched = \'flex\'', 'StringLiteral')
    const spy = vi.spyOn(classContext, 'isClassContextLiteralPath')

    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
  })

  it('keeps arbitrary classes untouched when classNameSet is non-empty but stale', () => {
    const literal = getLiteralPath('const arbitrary = \'w-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['bg-red-500']),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('does not transform non-set candidates', () => {
    const literal = getLiteralPath('const dotted = \'space-y-2.5\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['space-y-2']),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('keeps url-like tokens untouched when candidate not in classNameSet', () => {
    const literal = getLiteralPath('const url = \'https://foo-bar.com/assets/1.2.3\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['bg-red-500']),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('keeps arbitrary classes untouched when classNameSet is missing', () => {
    const literal = getLiteralPath('const arbitrary = \'w-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('does not escape arbitrary classes when classNameSet is missing', () => {
    const literal = getLiteralPath('const arbitrary = \'w-[100px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('does not escape arbitrary classes when classNameSet is empty', () => {
    const literal = getLiteralPath('const arbitrary = \'bg-[length:200rpx_100rpx]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set<string>(),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('still honours jsPreserveClass when classNameSet is missing', () => {
    const literal = getLiteralPath('const safe = \'biz-token-[alpha]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      jsPreserveClass: candidate => candidate.startsWith('biz-token'),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('matches escaped runtime-set entries for arbitrary utilities', () => {
    const literal = getLiteralPath('const cls = \'flex gap-[20px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['flex', 'gap-_b20px_B']),
      needEscaped: true,
    })

    expect(token?.value).toBe('flex gap-_b20px_B')
  })

  it('does not let legacy auto fallback bypass an empty runtime set', () => {
    const literal = getLiteralPath('const state = { className: \'flex gap-[20px]\' }', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      jsArbitraryValueFallback: 'auto',
      tailwindcssMajorVersion: 4,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('transforms matched arbitrary utilities inside ref array literals when runtime set is fresh', () => {
    const literal = getLiteralPath(
      `import { ref } from 'vue'; const cardsColor = ref(['bg-[#123456] shadow-blue-100'])`,
      'StringLiteral',
      1,
    )
    expect(literal.node.value).toBe('bg-[#123456] shadow-blue-100')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['bg-[#123456]', 'shadow-blue-100']),
      needEscaped: true,
    })

    expect(token).toBeDefined()
    expect(token?.value).toContain('bg-_b_h123456_B')
    expect(token?.value).not.toContain('bg-[#123456]')
  })

  it('keeps non-class strings unchanged with legacy auto fallback', () => {
    const literal = getLiteralPath('const trace = \'at App.vue:4 gap-[20px]\'', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      jsArbitraryValueFallback: 'auto',
      tailwindcssMajorVersion: 4,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('transforms UnoCSS numeric unit classes from classNameSet in explicit class context', () => {
    const literal = getLiteralPath('const state = { className: \'p-10% p-2.5px m-4rem\' }', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['p-10%', 'p-2.5px', 'm-4rem']),
      needEscaped: true,
    })

    expect(token?.value).toBe('p-10_v p-2_d5px m-4rem')
  })

  it('keeps UnoCSS numeric unit fallback disabled by default', () => {
    const literal = getLiteralPath('const state = { className: \'p-10% p-2.5px\' }', 'StringLiteral')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('avoids emitting tokens when the source span collapses', () => {
    const literal = getLiteralPath('const collapsing = \'w-[100px]\'', 'StringLiteral')
    literal.node.start = 0
    literal.node.end = 0

    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['w-[100px]']),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('treats unexpected node types as empty literals', () => {
    const numeric = getNumericLiteralPath('const value = 42')
    const token = replaceHandleValue(numeric, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['42']),
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  // 留空以保持 branch 结构稳定，后续如需新增场景可在此处补充
})
