import { logger } from '@weapp-tailwindcss/logger'
import * as css from '@weapp-tailwindcss/postcss/transform'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectRpxThemeRiskSources, recordRpxThemeRisk, shouldCheckRpxThemeRisk, warnFinalRpxThemeRisk, warnRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'

describe('rpx theme warning policy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(['mp-weixin', 'weapp', 'wx', 'weixin'])('enables known WeChat platform %s', (platform) => {
    expect(shouldCheckRpxThemeRisk({}, 'weapp', { platform })).toBe(true)
  })

  it.each(['mp-alipay', 'mp-toutiao', 'app-android', 'h5'])('skips other platform %s', (platform) => {
    expect(shouldCheckRpxThemeRisk({}, 'weapp', { platform })).toBe(false)
  })

  it('honors output target and log level before inspecting CSS', () => {
    expect(shouldCheckRpxThemeRisk({}, 'web', { platform: 'mp-weixin' })).toBe(false)
    for (const logLevel of ['silent', 'error'] as const) {
      expect(shouldCheckRpxThemeRisk({}, 'weapp', { platform: 'mp-weixin', logLevel })).toBe(false)
    }
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin')
    expect(shouldCheckRpxThemeRisk({}, 'weapp', {})).toBe(true)
    expect(shouldCheckRpxThemeRisk({}, 'weapp', { platform: 'mp-alipay' })).toBe(false)
  })

  it('deduplicates identical source CSS and session warnings before output parsing', () => {
    const collect = vi.spyOn(css, 'collectRpxThemeVariables')
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const session = {}
    const source = '@theme { --spacing: 3rpx }'
    const variables = collectRpxThemeRiskSources([source, source])
    expect(collect).toHaveBeenCalledTimes(1)
    warnRpxThemeRisk(session, variables, '.a { width: calc(var(--spacing) * 8) }')
    const inspect = vi.spyOn(css, 'inspectRpxCalcUsage')
    warnRpxThemeRisk(session, variables, '.a { width: 24rpx }')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('最终样式仍含 rpx 运行时 calc：--spacing')
    expect(inspect).not.toHaveBeenCalled()
    expect(shouldCheckRpxThemeRisk(session, 'weapp', { platform: 'mp-weixin' })).toBe(false)
  })

  it('静态值和无法解析的产物不警告，也不消耗会话额度', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const session = {}
    warnRpxThemeRisk(session, ['--gap'], '.a { width: 24rpx }')
    warnRpxThemeRisk(session, ['--gap'], '.a { width: calc(3rpx * 8)')
    expect(warn).not.toHaveBeenCalled()
    warnRpxThemeRisk(session, ['--gap'], '.a { width: calc(3rpx * 8) }')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.lastCall?.[0]).toContain('内联 rpx')
  })

  it('生成只登记来源，最终安全产物不妨碍后续 watch 风险提示', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const session = {}
    const options = { platform: 'mp-weixin' }
    recordRpxThemeRisk(session, 'theme', ['--spacing'])
    expect(warn).not.toHaveBeenCalled()
    warnFinalRpxThemeRisk(session, ['.w{width:32rpx}'], options)
    expect(warn).not.toHaveBeenCalled()
    warnFinalRpxThemeRisk(session, ['.w{width:calc(var(--spacing)*32)}'], options)
    warnFinalRpxThemeRisk(session, ['.w{width:calc(var(--spacing)*64)}'], options)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('来源更新替换旧变量，静默或其他平台不会消耗额度', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const session = {}
    const source = '.w{width:calc(var(--spacing)*32)}'
    recordRpxThemeRisk(session, 'theme', ['--spacing'])
    recordRpxThemeRisk(session, 'theme', [])
    warnFinalRpxThemeRisk(session, [source], { platform: 'mp-weixin' })
    expect(warn).not.toHaveBeenCalled()
    recordRpxThemeRisk(session, 'theme', ['--spacing'])
    warnFinalRpxThemeRisk(session, [source], { platform: 'mp-alipay' })
    warnFinalRpxThemeRisk(session, [source], { platform: 'mp-weixin', logLevel: 'silent' })
    expect(warn).not.toHaveBeenCalled()
    warnFinalRpxThemeRisk(session, [source], { platform: 'mp-weixin' })
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
