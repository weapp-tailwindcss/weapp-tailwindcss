import type { NativeCompiler } from '@/native'
import type { NativeJsTransformer } from '@/native/types'
import type { IJsHandlerOptions } from '@/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  load: vi.fn<() => NativeCompiler | undefined>(),
  compiler: {
    tokenizeWxml: vi.fn<NativeCompiler['tokenizeWxml']>(),
    createWxmlTransformer: vi.fn<NativeCompiler['createWxmlTransformer']>(),
    analyzeJs: vi.fn<NativeCompiler['analyzeJs']>(),
    jsRuntimeSignature: vi.fn<NativeCompiler['jsRuntimeSignature']>(),
    createJsTransformer: vi.fn<NativeCompiler['createJsTransformer']>(),
  },
  transformer: {
    transform: vi.fn<NativeJsTransformer['transform']>(),
    transformWithCandidates: vi.fn<NativeJsTransformer['transformWithCandidates']>(),
    replaceClassNames: vi.fn<NativeJsTransformer['replaceClassNames']>(),
  },
}))
vi.mock('@/native', () => ({ loadNativeCompiler: native.load }))

const source = 'const cls = "w-[100px]"'
const output = 'const cls = "w-_b100px_B"'
const options: IJsHandlerOptions = { experimentalJsFastPath: 'oxc', alwaysEscape: true }

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  native.load.mockReturnValue(native.compiler)
  native.compiler.createJsTransformer.mockReturnValue(native.transformer)
  native.compiler.analyzeJs.mockReturnValue(null)
  native.transformer.transformWithCandidates.mockReturnValue(output)
  native.transformer.replaceClassNames.mockReturnValue(true)
})
afterEach(() => vi.restoreAllMocks())

