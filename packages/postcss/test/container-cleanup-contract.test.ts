import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { removeEmptyBlockAtRules } from '@/compat/mini-program-css/root-cleanups'
import { splitUnresolvedAuthorVariableFallbacks } from '@/compat/uni-app-x-uvue/theme'

describe('Root 与 Document 的清理契约', () => {
  it('多轮清理嵌套空块时保留独立 Root、非空块与来源', () => {
    const first = postcss.parse('@media a{@supports (a:b){}}.a{color:red}', { from: 'first.css' })
    const second = postcss.parse('@media b{}@charset "utf-8";/* keep */', { from: 'second.css' })
    const firstRule = first.last
    const charset = second.nodes[1]
    const input = firstRule?.source?.input
    const document = postcss.document({ nodes: [first, second, postcss.root()] })

    expect(removeEmptyBlockAtRules(document)).toBe(2)
    expect(removeEmptyBlockAtRules(document)).toBe(1)
    expect(removeEmptyBlockAtRules(document)).toBe(0)
    expect(document.nodes).toEqual([first, second, expect.objectContaining({ type: 'root', nodes: [] })])
    expect(first.first).toBe(firstRule)
    expect(firstRule?.source?.input).toBe(input)
    expect(second.first).toBe(charset)
    expect(document.toString()).toBe('.a{color:red}@charset "utf-8";/* keep */')
  })

  it('跨 Root 拆分作者 fallback，保留只读变量表、原声明和各自 Input', () => {
    const first = postcss.parse('.a{width:var(--width, 2px);height:var(--known, 3px)}', { from: 'first.css' })
    const second = postcss.parse('.b{width:var(--width, 5px);--local:var(--other, 6px)}', { from: 'second.css' })
    const declarations: postcss.Declaration[] = []
    first.walkDecls((decl) => {
      declarations.push(decl)
    })
    second.walkDecls((decl) => {
      declarations.push(decl)
    })
    const inputs = declarations.map(decl => decl.source?.input)
    const variables = new Map([['--known', '9px']])
    const document = postcss.document({ nodes: [first, second] })

    expect(splitUnresolvedAuthorVariableFallbacks(document, variables)).toBe(true)
    expect(splitUnresolvedAuthorVariableFallbacks(document, variables)).toBe(false)
    expect(document.nodes).toEqual([first, second])
    expect(first.toString()).toBe('.a{width:2px;width:var(--width);height:var(--known, 3px)}')
    expect(second.toString()).toBe('.b{width:5px;width:var(--width);--local:var(--other, 6px)}')
    expect(declarations.map(decl => decl.source?.input)).toEqual(inputs)
    expect(declarations.every(decl => decl.parent !== undefined)).toBe(true)
    expect(first.first?.type === 'rule' && first.first.first?.source?.input).toBe(inputs[0])
    expect(second.first?.type === 'rule' && second.first.first?.source?.input).toBe(inputs[2])
    expect([...variables]).toEqual([['--known', '9px']])
  })

  it('单 Root 与空 Document 保留计数和 changed 契约', () => {
    const root = postcss.parse('@media a{}.a{width:var(--width, 2px)}')
    expect(removeEmptyBlockAtRules(root)).toBe(1)
    expect(splitUnresolvedAuthorVariableFallbacks(root, new Map())).toBe(true)
    const empty = postcss.document()
    expect(removeEmptyBlockAtRules(empty)).toBe(0)
    expect(splitUnresolvedAuthorVariableFallbacks(empty, new Map())).toBe(false)
  })
})
