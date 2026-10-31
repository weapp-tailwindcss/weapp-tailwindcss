import { describe, expect, it, vi } from 'vitest'
import { hasLocalCssImport, hasTailwindApplyDirective, hasTailwindNonRootGenerationDirectives, hasTailwindRootDirectives, hasTailwindSourceDirectives, postcss } from '../src/transform'

describe('生成指令的源码分析复用', () => {
  it('同一输入的多个规划查询只解析一次，并且按完整内容失效', () => {
    const parse = vi.spyOn(postcss, 'parse')
    try {
      const source = '@reference "./cache-fixture-theme.css";.cache-fixture{@apply flex}'
      expect(hasTailwindSourceDirectives(source)).toBe(true)
      expect(hasTailwindApplyDirective(source)).toBe(true)
      expect(hasTailwindNonRootGenerationDirectives(source)).toBe(true)
      expect(hasLocalCssImport(source)).toBe(false)
      expect(parse).toHaveBeenCalledOnce()
      expect(hasLocalCssImport(`${source}@import "./cache-fixture-new.css";`)).toBe(true)
      expect(parse).toHaveBeenCalledTimes(2)
    }
    finally {
      parse.mockRestore()
    }
  })

  it('隔离 import fallback 配置，并保留生成标记的 layer 语义', () => {
    const source = '@import "weapp-tailwindcss/utilities";.cache-option{}'
    expect(hasTailwindSourceDirectives(source, { importFallback: false })).toBe(false)
    expect(hasTailwindSourceDirectives(source, { importFallback: true })).toBe(true)
    expect(hasTailwindSourceDirectives(source, { importFallback: false })).toBe(false)
    const layer = '@layer theme{page{--cache-layer:1}}'
    expect(hasTailwindSourceDirectives(layer)).toBe(true)
    expect(hasTailwindSourceDirectives(`/*! tailwindcss v4.3.3 */${layer}`)).toBe(false)
  })

  it('保留解析失败后的预处理器 fallback，以及无指令的占位标记语义', () => {
    const broken = '@config "./cache-failure.cjs";\n.bad {'
    expect(hasLocalCssImport(broken)).toBe(false)
    expect(hasTailwindSourceDirectives(broken)).toBe(true)
    expect(hasTailwindRootDirectives(broken)).toBe(true)
    const placeholder = '/*! weapp-tailwindcss generator-placeholder */'
    expect(hasTailwindSourceDirectives(placeholder)).toBe(true)
    expect(hasTailwindNonRootGenerationDirectives(placeholder)).toBe(true)
  })

  it('普通声明无需解析即可确认没有指令，注释中的指令不会变成真信号', () => {
    const parse = vi.spyOn(postcss, 'parse')
    try {
      expect(hasTailwindNonRootGenerationDirectives('view,text{--tw-leading:var(--weapp-tw-invalid-reset)}')).toBe(false)
      expect(parse).not.toHaveBeenCalled()
      expect(hasTailwindApplyDirective('/* @apply flex; */.cache-comment{color:red}')).toBe(false)
    }
    finally {
      parse.mockRestore()
    }
  })
})
