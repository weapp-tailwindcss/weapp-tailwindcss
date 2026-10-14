import os from 'node:os'
import * as env from '@weapp-tailwindcss/env'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as framework from '@/framework'
import { normalizeFrameworkStylePlatform } from '@/framework/platform'
import { isRunningInHBuilderX as legacyHBuilderX } from '@/utils/hbuilderx'
import { resolveUniUtsPlatform as legacyUniUtsPlatform } from '@/utils/uni-platform'

const { normalizeFrameworkStylePlatform: normalize, ...publicEnv } = env

afterEach(() => vi.unstubAllEnvs())

describe('framework 兼容层', () => {
  it('保留既有导出且委托同一个识别实现', () => {
    expect(Object.keys(framework).sort()).toEqual([...Object.keys(publicEnv), 'resolveImplicitAppTypeFromViteRoot'].sort())
    for (const name of Object.keys(publicEnv) as Array<keyof typeof publicEnv>) {
      expect(framework[name], name).toBe(publicEnv[name])
    }
    expect(normalizeFrameworkStylePlatform).toBe(normalize)
  })

  it('工具包装继续使用新包的识别实现', () => {
    vi.stubEnv('UNI_UTS_PLATFORM', 'app-ios')
    expect(legacyUniUtsPlatform()).toEqual(env.resolveUniUtsPlatform())
    const hints = { cwd: '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli-vite', nodePath: null }
    expect(legacyHBuilderX(hints)).toBe(env.isRunningInHBuilderX(hints))
  })

  it('旧入口的显式环境快照也保持隔离', () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    vi.stubEnv('UNI_UTS_PLATFORM', 'app-android')
    vi.stubEnv('TARO_ENV', 'h5')
    vi.stubEnv('MPX_CURRENT_TARGET_MODE', 'web')
    expect(framework.resolveUniPlatformsFromEnv({}).uniUtsPlatform.normalized).toBeUndefined()
    expect(framework.resolveTaroPlatformFromEnv({}).raw).toBeUndefined()
    expect(framework.resolveMpxPlatformFromEnv({ MPX_CLI_MODE: 'wx' }).raw).toBe('wx')
    expect(framework.detectAppTypeFromEnv({}, { cwd: os.tmpdir() })).toBeUndefined()
  })
})
