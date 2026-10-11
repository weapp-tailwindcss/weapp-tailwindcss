import { describe, expect, it, vi } from 'vitest'
import * as inlineSource from '../src/source-scan/inline-source'
import { analyzeTailwindV4EntrySource } from '../src/source-scan/tailwind-v4/entry-source'

describe('Tailwind 入口语义分析', () => {
  it('合并入口指令，保持声明顺序、去重和 inline 排除', () => {
    const result = analyzeTailwindV4EntrySource(`
      @config "./theme.js";
      @import "tailwindcss/utilities.css" source(none);
      @source "./pages";
      @source not "./pages/ignored/**";
      @source inline("w-{1..3}");
      @source not inline("w-2");
      @config "./theme.js";
      @import url("tailwindcss") source("./components");
    `)
    expect(result?.configRequests).toEqual(['./theme.js'])
    expect(result?.getSourceDirectives()).toEqual({
      sourceRequests: [
        { sourcePath: './pages', negated: false },
        { sourcePath: './pages/ignored/**', negated: true },
      ],
      importSourcePath: './components',
      hasSourceNone: true,
      hasTailwindCssImport: true,
      includesPreflight: true,
      inlineCandidates: { included: new Set(['w-1', 'w-3']), excluded: new Set(['w-2']) },
    })
  })

  it('保留最后一个 source 路径，普通 import 不改变 Tailwind 入口', () => {
    const result = analyzeTailwindV4EntrySource('@import "tailwindcss4" source("./first"); @import "tailwindcss/theme.css" source("./last"); @import "other" source("./ignored");')
    expect(result?.getSourceDirectives().importSourcePath).toBe('./last')
    expect(result?.getSourceDirectives().includesPreflight).toBe(true)
    expect(analyzeTailwindV4EntrySource('@import "other";')?.getSourceDirectives().hasTailwindCssImport).toBe(false)
    expect(analyzeTailwindV4EntrySource('@tailwind base;')?.getSourceDirectives().includesPreflight).toBe(true)
    expect(analyzeTailwindV4EntrySource('@tailwind utilities;')?.getSourceDirectives().includesPreflight).toBe(false)
  })

  it('普通字符串、注释和非法 CSS 不产生伪入口', () => {
    const result = analyzeTailwindV4EntrySource('/* @config "x"; */ .a { content: "@source inline(flex)"; }')
    expect(result?.configRequests).toEqual([])
    expect(result?.getSourceDirectives().sourceRequests).toEqual([])
    expect(result?.getSourceDirectives().inlineCandidates.included.size).toBe(0)
    expect(analyzeTailwindV4EntrySource('@config "x"; .a {')).toBeUndefined()
  })

  it('只读取配置依赖时不展开 inline，实际扫描复用同一结果', () => {
    const collect = vi.spyOn(inlineSource, 'collectCssInlineSourceCandidates')
    try {
      const result = analyzeTailwindV4EntrySource('@config "./theme.js"; @source inline("w-{1..1000}");')
      expect(result?.configRequests).toEqual(['./theme.js'])
      expect(collect).not.toHaveBeenCalled()
      const directives = result?.getSourceDirectives()
      expect(directives?.inlineCandidates.included.size).toBe(1000)
      expect(result?.getSourceDirectives()).toBe(directives)
      expect(collect).toHaveBeenCalledTimes(1)
    }
    finally {
      collect.mockRestore()
    }
  })
})
