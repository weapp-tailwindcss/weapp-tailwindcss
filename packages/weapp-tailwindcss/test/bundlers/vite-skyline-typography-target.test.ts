import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveViteSkylineTypographyResetCss } from '@/bundlers/vite/shared/framework-skyline-typography'
import { initializeFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

afterEach(() => vi.unstubAllEnvs())

function options(skyline = true) {
  const value = { cssOptions: { skyline }, tailwindRuntime: { majorVersion: 4 } } as any
  initializeFrameworkEnvironment(value)
  return value
}

describe('Vite Skyline 实际目标能力', () => {
  it.each(['h5', 'mp-alipay', 'app', 'app-plus', 'app-android', 'app-ios', 'app-harmony'])('真实 UNI_PLATFORM=%s 时显式 CSS 微信平台不能越过 gate', (platform) => {
    vi.stubEnv('UNI_PLATFORM', platform)
    const value = options()
    value.cssOptions.platform = 'mp-weixin'
    expect(resolveViteSkylineTypographyResetCss(value, 'mp-weixin', false)).toBeUndefined()
  })

  it('实例快照不会被后续其它构建修改的进程环境污染', () => {
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin')
    const wechat = options()
    vi.stubEnv('UNI_PLATFORM', 'mp-alipay')
    const alipay = options()
    expect(resolveViteSkylineTypographyResetCss(wechat, 'mp-weixin', false)).toContain('--tw-leading:')
    expect(resolveViteSkylineTypographyResetCss(alipay, 'mp-weixin', false)).toBeUndefined()
  })

  it('默认关闭，且 Web 生成分支和非 v4 不启用', () => {
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin')
    expect(resolveViteSkylineTypographyResetCss(options(false), 'mp-weixin', false)).toBeUndefined()
    expect(resolveViteSkylineTypographyResetCss(options(), 'mp-weixin', true)).toBeUndefined()
    expect(resolveViteSkylineTypographyResetCss(options(), 'mp-weixin', false, 3)).toBeUndefined()
  })

  it('无框架环境时仅明确微信目标启用，未知平台保持关闭', () => {
    vi.stubEnv('UNI_PLATFORM', '')
    const value = options()
    expect(resolveViteSkylineTypographyResetCss(value, undefined, false)).toBeUndefined()
    expect(resolveViteSkylineTypographyResetCss(value, 'mini-program', false)).toBeUndefined()
    expect(resolveViteSkylineTypographyResetCss(value, 'mp-alipay', false)).toBeUndefined()
    expect(resolveViteSkylineTypographyResetCss(value, 'mp-weixin', false)).toContain('--tw-leading:')
  })

  it('保留自定义 universal 范围，关闭 preflight 也不增补边框等默认值', () => {
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin')
    const value = options()
    value.cssOptions.cssPreflight = false
    value.cssOptions.cssSelectorReplacement = { universal: ['view', 'text', 'button'] }
    const css = resolveViteSkylineTypographyResetCss(value, 'mp-weixin', false)
    expect(css).toContain('view,text,button')
    expect(css).not.toMatch(/border|margin|padding/)
  })
})
