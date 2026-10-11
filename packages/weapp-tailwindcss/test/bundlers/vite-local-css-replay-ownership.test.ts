import type { OutputAsset, OutputBundle } from 'rollup'
import type { ResolvedConfig } from 'vite'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { createGenerateBundleHook } from '@/bundlers/vite/generate-bundle'
import { createSubpackageSourceCandidateScope } from '@/bundlers/vite/generate-bundle/source-candidate-scope'
import { injectViteProcessedCssIntoMainCssAssets } from '@/bundlers/vite/processed-css-assets'
import { collectImportedStyleFiles } from '@/bundlers/vite/processed-css-assets/markers-imports'
import { createFrameworkProcessedCssRegistry } from '@/bundlers/vite/shared/framework-processed-css-registry'
import { createContext, createRollupAsset, createRollupChunk } from './vite-plugin.testkit'

describe('local CSS replay ownership', () => {
  it.each([
    ['theme.acss', true],
    ['./theme.acss', true],
    ['theme.acss?version=2', true],
    ['screens/home/view.acss', false],
    ['screens\\home\\view.acss', false],
    ['/theme.acss', false],
    ['C:\\theme.acss', false],
    ['C:\\screens\\view.acss', false],
    ['../theme.acss', false],
  ])('uses bundle output ownership for %s even when the main matcher is broad', (file, expected) => {
    const scope = createSubpackageSourceCandidateScope({
      rootDir: process.cwd(),
      snapshot: { entries: [] } as any,
      subpackageRoots: new Set(['feature']),
      useIncrementalMode: true,
    })
    expect(scope.shouldInjectCssIntoMainFromOutput(file, file, { isMainChunk: true })).toBe(expected)
  })

  it.each(['wxss', 'acss'])('keeps local imports and rules in their %s output across build and HMR', async (extension) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-local-css-owner-'))
    try {
      const rootFile = `theme.${extension}`
      const bridgeFile = `framework.${extension}`
      const pageFile = `screens/home/view.${extension}`
      const componentFile = `widgets/card/view.${extension}`
      const runtime = new Set(['local-before'])
      const context = createContext({
        appType: 'uni-app-x',
        cssMatcher: (file: string) => file.endsWith(`.${extension}`),
        mainCssChunkMatcher: (file: string) => file === rootFile,
        styleHandler: vi.fn(async (css: string) => ({ css })),
        tailwindRuntime: {
          getClassSet: vi.fn(async () => runtime),
          getClassSetSync: vi.fn(() => runtime),
          majorVersion: 4,
          extract: vi.fn(async () => ({ classSet: runtime })),
        },
      })
      const registry = createFrameworkProcessedCssRegistry()
      const generateBundle = createGenerateBundleHook({
        opts: context as any,
        runtimeState: { tailwindRuntime: context.tailwindRuntime, readyPromise: Promise.resolve() },
        ensureRuntimeClassSet: async () => runtime,
        ensureBundleRuntimeClassSet: async () => runtime,
        debug: vi.fn(),
        getResolvedConfig: () => ({
          command: 'build',
          plugins: [],
          root,
          build: { outDir: 'dist', watch: {} },
          css: { postcss: { plugins: [] } },
        }) as unknown as ResolvedConfig,
        markCssAssetProcessed: vi.fn(),
        isCssAssetProcessed: () => false,
        isViteProcessedCssAsset: (asset, file) => String(asset.source).includes('weapp-tailwindcss') || file === rootFile,
        recordCssAssetResult: vi.fn(),
        recordViteProcessedCssAssetResult: registry.record,
        getViteProcessedCssAssetResults: registry.entries,
        getViteProcessedCssAssetResult: registry.get,
        getSourceCandidates: () => runtime,
        getSourceCandidatesForEntries: () => runtime,
        waitForSourceCandidateSyncs: async () => undefined,
        rememberCssSource: vi.fn(),
        getRememberedCssSources: () => new Map(),
        getRememberedCssSignature: () => undefined,
        setRememberedCssSignature: vi.fn(),
        recordGeneratorCandidates: vi.fn(),
      })
      const asset = (file: string, css: string): OutputAsset => ({ ...createRollupAsset(css), fileName: file })
      const localCss = (file: string, css: string) => `${createBundlerGeneratedCssMarker('vite', path.join(root, file.replace(/\.[^.]+$/, '.uvue')))}\n${css}`
      for (const token of ['local-before', 'local-after', 'local-before']) {
        runtime.clear()
        runtime.add(token)
        const bundle: OutputBundle = {
          'app.json': asset('app.json', JSON.stringify({ pages: ['screens/home/view'], subPackages: [{ root: 'feature', pages: ['detail'] }] })),
          [rootFile]: asset(rootFile, '.root{display:block}'),
          [bridgeFile]: asset(bridgeFile, `@import "./${rootFile}";`),
          [pageFile]: asset(pageFile, localCss(pageFile, `@import "../../${bridgeFile}";\n.${token}{color:red}`)),
          [componentFile]: asset(componentFile, localCss(componentFile, `@import "/${rootFile}";\n.card{color:blue}`)),
          'screens/home/view.js': { ...createRollupChunk(`console.log('${token}')`), fileName: 'screens/home/view.js' },
        }
        await generateBundle.call({ addWatchFile: vi.fn() } as any, {}, bundle)
        // finalizer 会再次消费共享注册表，必须保留 generateBundle 已确定的局部归属。
        injectViteProcessedCssIntoMainCssAssets(bundle, {
          opts: context as any,
          getViteProcessedCssAssetResults: registry.entries,
        })

        const rootCss = String((bundle[rootFile] as OutputAsset).source)
        const pageCss = String((bundle[pageFile] as OutputAsset).source)
        const componentCss = String((bundle[componentFile] as OutputAsset).source)
        expect(rootCss).toContain('.root')
        expect(rootCss).not.toContain('@import')
        expect(rootCss).not.toContain('.local-')
        expect(rootCss).not.toContain('.card')
        expect(pageCss).toContain(`.${token}`)
        expect(collectImportedStyleFiles(pageCss, pageFile)).toEqual(new Set([bridgeFile]))
        expect(collectImportedStyleFiles(componentCss, componentFile)).toEqual(new Set([rootFile]))
        expect(String((bundle[bridgeFile] as OutputAsset).source)).toBe(`@import "./${rootFile}";`)
        expect(registry.get(pageFile)).toMatchObject({ injectIntoMain: false, outputFile: pageFile })
        expect(registry.get(componentFile)).toMatchObject({ injectIntoMain: false, outputFile: componentFile })
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
