import type { OutputAsset, OutputBundle } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'
import type { ViteFrameworkAssetPipelineStrategy } from '@/bundlers/vite/shared/framework-asset-strategy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTaroVitePlugins } from '@/bundlers/vite/frameworks/taro'
import { createUniAppXVitePlugins } from '@/bundlers/vite/frameworks/uni-app-x'
import { createViteFrameworkPlugins } from '@/bundlers/vite/shared/create-framework-plugins'
import { createContext, createRollupChunk, resetVitePluginTestContext } from './vite-plugin.testkit'

function asset(source: string): OutputAsset {
  return { type: 'asset', fileName: 'page.asset.js', names: [], originalFileNames: [], source }
}

async function preparePostPlugin(plugins: Plugin[]) {
  const plugin = plugins.find(item => item.name === 'weapp-tailwindcss:adaptor:post')!
  const config = {
    command: 'build',
    mode: 'development',
    css: { postcss: { plugins: [] } },
    build: { outDir: 'dist', watch: {} },
    root: process.cwd(),
  } as ResolvedConfig
  const configure = plugin.configResolved
  if (typeof configure === 'function') {
    await configure.call({} as any, config)
  }
  else {
    await configure?.handler.call({} as any, config)
  }
  return async (bundle: OutputBundle) => {
    const hook = plugin.generateBundle!
    const generate = typeof hook === 'function' ? hook : hook.handler
    await generate.call({} as any, {} as any, bundle, false)
  }
}

async function dispose(plugins: Plugin[]) {
  for (const plugin of plugins) {
    const hook = plugin.closeWatcher
    if (typeof hook === 'function') {
      await hook.call({} as any)
    }
    else {
      await hook?.handler.call({} as any)
    }
  }
}

describe('Vite 框架实例与产物阶段隔离', () => {
  beforeEach(resetVitePluginTestContext)

  it('相同文件名的 Taro 与 uni-app-x 产物在交错构建中只消费各自的资产策略', async () => {
    const taro = createContext({ appType: 'taro' })
    const uni = createContext({ appType: 'uni-app-x', uniAppX: { enabled: true } })
    const taroPlugins = createTaroVitePlugins(taro as any) as Plugin[]
    const uniPlugins = createUniAppXVitePlugins(uni as any) as Plugin[]
    const source = 'const cls = "text-[#565656]"'
    try {
      const buildTaro = await preparePostPlugin(taroPlugins)
      const buildUni = await preparePostPlugin(uniPlugins)
      for (const build of [buildUni, buildTaro, buildUni, buildTaro]) {
        const bundle = { 'page.asset.js': asset(source) }
        await build(bundle)
        expect(bundle['page.asset.js'].source).toBe(build === buildUni ? `js:${source}` : source)
      }
      expect(taro.jsHandler).not.toHaveBeenCalled()
      expect(uni.jsHandler).toHaveBeenCalledTimes(1)
      expect(taroPlugins.some(plugin => plugin.name === 'weapp-tailwindcss:runtime-invalidation')).toBe(false)
      expect(uniPlugins.some(plugin => plugin.name === 'weapp-tailwindcss:runtime-invalidation')).toBe(true)
    }
    finally {
      await dispose(taroPlugins)
      await dispose(uniPlugins)
    }
  })

  it('框架只通过当前资产绑定的操作转换 JS 与回放缓存', async () => {
    const options = createContext({ appType: 'native' })
    const transform = vi.fn()
    const plugins = createViteFrameworkPlugins(options as any, {
      frameworkName: 'generic',
      createAssetPipeline: () => ({
        createJsAssetTask(context) {
          for (const key of ['asset', 'cache', 'hashKey', 'runtimeSet', 'jsHandler']) {
            expect(context).not.toHaveProperty(key)
          }
          return () => context.runCachedTransform({
            hashSalt: 'test-transform-v1',
            async transform(source) {
              transform(source)
              return context.transformJs(source)
            },
          })
        },
      }),
      styleInjectorDelegate: () => [],
    }) as Plugin[]
    try {
      const build = await preparePostPlugin(plugins)
      const source = 'const cls = "text-[#123456]"'
      for (let iteration = 0; iteration < 2; iteration++) {
        const bundle = { 'page.asset.js': asset(source) }
        await build(bundle)
        expect(bundle['page.asset.js'].source).toBe(`js:${source}`)
      }
      expect(transform).toHaveBeenCalledTimes(1)
      expect(options.jsHandler).toHaveBeenCalledTimes(1)
    }
    finally {
      await dispose(plugins)
    }
  })

  it('完成转换后才执行框架阶段，并将 CSS 同步后操作限定于当前构建轮次', async () => {
    const events: string[] = []
    const options = createContext({ appType: 'native' })
    options.onUpdate = () => { events.push('transform') }
    options.onEnd = () => { events.push('end') }
    let revision = 0
    const strategy: ViteFrameworkAssetPipelineStrategy = {
      async afterTransform(context) {
        const current = ++revision
        expect(context.assets.read()['index.js']).toMatchObject({ code: expect.stringContaining('js:') })
        expect(context).not.toHaveProperty('runtimeState')
        expect(context).not.toHaveProperty('cache')
        events.push(`after:${current}`)
        return () => { events.push(`synced:${current}`) }
      },
    }
    const plugins = createViteFrameworkPlugins(options as any, {
      frameworkName: 'generic',
      createAssetPipeline: () => strategy,
      styleInjectorDelegate: () => [],
    }) as Plugin[]
    try {
      const build = await preparePostPlugin(plugins)
      await build({ 'index.js': createRollupChunk('const cls = "text-[#123456]"') })
      await build({ 'index.js': createRollupChunk('const cls = "text-[#654321]"') })
      expect(events).toEqual(['transform', 'after:1', 'synced:1', 'end', 'transform', 'after:2', 'synced:2', 'end'])
    }
    finally {
      await dispose(plugins)
    }
  })

  it('框架阶段失败向调用方传播且不会执行后续状态提交', async () => {
    const options = createContext({ appType: 'native' })
    const afterTransform = vi.fn(async () => { throw new Error('framework stage failed') })
    const plugins = createViteFrameworkPlugins(options as any, {
      frameworkName: 'generic',
      createAssetPipeline: () => ({ afterTransform }),
      styleInjectorDelegate: () => [],
    }) as Plugin[]
    try {
      const build = await preparePostPlugin(plugins)
      await expect(build({ 'index.js': createRollupChunk('const cls = "text-[#123456]"') })).rejects.toThrow('framework stage failed')
      expect(options.onEnd).not.toHaveBeenCalled()
    }
    finally {
      await dispose(plugins)
    }
  })
})
