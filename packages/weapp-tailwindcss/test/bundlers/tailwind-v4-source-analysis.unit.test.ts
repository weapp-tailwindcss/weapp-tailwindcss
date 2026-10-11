import { describe, expect, it, vi } from 'vitest'
import { postcss } from '@weapp-tailwindcss/postcss'
import { selectTailwindV4GenerationCssSourceForOutput } from '@/bundlers/vite/generate-bundle/tailwind-v4-css-source'

describe('入口指纹复用', () => {
  it('候选匹配只解析一次原始输出，下一次选择使用当前源码', () => {
    const entries = [
      { file: 'a.css', source: '@theme { --color-a: red; }' },
      { file: 'b.css', source: '@theme { --color-b: blue; }' },
    ]
    const raw = ':root { --color-b: blue; }'
    const parse = vi.spyOn(postcss, 'parse')
    try {
      expect(selectTailwindV4GenerationCssSourceForOutput('output.css', entries, raw)).toBe(entries[1])
      expect(parse.mock.calls.filter(([css]) => css === raw)).toHaveLength(1)
      entries[0]!.source = '@theme { --color-b: blue; }'
      entries[1]!.source = '@theme { --color-a: red; }'
      expect(selectTailwindV4GenerationCssSourceForOutput('output.css', entries, raw)).toBe(entries[0])
      expect(parse.mock.calls.filter(([css]) => css === raw)).toHaveLength(2)
    }
    finally {
      parse.mockRestore()
    }
  })
})
