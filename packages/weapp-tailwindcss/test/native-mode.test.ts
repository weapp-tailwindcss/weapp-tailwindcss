import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ resolve: vi.fn(), missing: new Error('native binding missing') }))
vi.mock('@/native/resolve', () => ({
  getNativeBindingSuffix: () => 'darwin-arm64',
  requireNativeBinding: native.resolve,
}))

const source = 'const cls = mode === "w-[1px]" ? "w-[1px]" : "plain"'
const options = { experimentalJsFastPath: 'oxc' as const, classNameSet: new Set(['w-[1px]']) }

beforeEach(() => {
  vi.resetModules()
  native.resolve.mockReset().mockImplementation(() => {
    throw native.missing
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('JS/WXML 原生模式边界', () => {
  it.each([undefined, 'off'])('模式 %s 保留完整兼容输出且不执行原生加载检查', async (mode) => {
    vi.stubEnv('WEAPP_TW_NATIVE', mode)
    const loader = await import('@/native')
    const load = vi.spyOn(loader, 'loadNativeCompiler')
    const { createJsHandler, jsHandler } = await import('@/js')
    const { getOxcSourceAnalysis } = await import('@/js/fast-path/analysis')
    const { templateReplacer } = await import('@/wxml/utils/template-fragments')
    const { Tokenizer } = await import('@/wxml/Tokenizer')
    const { JavaScriptTokenizer } = await import('@/wxml/tokenizer/javascript')

    expect(getOxcSourceAnalysis(source, options)?.literals).toHaveLength(3)
    const handler = createJsHandler(options)
    expect(handler(source, options.classNameSet).code).toBe(jsHandler(source, options).code)
    expect(handler(source, options.classNameSet).code).toContain('mode === "w-[1px]" ? "w-_b1px_B"')
    expect(templateReplacer('w-[1px]')).toBe('w-_b1px_B')
    const dynamic = 'w-[1px] {{value}}'
    expect(new Tokenizer().run(dynamic)).toEqual(new JavaScriptTokenizer().run(dynamic))
    expect(load).not.toHaveBeenCalled()
    expect(loader.loadNativeCompiler()).toBeUndefined()
    expect(native.resolve).not.toHaveBeenCalled()
  })

  it('公共入口不会把无效模式静默当作关闭', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'requred')
    const { createJsHandler } = await import('@/js')
    const { getOxcSourceAnalysis } = await import('@/js/fast-path/analysis')
    const { templateReplacer } = await import('@/wxml/utils/template-fragments')
    const { Tokenizer } = await import('@/wxml/Tokenizer')
    expect(() => createJsHandler(options)(source, options.classNameSet)).toThrow('Invalid WEAPP_TW_NATIVE mode')
    expect(() => getOxcSourceAnalysis(source, options)).toThrow('Invalid WEAPP_TW_NATIVE mode')
    expect(() => templateReplacer('w-[1px]')).toThrow('Invalid WEAPP_TW_NATIVE mode')
    expect(() => new Tokenizer().run('w-[1px]')).toThrow('Invalid WEAPP_TW_NATIVE mode')
    expect(native.resolve).not.toHaveBeenCalled()
  })

  it('显式启用进程中的回退缓存不能隐藏 required 加载失败', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'auto')
    const { createJsHandler } = await import('@/js')
    const handler = createJsHandler(options)
    vi.stubEnv('WEAPP_TW_NATIVE', 'off')
    expect(handler(source, options.classNameSet).code).toContain('w-_b1px_B')
    expect(native.resolve).not.toHaveBeenCalled()
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(() => handler(source, options.classNameSet)).toThrowError(expect.objectContaining({ cause: native.missing }))
    expect(native.resolve).toHaveBeenCalledOnce()
  })
})
