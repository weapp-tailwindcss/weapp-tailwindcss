import { describe, expect, it } from 'vitest'
import { collectCssApplyCandidates, collectGeneratorCssCandidates } from '@/generation/candidates'

describe('generator CSS candidates', () => {
  it('只收集结构化 Tailwind CSS 宏候选', () => {
    const candidates = collectGeneratorCssCandidates(`
      @import "tailwindcss" source(none);
      @source inline("w-{1..2} ease-spring");
      @source not inline("w-2");

      .card {
        animation: wiggle 1s ease-in-out infinite;
        transform: scale(0.96);
        @apply flex hover:bg-blue-500;
      }
    `)

    expect(candidates).toEqual([
      'ease-spring',
      'flex',
      'hover:bg-blue-500',
      'w-1',
    ])
    expect(candidates).not.toContain('ease-in-out')
    expect(candidates).not.toContain('transform')
    expect(collectCssApplyCandidates(`
      @source inline("w-1");
      .card { @apply flex hover:bg-blue-500; }
    `)).toEqual(['flex', 'hover:bg-blue-500'])
  })

  it('解析失败时不回退到普通文本扫描', () => {
    expect(collectGeneratorCssCandidates('.broken { color: red;')).toEqual([])
  })
})
