import type { InternalUserDefinedOptions } from '@/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveCompilationProfile, resolveContextStylesEmbeddedInScript } from '@/context/compilation-profile'
import { initializeFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

afterEach(() => vi.unstubAllEnvs())

function createContext(options: Partial<InternalUserDefinedOptions> = {}) {
  const context = { generator: { target: 'weapp' }, ...options } as InternalUserDefinedOptions
  initializeFrameworkEnvironment(context)
  return context
}

describe('样式嵌入能力查询', () => {
  it('只读取能力输入，不遍历来源配置或触碰编译 revision', () => {
    const context = createContext({ appType: 'taro', platform: 'mp-weixin', cssEntries: ['first.css'] })
    const current = resolveCompilationProfile(context)
    const readEntries = vi.fn(() => ['second.css'])
    Object.defineProperty(context, 'cssEntries', { get: readEntries })

    for (let index = 0; index < 10; index++) {
      expect(resolveContextStylesEmbeddedInScript(context)).toBe(false)
    }
    expect(readEntries).not.toHaveBeenCalled()
    expect(current.isCurrent()).toBe(true)

    const next = resolveCompilationProfile(context)
    expect(next.profile.revision).toBe(current.profile.revision + 1)
    expect(current.isCurrent()).toBe(false)
  })

  it.each(['uni-app-vite', 'uni-app-x', 'taro', 'mpx', 'native', 'weapp-vite'] as const)(
    '%s 保留请求覆盖、样式配置与平台配置的优先级，配置变更立即生效',
    (appType) => {
      const context = createContext({
        appType,
        uniAppX: appType === 'uni-app-x',
        platform: 'h5',
        cssOptions: { platform: 'app-android' },
      })
      expect(resolveContextStylesEmbeddedInScript(context)).toBe(true)
      expect(resolveContextStylesEmbeddedInScript(context, 'mp-weixin')).toBe(false)
      context.cssOptions!.platform = 'web'
      expect(resolveContextStylesEmbeddedInScript(context)).toBe(false)
      context.cssOptions = undefined
      context.platform = 'app-ios'
      expect(resolveContextStylesEmbeddedInScript(context)).toBe(true)
    },
  )

  it('交错查询沿用各实例捕获的环境，后续全局环境变更不串扰', () => {
    vi.stubEnv('UNI_PLATFORM', 'app-plus')
    vi.stubEnv('UNI_UTS_PLATFORM', undefined)
    const native = createContext({ appType: 'uni-app-vite' })
    vi.stubEnv('UNI_PLATFORM', 'h5')
    const web = createContext({ appType: 'uni-app-vite' })
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin')

    expect(resolveContextStylesEmbeddedInScript(native)).toBe(true)
    expect(resolveContextStylesEmbeddedInScript(web)).toBe(false)
    expect(resolveContextStylesEmbeddedInScript(native, 'web')).toBe(false)
    expect(resolveContextStylesEmbeddedInScript(native)).toBe(true)
  })
})
