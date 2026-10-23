import type { OutputAsset, OutputBundle } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { StyleInjector } from 'weapp-style-injector/vite/uni-app'
import { getViteHookHandler } from '@/bundlers/vite/plugin-hook'
import { createBuiltinViteStyleInjectorPlugins } from '@/style-injector/vite/runtime'
import { createUniViteStyleInjector } from '@/style-injector/vite/uni'

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [], needsCodeReference: false } as unknown as OutputAsset
}

async function buildRound(plugins: Plugin[]) {
  const bundle: OutputBundle = { 'sub/page.wxss': asset('sub/page.wxss', '.page{}') }
  const context = {
    addWatchFile() {},
    emitFile(file: { fileName: string, source: string }) {
      bundle[file.fileName] = asset(file.fileName, file.source)
      return file.fileName
    },
  } as any
  for (const plugin of plugins) {
    await getViteHookHandler(plugin.buildStart)?.call(context, {} as any)
  }
  for (const plugin of plugins) {
    await getViteHookHandler(plugin.generateBundle)?.call(context, {} as any, bundle, false)
  }
  return Object.fromEntries(Object.entries(bundle).filter(([, value]) => value.type === 'asset').map(([name, value]) => [name, (value as OutputAsset).source]))
}

describe('内置与独立 injector 连续构建一致性', () => {
  it('每轮刷新来源，更新和删除不沿用前一轮样式', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'injector-watch-parity-'))
    try {
      await mkdir(path.join(root, 'sub'))
      const pagesJsonPath = path.join(root, 'pages.json')
      const source = path.join(root, 'sub', 'index.css')
      await writeFile(pagesJsonPath, JSON.stringify({ subPackages: [{ root: 'sub', pages: ['page'] }] }))
      await writeFile(source, '.first{color:red}')
      const options = { subPackages: { pagesJsonPath, preprocess: false } }
      const builtin = createBuiltinViteStyleInjectorPlugins(options, () => createUniViteStyleInjector)
      const standaloneValue = StyleInjector(options)
      const standalone = Array.isArray(standaloneValue) ? standaloneValue : [standaloneValue]
      for (const plugins of [builtin, standalone]) {
        const config = { root, command: 'build', build: { watch: {} }, plugins, css: {} } as ResolvedConfig
        for (const plugin of plugins) {
          await getViteHookHandler(plugin.configResolved)?.call({} as any, config)
        }
      }
      for (const css of ['.first{color:red}', '.second{color:blue}', undefined]) {
        if (css === undefined) {
          await rm(source)
        }
        else {
          await writeFile(source, css)
        }
        const actual = await buildRound(builtin)
        expect(actual).toEqual(await buildRound(standalone))
        if (css) {
          expect(actual['sub/index.wxss']).toBe(css)
        }
        else {
          expect(actual['sub/index.wxss']).toBeUndefined()
        }
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
