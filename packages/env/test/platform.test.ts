import { describe, expect, it } from 'vitest'
import { isRunningInHBuilderX, normalizeFrameworkStylePlatform, resolveMpxPlatform, resolvePlatform, resolvePlatformIdentity } from '../src'

describe('平台与 HBuilderX 事实', () => {
  it.each([
    [' WEB-CUSTOM ', 'web-custom', 'isWeb'],
    [' MP-WEIXIN ', 'mp-weixin', 'isMp'],
    ['weapp', 'weapp', 'isMp'],
    ['app-plus', 'app-plus', 'isApp'],
    ['app-ios', 'app-ios', 'isAppIos'],
    ['app-android', 'app-android', 'isAppAndroid'],
    ['app-harmony', 'app-harmony', 'isAppHarmony'],
  ] as const)('规范化平台 %s', (raw, normalized, flag) => {
    const info = resolvePlatform(raw)
    expect(info.raw).toBe(raw)
    expect(info.normalized).toBe(normalized)
    expect(info[flag]).toBe(true)
  })

  it.each([undefined, '', '  ', 'unknown'])('未知平台 %s 不猜测平台族', (value) => {
    expect(resolvePlatform(value)).toMatchObject({ isApp: false, isMp: false, isWeb: false })
  })

  it.each([
    ['ali', 'mp-alipay'], ['dd', 'mp-dingtalk'], ['jd', 'mp-jd'],
    ['qq', 'mp-qq'], ['swan', 'mp-baidu'], ['tt', 'mp-toutiao'], ['wx', 'mp-weixin'],
  ])('仅 MPX 的 %s 映射为 %s', (value, expected) => {
    expect(normalizeFrameworkStylePlatform(` ${value.toUpperCase()} `, 'mpx')).toBe(expected)
    expect(normalizeFrameworkStylePlatform(value, 'taro')).toBe(value)
  })

  it('不补充未知平台及空输入', () => {
    expect(normalizeFrameworkStylePlatform('custom', 'mpx')).toBe('custom')
    expect(normalizeFrameworkStylePlatform(' ', undefined)).toBeUndefined()
  })

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('MPX 不把继承属性 %s 当成平台别名', (value) => {
    const normalized = normalizeFrameworkStylePlatform(value, 'mpx')
    expect(normalized).toBe(value.toLowerCase())
    expect(() => resolvePlatform(normalized)).not.toThrow()
  })

  it.each(['ali', 'dd', 'jd', 'qq', 'swan', 'tt', 'wx'])('MPX 的 %s 属于小程序并保留输入', (value) => {
    const raw = ` ${value.toUpperCase()} `
    expect(resolveMpxPlatform(raw)).toMatchObject({ raw, normalized: value, isMp: true, isWeb: false, isApp: false })
  })

  it.each(['ali', 'dd'])('通用 resolver 不把 MPX 专属 %s 猜测为小程序', (value) => {
    expect(resolvePlatform(value).isMp).toBe(false)
  })

  it.each([
    ['weapp', 'taro', 'mp-weixin'],
    ['wechat', 'weapp-vite', 'mp-weixin'],
    ['wx', 'mpx', 'mp-weixin'],
    ['mp-weixin', 'uni-app', 'mp-weixin'],
    ['alipay', 'taro', 'mp-alipay'],
    ['ali', 'mpx', 'mp-alipay'],
    ['mp-alipay', 'uni-app', 'mp-alipay'],
    ['baidu', 'taro', 'mp-baidu'],
    ['swan', 'mpx', 'mp-baidu'],
    ['mp-baidu', 'uni-app', 'mp-baidu'],
    ['jd', 'mpx', 'mp-jd'],
    ['mp-jd', 'uni-app', 'mp-jd'],
    ['qq', 'taro', 'mp-qq'],
    ['mp-qq', 'uni-app', 'mp-qq'],
    ['tt', 'mpx', 'mp-toutiao'],
    ['mp-toutiao', 'uni-app', 'mp-toutiao'],
    ['dd', 'mpx', 'mp-dingtalk'],
    ['mp-dingtalk', 'uni-app', 'mp-dingtalk'],
    ['h5', 'taro', 'web'],
    ['web', 'mpx', 'web'],
  ])('平台 %s 在 %s 中的统一身份为 %s', (value, appType, canonical) => {
    const raw = ` ${value.toUpperCase()} `
    expect(resolvePlatformIdentity(raw, appType)).toEqual({ raw, normalized: value, canonical })
  })

  it.each(['app', 'app-plus', 'app-android', 'app-ios', 'app-harmony'] as const)('保留独立 App 身份 %s', (value) => {
    expect(resolvePlatformIdentity(value, 'uni-app')).toEqual({ raw: value, normalized: value, canonical: value })
  })

  it.each([undefined, '', ' ', 'custom', 'mp-custom', 'web-custom', 'app-custom', 'constructor', '__proto__'])('未知 %s 不生成统一身份', (raw) => {
    expect(resolvePlatformIdentity(raw, 'mpx')).toEqual({ raw, normalized: raw?.trim() || undefined, canonical: undefined })
  })

  it.each(['ali', 'dd'])('统一身份只在 MPX 上下文解析专属别名 %s', (value) => {
    expect(resolvePlatformIdentity(value).canonical).toBeUndefined()
    expect(resolvePlatformIdentity(value, 'taro').canonical).toBeUndefined()
    expect(resolvePlatformIdentity(value, 'uni-app').canonical).toBeUndefined()
  })

  it('统一身份与既有平台 resolver 使用独立的公开形状', () => {
    expect(Object.keys(resolvePlatformIdentity('weapp'))).toEqual(['raw', 'normalized', 'canonical'])
    expect(Object.keys(resolveMpxPlatform('ali'))).toEqual(Object.keys(resolvePlatform('alipay')))
    expect(resolvePlatform('mp-custom').isMp).toBe(true)
    expect(resolvePlatform('web-custom').isWeb).toBe(true)
    expect(resolvePlatform('app-custom').isApp).toBe(true)
  })

  it.each([
    '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli-vite',
    '/opt/HBuilderX/plugins/uniapp-cli/worker',
    String.raw`C:\tools\HBuilderX\plugins\uniapp-cli-vite`,
    String.raw`E:\workspace\HBuilderX.4.87.2025121004\HBuilderX\plugins\uniapp-cli`,
    String.raw`\\server\tools\HBuilderX\plugins\uniapp-cli-vite\worker`,
  ])('识别 HBuilderX 路径 %s', (cwd) => {
    expect(isRunningInHBuilderX({ cwd, env: { NODE_PATH: ' ' } })).toBe(true)
    expect(isRunningInHBuilderX({ cwd, nodePath: '/node_modules', env: {} })).toBe(false)
    expect(isRunningInHBuilderX({ cwd, nodePath: null, env: { NODE_PATH: '/node_modules' } })).toBe(true)
  })

  it.each([
    '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli-vite-other',
    String.raw`C:\tools\HBuilderX-other\plugins\uniapp-cli`,
    '/project/plugins/uniapp-cli-vite',
  ])('不误认相邻目录 %s', (cwd) => {
    expect(isRunningInHBuilderX({ cwd, env: {} })).toBe(false)
  })
})
