import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import { jsHandler } from '@/js/babel'
import { getOxcSourceAnalysis } from '@/js/fast-path/analysis'
import { oxcJsHandler } from '@/js/fast-path/oxc'

afterEach(() => vi.unstubAllEnvs())

// 普通单测不依赖本机编译；native CI 显式要求真实 binding，并执行同一矩阵。
const modes = process.env.WEAPP_TW_NATIVE === 'required' ? ['off', 'required'] : ['off']

describe.each(modes)('解析选项权威与 eval 兼容：%s', (mode) => {
  it('sourceFilename 元数据不阻止快速路径', () => {
    vi.stubEnv('WEAPP_TW_NATIVE', mode)
    const source = 'const cls = value === "w-[10px]" ? "w-[10px]" : "plain"'
    const options = {
      experimentalJsFastPath: 'oxc' as const,
      babelParserOptions: { sourceFilename: 'entry.js' },
      classNameSet: new Set(['w-[10px]']),
    }
    expect(oxcJsHandler(source, options)?.code).toBe(jsHandler(source, options).code)
  })

  it('JS 与 TS 模板正文的空片段具有相同分析结果', () => {
    vi.stubEnv('WEAPP_TW_NATIVE', mode)
    // eslint-disable-next-line no-template-curly-in-string -- 覆盖空的首尾片段。
    const source = 'const cls = `${value}w-[10px]${other}`'
    const javascript = getOxcSourceAnalysis(source, {})
    const typescript = getOxcSourceAnalysis(source, { babelParserOptions: { plugins: ['typescript'] } })
    expect(javascript?.literals).toHaveLength(1)
    expect(typescript).toEqual(javascript)
  })

  it.each([
    { source: 'export default "w-[10px]"', filename: 'entry.js' },
    { source: 'const x: string = "w-[10px]"', filename: 'entry.ts' },
    { source: 'const x = <view className="w-[10px]" />', filename: 'entry.jsx' },
  ])('文件名不能放宽 Babel 解析规则：$filename', ({ source, filename }) => {
    vi.stubEnv('WEAPP_TW_NATIVE', mode)
    const options = { filename, experimentalJsFastPath: 'oxc' as const }
    const result = createJsHandler(options)(source, new Set(['w-[10px]']), options)
    const babel = jsHandler(source, options)
    expect(babel.error).toBeDefined()
    expect(result.code).toBe(babel.code)
    expect(result.error).toBeDefined()
  })

  it.each(['eval ', 'eval/**/', 'eval\n'])('eval 调用必须由 Babel 处理：%s', (callee) => {
    vi.stubEnv('WEAPP_TW_NATIVE', mode)
    const source = `${callee}(${JSON.stringify('const x = mode === "w-[10px]" ? "w-[10px]" : ""')})`
    const classes = new Set(['w-[10px]'])
    const options = { experimentalJsFastPath: 'oxc' as const, classNameSet: classes }
    expect(createJsHandler(options)(source, classes).code).toBe(jsHandler(source, options).code)
  })

  it('unambiguous 与缓存控制选项保留脚本语义', () => {
    vi.stubEnv('WEAPP_TW_NATIVE', mode)
    const source = 'with (scope) { const cls = "w-[10px]" }'
    const options = {
      experimentalJsFastPath: 'oxc' as const,
      babelParserOptions: { sourceType: 'unambiguous' as const, cache: true, cacheKey: 'contract' },
      classNameSet: new Set(['w-[10px]']),
    }
    const expected = jsHandler(source, options)
    expect(expected.error).toBeUndefined()
    expect(createJsHandler(options)(source, options.classNameSet).code).toBe(expected.code)
  })
})
