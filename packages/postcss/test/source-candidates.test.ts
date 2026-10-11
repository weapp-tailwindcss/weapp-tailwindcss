import { afterEach, describe, expect, it, vi } from 'vitest'
import { postcss } from '../src/postcss-runtime'
import { collectCssApplyCandidates, collectGeneratorCssCandidates, collectRuntimeApplyCandidates } from '../src/source-scan/candidates'

afterEach(() => vi.restoreAllMocks())

describe('CSS 候选分析', () => {
  it('合并 apply 与 inline，并应用排除规则', () => {
    expect(collectGeneratorCssCandidates(`
      @source inline("w-{1..3} hover:{flex,grid}");
      @source not inline("w-2 flex");
      .card { @apply flex p-4; content: "w-8"; }
    `)).toEqual(['hover:flex', 'hover:grid', 'p-4', 'w-1', 'w-3'])
    expect(collectCssApplyCandidates('@source inline("w-1"); .card { @apply p-4 flex p-4; }'))
      .toEqual(['flex', 'p-4'])
  })

  it.each(['@reference "./theme.css";', '@import "theme";', '@tailwind utilities;'])(
    '运行时复用一次解析，并支持后置上下文 %s',
    (context) => {
      const parse = vi.spyOn(postcss, 'parse')
      expect(collectRuntimeApplyCandidates(`.card { @apply p-4 flex!important p-4 !important; } ${context}`))
        .toEqual(['p-4', 'flex'])
      expect(parse).toHaveBeenCalledTimes(1)
    },
  )

  it('不把普通样式、注释或无上下文 apply 当成运行时候选', () => {
    expect(collectRuntimeApplyCandidates('.card { @apply flex; }')).toEqual([])
    expect(collectRuntimeApplyCandidates('@theme { --spacing: 1px; } .card { @apply flex; }')).toEqual([])
    expect(collectRuntimeApplyCandidates('/* @import "theme"; */ .card { @apply flex; }')).toEqual([])
    const parse = vi.spyOn(postcss, 'parse')
    expect(collectRuntimeApplyCandidates('@import "theme"; .card { color: red; }')).toEqual([])
    expect(parse).not.toHaveBeenCalled()
  })

  it('无效 CSS 不产生部分候选', () => {
    const css = '@import "theme"; .card { @apply flex;'
    expect(collectCssApplyCandidates(css)).toEqual([])
    expect(collectGeneratorCssCandidates(css)).toEqual([])
    expect(collectRuntimeApplyCandidates(css)).toEqual([])
  })

  it('大输入仍执行完整扫描，不跨调用保留旧候选', () => {
    const css = Array.from({ length: 1000 }, (_, index) => `.u${index} { @apply p-${index}; }`).join('\n')
    expect(collectRuntimeApplyCandidates(`${css}\n@reference "theme";`)).toHaveLength(1000)
    expect(collectRuntimeApplyCandidates('@reference "theme"; .new { @apply grid; }')).toEqual(['grid'])
  })
})
