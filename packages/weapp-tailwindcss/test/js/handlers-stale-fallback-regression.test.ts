import type { NodePath } from '@babel/traverse'
import type { StringLiteral } from '@babel/types'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { parse, traverse } from '@/babel'
import { replaceHandleValue } from '@/js/handlers'

function getStringLiteralPath(code: string) {
  const ast = parse(code, {
    sourceType: 'module',
  })
  let result: NodePath<StringLiteral> | undefined

  traverse(ast, {
    StringLiteral(path: NodePath<StringLiteral>) {
      if (!result) {
        result = path
        path.stop()
      }
    },
  })

  if (!result) {
    throw new Error('Unable to locate StringLiteral in provided code snippet.')
  }

  return result
}

describe('replaceHandleValue strict class set regressions', () => {
  it('keeps source-location tokens untouched and only transforms classNameSet hits', () => {
    const literal = getStringLiteralPath('const trace = "at App.vue:4 index.ts:120:3 Foo.jsx:8 hover:bg-red-500 w-[1.5px]"')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['hover:bg-red-500']),
      needEscaped: true,
    })

    expect(token?.value).toBe('at App.vue:4 index.ts:120:3 Foo.jsx:8 hover_cbg-red-500 w-[1.5px]')
    expect(token?.value).not.toContain('App_dvue_c4')
    expect(token?.value).not.toContain('index_dts_c120_c3')
    expect(token?.value).toContain('w-[1.5px]')
  })

  it('does not transform arbitrary values without classNameSet hits', () => {
    const literal = getStringLiteralPath('const trace = "at App.vue:4 w-[1.5px]"')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })

  it('still transforms known utility candidates from classNameSet', () => {
    const literal = getStringLiteralPath('const cls = "hover:bg-red-500"')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      classNameSet: new Set(['hover:bg-red-500']),
      needEscaped: true,
    })

    expect(token?.value).toBe('hover_cbg-red-500')
  })

  it('does not transform non-set candidates', () => {
    const literal = getStringLiteralPath('const cls = "w-[1.5px]"')
    const token = replaceHandleValue(literal, {
      escapeMap: MappingChars2String,
      needEscaped: true,
    })

    expect(token).toBeUndefined()
  })
})
