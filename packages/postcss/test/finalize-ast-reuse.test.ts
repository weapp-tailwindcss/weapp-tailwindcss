import { describe, expect, it, vi } from 'vitest'
import { finalizeMiniProgramCss } from '@/compat/mini-program-css/finalize'
import { postcss } from '@/index'

describe('最终清理共用 AST', () => {
  it('有效 CSS 只解析一次，仍清理不支持的 at-rule 和空容器', () => {
    const parse = vi.spyOn(postcss, 'parse')
    try {
      const result = finalizeMiniProgramCss('@supports(display:grid){.grid{display:grid}}@media screen{}@layer utilities{.a:not(#n){color:red}}', { isTailwindcssV4: false, cssPreflight: {} })
      expect(parse).toHaveBeenCalledTimes(1)
      expect(result).toBe('.a{color:red}')
    }
    finally {
      parse.mockRestore()
    }
  })

  it('不支持区块中的无效语法仍可经扫描修复后完成平台清理', () => {
    const result = finalizeMiniProgramCss('@supports(display:grid){broken}.a:not(#n){color:red}', { isTailwindcssV4: false, cssPreflight: {} })
    expect(result).toBe('.a{color:red}')
  })

  it('扫描后仍无法解析时保持原来的占位符字符串兜底', () => {
    const result = finalizeMiniProgramCss('.a:not(#n){color:', { isTailwindcssV4: false, cssPreflight: {} })
    expect(result).toBe('.a{color:')
  })
})
