import type { OutputAsset, Plugin } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { CssFinalizerContext } from '@/bundlers/vite/css-finalizer/options'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { rollup } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { createViteCssFinalizerOutputPlugin } from '@/bundlers/vite/css-finalizer'

describe('framework root shell emission in Rollup rebuilds', () => {
  it.each(['acss', 'ttss', 'qss'])('re-emits an omitted %s shell before final injection', async (extension) => {
    const shellFile = `bootstrap.${extension}`
    const targetFile = `generated.${extension}`
    const shell = `@import "./${targetFile}";\n`
    const relations = new Map([[shellFile, targetFile]])
    const records = new Map([
      [path.join(process.cwd(), 'card.vue'), {
        css: '.card{color:blue}', injectIntoMain: true, outputFile: `components/card.${extension}`,
      }],
    ])
    const context: CssFinalizerContext = {
      opts: {
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith(`.${extension}`),
        htmlMatcher: () => false,
        mainCssChunkMatcher: (file: string) => file === shellFile || file === targetFile,
        styleHandler: async (css: string) => ({ css }),
        onUpdate: vi.fn(),
        generator: false,
      } as unknown as InternalUserDefinedOptions,
      runtimeState: {
        tailwindRuntime: { majorVersion: 3 } as CssFinalizerContext['runtimeState']['tailwindRuntime'],
        readyPromise: Promise.resolve(),
      },
      ensureRuntimeClassSet: async () => new Set(),
      isCssAssetProcessed: () => true,
      markCssAssetProcessed: () => {},
      debug: () => {},
      getResolvedConfig: () => ({
        command: 'build', root: process.cwd(), build: { outDir: 'dist', watch: {} },
      } as ResolvedConfig),
      cssPipelineStrategy: { shouldKeepRootMiniProgramStyleAsImportShell: () => true },
      frameworkRootImportShellTargetByFile: relations,
      getViteProcessedCssAssetResults: () => records.entries(),
    }
    let revision = 0
    const finalizer = createViteCssFinalizerOutputPlugin(context)
    const build = await rollup({
      input: 'virtual:entry',
      plugins: [
        {
          name: 'framework-partial-style-output',
          resolveId: id => id === 'virtual:entry' ? id : undefined,
          load: id => id === 'virtual:entry' ? 'export const entry = true' : undefined,
          generateBundle() {
            revision++
            this.emitFile({ type: 'asset', fileName: targetFile, source: `.fresh{order:${revision}}` })
            if (revision === 1) {
              this.emitFile({ type: 'asset', fileName: shellFile, source: shell })
            }
          },
        },
        finalizer as Plugin,
        // 同轮重复收尾也不能产生重名资产或把组件 CSS 注入导入壳。
        { ...finalizer, name: 'repeat-css-finalizer' } as Plugin,
      ],
    })
    try {
      for (const expectedRevision of [1, 2, 3]) {
        const { output } = await build.generate({ format: 'es' })
        const assets = output.filter((item): item is OutputAsset => item.type === 'asset')
        expect(assets.filter(item => item.fileName === shellFile)).toHaveLength(1)
        expect(assets.find(item => item.fileName === shellFile)?.source).toBe(shell)
        const target = String(assets.find(item => item.fileName === targetFile)?.source)
        expect(target).toContain(`.fresh{order:${expectedRevision}}`)
        expect(target).toContain('.card{color:blue}')
        expect(target).not.toContain('@import')
      }
      relations.clear()
      const { output } = await build.generate({ format: 'es' })
      expect(output.some(item => item.fileName === shellFile)).toBe(false)
    }
    finally {
      await build.close()
    }
  })
})
