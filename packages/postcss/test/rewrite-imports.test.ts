import { describe, expect, it, vi } from 'vitest'
import { rewriteTailwindPackageImportStatements } from '../src/compat/tailwindcss-v4/package-import-statements'
import { rewriteCssImportSpecifiers } from '../src/syntax/rewrite-imports'

describe('CSS import 请求改写', () => {
  it('保留参数、引号和无关规则，只调用请求解析回调', () => {
    const resolve = vi.fn((request: string) => request === 'theme' ? './theme.css' : undefined)
    expect(rewriteCssImportSpecifiers('@import url("theme") layer(theme) source(none); @reference "theme"; .a { content: "theme"; }', resolve))
      .toBe('@import "./theme.css" layer(theme) source(none); @reference "theme"; .a { content: "theme"; }')
    expect(resolve).toHaveBeenCalledExactlyOnceWith('theme')
    expect(rewriteCssImportSpecifiers("@reference 'theme';", resolve, { atRuleNames: ['reference'] }))
      .toBe("@reference './theme.css';")
  })

  it('替换内容中的美元符号按字面处理，Windows 路径转成 CSS 请求', () => {
    expect(rewriteCssImportSpecifiers('@import "theme";', () => 'C:\\project\\$&theme.css'))
      .toBe('@import "C:/project/$&theme.css";')
    expect(rewriteCssImportSpecifiers('@import "theme";', () => '/project/$&theme.css'))
      .toBe('@import "/project/$&theme.css";')
  })

  it('没有替换时保留输入；解析失败由调用链显式选择容错', () => {
    expect(rewriteCssImportSpecifiers('  @import "a";\n', () => undefined)).toBe('  @import "a";\n')
    const css = '@import "a"; .broken {'
    expect(() => rewriteCssImportSpecifiers(css, () => 'b')).toThrow()
    expect(rewriteCssImportSpecifiers(css, () => 'b', { tolerateInvalidCss: true })).toBe(css)
  })

  it('预处理器文本仍可改写 Tailwind 包请求，无匹配返回 undefined', () => {
    const css = '$brand: red;\n@import url("tailwindcss/theme.css") layer(theme);\n.a { color: $brand; }'
    expect(rewriteTailwindPackageImportStatements(css, request => `/pkg/${request}`))
      .toBe('$brand: red;\n@import url("/pkg/tailwindcss/theme.css") layer(theme);\n.a { color: $brand; }')
    expect(rewriteTailwindPackageImportStatements('@import "other";', () => '/pkg')).toBeUndefined()
  })
})
