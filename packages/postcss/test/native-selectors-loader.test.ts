import { afterEach, describe, expect, it, vi } from 'vitest'

const nativeMock = vi.hoisted(() => ({
  load: vi.fn(),
}))

vi.mock('node:module', () => ({
  createRequire: () => Object.assign(nativeMock.load, { resolve: () => '/fixture/postcss/package.json' }),
}))

afterEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('Rust 选择器内核加载契约', () => {
  it('off 不尝试加载二进制', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'off')
    const { loadNativeSelectorBinding } = await import('@/selectorParser/native')
    expect(loadNativeSelectorBinding()).toBeUndefined()
    expect(nativeMock.load).not.toHaveBeenCalled()
  })

  it('auto 在加载失败时回退并缓存失败', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'auto')
    nativeMock.load.mockImplementation(() => { throw new Error('binary not found') })
    const { loadNativeSelectorBinding } = await import('@/selectorParser/native')
    expect(loadNativeSelectorBinding()).toBeUndefined()
    const attempts = nativeMock.load.mock.calls.length
    expect(attempts).toBeGreaterThan(0)
    expect(loadNativeSelectorBinding()).toBeUndefined()
    expect(nativeMock.load).toHaveBeenCalledTimes(attempts)
  })

  it.each([new Error('binary not found'), new Error('wrong ABI'), {}])('required 明确暴露加载或 ABI 错误：%s', async (failure) => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    nativeMock.load.mockImplementation(() => {
      if (failure instanceof Error) throw failure
      return failure
    })
    const { loadNativeSelectorBinding } = await import('@/selectorParser/native')
    expect(() => loadNativeSelectorBinding()).toThrow(/无法加载 PostCSS Rust 选择器内核/)
    expect(() => loadNativeSelectorBinding()).toThrow(failure instanceof Error ? failure.message : 'escapeClasses')
  })

  it('auto 不吞掉原生转换抛出的异常', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'auto')
    nativeMock.load.mockReturnValue({ escapeClasses: () => { throw new Error('native transform failed') } })
    const { escapeNativeSelectorClasses } = await import('@/selectorParser/native')
    expect(() => escapeNativeSelectorClasses(['w-[10px]'])).toThrow('native transform failed')
  })
})
