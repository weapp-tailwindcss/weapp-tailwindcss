import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectAppType,
  detectAppTypeFromEnv,
  resolveMpxPlatform,
  resolveTaroPlatform,
  resolveUniAppXPlatform,
  resolveUniPlatform,
  resolveUniPlatformsFromEnv,
  resolveUniUtsPlatform,
} from '../src'

const cwd = os.tmpdir()

beforeEach(() => {
  for (const key of ['MPX_CLI_MODE', 'MPX_CURRENT_TARGET_MODE', 'NODE_PATH', 'TARO_ENV', 'UNI_PLATFORM', 'UNI_UTS_PLATFORM', 'WEAPP_TW_TARGET', 'WEAPP_TAILWINDCSS_TARGET']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('UNI_PLATFORM', 'h5')
  vi.stubEnv('UNI_UTS_PLATFORM', 'app-android')
})

afterEach(() => vi.unstubAllEnvs())

describe('显式环境快照隔离', () => {
  it.each([
    [{}, undefined, undefined],
    [{ UNI_PLATFORM: 'mp-weixin' }, 'mp-weixin', undefined],
    [{ UNI_UTS_PLATFORM: 'app-ios' }, undefined, 'app-ios'],
    [{ UNI_PLATFORM: undefined, UNI_UTS_PLATFORM: undefined }, undefined, undefined],
    [{ UNI_PLATFORM: 'web', UNI_UTS_PLATFORM: 'app-harmony' }, 'web', 'app-harmony'],
  ] as const)('只读取传入快照 %j', (env, uni, uts) => {
    const platforms = resolveUniPlatformsFromEnv(env)
    expect(platforms.uniPlatform.normalized).toBe(uni)
    expect(platforms.uniAppXPlatform.normalized).toBe(uts)
    expect(platforms.uniUtsPlatform.normalized).toBe(uts)
  })

  it('空快照不会从进程推断框架，即使 detectEnv 已开启', () => {
    expect(detectAppTypeFromEnv({}, { cwd })).toBeUndefined()
    expect(detectAppType({ env: {}, detectEnv: true, cwd })).toBeUndefined()
    expect(detectAppTypeFromEnv({ UNI_PLATFORM: 'mp-weixin' }, { cwd })).toBe('uni-app-vite')
  })

  it('未传快照时仍读取调用时的环境', () => {
    expect(resolveUniPlatformsFromEnv().uniPlatform.normalized).toBe('h5')
    expect(detectAppTypeFromEnv(undefined, { cwd })).toBe('uni-app-x')
    expect(detectAppType({ detectEnv: true, cwd })).toBe('uni-app-x')
    expect(detectAppType({ cwd })).toBeUndefined()
    vi.stubEnv('UNI_UTS_PLATFORM', undefined)
    vi.stubEnv('UNI_PLATFORM', 'mp-alipay')
    expect(detectAppTypeFromEnv(undefined, { cwd })).toBe('uni-app-vite')
    expect(resolveUniPlatformsFromEnv().uniPlatform.normalized).toBe('mp-alipay')
  })

  it('单值解析函数仍支持默认环境及显式 undefined', () => {
    vi.stubEnv('TARO_ENV', 'weapp')
    vi.stubEnv('MPX_CLI_MODE', 'web')
    vi.stubEnv('MPX_CURRENT_TARGET_MODE', 'wx')
    expect(resolveUniPlatform().raw).toBe('h5')
    expect(resolveUniPlatform(undefined).raw).toBe('h5')
    expect(resolveUniUtsPlatform().raw).toBe('app-android')
    expect(resolveUniAppXPlatform(undefined).raw).toBe('app-android')
    expect(resolveTaroPlatform().raw).toBe('weapp')
    expect(resolveMpxPlatform().raw).toBe('wx')
    vi.stubEnv('MPX_CURRENT_TARGET_MODE', undefined)
    expect(resolveMpxPlatform().raw).toBe('web')
  })

  it('保持框架环境优先级', () => {
    const env = { UNI_PLATFORM: 'h5', UNI_UTS_PLATFORM: 'app-ios', MPX_CLI_MODE: 'wx', TARO_ENV: 'weapp' }
    expect(detectAppTypeFromEnv({ ...env, WEAPP_TW_TARGET: 'weapp-vite' }, { cwd })).toBe('weapp-vite')
    expect(detectAppTypeFromEnv({ ...env, WEAPP_TAILWINDCSS_TARGET: 'weapp-vite' }, { cwd })).toBe('weapp-vite')
    expect(detectAppTypeFromEnv(env, { cwd })).toBe('taro')
    expect(detectAppTypeFromEnv({ ...env, TARO_ENV: undefined }, { cwd })).toBe('mpx')
    expect(detectAppTypeFromEnv({ UNI_PLATFORM: 'h5', UNI_UTS_PLATFORM: 'app-ios' }, { cwd })).toBe('uni-app-x')
  })
})
