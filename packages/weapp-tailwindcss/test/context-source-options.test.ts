import { describe, expect, it, vi } from 'vitest'
import { createCache } from '@/cache'
import { createCompilerContext } from '@/context'
import { getCompilerContextSourceOptions } from '@/context/source-options'

describe('编译上下文的可复用源配置', () => {
  it('复制配置数据并保留回调身份，已有 context 只回溯原始配置而不保存会话资源', () => {
    const callback = vi.fn()
    const options = { logLevel: 'silent' as const, onStart: callback, cssOptions: { preserveWebkitProperties: ['-webkit-test'] } }
    const first = createCompilerContext(options)
    options.cssOptions.preserveWebkitProperties.push('-webkit-later')
    const source = getCompilerContextSourceOptions(first)
    expect(source.onStart).toBe(callback)
    expect(source.cssOptions?.preserveWebkitProperties).toEqual(['-webkit-test'])
    expect(Object.isFrozen(options)).toBe(false)
    for (const key of ['cache', 'styleHandler', 'jsHandler', 'templateHandler', 'tailwindRuntime', 'refreshTailwindcssRuntime']) {
      expect(source).not.toHaveProperty(key)
    }
    const second = createCompilerContext(first)
    expect(getCompilerContextSourceOptions(second)).toBe(source)
    expect(second.cache).not.toBe(first.cache)
    expect(second.tailwindRuntime).not.toBe(first.tailwindRuntime)
  })

  it('显式缓存属于调用者，不深拷贝、冻结或替换其身份', () => {
    const cache = createCache()
    const context = createCompilerContext({ logLevel: 'silent', cache, generator: { target: 'web' } })
    const source = getCompilerContextSourceOptions(context)
    expect(source.cache).toBe(cache)
    expect(source.generator?.target).toBe('web')
    cache.set('caller', 'retained')
    expect(source.cache).toBe(cache)
    expect(Object.isFrozen(cache)).toBe(false)
    expect(createCompilerContext(source).cache).toBe(cache)
  })
})
