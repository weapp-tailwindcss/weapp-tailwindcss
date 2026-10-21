import type { Root } from 'postcss'
import { expect } from 'vitest'

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim()
}

export function classSelector(candidate: string) {
  return `.${candidate.replace(/([^\w-])/g, '\\$1')}`
}

export function expectColorDeclarations(root: Root, selector: string, property: string, expected: string[], condition?: RegExp) {
  const values: string[] = []
  let hasUnconditionalFallback = false
  root.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) {
      return
    }
    for (const decl of rule.nodes) {
      if (decl.type !== 'decl' || decl.prop !== property) {
        continue
      }
      values.push(normalize(decl.value))
      let parent = decl.parent
      let modernConditional = false
      const conditions: string[] = []
      while (parent) {
        modernConditional ||= parent.type === 'atrule'
          && parent.name === 'supports'
          && /color-mix|oklch|oklab|lab|lch|display-p3/i.test(parent.params)
        if (parent.type === 'atrule') {
          conditions.push(normalize(`@${parent.name}${parent.params}`))
        }
        parent = parent.parent
      }
      if (condition) {
        expect(conditions.join(' '), `${selector} ${property} 必须保留目标条件`).toMatch(condition)
      }
      hasUnconditionalFallback ||= !modernConditional && normalize(decl.value) === normalize(expected[0]!)
    }
  })
  const sequence = values.filter((value, index) => !index || value !== values[index - 1])
  expect(sequence, `${selector} ${property} 的完整声明顺序必须与合同一致`).toEqual(expected.map(normalize))
  expect(hasUnconditionalFallback, `${selector} ${property} 的静态 fallback 不应依赖现代颜色 @supports`).toBe(true)
}

export function dynamicAlphaMix(color: string, alpha: string) {
  return `color-mix(in oklab, ${color} var(${alpha}), transparent)`
}

export const runtimeColors = [
  { fallback: 'rgb(251, 44, 54)', dynamic: 'oklch(63.7% 0.237 25.331)' },
  { fallback: 'rgba(0, 148, 136, 0.2)', dynamic: 'color-mix(in oklab, oklch(60% 0.118 184.704) 20%, transparent)' },
  { fallback: '#123456', dynamic: '#123456' },
]
