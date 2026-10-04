import type { NativeCompiler } from '@/native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  load: vi.fn<() => NativeCompiler | undefined>(),
  compiler: {
    tokenizeWxml: vi.fn<NativeCompiler['tokenizeWxml']>(),
    analyzeJs: vi.fn<NativeCompiler['analyzeJs']>(),
    jsRuntimeSignature: vi.fn<NativeCompiler['jsRuntimeSignature']>(),
  },
}))
vi.mock('@/native', () => ({ loadNativeCompiler: native.load }))

const source = 'const cls = "w-[100px]"'
const facts = {
  literals: [{ kind: 'string' as const, start: 12, end: source.length, value: 'w-[100px]', isConditionTest: false }],
  hasModuleDeclarations: false,
  hasTaggedTemplate: false,
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  native.load.mockReturnValue(native.compiler)
  native.compiler.analyzeJs.mockReturnValue(null)
  native.compiler.jsRuntimeSignature.mockReturnValue(null)
})
afterEach(() => vi.restoreAllMocks())

describe('Rust JS 分析与缓存边界', () => {
  it('把语言、sourceType 和显式括号选项传给 Rust，保留紧凑事实', async () => {
    const { getOxcSourceAnalysis } = await import('@/js/fast-path/analysis')
    const parser = await import('@/js/oxc-parser')
    const parse = vi.spyOn(parser, 'parseOxcSync')
    native.compiler.analyzeJs.mockReturnValue(facts)
    const options = { filename: 'entry.tsx', babelParserOptions: { sourceType: 'script' as const, createParenthesizedExpressions: true } }

    expect(getOxcSourceAnalysis(source, options)).toBe(facts)
    expect(getOxcSourceAnalysis(source, options)).toBe(facts)
    expect(native.compiler.analyzeJs).toHaveBeenCalledExactlyOnceWith(source, 'tsx', 'script', true)
    expect(parse).not.toHaveBeenCalled()
  })

  it('原生可用后不复用先前的 JS 分析缓存', async () => {
    const { getOxcSourceAnalysis } = await import('@/js/fast-path/analysis')
    native.load.mockReturnValue(undefined)
    const fallback = getOxcSourceAnalysis(source, {})
    expect(fallback).toEqual(facts)

    native.load.mockReturnValue(native.compiler)
    native.compiler.analyzeJs.mockReturnValue(facts)
    expect(getOxcSourceAnalysis(source, {})).toBe(facts)
    expect(native.compiler.analyzeJs).toHaveBeenCalledOnce()

    native.load.mockReturnValue(undefined)
    expect(getOxcSourceAnalysis(source, {})).toBe(fallback)
  })

  it('已有缓存也不能隐藏 required 加载失败', async () => {
    const { getOxcSourceAnalysis } = await import('@/js/fast-path/analysis')
    native.compiler.analyzeJs.mockReturnValue(facts)
    expect(getOxcSourceAnalysis(source, {})).toBe(facts)
    const error = new Error('required native binding unavailable')
    native.load.mockImplementation(() => { throw error })
    expect(() => getOxcSourceAnalysis(source, {})).toThrow(error)
  })

  it('null 结果走 Oxc 兼容解析，执行异常直接上抛', async () => {
    const { getOxcSourceAnalysis } = await import('@/js/fast-path/analysis')
    const parser = await import('@/js/oxc-parser')
    const parse = vi.spyOn(parser, 'parseOxcSync')
    expect(getOxcSourceAnalysis(source, {})).toEqual(facts)
    expect(native.compiler.analyzeJs).toHaveBeenCalledOnce()
    expect(parse).toHaveBeenCalledOnce()

    parse.mockClear()
    const error = new Error('native execution failed')
    native.compiler.analyzeJs.mockImplementation(() => { throw error })
    expect(() => getOxcSourceAnalysis(`${source};`, {})).toThrow(error)
    expect(parse).not.toHaveBeenCalled()
  })

  it('共享事实不缓存 classNameSet 的转换结果', async () => {
    const { oxcJsHandler } = await import('@/js/fast-path/oxc')
    const { MappingChars2String } = await import('@weapp-tailwindcss/escape')
    native.compiler.analyzeJs.mockReturnValue(facts)
    const options = { experimentalJsFastPath: 'oxc' as const, escapeMap: MappingChars2String, classNameSet: new Set(['w-[100px]']) }
    expect(oxcJsHandler(source, options)?.code).toContain('w-_b100px_B')
    options.classNameSet = new Set(['h-[100px]'])
    expect(oxcJsHandler(source, options)?.code).toBe(source)
    expect(native.compiler.analyzeJs).toHaveBeenCalledOnce()
  })
})

describe('Rust 运行时签名', () => {
  it('保留原生空签名并跳过 JS AST 解析', async () => {
    const { tryCreateJsRuntimeAffectingSignature } = await import('@/compiler/runtime-affecting-signature/js')
    const parser = await import('@/js/oxc-parser')
    const parse = vi.spyOn(parser, 'parseOxcSync')
    native.compiler.jsRuntimeSignature.mockReturnValue('')
    expect(tryCreateJsRuntimeAffectingSignature('let n = 1')).toBe('')
    expect(native.compiler.jsRuntimeSignature).toHaveBeenCalledExactlyOnceWith('let n = 1')
    expect(parse).not.toHaveBeenCalled()
  })

  it('不支持时复用 Oxc，原生执行失败不静默回退', async () => {
    const { tryCreateJsRuntimeAffectingSignature } = await import('@/compiler/runtime-affecting-signature/js')
    const parser = await import('@/js/oxc-parser')
    const parse = vi.spyOn(parser, 'parseOxcSync')
    expect(tryCreateJsRuntimeAffectingSignature(source)).toBe('s:w-[100px]')
    expect(parse).toHaveBeenCalledOnce()
    parse.mockClear()
    const error = new Error('native signature failed')
    native.compiler.jsRuntimeSignature.mockImplementation(() => { throw error })
    expect(() => tryCreateJsRuntimeAffectingSignature(source)).toThrow(error)
    expect(parse).not.toHaveBeenCalled()
  })
})
