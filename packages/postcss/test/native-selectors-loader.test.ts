import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nativeMock = vi.hoisted(() => ({ load: vi.fn(), resolve: vi.fn() }))
vi.mock('node:module', () => ({
  createRequire: () => Object.assign(nativeMock.load, { resolve: nativeMock.resolve }),
}))

function binding() {
  return {
    SelectorRuleTransformer: class { transform() { return null } },
    escapeClasses: (values: string[]) => values,
    transformSelector: () => null,
    transformSelectors: () => [],
    normalizeV4VariableFallbacks: (value: string) => value,
    normalizeV4Declaration: (value: string) => value,
    normalizeV4GradientPosition: (value: string) => value,
    normalizeV4InfinityCalc: (value: string) => value,
    normalizeUvueTransformValue: (value: string) => value,
    normalizeUvueTransformValues: (values: string[]) => values,
  }
}

beforeEach(() => {
  nativeMock.resolve.mockImplementation((id: string) => id === '@weapp-tailwindcss/postcss/package.json' ? '/fixture/postcss/package.json' : id)
})
afterEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('Rust CSS 内核加载契约', () => {
  it('off 不尝试解析或加载二进制', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'off')
    const { loadNativeCssBinding } = await import('@/native/binding')
    expect(loadNativeCssBinding()).toBeUndefined()
    expect(nativeMock.resolve).not.toHaveBeenCalled()
    expect(nativeMock.load).not.toHaveBeenCalled()
  })

  it('拒绝错误的模式名称', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'enabled')
    const { loadNativeCssBinding } = await import('@/native/binding')
    expect(() => loadNativeCssBinding()).toThrow('无效的 WEAPP_TW_NATIVE 模式')
  })

  it('优先加载已安装平台包，不尝试本地二进制', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const native = binding()
    nativeMock.load.mockReturnValue(native)
    const { loadNativeCssBinding } = await import('@/native/binding')
    expect(loadNativeCssBinding()).toBe(native)
    expect(nativeMock.load).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^@weapp-tailwindcss\/native-.+\/postcss$/))
    expect(nativeMock.resolve).not.toHaveBeenCalledWith(expect.stringMatching(/\.node$/))
  })

  it('只有平台包解析 MODULE_NOT_FOUND 时才加载本地二进制', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    nativeMock.resolve.mockImplementation((id: string) => {
      if (id.startsWith('@weapp-tailwindcss/native-')) throw Object.assign(new Error('missing package'), { code: 'MODULE_NOT_FOUND' })
      return id === '@weapp-tailwindcss/postcss/package.json' ? '/fixture/postcss/package.json' : id
    })
    nativeMock.load.mockReturnValue(binding())
    const { loadNativeCssBinding } = await import('@/native/binding')
    expect(loadNativeCssBinding()).toBeDefined()
    expect(nativeMock.load).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/weapp-tailwindcss-postcss\.node$/))
  })

  it.each(['auto', 'required'])('已安装包加载失败不尝试本地，%s 保留失败策略', async (mode) => {
    vi.stubEnv('WEAPP_TW_NATIVE', mode)
    const error = Object.assign(new Error('installed binary is damaged'), { code: 'ERR_DLOPEN_FAILED' })
    nativeMock.load.mockImplementation(() => { throw error })
    const { loadNativeCssBinding } = await import('@/native/binding')
    if (mode === 'required') expect(() => loadNativeCssBinding()).toThrow(error)
    else expect(loadNativeCssBinding()).toBeUndefined()
    expect(nativeMock.load).toHaveBeenCalledTimes(1)
    expect(nativeMock.resolve).not.toHaveBeenCalledWith(expect.stringMatching(/\.node$/))
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(() => loadNativeCssBinding()).toThrow(error)
    expect(nativeMock.load).toHaveBeenCalledTimes(1)
  })

  it('解析时非缺包错误直接保留，禁止其它 binding 掩盖', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const error = Object.assign(new Error('package subpath not exported'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
    nativeMock.resolve.mockImplementation((id: string) => {
      if (id.startsWith('@weapp-tailwindcss/native-')) throw error
      return '/fixture/postcss/package.json'
    })
    const { loadNativeCssBinding } = await import('@/native/binding')
    expect(() => loadNativeCssBinding()).toThrow(error)
    expect(nativeMock.load).not.toHaveBeenCalled()
  })

  it.each(['SelectorRuleTransformer', 'escapeClasses', 'transformSelector', 'transformSelectors', 'normalizeV4VariableFallbacks', 'normalizeV4Declaration', 'normalizeV4GradientPosition', 'normalizeV4InfinityCalc', 'normalizeUvueTransformValue', 'normalizeUvueTransformValues'])('旧二进制缺少 %s 时拒绝，不尝试本地', async (method) => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const native = binding() as Record<string, unknown>
    delete native[method]
    nativeMock.load.mockReturnValue(native)
    const { loadNativeCssBinding } = await import('@/native/binding')
    expect(() => loadNativeCssBinding()).toThrow(/原生模块缺少/)
    expect(nativeMock.load).toHaveBeenCalledTimes(1)
    expect(nativeMock.resolve).not.toHaveBeenCalledWith(expect.stringMatching(/\.node$/))
  })

  it('只允许 null 转换结果回退，不吞掉原生执行异常', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'auto')
    const transformSelector = vi.fn().mockReturnValueOnce(null).mockImplementation(() => { throw new Error('selector failed') })
    nativeMock.load.mockReturnValue({ ...binding(), transformSelector })
    const { transformNativeSelector } = await import('@/selectorParser/native')
    expect(transformNativeSelector('.a:hover')).toBeUndefined()
    expect(() => transformNativeSelector('.a')).toThrow('selector failed')
  })

  it('原生值转换失败保留原始异常，不重新执行兼容实现', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'auto')
    const error = new Error('value transform failed')
    const fail = () => { throw error }
    nativeMock.load.mockReturnValue({ ...binding(), normalizeV4VariableFallbacks: fail, normalizeUvueTransformValue: fail, normalizeUvueTransformValues: fail })
    const { normalizeV4VariableFallbacks } = await import('@/compat/tailwindcss-v4/declarations/variable-fallbacks')
    const { normalizeUniAppXTransformValue, normalizeUniAppXTransformValues } = await import('@/compat/uni-app-x-uvue/transform-value')
    expect(() => normalizeV4VariableFallbacks('var(--tw-x,)')).toThrow(error)
    expect(() => normalizeUniAppXTransformValue('translate(1px,2px)')).toThrow(error)
    expect(() => normalizeUniAppXTransformValues(['translate(1px,2px)'])).toThrow(error)
  })

  it('拒绝长度不完整的原生值批次，防止声明错配', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    nativeMock.load.mockReturnValue({ ...binding(), normalizeUvueTransformValues: () => [] })
    const { normalizeUniAppXTransformValues } = await import('@/compat/uni-app-x-uvue/transform-value')
    expect(() => normalizeUniAppXTransformValues(['rotate(45deg)', 'translate(1px,2px)'])).toThrow('不完整的 transform 声明批次')
  })

  it('规则转换器只初始化一次，off 不调用且原生执行异常向上传递', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const transform = vi.fn().mockReturnValueOnce(null).mockImplementation(() => { throw new Error('rule failed') })
    let constructions = 0
    nativeMock.load.mockReturnValue({ ...binding(), SelectorRuleTransformer: class {
      constructor() { constructions++ }
      transform(value: string) { return transform(value) }
    } })
    const { createNativeSelectorRuleTransformer } = await import('@/selectorParser/native-rule')
    const run = createNativeSelectorRuleTransformer({})
    expect(run('.a:where(.b,.c)')).toBeUndefined()
    vi.stubEnv('WEAPP_TW_NATIVE', 'off')
    expect(run('.a:where(.b,.c)')).toBeUndefined()
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(() => run('.a:where(.b,.c)')).toThrow('rule failed')
    expect(constructions).toBe(1)
    expect(transform).toHaveBeenCalledTimes(2)
  })

  it('规则转换器缺少 prototype transform 时按 ABI 不匹配处理', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    nativeMock.load.mockReturnValue({ ...binding(), SelectorRuleTransformer: class {} })
    const { loadNativeCssBinding } = await import('@/native/binding')
    expect(() => loadNativeCssBinding()).toThrow('原生模块缺少 SelectorRuleTransformer')
    expect(nativeMock.load).toHaveBeenCalledTimes(1)
  })
})
