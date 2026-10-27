import type { Plugin } from 'vite'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'
import type { Compiler } from '@/core/compiler/types'

/** 测试框架只能调用生成与转换服务，不能取得其他所有者的缓存或关闭方法。 */
export type FixtureCompilationServices = Readonly<Pick<Compiler, 'generate' | 'transformCss' | 'transformTemplate'>>

const pluginName = 'fixture:capability-framework'
const slots = [{
  name: pluginName,
  enforce: 'pre',
  ownsSession: true,
  hooks: { buildStart: true, transform: { order: 'pre' }, watchChange: true, generateBundle: { order: 'post' }, closeWatcher: true },
}] as const satisfies readonly VitePluginSlot[]

function create(root: string, compilation: FixtureCompilationServices): Plugin[] {
  const sources = new Map<string, readonly string[]>()
  const api = { builds: 0, closes: 0 }
  const generate = () => compilation.generate({
    id: 'fixture:root',
    candidates: [...sources.values()].flat(),
    scanSources: false,
    sourceOptions: { base: root, css: '@theme { --spacing: 0.25rem; }\n@tailwind utilities;' },
    target: 'weapp',
  })
  return [{
    name: pluginName,
    enforce: 'pre',
    api,
    buildStart() {
      api.builds++
    },
    transform: {
      order: 'pre',
      async handler(code, id) {
        if (!id.endsWith('.capability')) {
          return
        }
        const candidates = code.trim().split(/\s+/).filter(Boolean)
        sources.set(id, candidates)
        const generated = await generate()
        return {
          code: await compilation.transformTemplate(`<view class="${candidates.join(' ')}" />`, generated.snapshot),
          map: null,
        }
      },
    },
    watchChange(id, change) {
      if (change.event === 'delete') {
        sources.delete(id)
      }
    },
    generateBundle: {
      order: 'post',
      async handler() {
        const generated = await generate()
        const result = await compilation.transformCss(generated.css, generated.snapshot)
        this.emitFile({ type: 'asset', fileName: 'fixture.wxss', source: result.css })
      },
    },
    closeWatcher() {
      sources.clear()
      api.closes++
    },
  }]
}

/** 新框架的全部接入只增加实现与登记，现有 dispatcher 无需识别名称。 */
export const fixtureFrameworkRegistration = {
  capability: { slots, create },
} as const
