import type { SetupWebpackV5ProcessAssetsHookOptions } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/helpers'
import { vi } from 'vitest'
import { setupWebpackV5ProcessAssetsHook } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets'
import { createAssetsFromStore, createContext, FakeConcatSource } from './shared'

export function createHookHarness(options: {
  assetStore: Record<string, string>
  chunkGraph?: any
  chunkFiles?: string[] | undefined
  chunks?: any[] | undefined
  compilerOutputPath?: string | undefined
  context?: ReturnType<typeof createContext> | any
  hookOptions?: Partial<SetupWebpackV5ProcessAssetsHookOptions> | undefined
  outputOptionsPath?: string | undefined
  setupProcessAssetsHook?: typeof setupWebpackV5ProcessAssetsHook | undefined
  watchMode?: boolean | undefined
}) {
  const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
  const assetStore = options.assetStore
  const compilation = {
    compiler: options.compilerOutputPath === undefined ? undefined : { outputPath: options.compilerOutputPath },
    outputOptions: options.outputOptionsPath === undefined ? undefined : { path: options.outputOptionsPath },
    chunks: options.chunks ?? [{
      id: 'main',
      hash: 'hash-main',
      files: options.chunkFiles ?? Object.keys(assetStore),
    }],
    chunkGraph: options.chunkGraph,
    fileDependencies: {
      add: vi.fn(),
    },
    hooks: {
      processAssets: {
        tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
          processAssetsCallbacks.push(handler)
        },
      },
    },
    updateAsset: vi.fn((file: string, source: FakeConcatSource) => {
      assetStore[file] = source.toString()
    }),
    getAsset(file: string) {
      const content = assetStore[file]
      if (content === undefined) {
        return undefined
      }
      return {
        source: {
          source: () => content,
        },
      }
    },
  }
  const compiler = {
    outputPath: options.compilerOutputPath,
    webpack: {
      Compilation: {
        PROCESS_ASSETS_STAGE_SUMMARIZE: Symbol('stage'),
      },
      sources: {
        ConcatSource: FakeConcatSource,
      },
    },
    hooks: {
      compilation: {
        tap: vi.fn((_name: string, handler: (_compilation: any) => void) => {
          handler(compilation)
        }),
      },
    },
  }
  const context = options.context ?? createContext({
    tailwindRuntime: {
      ...createContext().tailwindRuntime,
      majorVersion: 4,
      getClassSet: vi.fn(async () => new Set(['bg-red-500'])),
      getClassSetSync: vi.fn(() => new Set(['bg-red-500'])),
      extract: vi.fn(async () => ({ classSet: new Set(['bg-red-500']) })),
    },
  })
  const baseHookOptions = {
    compiler,
    options: context,
    appType: context.appType,
    runtimeState: {
      tailwindRuntime: context.tailwindRuntime,
      readyPromise: Promise.resolve(),
    },
    getRuntimeRefreshRequirement: vi.fn(() => false),
    refreshRuntimeMetadata: vi.fn(async () => {}),
    consumeRuntimeRefreshRequirement: vi.fn(),
    isWatchMode: vi.fn(() => options.watchMode === true),
    getWatchChangedFiles: vi.fn(() => []),
    debug: vi.fn(),
    ...options.hookOptions,
  } satisfies SetupWebpackV5ProcessAssetsHookOptions

  ;(options.setupProcessAssetsHook ?? setupWebpackV5ProcessAssetsHook)(baseHookOptions as any)

  return {
    assetStore,
    compilation,
    context,
    hookOptions: baseHookOptions,
    processAssets: () => processAssetsCallbacks[0](createAssetsFromStore(assetStore)),
    processAssetsWith: (assets: Record<string, any>) => processAssetsCallbacks[0](assets),
  }
}
