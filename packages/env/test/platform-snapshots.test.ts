import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveMpxPlatform,
  resolveMpxPlatformFromEnv,
  resolveTaroPlatform,
  resolveTaroPlatformFromEnv,
} from '../src'

beforeEach(() => {
  vi.stubEnv('TARO_ENV', 'h5')
  vi.stubEnv('MPX_CURRENT_TARGET_MODE', 'web')
  vi.stubEnv('MPX_CLI_MODE', 'wx')
})

afterEach(() => vi.unstubAllEnvs())

describe('Taro/MPX 平台环境快照', () => {
  it.each([
    [{}, undefined],
    [{ TARO_ENV: undefined }, undefined],
    [{ UNI_PLATFORM: 'h5', MPX_CLI_MODE: 'wx' }, undefined],
    [{ TARO_ENV: 'weapp' }, 'weapp'],
    [{ TARO_ENV: ' H5 ' }, ' H5 '],
    [{ TARO_ENV: '' }, ''],
    [{ TARO_ENV: 'unknown' }, 'unknown'],
  ] as const)('Taro 只读取显式快照 %j', (env, raw) => {
    expect(resolveTaroPlatformFromEnv(Object.freeze(env)).raw).toBe(raw)
  })

  it.each([
    [{}, undefined],
    [{ MPX_CURRENT_TARGET_MODE: undefined, MPX_CLI_MODE: undefined }, undefined],
    [{ TARO_ENV: 'weapp' }, undefined],
    [{ MPX_CLI_MODE: 'wx' }, 'wx'],
    [{ MPX_CURRENT_TARGET_MODE: 'qq' }, 'qq'],
    [{ MPX_CURRENT_TARGET_MODE: 'web', MPX_CLI_MODE: 'wx' }, 'web'],
    [{ MPX_CURRENT_TARGET_MODE: undefined, MPX_CLI_MODE: 'wx' }, 'wx'],
    [{ MPX_CURRENT_TARGET_MODE: '', MPX_CLI_MODE: 'wx' }, ''],
    [{ MPX_CLI_MODE: '' }, ''],
    [{ MPX_CLI_MODE: 'unknown' }, 'unknown'],
  ] as const)('MPX 保持隔离及空值优先级 %j', (env, raw) => {
    expect(resolveMpxPlatformFromEnv(Object.freeze(env)).raw).toBe(raw)
  })

  it('省略快照或传入 undefined 时读取调用时的进程环境', () => {
    expect(resolveTaroPlatformFromEnv().raw).toBe('h5')
    expect(resolveTaroPlatformFromEnv(undefined).raw).toBe('h5')
    expect(resolveMpxPlatformFromEnv().raw).toBe('web')
    expect(resolveMpxPlatformFromEnv(undefined).raw).toBe('web')
    vi.stubEnv('TARO_ENV', 'weapp')
    vi.stubEnv('MPX_CURRENT_TARGET_MODE', undefined)
    expect(resolveTaroPlatformFromEnv().raw).toBe('weapp')
    expect(resolveMpxPlatformFromEnv().raw).toBe('wx')
    vi.stubEnv('MPX_CURRENT_TARGET_MODE', '')
    expect(resolveMpxPlatformFromEnv().raw).toBe('')
  })

  it('返回现有分类事实，不修改冻结快照和进程环境', () => {
    const snapshot = Object.freeze({ TARO_ENV: ' H5 ', MPX_CLI_MODE: 'wx' })
    expect(resolveTaroPlatformFromEnv(snapshot)).toMatchObject({ raw: ' H5 ', normalized: 'h5', isWeb: true })
    expect(resolveMpxPlatformFromEnv(snapshot)).toMatchObject({ raw: 'wx', normalized: 'wx', isMp: true })
    expect(snapshot).toEqual({ TARO_ENV: ' H5 ', MPX_CLI_MODE: 'wx' })
    expect(process.env['TARO_ENV']).toBe('h5')
    expect(process.env['MPX_CURRENT_TARGET_MODE']).toBe('web')
    expect(process.env['MPX_CLI_MODE']).toBe('wx')
    expect(resolveMpxPlatformFromEnv({ MPX_CURRENT_TARGET_MODE: '', MPX_CLI_MODE: 'wx' })).toMatchObject({ raw: '', normalized: undefined, isMp: false })
  })

  it('保留旧单值入口的默认环境契约', () => {
    expect(resolveTaroPlatform(undefined).raw).toBe('h5')
    expect(resolveMpxPlatform(undefined).raw).toBe('web')
    expect(resolveTaroPlatform('weapp').raw).toBe('weapp')
    expect(resolveMpxPlatform('wx').raw).toBe('wx')
  })
})
