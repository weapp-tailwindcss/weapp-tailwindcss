import type { Plugin, ResolvedConfig } from 'vite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createContext, resetVitePluginTestContext, setCurrentContext } from './vite-plugin.testkit'

function findPlugin(plugins: Plugin[] | undefined, suffix: string) {
  return plugins?.find(plugin => plugin.name?.endsWith(suffix))
}

describe('vite 单入口 dispatcher', () => {
  it('无标记 Generic 项目在 configResolved 后使用 Web profile', async () => {
    const context = createContext({ appType: undefined, generator: undefined, platform: undefined, cssOptions: undefined })
    setCurrentContext(context)
    const { WeappTailwindcss } = await import('@/bundlers/vite')
    const plugins = WeappTailwindcss()
    const sourceCandidates = findPlugin(plugins, ':source-candidates')!
    expect(sourceCandidates.apply).toBeTypeOf('function')
    expect(typeof sourceCandidates.apply === 'function' && sourceCandidates.apply({ build: {} }, { command: 'build', mode: 'production' })).toBe(true)
    const post = findPlugin(plugins, ':post')!
    await post.configResolved?.call(post, {
      command: 'build',
      root: '/project',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    expect(context.generator).toMatchObject({ target: 'web' })
    expect(typeof sourceCandidates.apply === 'function' && sourceCandidates.apply({ build: {} }, { command: 'build', mode: 'production' })).toBe(false)
    expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:adaptor:web-css-finalizer')).toBe(true)
    const js = findPlugin(plugins, ':js:serve')
    const jsResult = await js?.transform?.call(js, 'const cls = "text-red-500"', '/project/main.ts')
    expect(jsResult).toBeUndefined()
    expect(context.jsHandler).not.toHaveBeenCalled()
    resetVitePluginTestContext()
  })

  it('Generic Web 显式 cssEntries 仍保持 Web profile', async () => {
    const context = createContext({
      appType: undefined,
      generator: undefined,
      platform: undefined,
      cssOptions: undefined,
      cssEntries: ['/project/src/app.css'],
    })
    setCurrentContext(context)
    const { WeappTailwindcss } = await import('@/bundlers/vite')
    const plugins = WeappTailwindcss()!
    const post = findPlugin(plugins, ':post')!
    await post.configResolved?.call(post, {
      command: 'build',
      root: '/project',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    expect(context.generator).toMatchObject({ target: 'web' })
    const js = findPlugin(plugins, ':js:serve')
    const jsResult = await js?.transform?.call(js, 'const cls = "text-red-500"', '/project/main.ts')
    expect(jsResult).toBeUndefined()
    expect(context.jsHandler).not.toHaveBeenCalled()
    resetVitePluginTestContext()
  })

  it('vite/web 入口固定 Generic Web 并忽略外层框架环境', async () => {
    const context = createContext({
      appType: 'taro',
      generator: { target: 'web' },
      platform: 'web',
    })
    setCurrentContext(context)
    const { WeappTailwindcssWeb } = await import('@/vite-web')
    const plugins = WeappTailwindcssWeb()
    const post = findPlugin(plugins, ':post')!
    await post.configResolved?.call(post, {
      command: 'build',
      root: '/project',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    expect(context.generator).toMatchObject({ target: 'web' })
    expect(context.platform).toBe('web')
    expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:taro-alipay-browserslist-asset')).toBe(false)
    expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:adaptor:web-css-finalizer')).toBe(true)
    expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:adaptor:css-finalizer')).toBe(false)
    expect(plugins.some(plugin => plugin.name?.includes(':js:serve'))).toBe(false)
    expect(plugins.some(plugin => plugin.name?.includes('style-injector'))).toBe(false)
    const js = findPlugin(plugins, ':js:serve')
    const jsResult = await js?.transform?.call(js, 'const cls = "text-red-500"', '/project/main.ts')
    expect(jsResult).toBeUndefined()
    expect(context.jsHandler).not.toHaveBeenCalled()
    resetVitePluginTestContext()
  })

  it('vite/web 只在显式配置时注册 Web style injector', async () => {
    const context = createContext({
      appType: undefined,
      generator: { target: 'web' },
      platform: 'web',
      styleInjector: true,
    })
    setCurrentContext(context)
    const { WeappTailwindcssWeb } = await import('@/vite-web')
    const plugins = WeappTailwindcssWeb()

    expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:web-style-injector-pre')).toBe(true)
    expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:web-style-injector')).toBe(true)
    expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:style-injector-pre')).toBe(false)
    resetVitePluginTestContext()
  })

  it('显式小程序 target 保留主入口的历史插件能力', async () => {
    const context = createContext({ appType: undefined, generator: { target: 'weapp' } })
    setCurrentContext(context)
    const { WeappTailwindcss } = await import('@/bundlers/vite')
    const plugins = WeappTailwindcss()!
    const post = findPlugin(plugins, ':post')!
    await post.configResolved?.call(post, {
      command: 'build',
      root: '/project',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    const js = findPlugin(plugins, ':js:serve')
    expect(js).toBeDefined()
    resetVitePluginTestContext()
  })

  it('显式生成 target 不覆盖真实 root 推断出的 Taro framework hook', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-vite-dispatcher-taro-'))
    const previousTaroEnv = process.env['TARO_ENV']
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      dependencies: {
        '@tarojs/taro': '4.2.1',
      },
    }), 'utf8')
    process.env['TARO_ENV'] = 'alipay'

    try {
      const context = createContext({ appType: undefined, generator: { target: 'weapp' } })
      setCurrentContext(context)
      const { WeappTailwindcss } = await import('@/bundlers/vite')
      const plugins = WeappTailwindcss({ generator: { target: 'weapp' } })!
      const post = findPlugin(plugins, ':post')!
      await post.configResolved?.call(post, {
        command: 'build',
        root,
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist' },
      } as ResolvedConfig)

      const browserslist = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:taro-alipay-browserslist-asset')!
      const bundle = {}
      expect(browserslist.generateBundle).toBeTypeOf('function')
      await (browserslist.generateBundle as Function).call(browserslist, {}, bundle, false)

      expect(context.appType).toBe('taro')
      expect(bundle).toHaveProperty('.browserslistrc')
    }
    finally {
      if (previousTaroEnv === undefined) {
        delete process.env['TARO_ENV']
      }
      else {
        process.env['TARO_ENV'] = previousTaroEnv
      }
      resetVitePluginTestContext()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('显式 Web target 保留可信 basedir 推断出的 Taro framework 能力', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-vite-dispatcher-taro-web-'))
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      dependencies: {
        '@tarojs/taro': '4.2.1',
      },
    }), 'utf8')

    try {
      const context = createContext({ appType: undefined, generator: { target: 'web' } })
      setCurrentContext(context)
      const { WeappTailwindcss } = await import('@/bundlers/vite')
      const plugins = WeappTailwindcss({
        generator: { target: 'web' },
        tailwindcssBasedir: root,
      })!
      const post = findPlugin(plugins, ':post')!
      await post.configResolved?.call(post, {
        command: 'build',
        root,
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist' },
      } as ResolvedConfig)

      expect(context.appType).toBeUndefined()
      expect(plugins.some(plugin => plugin.name === 'weapp-tailwindcss:taro-alipay-browserslist-asset')).toBe(true)
    }
    finally {
      resetVitePluginTestContext()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('可信 basedir 与真实 root 的 profile 一致时由原 framework hook 刷新 runtime', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-vite-dispatcher-weapp-vite-'))
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      devDependencies: {
        'weapp-vite': '4.2.1',
      },
    }), 'utf8')

    try {
      const context = createContext({ appType: undefined, generator: undefined, tailwindcssBasedir: root })
      setCurrentContext(context)
      const { WeappTailwindcss } = await import('@/bundlers/vite')
      const plugins = WeappTailwindcss({ tailwindcssBasedir: root })!
      const post = findPlugin(plugins, ':post')!
      await post.configResolved?.call(post, {
        command: 'build',
        root,
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist' },
      } as ResolvedConfig)

      expect(context.appType).toBe('weapp-vite')
      expect(context.refreshTailwindcssRuntime).toHaveBeenCalledTimes(1)
    }
    finally {
      resetVitePluginTestContext()
      await rm(root, { recursive: true, force: true })
    }
  })
})
