import type { Plugin, ResolvedConfig } from 'vite'
import path from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { createContext, createRollupAsset, resetVitePluginTestContext, setCurrentContext } from './vite-plugin.testkit'

beforeEach(() => {
  vi.resetModules()
  resetVitePluginTestContext()
})

it.each([
  { entry: '包目录', root: path.resolve(import.meta.dirname, '../..') },
  { entry: '仓库根目录', root: path.resolve(import.meta.dirname, '../../../..') },
])('$entry：普通作者 CSS 重复编译后回滚仍消费本轮产物，不能被登记成生成来源', async ({ root }) => {
  const { WeappTailwindcss } = await import('@/bundlers/vite')
  // 固定被测框架，避免从仓库根依赖推断成另一条平台链路。
  const pluginOptions = { appType: 'uni-app-vite', platform: 'mp-alipay' } as const
  const styleHandler = vi.fn(async (css: string) => ({ css: css.replace('color:red', 'color:crimson') }))
  setCurrentContext(createContext({
    ...pluginOptions,
    cssMatcher: (file: string) => file.endsWith('.acss'),
    mainCssChunkMatcher: () => false,
    styleHandler,
  }))
  const postPlugin = WeappTailwindcss(pluginOptions)?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
  await (postPlugin.configResolved as any).call(postPlugin, {
    command: 'serve',
    root,
    css: { postcss: { plugins: [] } },
    build: { outDir: 'dist' },
  } as ResolvedConfig)
  const hook = postPlugin.generateBundle as any
  const generateBundle = typeof hook === 'object' ? hook.handler : hook
  const run = async (source: string) => {
    const asset = { ...createRollupAsset(source), fileName: 'styles/card.acss' }
    await generateBundle.call(postPlugin, {}, { 'styles/card.acss': asset })
    return asset.source.toString()
  }
  const initial = '.scope{--spacing:2rpx;color:red}'
  const cleared = '.scope{color:blue}'

  expect(await run(initial)).toBe('.scope{--spacing:2rpx;color:crimson}')
  expect(await run(cleared)).toBe(cleared)
  expect(await run(cleared)).toBe(cleared)
  expect(styleHandler).toHaveBeenCalledTimes(2)
  expect(await run(initial)).toBe('.scope{--spacing:2rpx;color:crimson}')
  expect(styleHandler).toHaveBeenCalledTimes(3)
})
