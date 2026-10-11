import { postcss } from '@weapp-tailwindcss/postcss'
import { expect } from 'vitest'

export function assertMiniProgramPreflight(css: string) {
  const selectors = new Set(['view', 'text', '::after', '::before'])
  const declarations: Record<string, string> = {}
  postcss.parse(css).walkRules((rule) => {
    if (rule.selectors.length !== selectors.size || !rule.selectors.every(selector => selectors.has(selector.trim()))) {
      return
    }
    rule.each((node) => {
      if (node.type === 'decl') {
        declarations[node.prop] = node.value
      }
    })
  })
  expect(declarations).toMatchObject({
    'border': '0 solid',
    'box-sizing': 'border-box',
    'margin': '0',
    'padding': '0',
  })
}
