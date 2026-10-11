import type { OutputAsset, OutputBundle } from 'rollup'
import type { ResolvedConfig } from 'vite'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { createGenerateBundleHook } from '@/bundlers/vite/generate-bundle'
import * as scopedSources from '@/bundlers/vite/generate-bundle/scoped-generator-sources'
import { createContext } from './vite-plugin.testkit'

afterEach(() => vi.restoreAllMocks())

describe('已完成 CSS 的增量复用计划', () => {
  it.each(['wxss', 'acss', 'ttss'])('复用 %s 产物不再准备未消费的候选与来源追踪', async (extension) => {
    const sourceData = vi.spyOn(scopedSources, 'createScopedGeneratorSourceData')
    const styleHandler = vi.fn(async (css: string) => ({ css }))
    const ctx = createContext({
      appType: 'uni-app-x',
      generator: false,
      cssMatcher: (file: string) => file.endsWith(`.${extension}`),
      mainCssChunkMatcher: () => false,
      styleHandler,
      tailwindRuntime: { majorVersion: 3 },
    })
    const recordCssAssetResult = vi.fn()
    let processed = true
    const hook = createGenerateBundleHook({
      opts: ctx as any,
      runtimeState: { tailwindRuntime: ctx.tailwindRuntime, readyPromise: Promise.resolve() } as any,
      ensureRuntimeClassSet: async () => new Set(),
      ensureBundleRuntimeClassSet: async () => new Set(),
      debug: () => {},
      getResolvedConfig: () => ({
        command: 'build',
        root: process.cwd(),
        build: { outDir: 'dist', watch: {} },
      } as ResolvedConfig),
      isCssAssetProcessed: () => processed,
      isViteProcessedCssAsset: () => processed,
      recordCssAssetResult,
    })
    const file = `components/card.${extension}`
    const run = async (color: string) => {
      const css = `.card{color:${color}}`
      const bundle: OutputBundle = {
        [file]: { type: 'asset', fileName: file, source: processed ? `${createBundlerGeneratedCssMarker('vite', path.join(process.cwd(), 'card.css'))}\n${css}` : css, names: [], originalFileNames: [], needsCodeReference: false },
      }
      await hook.call({ addWatchFile: () => {} }, {}, bundle)
      expect((bundle[file] as OutputAsset).source).toBe(css)
      return css
    }
    for (const color of ['red', 'red', 'blue']) {
      const css = await run(color)
      expect(recordCssAssetResult).toHaveBeenCalledWith(file, css)
    }
    expect(sourceData).not.toHaveBeenCalled()
    expect(styleHandler).not.toHaveBeenCalled()

    // 撤销已处理身份后仍执行正常管线，不能以历史复用状态吞掉本轮变化。
    processed = false
    await run('green')
    expect(sourceData).toHaveBeenCalledTimes(1)
    expect(styleHandler).toHaveBeenCalled()
  })
})
