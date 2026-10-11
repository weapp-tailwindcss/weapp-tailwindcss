import { describe, expect, it } from 'vitest'
import { isRunningInHBuilderX, normalizeFrameworkStylePlatform, resolvePlatform } from '../src'

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
