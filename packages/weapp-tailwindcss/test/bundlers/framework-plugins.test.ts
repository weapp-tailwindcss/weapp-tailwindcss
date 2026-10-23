import { afterEach, describe, expect, it, vi } from 'vitest'

describe('framework plugin composition profiles', () => {
  afterEach(() => {
    vi.doUnmock('@/bundlers/vite/shared/create-framework-plugins')
    vi.doUnmock('@/bundlers/webpack/shared/create-framework-plugin')
    vi.doUnmock('@/bundlers/gulp/shared/create-native-framework-plugins')
    vi.resetModules()
  })

  it('routes Vite public entry to framework factories', async () => {
    const createViteFrameworkPlugins = vi.fn((_options, framework) => [{ name: framework.frameworkName }])
    vi.doMock('@/bundlers/vite/shared/create-framework-plugins', () => ({
      createViteFrameworkPlugins,
    }))

    const { WeappTailwindcss } = await import('@/bundlers/vite')

    expect(WeappTailwindcss({ appType: 'taro' })?.map(plugin => plugin.name)).toEqual([
      'weapp-tailwindcss:taro-alipay-browserslist-asset',
      'taro',
    ])
    expect(WeappTailwindcss({ appType: 'uni-app-vite' })?.[0]?.name).toBe('uni-app')
    expect(WeappTailwindcss({ appType: 'uni-app-x' })?.[0]?.name).toBe('uni-app-x')
    expect(WeappTailwindcss({ appType: 'weapp-vite' })?.[0]?.name).toBe('weapp-vite')

    const frameworkProfiles = createViteFrameworkPlugins.mock.calls.map(([, framework]) => framework)
    expect(frameworkProfiles.find(framework => framework.frameworkName === 'uni-app')).toMatchObject({
      adaptWatchCssBeforeFrameworkCache: true,
    })
    expect(frameworkProfiles.find(framework => framework.frameworkName === 'uni-app-x')).toMatchObject({
      adaptWatchCssBeforeFrameworkCache: true,
    })
    expect(frameworkProfiles.find(framework => framework.frameworkName === 'taro')).not.toHaveProperty('adaptWatchCssBeforeFrameworkCache')
    expect(frameworkProfiles.find(framework => framework.frameworkName === 'weapp-vite')).not.toHaveProperty('adaptWatchCssBeforeFrameworkCache')
  })

  it('pre-registers Taro Alipay browserslist asset inside the Vite bundle graph', async () => {
    const { WeappTailwindcss } = await import('@/bundlers/vite')
    const previousTaroEnv = process.env.TARO_ENV
    try {
      delete process.env.TARO_ENV
      const plugins = WeappTailwindcss({ appType: 'taro' }) ?? []
      const browserslistAssetPlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:taro-alipay-browserslist-asset')
      expect(browserslistAssetPlugin?.enforce).toBe('pre')
      expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:taro-cjs-stability')).toBe(false)
      const weappBundle = {}
      await (browserslistAssetPlugin?.generateBundle as any)?.({}, weappBundle)
      expect(weappBundle).not.toHaveProperty('.browserslistrc')

      process.env.TARO_ENV = 'alipay'
      const alipayPlugins = WeappTailwindcss({ appType: 'taro' }) ?? []
      const alipayPlugin = alipayPlugins.find(plugin => plugin.name === 'weapp-tailwindcss:taro-alipay-browserslist-asset')
      const unchangedWeappBundle = {}
      await (browserslistAssetPlugin?.generateBundle as any)?.({}, unchangedWeappBundle)
      expect(unchangedWeappBundle).not.toHaveProperty('.browserslistrc')
      process.env.TARO_ENV = 'weapp'
      const alipayBundle = {}
      await (alipayPlugin?.generateBundle as any)?.({}, alipayBundle)
      expect(alipayBundle).toMatchObject({
        '.browserslistrc': {
          type: 'asset',
          fileName: '.browserslistrc',
          source: 'defaults and fully supports es6-module',
        },
      })
    }
    finally {
      if (previousTaroEnv === undefined) {
        delete process.env.TARO_ENV
      }
      else {
        process.env.TARO_ENV = previousTaroEnv
      }
    }
  })

  it('routes Webpack public class to framework classes', async () => {
    const appliedFrameworks: string[] = []

    vi.doMock('@/bundlers/webpack/shared/create-framework-plugin', () => ({
      weappTailwindcssPackageDir: '/mock/weapp-tailwindcss',
      WebpackFrameworkPlugin: class {
        appType: string | undefined
        options: Record<string, unknown>
        private frameworkName: string

        constructor(options: Record<string, unknown> = {}, framework: { frameworkName: string }) {
          this.options = options
          this.appType = options.appType as string | undefined
          this.frameworkName = framework.frameworkName
        }

        apply() {
          appliedFrameworks.push(this.frameworkName)
        }
      },
    }))

    const { WeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')

    new WeappTailwindcss({ appType: 'taro' }).apply({ options: {}, context: process.cwd() } as any)
    new WeappTailwindcss({ appType: 'mpx' }).apply({ options: {}, context: process.cwd() } as any)
    new WeappTailwindcss({ appType: 'uni-app' }).apply({ options: {}, context: process.cwd() } as any)
    new WeappTailwindcss({ appType: 'weapp-vite' }).apply({ options: {}, context: process.cwd() } as any)

    expect(appliedFrameworks).toEqual([
      'taro',
      'mpx',
      'uni-app',
      'weapp-vite',
    ])
  })

  it('routes Gulp public entry to native framework factory', async () => {
    vi.doMock('@/bundlers/gulp/shared/create-native-framework-plugins', () => ({
      createNativeGulpPlugins: vi.fn(options => [`native:${options.appType ?? 'native'}`]),
    }))

    const { createPlugins } = await import('@/bundlers/gulp')

    expect(createPlugins()).toEqual(['native:native'])
    expect(createPlugins({ appType: 'native' })).toEqual(['native:native'])
  })
})
