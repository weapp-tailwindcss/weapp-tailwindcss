import { describe, expect, it } from 'vitest'
import { resolveMpxPlatform, resolvePlatform, resolvePlatformIdentity, resolveTaroPlatform, resolveTaroPlatformFromEnv, resolveUniPlatform } from '../src'

describe('Taro Harmony WebView 平台事实', () => {
  it.each(['h5', 'harmony-hybrid', ' HARMONY-HYBRID '])('%s 与环境快照都识别为 Web，保留输入身份', (value) => {
    const snapshot = Object.freeze({ TARO_ENV: value })
    const platform = resolveTaroPlatform(value)
    expect(platform).toMatchObject({ raw: value, normalized: value.trim().toLowerCase(), isWeb: true, isApp: false, isMp: false })
    expect(resolveTaroPlatformFromEnv(snapshot)).toEqual(platform)
    expect(resolvePlatformIdentity(value, 'taro').canonical).toBe('web')
    expect(snapshot).toEqual({ TARO_ENV: value })
  })

  it.each(['harmony', 'app-harmony', 'rn', 'weapp', 'harmony-custom', 'unknown'])('%s 不继承 Hybrid 的 Web 分类', (value) => {
    expect(resolveTaroPlatform(value).isWeb).toBe(false)
    expect(resolveTaroPlatformFromEnv(Object.freeze({ TARO_ENV: value })).isWeb).toBe(false)
    expect(resolvePlatformIdentity(value, 'taro').canonical).not.toBe('web')
  })

  it('Hybrid 别名只由 Taro 解释，通用、Uni 与 Mpx 保留未知平台边界', () => {
    for (const resolve of [resolvePlatform, resolveUniPlatform, resolveMpxPlatform]) {
      expect(resolve('harmony-hybrid').isWeb).toBe(false)
    }
    for (const appType of [undefined, 'uni-app', 'uni-app-x', 'mpx'] as const) {
      expect(resolvePlatformIdentity('harmony-hybrid', appType).canonical).toBeUndefined()
    }
    expect(Object.keys(resolveTaroPlatform('harmony-hybrid')).sort()).toEqual(Object.keys(resolvePlatform('h5')).sort())
  })
})
