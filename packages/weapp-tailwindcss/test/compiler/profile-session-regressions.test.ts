import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCompiler } from '@/core/compiler'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import { clearTailwindV4IncrementalGenerateCacheForTest, getTailwindV4IncrementalGenerateCacheStatsForTest } from '@/tailwindcss/v4-engine/generator/cache-stats'
import { getCompilerContext } from '@/context'
import { resolveCompilationProfile, resolveContextStylePlatform } from '@/context/compilation-profile'

afterEach(() => {
  vi.unstubAllEnvs()
  clearTailwindV4IncrementalGenerateCacheForTest()
})

describe('public generation configuration and session isolation', () => {
  it('preserves public compiler generation compatibility for uni-app web styles', async () => {
    const source = await resolveTailwindV4Source({ css: '@tailwind utilities;', base: process.cwd() })
    const compiler = createCompiler({ logLevel: 'silent' })
    const engine = createTailwindV4Engine(source)
    const options = { scanSources: false, candidates: ['text-[55rpx]'], target: 'web' as const, styleOptions: { appType: 'uni-app-vite' } }
    try {
      const standalone = await engine.generate(options)
      const compiled = await compiler.generate({ ...options, id: 'root', source })
      expect(compiled.css).toBe(standalone.css)
    }
    finally {
      await compiler.dispose()
      engine.dispose?.()
    }
  })

  it('keeps the public compiler environment stable across interleaved project instances', async () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    const first = createCompiler({ logLevel: 'silent' })
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin')
    const second = createCompiler({ logLevel: 'silent' })
    const source = await resolveTailwindV4Source({ css: '@tailwind utilities;', base: process.cwd() })
    const request = { id: 'root', source, scanSources: false, candidates: ['text-[55rpx]'], target: 'web' as const }
    try {
      expect((await first.generate(request)).css).toContain('font-size: 1.71875rem')
      expect((await second.generate(request)).css).toContain('color: 55rpx')
      await first.dispose()
      expect((await second.generate(request)).css).toContain('color: 55rpx')
    }
    finally {
      await Promise.all([first.dispose(), second.dispose()])
    }
  })

  it('keeps a disposed engine cache empty after an accepted generation finishes', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered = false
    const source = await resolveTailwindV4Source({ css: '@tailwind utilities;', base: process.cwd() })
    const engine = createTailwindV4Engine(source)
    const pending = engine.generate({
      scanSources: false,
      candidates: ['w-[10px]'],
      incrementalCache: true,
      styleOptions: { postcssOptions: { plugins: [{ postcssPlugin: 'wait', async Once() { entered = true; await gate } }] } },
    })
    try {
      await vi.waitFor(() => expect(entered).toBe(true))
      engine.dispose?.()
      await expect(engine.generate({ candidates: ['w-[10px]'], incrementalCache: true })).rejects.toThrow('已释放')
      await expect(engine.validateCandidates(['w-[10px]'])).rejects.toThrow('已释放')
      await expect(engine.loadDesignSystem()).rejects.toThrow('已释放')
      release()
      await pending
      expect(getTailwindV4IncrementalGenerateCacheStatsForTest().size).toBe(0)
    }
    finally {
      release()
      await pending
      engine.dispose?.()
    }
  })

  it.each(['error', 'warn', 'silent'] as const)('retains the resolved unsupported-native-CSS policy %s in the profile', (uvueUnsupported) => {
    const context = getCompilerContext({ appType: 'uni-app-x', uniAppX: { uvueUnsupported }, logLevel: 'silent' })
    const { profile } = resolveCompilationProfile(context)
    expect(profile.styleOptions.uniAppXUnsupported).toBe(uvueUnsupported)
  })

  it('uses the current cssOptions preflight override for both transformation and generation', () => {
    const context = getCompilerContext({ cssOptions: { cssPreflight: { border: true } }, logLevel: 'silent' })
    const previous = resolveCompilationProfile(context)
    context.cssOptions!.cssPreflight = false
    const current = resolveCompilationProfile(context)
    expect(current.profile.styleOptions.cssPreflight).toBe(false)
    expect(current.profile.cssPreflight).toBe(false)
    expect(previous.isCurrent()).toBe(false)
  })

  it('preserves the classic uni-app platform priority when UNI and UTS environment keys coexist', () => {
    vi.stubEnv('UNI_PLATFORM', 'app-plus')
    vi.stubEnv('UNI_UTS_PLATFORM', 'app-android')
    const context = getCompilerContext({ appType: 'uni-app-vite', logLevel: 'silent' })
    const platform = resolveContextStylePlatform(context)
    expect(platform).toBe('app-plus')
    expect(resolveCompilationProfile(context, context, { platform }).profile.generator.target).toBe('web')
    expect(resolveContextStylePlatform(context, 'mp-alipay')).toBe('mp-alipay')
  })

  it.each(['weapp', 'web'] as const)('models embedded native styles independently of the %s generator target', (target) => {
    vi.stubEnv('UNI_PLATFORM', '')
    vi.stubEnv('UNI_UTS_PLATFORM', '')
    const context = getCompilerContext({
      appType: 'uni-app-x',
      uniAppX: true,
      platform: 'app-android',
      generator: { target },
      logLevel: 'silent',
    })
    const { profile } = resolveCompilationProfile(context)
    expect(profile.generator.target).toBe(target)
    expect(profile.stylesEmbeddedInScript).toBe(true)
    expect(resolveCompilationProfile(context, context, { platform: 'h5' }).profile.stylesEmbeddedInScript).toBe(false)
  })
})
