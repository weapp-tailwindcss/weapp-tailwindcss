import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { normalizeCssSnapshot } from './snapshotUtils'

function declarations(css: string, selector: string) {
  const result: Array<[string, string, boolean]> = []
  postcss.parse(css).walkRules(selector, (rule) => {
    for (const node of rule.nodes) {
      if (node.type === 'decl') {
        result.push([node.prop, node.value, Boolean(node.important)])
      }
    }
  })
  return result
}

describe('CSS 快照声明顺序', () => {
  it('去重后仍保留用户最后一次覆盖的声明顺序', () => {
    const css = normalizeCssSnapshot('.theme { --accent: red; --accent: blue; --accent: red; color: red; color: blue; color: red; }')
    expect(declarations(css, '.theme')).toEqual([
      ['--accent', 'blue', false],
      ['--accent', 'red', false],
      ['color', 'blue', false],
      ['color', 'red', false],
    ])
  })

  it('区分 important 与普通声明并保留各自的最后一次覆盖', () => {
    const css = normalizeCssSnapshot('.theme { color: red !important; color: blue !important; color: red; color: red !important; }')
    expect(declarations(css, '.theme')).toEqual([
      ['color', 'blue', true],
      ['color', 'red', false],
      ['color', 'red', true],
    ])
  })

  it('父规则去重不会删除嵌套规则或条件内的同名声明', () => {
    const css = normalizeCssSnapshot('.theme { --accent: red; @media (prefers-color-scheme: dark) { --accent: red; } & .child { --accent: red; } --accent: blue; --accent: red; }')
    expect(declarations(css, '.theme')).toEqual([
      ['--accent', 'blue', false],
      ['--accent', 'red', false],
    ])
    expect(declarations(css, '& .child')).toEqual([['--accent', 'red', false]])
    const conditionalValues: string[] = []
    postcss.parse(css).walkAtRules('media', (rule) => {
      rule.walkDecls('--accent', (decl) => {
        conditionalValues.push(decl.value)
      })
    })
    expect(conditionalValues).toEqual(['red'])
  })
})
