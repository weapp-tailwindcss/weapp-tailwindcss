import { describe, expect, it } from 'vitest'
import { createViteFrameworkProfileState, resolveGulpFrameworkProfile, resolveViteFrameworkProfile, resolveWebpackFrameworkProfile } from '@/bundlers/framework-selector'
import { bundlerFrameworkNames, frameworkCatalog, normalizeFrameworkName } from '@/framework/catalog'

describe('bundler framework selector', () => {
  it('注册数据保留别名、支持组合和不支持框架的既有 fallback', () => {
    expect(normalizeFrameworkName('uni-app-vite')).toBe('uni-app')
    expect(normalizeFrameworkName('unknown-framework')).toBeUndefined()
    expect(frameworkCatalog['uni-app-x'].family).toBe('uni')
    expect(bundlerFrameworkNames.vite).not.toContain('mpx')
    expect(bundlerFrameworkNames.webpack).not.toContain('uni-app-x')
    expect(resolveViteFrameworkProfile({ appType: 'mpx' }).frameworkName).toBe('generic')
    expect(resolveWebpackFrameworkProfile({ appType: 'uni-app-x' }).frameworkName).toBe('uni-app')
    expect(resolveWebpackFrameworkProfile({ appType: 'taro', uniAppX: true }).frameworkName).toBe('taro')
    expect(resolveWebpackFrameworkProfile({ appType: 'mpx', uniAppX: true }).frameworkName).toBe('mpx')
    expect(resolveViteFrameworkProfile({ appType: 'taro', uniAppX: true }).frameworkName).toBe('uni-app-x')
  })

  it('keeps explicit appType ahead of package detection', () => {
    const profile = resolveViteFrameworkProfile({
      appType: 'taro',
      packageJson: {
        dependencies: {
          '@dcloudio/vite-plugin-uni': 'latest',
        },
      },
    })

    expect(profile).toMatchObject({
      appType: 'taro',
      frameworkName: 'taro',
    })
  })

  it('selects isolated Vite framework profiles', () => {
    expect(resolveViteFrameworkProfile({
      packageJson: {
        dependencies: {
          '@dcloudio/vite-plugin-uni': 'latest',
        },
      },
    }).frameworkName).toBe('uni-app')

    expect(resolveViteFrameworkProfile({
      packageJson: {
        dependencies: {
          '@tarojs/taro': 'latest',
        },
      },
    }).frameworkName).toBe('taro')

    expect(resolveViteFrameworkProfile({
      packageJson: {
        dependencies: {
          'weapp-vite': 'latest',
        },
      },
    }).frameworkName).toBe('weapp-vite')
  })

  it('selects isolated Webpack framework profiles', () => {
    expect(resolveWebpackFrameworkProfile({
      packageJson: {
        dependencies: {
          '@mpxjs/core': 'latest',
        },
      },
    }).frameworkName).toBe('mpx')

    expect(resolveWebpackFrameworkProfile({
      packageJson: {
        dependencies: {
          '@tarojs/webpack5-runner': 'latest',
        },
      },
    }).frameworkName).toBe('taro')

    expect(resolveWebpackFrameworkProfile({
      packageJson: {
        dependencies: {
          '@dcloudio/vue-cli-plugin-uni': 'latest',
        },
      },
    }).frameworkName).toBe('uni-app')

    expect(resolveWebpackFrameworkProfile({
      appType: 'weapp-vite',
    })).toMatchObject({
      appType: 'weapp-vite',
      frameworkName: 'weapp-vite',
    })
  })

  it('keeps uni-app x as a Vite framework profile and maps Webpack opt-in to uni-app', () => {
    expect(resolveViteFrameworkProfile({
      appType: 'uni-app-vite',
      uniAppX: true,
    })).toMatchObject({
      frameworkName: 'uni-app-x',
    })

    expect(resolveWebpackFrameworkProfile({
      appType: 'uni-app',
      uniAppX: {
        enabled: true,
      },
    }).frameworkName).toBe('uni-app')
  })

  it('keeps gulp on the native framework profile', () => {
    expect(resolveGulpFrameworkProfile({
      packageJson: {
        dependencies: {
          '@tarojs/taro': 'latest',
        },
      },
    })).toMatchObject({
      frameworkName: 'native',
    })
  })

  it('refreshes cached vite framework profile state with merged options', () => {
    const state = createViteFrameworkProfileState({
      appType: 'taro',
      packageJson: {
        dependencies: {
          'weapp-vite': 'latest',
        },
      },
    })

    expect(state.current()).toMatchObject({
      appType: 'taro',
      frameworkName: 'taro',
    })
    expect(state.refresh({ appType: undefined })).toMatchObject({
      appType: 'weapp-vite',
      frameworkName: 'weapp-vite',
    })
  })
})