describe('Rust 完整 JS 转换适配器', () => {
  it('完整转换只传回代码，不把 AST 或字面量传到 JS', async () => {
    const { createJsHandler } = await import('@/js')
    expect(createJsHandler(options)(source).code).toBe(output)
    expect(native.compiler.analyzeJs).not.toHaveBeenCalled()
    expect(native.transformer.transformWithCandidates).toHaveBeenCalledExactlyOnceWith(source, 'js', 'script', false, {
      alwaysEscape: true,
      preserveStar: false,
      unescapeUnicode: false,
      moduleGraph: false,
      ignoreTaggedTemplates: false,
    }, expect.any(Function))
  })

  it('默认保留策略作为固定开关传给内核，用户自定义回调仍回退', async () => {
    const { nativeJsHandler } = await import('@/js/fast-path/native')
    const { defaultJsPreserveClass } = await import('@/js/default-preserve')
    nativeJsHandler(source, { ...options, jsPreserveClass: defaultJsPreserveClass })
    expect(native.transformer.transformWithCandidates).toHaveBeenLastCalledWith(source, 'js', 'script', false, expect.objectContaining({ preserveStar: true }), expect.any(Function))
    nativeJsHandler(source, options)
    expect(native.transformer.transformWithCandidates).toHaveBeenLastCalledWith(source, 'js', 'script', false, expect.objectContaining({ preserveStar: false }), expect.any(Function))
    expect(nativeJsHandler(source, { ...options, jsPreserveClass: () => false })).toBeUndefined()
    expect(native.transformer.transformWithCandidates).toHaveBeenCalledTimes(2)
  })

  it.each([0, 6, 100_000])('集合规模 %i 不触发全量快照，每次候选查询读取最新集合', async (size) => {
    const { nativeJsHandler } = await import('@/js/fast-path/native')
    const classes = new Set(Array.from({ length: size }, (_, index) => `unrelated-${index}`))
    const current = { ...options, classNameSet: classes }
    native.transformer.transformWithCandidates.mockImplementation((_source, _lang, _type, _parens, _options, contains) => contains('w-[100px]') ? output : source)
    expect(nativeJsHandler(source, current)?.code).toBe(source)
    classes.add('w-[100px]')
    expect(nativeJsHandler(source, current)?.code).toBe(output)
    classes.delete('w-[100px]')
    classes.add('h-[100px]')
    expect(nativeJsHandler(source, current)?.code).toBe(source)
    classes.clear()
    expect(nativeJsHandler(source, current)?.code).toBe(source)
    classes.add('w-[100px]')
    expect(nativeJsHandler(source, current)?.code).toBe(output)
    expect(native.compiler.createJsTransformer).toHaveBeenCalledExactlyOnceWith([], expect.any(Array))
    expect(native.transformer.replaceClassNames).not.toHaveBeenCalled()
    expect(native.transformer.transform).not.toHaveBeenCalled()
  })

  it('自定义映射同对象变更与删除使原生实例失效，并补齐默认映射', async () => {
    const { nativeJsHandler } = await import('@/js/fast-path/native')
    const map: Record<string, string> = { '[': '_left' }
    nativeJsHandler(source, { ...options, escapeMap: map })
    expect(native.compiler.createJsTransformer.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      { character: '[', replacement: '_left' },
      { character: ']', replacement: '_B' },
    ]))
    map['['] = '_next'
    nativeJsHandler(source, { ...options, escapeMap: map })
    delete map['[']
    nativeJsHandler(source, { ...options, escapeMap: map })
    expect(native.compiler.createJsTransformer).toHaveBeenCalledTimes(3)
    expect(native.compiler.createJsTransformer.mock.calls[2]?.[1]).toContainEqual({ character: '[', replacement: '_b' })
  })

  it('未被源码查询的孤立代理字符不导致集合快照回退', async () => {
    const { nativeJsHandler } = await import('@/js/fast-path/native')
    const classes = new Set(['w-[100px]', '\uD800'])
    expect(nativeJsHandler(source, { ...options, classNameSet: classes })?.code).toBe(output)
    expect(native.compiler.createJsTransformer).toHaveBeenCalledExactlyOnceWith([], expect.any(Array))
    expect(native.transformer.replaceClassNames).not.toHaveBeenCalled()
  })

  it('直接适配器同样拒绝自定义集合', async () => {
    const { nativeJsHandler } = await import('@/js/fast-path/native')
    const classes = new Set(['w-[100px]'])
    classes.has = vi.fn(() => true)
    expect(nativeJsHandler(source, { ...options, classNameSet: classes })).toBeUndefined()
    expect(native.load).not.toHaveBeenCalled()
    expect(classes.has).not.toHaveBeenCalled()
  })

  it.each([
    { generateMap: true },
    { wrapExpression: true },
    { moduleSpecifierReplacements: {} },
    { ignoreCallExpressionIdentifiers: ['keep'] },
    { jsPreserveClass: () => true },
    { babelParserOptions: { allowReturnOutsideFunction: true } },
    { babelParserOptions: { sourceType: 'commonjs' as const } },
    { experimentalJsFastPath: false },
  ])('语义不支持时保持兼容入口：%j', async (override) => {
    const { nativeJsHandler } = await import('@/js/fast-path/native')
    expect(nativeJsHandler(source, { ...options, ...override })).toBeUndefined()
    expect(native.load).not.toHaveBeenCalled()
  })

  it('module graph 与 tagged template 由内核事实决定回退', async () => {
    const { nativeJsHandler } = await import('@/js/fast-path/native')
    const current = {
      ...options,
      filename: 'entry.tsx',
      moduleGraph: {},
      ignoreTaggedTemplateExpressionIdentifiers: ['keep'],
      babelParserOptions: { sourceType: 'script' as const, createParenthesizedExpressions: true, plugins: ['typescript', 'jsx'] as ('typescript' | 'jsx')[] },
    }
    native.transformer.transformWithCandidates.mockReturnValue(null)
    expect(nativeJsHandler(source, current)).toBeNull()
    expect(native.transformer.transformWithCandidates).toHaveBeenCalledWith(source, 'tsx', 'script', true, expect.objectContaining({ moduleGraph: true, ignoreTaggedTemplates: true }), expect.any(Function))
  })

  it('只有 null 回退，保留空输出且执行异常不吞掉', async () => {
    const { nativeJsHandler } = await import('@/js/fast-path/native')
    native.transformer.transformWithCandidates.mockReturnValue(null)
    expect(nativeJsHandler(source, options)).toBeNull()
    native.transformer.transformWithCandidates.mockReturnValue('')
    expect(nativeJsHandler(source, options)).toEqual({ code: '' })
    const error = new Error('native transform failed')
    native.transformer.transformWithCandidates.mockImplementation(() => {
      throw error
    })
    expect(() => nativeJsHandler(source, options)).toThrow(error)
  })

  it('旧 JS 结果缓存不能绕过 required 加载失败或原生转换', async () => {
    const { createJsHandler } = await import('@/js')
    const handler = createJsHandler(options)
    native.load.mockReturnValue(undefined)
    expect(handler(source).code).toBe(output)
    const error = new Error('required native unavailable')
    native.load.mockImplementation(() => {
      throw error
    })
    expect(() => handler(source)).toThrow(error)
    native.load.mockReturnValue(native.compiler)
    expect(handler(source).code).toBe(output)
    expect(native.transformer.transformWithCandidates).toHaveBeenCalledOnce()
  })

  it('自定义集合与映射 getter 不由原生快照接管', async () => {
    const { createJsHandler } = await import('@/js')
    const classes = new Set(['w-[100px]'])
    classes.has = vi.fn(() => false)
    const handler = createJsHandler({ experimentalJsFastPath: 'oxc' })
    expect(handler(source, classes).code).toBe(source)
    expect(classes.has).toHaveBeenCalledWith('w-[100px]')

    const escapeMap: Record<string, string> = {}
    const getter = vi.fn(() => '_custom_')
    Object.defineProperty(escapeMap, '[', { enumerable: true, get: getter })
    expect(createJsHandler({ ...options, escapeMap })(source).code).toContain('w-_custom_100px_B')
    expect(getter).toHaveBeenCalledOnce()
    expect(native.load).not.toHaveBeenCalled()
    expect(native.transformer.transformWithCandidates).not.toHaveBeenCalled()
  })

  it('原生拒绝的语义必须交给 Babel，不能再次进入 Oxc', async () => {
    const { createJsHandler } = await import('@/js')
    const { jsHandler } = await import('@/js/babel')
    const invalid = 'let value = "w-[100px]"; let value = 1'
    native.transformer.transformWithCandidates.mockReturnValue(null)
    const result = createJsHandler(options)(invalid)
    const expected = jsHandler(invalid, options)
    expect(expected.error).toBeDefined()
    expect(result.code).toBe(expected.code)
    expect(result.error).toBeDefined()
    expect(native.compiler.analyzeJs).not.toHaveBeenCalled()
  })
})
