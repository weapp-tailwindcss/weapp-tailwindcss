import type { TailwindV4GenerationCoreInput } from '@/context/generation'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebpackGeneratorRequestOptions } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/generator-request'
import { resolveCompilationProfile } from '@/context/compilation-profile'
import { generateTailwindV4Css } from '@/context/generation'
import { initializeFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

const { requests } = vi.hoisted(() => ({ requests: [] as any[] }))

vi.mock('@/generation/service', () => ({
  generateTailwindV4Css(input: unknown) {
    requests.push(input)
    return Promise.resolve(undefined)
  },
}))

function createRequest(): TailwindV4GenerationCoreInput {
  const opts = {
    appType: 'taro',
    generator: { target: 'weapp' },
    cssPreflight: false,
    cssOptions: { platform: 'mp-weixin' },
    logLevel: 'silent',
  } as InternalUserDefinedOptions
  initializeFrameworkEnvironment(opts)
  return {
    opts,
    runtimeState: {
      tailwindRuntime: { majorVersion: 4, options: { tailwindcss: { v4: { cssEntries: [] } } } } as any,
      readyPromise: Promise.resolve(),
    },
    runtime: new Set(['p-4']),
    rawSource: '@import "tailwindcss";',
    file: path.resolve('entry.css'),
    cssHandlerOptions: { majorVersion: 4, isMainChunk: true },
    cssUserHandlerOptions: { majorVersion: 4, isMainChunk: false },
    styleHandler: vi.fn(async (css: string) => ({ css })) as any,
    debug: vi.fn(),
  }
}

afterEach(() => {
  requests.length = 0
  vi.unstubAllEnvs()
})

describe('生成兼容桥的配置与请求快照复用', () => {
  it('同一 Webpack 来源在请求与两类样式参数中只快照一次，保留只读别名', async () => {
    const request = createRequest()
    let sourceReads = 0
    const dependencies = Object.freeze([path.resolve('dependency.css')])
    const source = Object.freeze({
      file: request.file,
      css: request.rawSource,
      get dependencies() {
        sourceReads++
        return dependencies
      },
    })
    const styleOptions = {
      ...request.cssHandlerOptions,
      sourceOptions: { sourceFile: request.file, cssSources: [source] },
    }
    const projected = createWebpackGeneratorRequestOptions(request.opts, styleOptions, request.file)
    expect(projected.cssSources).toBe(projected.cssHandlerOptions.sourceOptions?.cssSources)
    await generateTailwindV4Css({
      ...request,
      ...projected,
      cssUserHandlerOptions: { ...styleOptions, isMainChunk: false },
    })
    const captured = requests.at(-1)
    expect(sourceReads).toBe(1)
    expect(captured.cssSources[0]).toBe(captured.cssHandlerOptions.sourceOptions.cssSources[0])
    expect(captured.cssSources[0]).toBe(captured.cssUserHandlerOptions.sourceOptions.cssSources[0])
    expect(captured.cssSources[0]).not.toBe(source)
    expect(Object.isFrozen(captured.cssSources[0])).toBe(true)
    expect(captured.cssSources[0].dependencies).toEqual(dependencies)
    expect(request.runtime).toEqual(new Set(['p-4']))
  })

  it('同一 owner 的未变配置复用只读 profile，后续配置更新独立快照并使旧请求失效', async () => {
    const request = createRequest()
    await generateTailwindV4Css(request)
    const first = requests.at(-1)
    await generateTailwindV4Css(request)
    const second = requests.at(-1)
    expect(second.profile).toBe(first.profile)
    expect(second.runtime).not.toBe(first.runtime)
    expect(second.runtime).not.toBe(request.runtime)
    expect(first.isConfigurationCurrent()).toBe(true)

    request.opts.cssPreflight = { border: false }
    request.runtime.clear()
    request.runtime.add('m-2')
    await generateTailwindV4Css(request)
    const changed = requests.at(-1)
    expect(changed.profile).not.toBe(first.profile)
    expect(changed.profile.revision).toBe(first.profile.revision + 1)
    expect(first.profile.cssPreflight).toBe(false)
    expect(first.runtime).toEqual(new Set(['p-4']))
    expect(changed.runtime).toEqual(new Set(['m-2']))
    expect(first.isConfigurationCurrent()).toBe(false)
    expect(changed.isConfigurationCurrent()).toBe(true)

    request.opts.cssPreflight = false
    await generateTailwindV4Css(request)
    const restored = requests.at(-1)
    expect(restored.profile.revision).toBe(changed.profile.revision + 1)
    expect(restored.profile).not.toBe(first.profile)
    expect(first.isConfigurationCurrent()).toBe(false)
    expect(changed.isConfigurationCurrent()).toBe(false)
    expect(restored.isConfigurationCurrent()).toBe(true)
  })

  it('跨请求继续复制来源与运行时配置，用户原位修改不会污染已接收请求', async () => {
    const request = createRequest()
    const source = { file: request.file, css: '.first {}', dependencies: ['first.css'] }
    const options = { cssSources: [source] }
    request.cssSources = options.cssSources
    request.cssHandlerOptions.sourceOptions = options
    request.cssUserHandlerOptions.sourceOptions = options
    request.runtimeState.tailwindRuntime.options = options as any
    await generateTailwindV4Css(request)
    const first = requests.at(-1)
    source.css = '.second {}'
    source.dependencies.push('second.css')
    await generateTailwindV4Css(request)
    const second = requests.at(-1)

    expect(first.cssSources[0]).toBe(first.sourceRuntimeState.tailwindRuntime.options.cssSources[0])
    expect(first.cssSources[0]).not.toBe(second.cssSources[0])
    expect(first.cssSources[0]).toEqual({ file: request.file, css: '.first {}', dependencies: ['first.css'] })
    expect(second.cssSources[0]).toEqual(source)
    expect(Object.isFrozen(source)).toBe(false)
    expect(Object.isFrozen(source.dependencies)).toBe(false)
  })

  it('请求覆盖只复用对应快照，不改变配置 revision 或其它请求的目标', () => {
    const { opts, runtimeState } = createRequest()
    const overrides = { platform: 'app-android', nativeStyle: true, styleTarget: 'uvue' }
    const first = resolveCompilationProfile(opts, runtimeState)
    const native = resolveCompilationProfile(opts, runtimeState, overrides)
    const repeated = resolveCompilationProfile(opts, runtimeState, { ...overrides })
    const last = resolveCompilationProfile(opts, runtimeState)

    expect(repeated.profile).toBe(native.profile)
    expect(native.profile).not.toBe(first.profile)
    expect(native.profile.policy.preflight.suppress).toBe(true)
    expect(first.profile.policy.preflight.suppress).toBe(false)
    expect(last.profile.policy.preflight.suppress).toBe(false)
    expect(last.profile.revision).toBe(first.profile.revision)
    expect(native.profile.revision).toBe(first.profile.revision)
    expect(first.isCurrent()).toBe(true)
    expect(native.isCurrent()).toBe(true)
  })

  it('同源码不同捕获值的回调保留独立身份，替换配置后使旧请求失效', () => {
    const { opts, runtimeState } = createRequest()
    const createCallback = (value: string) => () => value
    const firstCallback = createCallback('first')
    const secondCallback = createCallback('second')
    expect(firstCallback.toString()).toBe(secondCallback.toString())
    opts.postcssOptions = { plugins: [{ postcssPlugin: 'captured', Once: firstCallback }] }
    const first = resolveCompilationProfile(opts, runtimeState)
    expect(resolveCompilationProfile(opts, runtimeState).profile).toBe(first.profile)

    opts.postcssOptions = { plugins: [{ postcssPlugin: 'captured', Once: secondCallback }] }
    const second = resolveCompilationProfile(opts, runtimeState)
    expect(second.profile.revision).toBe(first.profile.revision + 1)
    expect(first.isCurrent()).toBe(false)
    expect((first.profile.styleOptions.postcssOptions!.plugins![0] as any).Once()).toBe('first')
    expect((second.profile.styleOptions.postcssOptions!.plugins![0] as any).Once()).toBe('second')
  })

  it('同属性同函数的插件替换仍保留实例身份，原位插件配置更新同样失效', () => {
    const { opts, runtimeState } = createRequest()
    const visits = new WeakMap<object, number>()
    const visit = function (this: object) {
      return visits.get(this)
    }
    const firstPlugin = { postcssPlugin: 'instance', Once: visit, value: 1 }
    const nextPlugin = { ...firstPlugin }
    visits.set(firstPlugin, 1)
    visits.set(nextPlugin, 2)
    opts.postcssOptions = { plugins: [firstPlugin] }
    const first = resolveCompilationProfile(opts, runtimeState)
    opts.postcssOptions.plugins = [nextPlugin]
    const next = resolveCompilationProfile(opts, runtimeState)
    nextPlugin.value = 2
    const updated = resolveCompilationProfile(opts, runtimeState)

    expect(first.profile.styleOptions.postcssOptions!.plugins![0]).toBe(firstPlugin)
    expect(next.profile.styleOptions.postcssOptions!.plugins![0]).toBe(nextPlugin)
    expect(firstPlugin.Once()).toBe(1)
    expect(nextPlugin.Once()).toBe(2)
    expect(next.profile.revision).toBe(first.profile.revision + 1)
    expect(updated.profile.revision).toBe(next.profile.revision + 1)
    expect(first.isCurrent()).toBe(false)
    expect(next.isCurrent()).toBe(false)
  })

  it('显式样式目标与原生诊断策略参与配置版本，原位修改生成配置同样失效', () => {
    const { opts, runtimeState } = createRequest()
    const first = resolveCompilationProfile(opts, runtimeState)
    const styleContext = opts as InternalUserDefinedOptions & { uniAppXCssTarget: 'uvue', uniAppXUnsupported: 'error' }
    styleContext.uniAppXCssTarget = 'uvue'
    const target = resolveCompilationProfile(opts, runtimeState)
    styleContext.uniAppXUnsupported = 'error'
    const unsupported = resolveCompilationProfile(opts, runtimeState)
    if (opts.generator) {
      opts.generator.importFallback = true
    }
    const generator = resolveCompilationProfile(opts, runtimeState)

    expect(target.profile.revision).toBe(first.profile.revision + 1)
    expect(unsupported.profile.revision).toBe(target.profile.revision + 1)
    expect(generator.profile.revision).toBe(unsupported.profile.revision + 1)
    expect(target.profile.styleOptions.uniAppXCssTarget).toBe('uvue')
    expect(unsupported.profile.styleOptions.uniAppXUnsupported).toBe('error')
    expect(first.isCurrent()).toBe(false)
    expect(target.isCurrent()).toBe(false)
    expect(unsupported.isCurrent()).toBe(false)
    expect(generator.isCurrent()).toBe(true)
  })

  it.each(['appType', 'platform', 'majorVersion', 'uniAppX'] as const)('%s 更新参与 profile 版本并使旧请求失效', (field) => {
    const { opts, runtimeState } = createRequest()
    opts.tailwindRuntime = runtimeState.tailwindRuntime
    const first = resolveCompilationProfile(opts, runtimeState)
    if (field === 'appType') {
      opts.appType = 'uni-app-x'
    }
    else if (field === 'platform') {
      opts.cssOptions!.platform = 'app-android'
    }
    else if (field === 'majorVersion') {
      opts.tailwindRuntime.majorVersion = 3
    }
    else {
      opts.uniAppX = true
    }
    const next = resolveCompilationProfile(opts, runtimeState)

    expect(next.profile.revision).toBe(first.profile.revision + 1)
    expect(next.profile).not.toBe(first.profile)
    expect(first.isCurrent()).toBe(false)
    expect(next.isCurrent()).toBe(true)
  })

  it('同配置不同 owner 不共享 profile，交错请求沿用各实例环境', () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    const first = createRequest()
    first.opts.appType = 'uni-app-vite'
    first.opts.generator = undefined
    first.opts.cssOptions = undefined
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin')
    const second = createRequest()
    second.opts.appType = 'uni-app-vite'
    second.opts.generator = undefined
    second.opts.cssOptions = undefined
    const web = resolveCompilationProfile(first.opts, first.runtimeState)
    const mini = resolveCompilationProfile(second.opts, second.runtimeState)
    vi.stubEnv('UNI_PLATFORM', 'app-plus')
    const repeated = resolveCompilationProfile(first.opts, first.runtimeState)
    const independent = resolveCompilationProfile(first.opts, {})

    expect(repeated.profile).toBe(web.profile)
    expect(independent.profile).not.toBe(web.profile)
    expect(web.profile.generator.target).toBe('web')
    expect(mini.profile.generator.target).toBe('weapp')
    expect(web.isCurrent()).toBe(true)
    expect(mini.isCurrent()).toBe(true)
  })
})
