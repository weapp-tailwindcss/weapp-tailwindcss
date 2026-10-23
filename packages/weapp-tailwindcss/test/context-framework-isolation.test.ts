import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uniAppXCssPipelineStrategy } from '@/bundlers/vite/frameworks/uni-app-x'
import { resolveFrameworkStylePlatform } from '@/bundlers/vite/shared/framework-runtime-configuration'
import { getCompilerContext } from '@/context'
import { createCompilerContextCacheKey } from '@/context/compiler-context-cache'
import { resolveContextGeneratorConfiguration } from '@/generator/context-options'
import { generatorTargetEnvKeys } from '@/runtime-branch/generator-target-env'
import { createUniAppXNativeBuildTargetResolver } from '@/uni-app-x/vite/native-target'

beforeEach(() => {
  for (const key of generatorTargetEnvKeys) {
    vi.stubEnv(key, undefined)
  }
})
afterEach(() => vi.unstubAllEnvs())

describe('框架环境与 context 缓存隔离', () => {
  it('交错解析 uni-app-x Vite 平台时已有实例保持自身的原生与 Web 策略', () => {
    const options = { appType: 'uni-app-x' as const, uniAppX: true, tailwindcssBasedir: process.cwd(), logLevel: 'silent' as const }
    vi.stubEnv('UNI_UTS_PLATFORM', 'web')
    const web = getCompilerContext(options)
    const webNativeTarget = createUniAppXNativeBuildTargetResolver(() => undefined)
    vi.stubEnv('UNI_UTS_PLATFORM', 'app-harmony')
    const native = getCompilerContext(options)
    const nativeTarget = createUniAppXNativeBuildTargetResolver(() => undefined)
    const context = (opts: typeof web) => {
      const currentGeneratorOptions = resolveContextGeneratorConfiguration(opts).options
      return { opts, currentGeneratorOptions, currentGeneratorBranch: currentGeneratorOptions.branch, resolvedConfig: undefined, resolveStylePlatform: () => resolveFrameworkStylePlatform(opts, undefined) }
    }
    for (const environment of ['web', 'app-harmony', 'mp-weixin']) {
      vi.stubEnv('UNI_UTS_PLATFORM', environment)
      expect(resolveContextGeneratorConfiguration(web).options.target).toBe('web')
      expect(resolveFrameworkStylePlatform(web, undefined)).toBe('web')
      expect(uniAppXCssPipelineStrategy.isNativeAppStyleTarget!(context(web))).toBe(false)
      expect(uniAppXCssPipelineStrategy.isHarmonyAppStyleTarget!(context(web))).toBe(false)
      expect(uniAppXCssPipelineStrategy.isNativeAppStyleTarget!(context(native))).toBe(true)
      expect(uniAppXCssPipelineStrategy.isHarmonyAppStyleTarget!(context(native))).toBe(true)
      expect(webNativeTarget()).toBe(false)
      expect(nativeTarget()).toBe(true)
    }
  })

  it.each(['MPX_CLI_MODE', 'MPX_CURRENT_TARGET_MODE'])('显式 basedir 下切换 %s 会创建匹配平台的新 context', (key) => {
    const options = { appType: 'mpx' as const, tailwindcssBasedir: process.cwd(), logLevel: 'silent' as const }
    vi.stubEnv(key, 'web')
    const web = getCompilerContext(options)
    vi.stubEnv(key, 'wx')
    const mini = getCompilerContext(options)
    expect(web.platform).toBe('web')
    expect(mini.platform).toBe('mp-weixin')
    expect(mini).not.toBe(web)
    expect(mini.tailwindRuntime).not.toBe(web.tailwindRuntime)
    expect(mini.cache).not.toBe(web.cache)
    vi.stubEnv(key, 'web')
    expect(getCompilerContext({ ...options })).toBe(web)
    expect(web.platform).toBe('web')
    expect(mini.platform).toBe('mp-weixin')
  })

  it.each([
    ['UNI_PLATFORM', 'h5', 'mp-weixin'],
    ['UNI_UTS_PLATFORM', 'app-android', 'app-ios'],
    ['TARO_ENV', 'h5', 'weapp'],
    ['WEAPP_TW_TARGET', 'web', 'weapp'],
    ['WEAPP_TAILWINDCSS_TARGET', 'web', 'weapp'],
  ])('显式和隐式 basedir 的缓存键都感知 %s', (key, first, second) => {
    for (const options of [{ tailwindcssBasedir: process.cwd() }, {}]) {
      vi.stubEnv(key, first)
      const firstKey = createCompilerContextCacheKey(options)
      vi.stubEnv(key, second)
      expect(createCompilerContextCacheKey(options)).not.toBe(firstKey)
      vi.stubEnv(key, first)
      expect(createCompilerContextCacheKey(options)).toBe(firstKey)
    }
  })
})
