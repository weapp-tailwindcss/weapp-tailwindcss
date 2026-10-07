import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { createJsHandler } from '@/js'
import { jsHandler } from '@/js/babel'
import { getOxcSourceAnalysis } from '@/js/fast-path/analysis'

describe('Oxc script 语法约束', () => {
  it.each([
    'export default "w-[10px]"',
    'export const cls = "w-[10px]"',
    'const cls = "w-[10px]"; export { cls }',
    'export * from "w-[10px]"',
    'import cls from "w-[10px]"',
  ])('静态 ESM 声明交给 Babel 处理：%s', (source) => {
    const options = {
      experimentalJsFastPath: 'oxc' as const,
      generateMap: false,
      classNameSet: new Set(['w-[10px]']),
      escapeMap: MappingChars2String,
      babelParserOptions: { sourceType: 'script' as const },
    }
    expect(getOxcSourceAnalysis(source, options)).toBeUndefined()
    const actual = createJsHandler(options)(source, options.classNameSet, options)
    expect(actual.code).toBe(jsHandler(source, options).code)
  })
})
