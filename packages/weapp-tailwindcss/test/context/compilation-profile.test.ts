import path from 'node:path'
import type { InternalUserDefinedOptions } from '@/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCompilationSessionPool, disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'
import { resolveCompilationProfile, resolveContextStylePlatform } from '@/context/compilation-profile'
import { generateCssByGenerator } from '@/context/generation'
import { requireFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

afterEach(() => vi.unstubAllEnvs())

describe('resolved compilation profiles', () => {
  it('snapshots nested configuration without freezing or changing user objects', () => {
    const options = {
      logLevel: 'silent' as const,
      cssEntries: ['first.css'],
      cssOptions: { preserveWebkitProperties: ['-webkit-line-clamp'] },
    }
    const context = getCompilerContext(options)
    const first = resolveCompilationProfile(context)
    expect(Object.isFrozen(first.profile)).toBe(true)
    expect(Object.isFrozen(first.profile.styleOptions.cssOptions)).toBe(true)
    expect(Object.isFrozen(options.cssEntries)).toBe(false)
    context.cssEntries = ['second.css']
    const second = resolveCompilationProfile(context)
    expect(first.profile.cssEntries).toEqual([path.resolve('first.css')])
    expect(second.profile.cssEntries).toEqual(['second.css'])
    expect(first.isCurrent()).toBe(false)
    expect(second.profile.revision).toBe(first.profile.revision + 1)
    expect(second.isCurrent()).toBe(true)
  })

  it('keeps request overrides and environment changes independent of configuration revision', () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    const context = getCompilerContext({ appType: 'uni-app-vite', logLevel: 'silent' })
    const first = resolveCompilationProfile(context)
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin')
    const overridden = resolveCompilationProfile(context, context, { platform: 'mp-alipay' })
    expect(first.profile.generator.target).toBe('web')
    expect(overridden.profile.revision).toBe(first.profile.revision)
    expect(first.isCurrent()).toBe(true)
    expect(resolveContextStylePlatform(context)).toBe('h5')
    expect(resolveContextStylePlatform(context, 'mp-alipay')).toBe('mp-alipay')
    expect(requireFrameworkEnvironment(context).uniPlatform).toBe('h5')
    expect(() => requireFrameworkEnvironment({})).toThrow('缺少环境快照')
  })

  it.each(['uni-app-vite', 'uni-app-x', 'taro', 'mpx', 'native', 'weapp-vite'] as const)(
    'isolates identical %s instances and reuses state only within the same owner', async (appType) => {
      const options = { appType, logLevel: 'silent' as const, tailwindcssBasedir: process.cwd() }
      const first = getCompilerContext(options)
      const second = getCompilerContext(options)
      expect(first).not.toBe(second)
      expect(first.cache).not.toBe(second.cache)
      expect(first.tailwindRuntime).not.toBe(second.tailwindRuntime)
      const firstPool = getCompilationSessionPool(first)
      const secondPool = getCompilationSessionPool(second)
      const request = { scope: { id: 'same', kind: 'global' as const }, outputId: 'same', sources: [] }
      const firstResult = await firstPool.run(request, async () => ({ classSet: ['first'] }))
      const secondResult = await secondPool.run(request, async () => ({ classSet: ['second'] }))
      expect(firstResult.compilation.validatedClassSet).toEqual(new Set(['first']))
      expect(secondResult.compilation.validatedClassSet).toEqual(new Set(['second']))
      expect(getCompilationSessionPool(second)).toBe(secondPool)
      await disposeCompilerOwner(first)
      const next = await secondPool.run(request, async () => ({ classSet: ['second-next'] }))
      expect(next.compilation.validatedClassSet).toEqual(new Set(['second-next']))
      await disposeCompilerOwner(second)
    },
  )

  it('creates fresh runtime and caches when a compatibility caller spreads an internal context', () => {
    const first = getCompilerContext({ logLevel: 'silent', cache: false })
    const second = getCompilerContext({ ...first })
    expect(second.cache).not.toBe(first.cache)
    expect(second.tailwindRuntime).not.toBe(first.tailwindRuntime)
    expect(second.styleHandler).not.toBe(first.styleHandler)
    expect(second.jsHandler).not.toBe(first.jsHandler)
  })

  it('discards a pending result after configuration changes, including the disabled-generator path', async () => {
    let finish!: () => void
    const gate = new Promise<void>(resolve => { finish = resolve })
    const opts = { generator: false, cssPreflight: false } as InternalUserDefinedOptions
    const runtimeState = { tailwindRuntime: { majorVersion: 4 } as any, readyPromise: Promise.resolve() }
    const pending = generateCssByGenerator({
      opts,
      runtimeState,
      runtime: new Set(),
      rawSource: '@import "tailwindcss";',
      file: 'virtual:entry.css',
      cssHandlerOptions: { postcssOptions: { plugins: [{ postcssPlugin: 'test' }] } },
      cssUserHandlerOptions: {},
      styleHandler: (async () => { await gate; return { css: '.old {}' } }) as any,
      debug: vi.fn(),
    })
    opts.cssPreflight = { border: false }
    resolveCompilationProfile(opts, runtimeState)
    finish()
    await expect(pending).resolves.toBeUndefined()
    await disposeCompilerOwner(runtimeState)
  })
})
