import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { createJsHandler } from '@/js'
import { jsHandler } from '@/js/babel'
import { getOxcSourceAnalysis } from '@/js/fast-path/analysis'
import { oxcJsHandler } from '@/js/fast-path/oxc'
import { classContextEdgeCases } from '../helpers/class-context-edge-cases'

describe.each(['js', 'jsx', 'ts', 'tsx'])('Oxc 的 %s class 上下文来自解析后的 AST', (lang) => {
  const options = {
    experimentalJsFastPath: 'oxc' as const,
    filename: `entry.${lang}`,
    classNameSet: new Set(['pages/home', 'w-[10px]']),
    escapeMap: MappingChars2String,
    babelParserOptions: { sourceType: 'module' as const, plugins: ['typescript', 'jsx'] as ('typescript' | 'jsx')[] },
  }

  it.each(classContextEdgeCases)('保留转义、名称规范化与注释语义：%s', (source) => {
    const expected = jsHandler(source, options)
    expect(expected.error).toBeUndefined()
    expect(expected.code).toContain('pages_fhome')
    expect(oxcJsHandler(source, options)?.code).toBe(expected.code)
    expect(createJsHandler(options)(source, options.classNameSet, options).code).toBe(expected.code)
    expect(getOxcSourceAnalysis(source, options)?.literals.find(literal => literal.value === 'pages/home')?.classContext).toBe(true)
  })

  it.each([
    'const x = "pages\\u002fhome"',
    'const x = { route: "pages\\x2fhome" }',
    'const x = cn?.("pages/home")',
  ])('普通业务路径和 optional helper 保持原样：%s', (source) => {
    expect(jsHandler(source, options).code).toBe(source)
    expect(oxcJsHandler(source, options)?.code).toBe(source)
    expect(createJsHandler(options)(source, options.classNameSet, options).code).toBe(source)
  })

  it('class 上下文事实不依赖字面量是否包含明文斜杠', () => {
    const analysis = getOxcSourceAnalysis('const x = { className: "w-[10px]" }', options)
    expect(analysis?.literals.find(literal => literal.value === 'w-[10px]')?.classContext).toBe(true)
  })
})
