import type { EmittedAsset } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'
import type { Compiler } from '@/core/compiler/types'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'
import { createCompiler } from '@/core/compiler'
import { fixtureFrameworkRegistration } from './fixtures/capability-framework'

function hook(plugin: Plugin, name: keyof Plugin) {
  const candidate = plugin[name]
  const handler = typeof candidate === 'function' ? candidate : (candidate as { handler?: (...args: unknown[]) => unknown } | undefined)?.handler
  if (!handler) {
    throw new Error(`测试框架缺少钩子：${String(name)}`)
  }
  return handler as (...args: unknown[]) => unknown
}

describe('测试框架复用 Core 服务与静态插件代理', () => {
  it('复用生成能力完成首次构建、连续更新、来源删除和配置重复 build', async () => {
    const compilers: Compiler[] = []
    const framework = fixtureFrameworkRegistration.capability
    const [plugin] = createDeferredVitePlugins(framework.slots, (config) => {
      const compiler = createCompiler()
      compilers.push(compiler)
      return framework.create(config.root, Object.freeze({
        generate: compiler.generate,
        transformCss: compiler.transformCss,
        transformTemplate: compiler.transformTemplate,
      }))
    })
    const emissions: EmittedAsset[] = []
    const context = { emitFile: (asset: EmittedAsset) => {
      emissions.push(asset)
      return 'fixture-output'
    } }
    const invoke = (name: keyof Plugin, ...args: unknown[]) => hook(plugin!, name).apply(context, args)
    const configure = () => invoke('configResolved', { command: 'build', root: process.cwd(), build: { watch: {} } } as ResolvedConfig)
    const build = async () => {
      await invoke('generateBundle', {}, {}, false)
      return String(emissions.at(-1)!.source)
    }
    const firstFile = path.join(process.cwd(), 'first.capability')
    const secondFile = path.join(process.cwd(), 'second.capability')
    try {
      expect(compilers).toHaveLength(0)
      expect(plugin!.transform).toMatchObject({ order: 'pre' })
      expect(plugin!.generateBundle).toMatchObject({ order: 'post' })
      await configure()
      const firstApi = plugin!.api
      await invoke('buildStart', {})
      const first = await invoke('transform', 'w-[17px]', firstFile)
      expect(first).toEqual({ code: '<view class="w-_b17px_B" />', map: null })
      expect(await build()).toContain('width: 17px')

      await invoke('buildStart', {})
      await invoke('transform', 'w-[29px]', firstFile)
      await invoke('transform', 'h-[31px]', secondFile)
      const updated = await build()
      expect(updated).toContain('width: 29px')
      expect(updated).toContain('height: 31px')
      expect(updated).not.toContain('width: 17px')

      await invoke('buildStart', {})
      await invoke('watchChange', firstFile, { event: 'delete' })
      const removed = await build()
      expect(removed).not.toContain('width:')
      expect(removed).toContain('height: 31px')
      expect(firstApi).toMatchObject({ builds: 3, closes: 0 })

      await invoke('closeWatcher')
      await invoke('closeWatcher')
      expect(firstApi).toMatchObject({ builds: 3, closes: 1 })
      expect(plugin!.api).toBeUndefined()
      await configure()
      expect(compilers).toHaveLength(2)
      const secondApi = plugin!.api
      expect(secondApi).not.toBe(firstApi)
      expect(secondApi).toMatchObject({ builds: 0, closes: 0 })
      await invoke('buildStart', {})
      await invoke('transform', 'w-[43px]', firstFile)
      const rebuilt = await build()
      expect(rebuilt).toContain('width: 43px')
      expect(rebuilt).not.toContain('height: 31px')
      expect(plugin!.api).toBe(secondApi)
      expect(secondApi).toMatchObject({ builds: 1, closes: 0 })
      expect(firstApi).toMatchObject({ builds: 3, closes: 1 })
    }
    finally {
      await invoke('closeWatcher')
      await Promise.all(compilers.map(compiler => compiler.dispose()))
    }
  })
})
