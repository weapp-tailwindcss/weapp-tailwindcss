import type { Compiler, CompilerCssTransformOptions } from '@/core/compiler'
import type { InternalUserDefinedOptions } from '@/types'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { finalizeMiniProgramUserCssAssetSource } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/memory-trace'
import { assertSkylineTypographyBundle } from '@/bundlers/vite/css-finalizer/final-assets'
import { createReplayCssAsset } from '@/bundlers/vite/generate-bundle/rollup-assets'
import { finalizeWebpackCssAssetSource } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/finalize'
import { createCompilerContext } from '@/context'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { assertSkylineTypographyAsset, isSkylineTypographyEnabledForContext } from '@/context/skyline-typography'
import { initializeFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { createCompiler } from '@/core/compiler'
import { finalizeMiniProgramGeneratorCss } from '@/generation/generation-helpers/preflight'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '@/generator'

const source = 'view,text{--tw-leading:initial;--tw-font-weight:initial}.text-header-md{line-height:var(--tw-leading,var(--text-header-md--line-height));font-weight:var(--tw-font-weight,var(--text-header-md--font-weight))}'
const options = { cssOptions: { skyline: true, cssPreflight: false } }

function leading(css: string) {
  const result: string[] = []
  postcss.parse(css).walkDecls('--tw-leading', (decl) => { result.push(decl.value) })
  return result
}

describe('Skyline 配置全链路', () => {
  const compilers: Compiler[] = []
  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(compilers.splice(0).map(compiler => compiler.dispose()))
  })

  it('没有显式 platform 时使用实例环境，且不被后续环境污染', () => {
    const contexts = ['mp-weixin', 'mp-alipay', 'h5'].map((platform) => {
      vi.stubEnv('UNI_PLATFORM', platform)
      const context = { appType: 'uni-app-vite', ...options } as InternalUserDefinedOptions
      initializeFrameworkEnvironment(context)
      return { context, platform }
    })
    for (const { context, platform } of contexts) {
      expect(resolveStyleOptionsFromContext(context, 4).platform).toBe(platform)
      expect(isSkylineTypographyEnabledForContext(context, 4)).toBe(platform === 'mp-weixin')
    }
  })

  it.each([undefined, false])('Skyline 关闭时不改变既有 Taro 平台及自动 calc 默认值：%s', (skyline) => {
    vi.stubEnv('TARO_ENV', 'weapp')
    const context = { appType: 'taro', cssOptions: { skyline } } as InternalUserDefinedOptions
    initializeFrameworkEnvironment(context)
    const resolved = resolveStyleOptionsFromContext(context, 4)
    expect(resolved.platform).toBeUndefined()
    expect(resolved.cssCalc).toBeUndefined()
  })

  it.each([undefined, false])('Skyline 关闭时保留 Mpx wx 平台与自动 calc 默认值：%s', (skyline) => {
    vi.stubEnv('MPX_CURRENT_TARGET_MODE', 'wx')
    const context = createCompilerContext({ appType: 'mpx', cssOptions: { skyline } })
    const resolved = resolveStyleOptionsFromContext(context, 4)
    expect(resolved.platform).toBe('mp-weixin')
    expect(resolved.cssCalc).toBe('auto')
    expect(resolved.cssOptions?.platform).toBe('mp-weixin')
    expect(resolved.cssOptions?.cssCalc).toBe('auto')
  })

  it.each(['view{--weapp-tw-invalid-reset:1}', '@property --weapp-tw-invalid-reset{syntax:"*";inherits:false}'])('最终资产校验包括不含消费者的独立资产：%s', (conflict) => {
    const opts = createCompilerContext({ ...options, platform: 'mp-weixin' })
    opts.tailwindRuntime.majorVersion = 4
    const bundle = { 'entry.wxss': createReplayCssAsset('entry.wxss', source), 'isolated.wxss': createReplayCssAsset('isolated.wxss', conflict) }
    expect(() => assertSkylineTypographyBundle(bundle, { opts, runtimeState: opts, getResolvedConfig: () => undefined } as any)).toThrow('保留变量')
  })

  it('重复资产边界复用已验证文本，配置变化和新增冲突仍然报错', () => {
    const opts = createCompilerContext({ ...options, platform: 'mp-weixin' })
    opts.tailwindRuntime.majorVersion = 4
    const parse = vi.spyOn(postcss, 'parse')
    try {
      assertSkylineTypographyAsset(source, opts)
      const parses = parse.mock.calls.length
      expect(parses).toBeGreaterThan(0)
      assertSkylineTypographyAsset(source, opts)
      expect(parse.mock.calls).toHaveLength(parses)
      opts.cssOptions = { ...opts.cssOptions, cssRemoveProperty: false }
      expect(() => assertSkylineTypographyAsset(source, opts)).toThrow('cssRemoveProperty: false')
      opts.cssOptions = { ...opts.cssOptions, cssRemoveProperty: true }
      expect(() => assertSkylineTypographyAsset(`${source}.author{--weapp-tw-invalid-reset:1}`, opts)).toThrow('保留变量')
    }
    finally {
      parse.mockRestore()
    }
  })

  it.each([undefined, 'component.vue?vue&type=style&scoped=abc'])('生成 finalizer 保留旧版平台及 property 策略：%s', (from) => {
    const styleOptions = { ...options, platform: 'mp-alipay', postcssOptions: { options: { from } } }
    expect(leading(finalizeMiniProgramGeneratorCss(source, 'weapp', 4, false, { styleOptions }))).toEqual(['initial'])
    expect(() => finalizeMiniProgramGeneratorCss(source, 'weapp', 4, false, {
      styleOptions: { ...styleOptions, platform: 'mp-weixin', atRules: { property: false } },
    })).toThrow('保留 @property')
  })

  it('上下文保留嵌套开关、下一次读取反映配置变化，Web 与原生分支关闭', () => {
    let reads = 0
    const nested = { skyline: true }
    const context = {
      platform: 'mp-weixin',
      generator: { target: 'weapp' },
      get cssOptions() { reads++; return nested },
    } as unknown as InternalUserDefinedOptions
    expect(resolveStyleOptionsFromContext(context, 4).cssOptions?.skyline).toBe(true)
    expect(reads).toBe(1)
    nested.skyline = false
    expect(resolveStyleOptionsFromContext(context, 4).cssOptions?.skyline).toBe(false)
    expect(reads).toBe(2)
    expect(resolveStyleOptionsFromContext({ generator: { target: 'web' }, cssOptions: { skyline: true } } as InternalUserDefinedOptions, 4).cssOptions?.skyline).toBe(false)
  })

  it('公开上下文的局部资产处理器保留开关', async () => {
    const context = createCompilerContext({ ...options, appType: 'uni-app-vite' })
    const result = await context.styleHandler(source, { majorVersion: 4, isMainChunk: false })
    expect(leading(result.css)).toEqual(['var(--weapp-tw-invalid-reset)'])
  })

  it.each([undefined, 'component.vue?vue&type=style&scoped=abc'])('生成终结入口保留普通及 scoped 资产配置：%s', (from) => {
    const result = finalizeMiniProgramGeneratorCss(source, 'weapp', 4, false, {
      styleOptions: { ...options, postcssOptions: { options: { from } } },
    })
    expect(leading(result)).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(finalizeMiniProgramGeneratorCss(source, 'web', 4, false, { styleOptions: options })).toBe(source)
  })

  it.each([undefined, 3])('Webpack 版本 %s 不因显式 skyline 改变输出或拒绝注册配置', (majorVersion) => {
    const baseline = createCompilerContext({ cssOptions: { skyline: false, cssRemoveProperty: false } })
    const enabled = createCompilerContext({ cssOptions: { skyline: true, cssRemoveProperty: false } })
    baseline.tailwindRuntime.majorVersion = majorVersion
    enabled.tailwindRuntime.majorVersion = majorVersion
    const input = `${source}view{--weapp-tw-invalid-reset: 1}`
    for (const generatedCss of [false, true]) {
      expect(finalizeWebpackCssAssetSource(input, enabled, false, { generatedCss })).toBe(finalizeWebpackCssAssetSource(input, baseline, false, { generatedCss }))
    }
    expect(finalizeMiniProgramUserCssAssetSource(input, enabled, false)).toBe(finalizeMiniProgramUserCssAssetSource(input, baseline, false))
  })

  it.each([false, true])('Webpack 最终资产透传开关：generated=%s', (generatedCss) => {
    const context = createCompilerContext(options)
    context.tailwindRuntime.majorVersion = 4
    expect(leading(finalizeWebpackCssAssetSource(source, context, false, { generatedCss, cssPreflight: true }))).toEqual(['var(--weapp-tw-invalid-reset)'])
    const missingReset = '.x{line-height:var(--tw-leading,32px)}'
    expect(leading(finalizeWebpackCssAssetSource(missingReset, context, false, { generatedCss, cssPreflight: false }))).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(leading(finalizeMiniProgramUserCssAssetSource(source, context, false, { cssPreflight: false }))).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(finalizeWebpackCssAssetSource(source, context, true, { generatedCss })).toBe(source)
  })

  it.each(['string', 'root'] as const)('编译器 %s 转换与 finalizer 共用配置，Web snapshot 排除兼容', async (kind) => {
    const compiler = createCompiler(options)
    compilers.push(compiler)
    const snapshot = compiler.createSnapshot({ id: 'skyline', target: 'weapp', classSet: [] })
    const input = '.x{line-height:var(--tw-leading,32px);font-weight:var(--tw-font-weight,500)}'
    const transform = (target = snapshot, skyline?: boolean) => kind === 'string'
      ? compiler.transformCss(input, target, { majorVersion: 4, cssOptions: skyline === undefined ? undefined : { skyline } })
      : compiler.transformCssRoot(postcss.parse(input), target, { majorVersion: 4, cssOptions: skyline === undefined ? undefined : { skyline } })
    expect(leading((await transform()).css)).toEqual(['var(--weapp-tw-invalid-reset)'])
    expect(leading((await transform(snapshot, false)).css)).toEqual([''])
    const web = compiler.createSnapshot({ id: 'web', target: 'web', classSet: [] })
    expect(leading((await transform(web, true)).css)).toEqual([])
  })

  it.each(['string', 'root'] as const)('实例的 Web/native 配置不能由 Core %s finalizer 重新开启', async (kind) => {
    const targets = [
      { appType: 'uni-app-vite', platform: 'h5' },
      { appType: 'uni-app-vite', platform: 'mp-alipay' },
      { appType: 'uni-app-x', platform: 'app-android', uniAppX: true, uniAppXCssTarget: 'uvue' },
      { appType: 'uni-app-x', platform: 'app-android', uniAppX: true, uniAppXCssTarget: 'webview' },
    ] satisfies NonNullable<Parameters<typeof createCompiler>[0]>[]
    const input = '.local{--tw-leading:initial;--tw-font-weight:initial;line-height:var(--tw-leading,32px);font-weight:var(--tw-font-weight,500)}'
    for (const target of targets) {
      const baseline = createCompiler({ ...target, cssOptions: { skyline: false } })
      const enabled = createCompiler({ ...target, cssOptions: { skyline: true } })
      compilers.push(baseline, enabled)
      const transform = async (compiler: Compiler) => {
        const snapshot = compiler.createSnapshot({ id: 'excluded-context', classSet: [] })
        return kind === 'string'
          ? compiler.transformCss(input, snapshot, { majorVersion: 4 })
          : compiler.transformCssRoot(postcss.parse(input), snapshot, { majorVersion: 4 })
      }
      expect((await transform(enabled)).css).toBe((await transform(baseline)).css)
    }
  })

  it.each(['string', 'root'] as const)('本次调用的 Web/native 覆盖同时约束 %s handler 和 finalizer', async (kind) => {
    const compiler = createCompiler(options)
    compilers.push(compiler)
    const snapshot = compiler.createSnapshot({ id: 'excluded-call', target: 'weapp', classSet: [] })
    const input = '.local{--tw-leading:initial;--tw-font-weight:initial;line-height:var(--tw-leading,32px);font-weight:var(--tw-font-weight,500)}'
    const targets: CompilerCssTransformOptions[] = [
      { platform: 'h5' },
      { platform: 'mp-alipay' },
      { cssOptions: { platform: 'web' } },
      { uniAppX: true, uniAppXCssTarget: 'uvue' },
      { uniAppX: true, uniAppXCssTarget: 'webview' },
    ]
    for (const target of targets) {
      const transform = (skyline: boolean) => {
        const overrides = { ...target, majorVersion: 4 as const, cssOptions: { ...target.cssOptions, skyline } }
        return kind === 'string'
          ? compiler.transformCss(input, snapshot, overrides)
          : compiler.transformCssRoot(postcss.parse(input), snapshot, overrides)
      }
      expect((await transform(true)).css).toBe((await transform(false)).css)
    }
  })

  it('真实生成器保留 v4 主题 fallback，并按开关变化重新生成', async () => {
    const resolved = await resolveTailwindV4Source({
      base: process.cwd(),
      css: '@theme {--text-header-md:20px;--text-header-md--line-height:32px;--text-header-md--font-weight:500} @tailwind utilities;',
    })
    const generator = createWeappTailwindcssGenerator(resolved)
    try {
      const styleOptions = { cssOptions: { skyline: true } }
      const request = { candidates: ['text-header-md'], scanSources: false, target: 'weapp' as const, styleOptions }
      const enabled = await generator.generate(request)
      expect(leading(enabled.css)).toEqual(['var(--weapp-tw-invalid-reset)'])
      expect(enabled.css).toContain('var(--tw-leading, var(--text-header-md--line-height))')
      styleOptions.cssOptions.skyline = false
      const disabled = await generator.generate(request)
      expect(leading(disabled.css)).not.toContain('var(--weapp-tw-invalid-reset)')
      const web = await generator.generate({ ...request, target: 'web', styleOptions: { cssOptions: { skyline: true } } })
      expect(leading(web.css)).not.toContain('var(--weapp-tw-invalid-reset)')
    }
    finally { generator.dispose?.() }
  })
})
