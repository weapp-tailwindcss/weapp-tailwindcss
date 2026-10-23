import type { InternalUserDefinedOptions } from '@/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCompilerContext } from '@/context'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { generatorTargetEnvKeys, resolveFrameworkPolicy } from '@/framework-policies/resolve'
import { resolveMiniProgramPreflightModeForGeneratorCss } from '@/generation/generation-helpers/preflight'
import { normalizeWeappTailwindcssGeneratorOptions, resolveGeneratorConfiguration } from '@/generator/options'

beforeEach(() => {
  for (const key of generatorTargetEnvKeys) {
    vi.stubEnv(key, undefined)
  }
})
afterEach(() => vi.unstubAllEnvs())

describe('框架策略兼容入口', () => {
  it('保留公开归一化结果形状，仅内部配置携带策略', () => {
    const resolved = resolveGeneratorConfiguration(undefined, { appType: 'uni-app-x', uniAppX: true })
    expect(normalizeWeappTailwindcssGeneratorOptions(undefined, { appType: 'uni-app-x', uniAppX: true })).toEqual(resolved.options)
    expect(resolved.options).not.toHaveProperty('frameworkPolicy')
    expect(resolved.frameworkPolicy.preflight.localImports).toBe(true)
  })

  it.each(['app', 'app-plus'])('保留普通 uni-app %s WebView 与显式 target 的优先级', (platform) => {
    vi.stubEnv('WEAPP_TW_TARGET', 'weapp')
    expect(resolveGeneratorConfiguration(undefined, { appType: 'uni-app-vite', platform }).options.target).toBe('web')
    const explicit = resolveGeneratorConfiguration({ target: 'weapp' }, { appType: 'uni-app-vite', platform })
    expect(explicit.options.target).toBe('weapp')
    expect(explicit.options.webCompat).toBeUndefined()
  })

  it.each(['app-android', 'app-ios', 'app-harmony'])('原生分支必须同时满足框架身份、启用选项和 %s 目标', (uniUtsPlatform) => {
    expect(resolveFrameworkPolicy({ appType: 'uni-app-x', uniAppX: {}, uniUtsPlatform }).useNativeApp).toBe(true)
    expect(resolveFrameworkPolicy({ appType: 'uni-app-x', uniAppX: false, uniUtsPlatform }).useNativeApp).toBe(false)
    expect(resolveFrameworkPolicy({ appType: 'taro', uniAppX: true, uniUtsPlatform }).useNativeApp).toBe(false)
  })

  it('环境切换与独立实例之间不复用策略快照', () => {
    vi.stubEnv('MPX_CLI_MODE', 'web')
    const web = resolveFrameworkPolicy({ appType: 'mpx' })
    vi.stubEnv('MPX_CLI_MODE', 'wx')
    const mini = resolveFrameworkPolicy({ appType: 'mpx' })
    expect(web.defaultGeneratorTarget).toBe('web')
    expect(mini.defaultGeneratorTarget).toBe('weapp')
    expect(mini.contextDefaults.platform).toBe('mp-weixin')
    expect(web.preflight).not.toBe(mini.preflight)
    const first = resolveFrameworkPolicy({ uniAppX: true })
    const second = resolveFrameworkPolicy({ uniAppX: true })
    expect(first.preflight.defaults).not.toBe(second.preflight.defaults)
  })

  it('框架默认值保留用户明确的 border 配置，且不污染其它 context', () => {
    const native = getCompilerContext({
      appType: 'uni-app-x',
      uniAppX: true,
      cssPreflight: { 'border-style': 'dotted', border: false },
    })
    expect(native.cssPreflight).toMatchObject({ 'border-width': '0', 'border-style': 'dotted', border: false })
    const generic = getCompilerContext({ appType: 'taro' })
    expect(generic.cssPreflight).not.toHaveProperty('border-style', 'dotted')
    expect(getCompilerContext({ appType: 'uni-app-x', cssPreflight: false }).cssPreflight).toBe(false)
  })

  it('样式选项一次读取嵌套配置并消费 Web 策略', () => {
    let reads = 0
    const ctx = {
      appType: 'uni-app-vite',
      generator: { target: 'web' },
      get cssOptions() {
        reads += 1
        return { rem2rpx: true, platform: 'h5' }
      },
    } as unknown as InternalUserDefinedOptions
    expect(resolveStyleOptionsFromContext(ctx).rem2rpx).toBe(false)
    expect(reads).toBe(1)
    expect(resolveStyleOptionsFromContext({ generator: { target: 'web' }, rem2rpx: true } as InternalUserDefinedOptions).rem2rpx).toBe(true)
  })
})

describe('生成 preflight 策略', () => {
  const options = {
    cssHandlerOptions: { isMainChunk: false },
    isolateCurrentCssCandidates: true,
    localImports: '@import "./component.css";',
  }

  it('保留旧直调 uniAppX 局部 import 行为', () => {
    expect(resolveMiniProgramPreflightModeForGeneratorCss({ uniAppX: true } as InternalUserDefinedOptions, options)).toEqual({ inject: true, preserve: true })
    expect(resolveMiniProgramPreflightModeForGeneratorCss({ uniAppX: false } as InternalUserDefinedOptions, options)).toEqual({ inject: false, preserve: false })
  })

  it('预解析策略驱动输出，不再读取原始框架身份', () => {
    const frameworkPolicy = resolveFrameworkPolicy({ uniAppX: true })
    expect(resolveMiniProgramPreflightModeForGeneratorCss({ uniAppX: false } as InternalUserDefinedOptions, { ...options, frameworkPolicy })).toEqual({ inject: true, preserve: true })
  })

  it('uvue 样式禁用 preflight，普通主样式仍可注入', () => {
    const nativeStyle = { ...options, cssHandlerOptions: { isMainChunk: true, uniAppX: true, uniAppXCssTarget: 'uvue' as const } }
    expect(resolveMiniProgramPreflightModeForGeneratorCss({ uniAppX: true } as InternalUserDefinedOptions, nativeStyle)).toEqual({ inject: false, preserve: false })
    expect(resolveMiniProgramPreflightModeForGeneratorCss({ uniAppX: true } as InternalUserDefinedOptions, { ...options, cssHandlerOptions: { isMainChunk: true } })).toEqual({ inject: true, preserve: true })
  })
})
