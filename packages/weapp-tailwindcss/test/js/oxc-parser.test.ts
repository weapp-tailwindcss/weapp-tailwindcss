import type { OxcParser } from '@/js/oxc-parser/loader'
import { parseSync } from 'oxc-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseOxcSync } from '@/js/oxc-parser'
import * as loader from '@/js/oxc-parser/loader'

describe('Oxc 解析传输与回退', () => {
  afterEach(() => vi.restoreAllMocks())

  const source = 'const cls = "w-[10px]"'
  const result = parseSync('entry.js', source)
  const options = Object.freeze({ lang: 'js' as const, sourceType: 'module' as const, preserveParens: false })

  function useParser(parser: OxcParser) {
    vi.spyOn(loader, 'loadOxcParser').mockReturnValue(parser)
  }

  it('优先使用 raw transfer 并保留调用方选项', () => {
    const parse = vi.fn<OxcParser['parseSync']>().mockReturnValue(result)
    useParser({ parseSync: parse, rawTransferSupported: () => true })

    expect(parseOxcSync('entry.js', source, options)).toBe(result)
    expect(parse).toHaveBeenCalledExactlyOnceWith('entry.js', source, {
      ...options,
      experimentalRawTransfer: true,
    })
    expect(options).not.toHaveProperty('experimentalRawTransfer')
  })

  it('缓存 raw transfer 能力探测，并允许签名路径固定使用普通 AST', () => {
    const parse = vi.fn<OxcParser['parseSync']>().mockReturnValue(result)
    const rawTransferSupported = vi.fn(() => true)
    useParser({ parseSync: parse, rawTransferSupported })

    parseOxcSync('entry.js', source, options)
    parseOxcSync('runtime.tsx', source, { lang: 'tsx', sourceType: 'unambiguous' }, 'ast')

    expect(rawTransferSupported).toHaveBeenCalledOnce()
    expect(parse).toHaveBeenNthCalledWith(2, 'runtime.tsx', source, { lang: 'tsx', sourceType: 'unambiguous' })
  })

  it.each([
    ['能力检查缺失', undefined],
    ['平台不支持', () => false],
    ['能力检查抛错', () => { throw new Error('capability probe failed') }],
  ] as const)('%s 时直接使用普通解析', (_name, rawTransferSupported) => {
    const parse = vi.fn<OxcParser['parseSync']>().mockReturnValue(result)
    useParser({ parseSync: parse, ...(rawTransferSupported ? { rawTransferSupported } : {}) })

    expect(parseOxcSync('entry.js', source, options)).toBe(result)
    expect(parse).toHaveBeenCalledExactlyOnceWith('entry.js', source, options)
  })

  it('raw transfer 抛错后使用普通解析结果', () => {
    const parse = vi.fn<OxcParser['parseSync']>()
      .mockImplementationOnce(() => { throw new Error('raw transfer failed') })
      .mockReturnValue(result)
    useParser({ parseSync: parse, rawTransferSupported: () => true })

    expect(parseOxcSync('entry.js', source, options)).toBe(result)
    expect(parse).toHaveBeenCalledTimes(2)
    expect(parse).toHaveBeenNthCalledWith(1, 'entry.js', source, { ...options, experimentalRawTransfer: true })
    expect(parse).toHaveBeenNthCalledWith(2, 'entry.js', source, options)
  })

  it.each([false, true])('解析器所有可用路径均抛错时返回 undefined：raw=%s', (rawTransferSupported) => {
    const parse = vi.fn<OxcParser['parseSync']>().mockImplementation(() => {
      throw new Error('parse failed')
    })
    useParser({ parseSync: parse, rawTransferSupported: () => rawTransferSupported })

    expect(parseOxcSync('entry.js', source, options)).toBeUndefined()
    expect(parse).toHaveBeenCalledTimes(rawTransferSupported ? 2 : 1)
  })

  it('原生模块不可用时返回 undefined', () => {
    const load = vi.spyOn(loader, 'loadOxcParser').mockReturnValue(undefined)

    expect(parseOxcSync('entry.js', source, options)).toBeUndefined()
    expect(load).toHaveBeenCalledOnce()
  })

  it.each(['\uD800', '\uDC00'])('输入的孤立代理字符 %s 交还 Babel，避免 UTF-8 有损转换', (character) => {
    const load = vi.spyOn(loader, 'loadOxcParser')
    expect(parseOxcSync('entry.js', `const cls = "${character} w-[10px]"`, options)).toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })

  it('语法错误保留诊断且不重复解析', () => {
    const invalidSource = 'const broken ='
    const invalidResult = parseSync('entry.js', invalidSource)
    const parse = vi.fn<OxcParser['parseSync']>().mockReturnValue(invalidResult)
    useParser({ parseSync: parse, rawTransferSupported: () => true })

    expect(parseOxcSync('entry.js', invalidSource, options)).toBe(invalidResult)
    expect(invalidResult.errors.length).toBeGreaterThan(0)
    expect(parse).toHaveBeenCalledOnce()
  })

  it.each([
    ['entry.js', 'const text = "中文😀"; const cls = "w-[10px]"'],
    ['entry.ts', 'type Size = "w-[10px]"; const cls: Size = "w-[10px]"'],
    ['entry.tsx', 'const view = <view className="w-[10px]"> 中文😀 </view>'],
    ['entry.js', 'const cls = "w-\\u005b10px\\u005d"'],
    // eslint-disable-next-line no-template-curly-in-string -- 被测源码需要保留模板插值。
    ['entry.js', 'const cls = `😀 w-[10px] ${active ? `h-[20px]` : "m-[30px]"}`'],
    ['entry.js', 'import value from "./source"; export { value }; export * from "./other"'],
    ['entry.js', '#!/usr/bin/env node\n// w-[10px]\n/* h-[20px] */ const n = 1n; const re = /foo/g'],
    ['entry.js', 'const broken = "w-[10px]'],
  ])('真实解析器保持 AST、模块、注释与诊断一致：%s %s', (filename, text) => {
    const parserOptions = { sourceType: 'unambiguous' as const, preserveParens: false }
    const expected = parseSync(filename, text, parserOptions)
    const actual = parseOxcSync(filename, text, parserOptions)

    expect(actual).toBeDefined()
    expect(actual?.program).toEqual(expected.program)
    expect(actual?.module).toEqual(expected.module)
    expect(actual?.comments).toEqual(expected.comments)
    expect(actual?.errors).toEqual(expected.errors)
  })
})
