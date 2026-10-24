import { describe, expect, it, vi } from 'vitest'
import { createCache } from '@/cache'
import { createCompilerContextMock, createCompilerWithLoaderTracking, createContext, setupWebpackV5UnitTest, testState, WeappTailwindcss } from './webpack.v5.unit/shared'

describe('Webpack 永久关闭释放拥有的上下文资源', () => {
  setupWebpackV5UnitTest()

  it('保留插件和 compiler 时，关闭后清空自有产物缓存并断开旧 handler', async () => {
    const plugin = new WeappTailwindcss()
    const context = plugin.options
    const originalCache = context.cache
    const handlers = [context.styleHandler, context.jsHandler, context.templateHandler]
    context.cache.set('asset', 'retained output')
    context.cache.calcHashValueChanged('asset', 'hash')
    const fixture = createCompilerWithLoaderTracking()
    plugin.apply(fixture.compiler as any)
    await fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]()
    expect(originalCache.instance.size).toBe(0)
    expect(originalCache.hashMap.size).toBe(0)
    expect(context.cache.instance.size).toBe(0)
    expect(context.cache.hashMap.size).toBe(0)
    expect([context.styleHandler, context.jsHandler, context.templateHandler].some(handler => handlers.includes(handler as any))).toBe(false)
    expect(() => plugin.options.jsHandler('closed')).toThrow('已释放')
    expect(testState.currentContext).toBe(context)
  })

  it('调用者提供的缓存仍保留，关闭只断开当前实例引用，下一次 apply 创建新上下文', async () => {
    const cache = createCache()
    cache.set('caller', 'keep')
    cache.calcHashValueChanged('caller', 'hash')
    const callback = vi.fn()
    const first = createContext({ cache })
    const second = createContext({ cache })
    createCompilerContextMock.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const plugin = new WeappTailwindcss({ cache, onStart: callback })
    const a = createCompilerWithLoaderTracking()
    plugin.apply(a.compiler as any)
    await a.compiler.hooks.watchClose.tap.mock.calls[0]![1]()
    expect(cache.get('caller')).toBe('keep')
    expect(cache.hashMap.size).toBe(1)
    expect(first.cache).not.toBe(cache)
    const b = createCompilerWithLoaderTracking()
    plugin.apply(b.compiler as any)
    expect(plugin.options).toBe(second)
    const source = createCompilerContextMock.mock.calls[1]![0]
    expect(source).toMatchObject({ cache, onStart: callback })
    expect(source).not.toHaveProperty('styleHandler')
    expect(source).not.toHaveProperty('tailwindRuntime')
    await b.compiler.hooks.watchClose.tap.mock.calls[0]![1]()
    expect(cache.get('caller')).toBe('keep')
  })

  it('自有缓存清理之一失败仍释放其他缓存和 handler，重复关闭复用失败', async () => {
    const plugin = new WeappTailwindcss()
    const oldCache = plugin.options.cache
    oldCache.set('asset', 'payload')
    oldCache.calcHashValueChanged('asset', 'hash')
    vi.spyOn(oldCache.instance, 'clear').mockImplementation(() => {
      throw new Error('cache clear failed')
    })
    const fixture = createCompilerWithLoaderTracking()
    ;(fixture.compiler as any).getInfrastructureLogger = () => ({ error() {} })
    plugin.apply(fixture.compiler as any)
    const close = fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]
    const completion = close()
    await expect(completion).rejects.toThrow('上下文释放失败')
    expect(close()).toBe(completion)
    expect(oldCache.hashMap.size).toBe(0)
    expect(plugin.options.cache).not.toBe(oldCache)
    expect(() => plugin.options.jsHandler('closed')).toThrow('已释放')
  })

  it('调用者在 apply 前替换 cache 不转移所有权，只清创建时登记的缓存', async () => {
    const plugin = new WeappTailwindcss()
    const originalCache = plugin.options.cache
    originalCache.set('owned', 'owned')
    const replacement = createCache()
    replacement.set('caller', 'caller')
    plugin.options.cache = replacement
    const fixture = createCompilerWithLoaderTracking()
    plugin.apply(fixture.compiler as any)
    await fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]()
    expect(originalCache.instance.size).toBe(0)
    expect(replacement.get('caller')).toBe('caller')
    expect(plugin.options.cache).not.toBe(replacement)
  })
})
