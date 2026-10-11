import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { createJsHandler } from '@/js'
import { jsHandler } from '@/js/babel'
import { oxcJsHandler } from '@/js/fast-path/oxc'

describe('Oxc 升级的字面量位置与回退契约', () => {
  const options = {
    escapeMap: MappingChars2String,
    classNameSet: new Set(['w-[100px]']),
    experimentalJsFastPath: 'oxc' as const,
    generateMap: false,
    filename: 'component.tsx',
    babelParserOptions: { sourceType: 'module' as const, plugins: ['typescript', 'jsx'] as any },
  }

  it('非 BMP 字符之后仍按源码位置转换 TSX、模板和转义字面量', () => {
    // eslint-disable-next-line no-template-curly-in-string -- 保留待解析源码中的模板插值，不能由测试进程提前求值。
    const source = 'const title = "中文😀"; const value = <view className="w-[100px] h-[20px]"/>; const text = `😀 ${title} w-[100px]`;'
    const fast = oxcJsHandler(source, options)
    expect(fast).toBeDefined()
    expect(fast?.code).toBe(source.replaceAll('w-[100px]', 'w-_b100px_B'))
    expect(fast?.code).toBe(jsHandler(source, options).code)
  })

  it('首次请求 source map 时通过 Babel 返回完整转换与映射', () => {
    const source = 'const title = "😀";\nconst cls = "w-[100px] h-[20px]";'
    const mapped = { ...options, generateMap: true }
    expect(oxcJsHandler(source, mapped)).toBeUndefined()
    const actual = createJsHandler(mapped)(source, mapped.classNameSet, mapped)
    const expected = jsHandler(source, mapped)
    expect(actual.code).toBe(source.replace('w-[100px]', 'w-_b100px_B'))
    expect(actual.map?.mappings).toBeTruthy()
    expect(actual.map?.toString()).toBe(expected.map?.toString())
  })
})
