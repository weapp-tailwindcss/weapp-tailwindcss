import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { normalizeMiniProgramGeneratedCssForPostcss, pruneMiniProgramGeneratedCss } from '../src'

describe('generated CSS AST lifecycle', () => {
  it('keeps nesting, selector preparation and pruning in one PostCSS tree', async () => {
    const parse = vi.spyOn(postcss, 'parse')
    const stringifyRoot = vi.spyOn(postcss.Root.prototype, 'toString')
    try {
      const css = await normalizeMiniProgramGeneratedCssForPostcss([
        '/* 浏览器规则必须裁剪，业务 class 身份必须保留。 */',
        '@supports (display:grid){.unsupported{display:grid}}',
        '.group-variant{&:is(:where(.group) *){display:block}}',
        '.content-\\[\\*\\][data-value="*"]{content:"*"}',
        ...Array.from({ length: 1000 }, (_, index) => `.utility-${index}{color:rgb(0,0,0)}`),
      ].join('\n'), { preserveRawClassRules: true })

      expect(css).toContain('.group-variant:is(:where(.group) :is(view,text))')
      expect(css).toContain('.content-\\[\\*\\][data-value="*"]{content:"*"}')
      expect(css).toContain('.utility-999')
      expect(css).not.toContain('@supports')
      expect(css).not.toContain('/*')
      // 大输入不能在嵌套展开后经字符串重建第二棵 AST 或提前整树序列化。
      expect(parse.mock.calls.length).toBe(0)
      expect(stringifyRoot.mock.calls.length).toBe(0)
    }
    finally {
      parse.mockRestore()
      stringifyRoot.mockRestore()
    }
  })

  it('preserves the standalone string pruning boundary', () => {
    const parse = vi.spyOn(postcss, 'parse')
    try {
      const css = pruneMiniProgramGeneratedCss('/* 裁剪 */.utility{display:block}body{margin:0}')
      expect(css).toBe('.utility{display:block}')
      expect(parse).toHaveBeenCalledTimes(1)
    }
    finally {
      parse.mockRestore()
    }
  })
})
