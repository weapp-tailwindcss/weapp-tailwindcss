import type { SetupWebpackV5ProcessAssetsHookOptions } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/helpers'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { setupWebpackV5ProcessAssetsHook } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets'
import { createCache } from '@/cache'
import { createJsHandler } from '@/js'

function createHarness(watchMode: boolean) {
  const callbacks: Array<(assets: Record<string, { source: () => string }>) => Promise<void>> = []
  const runtimeSet = new Set(['bg-[#123456]'])
  const runtimeState = {
    readyPromise: Promise.resolve(),
    tailwindRuntime: {
      majorVersion: 4,
      options: {},
      getClassSet: vi.fn(async () => runtimeSet),
      getClassSetSync: vi.fn(() => runtimeSet),
      extract: vi.fn(async () => ({ classSet: runtimeSet })),
    },
  }
  const cache = createCache()
  const prune = vi.spyOn(cache, 'prune')
  const jsHandler = vi.fn(createJsHandler({}))
  const compilerOptions = {
    cache,
    generator: { target: 'weapp' },
    cssMatcher: (file: string) => file.endsWith('.css'),
    htmlMatcher: (file: string) => file.endsWith('.wxml'),
    jsMatcher: (file: string) => file.endsWith('.js'),
    wxsMatcher: (_file: string) => false,
    mainCssChunkMatcher: () => false,
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onUpdate: vi.fn(),
    jsHandler,
    templateHandler: vi.fn(async (source: string) => source),
    styleHandler: vi.fn(async (source: string) => ({ css: source })),
  }
  let refreshRequired = true
  const refreshRuntimeMetadata = vi.fn(async () => {})
  const consumeRuntimeRefreshRequirement = vi.fn(() => {
    refreshRequired = false
  })
  const prepareWebpackCssSources = vi.fn(() => new Set<string>())
  const rootCompiler = {
    outputPath: path.resolve('dist'),
    isChild: () => false,
    webpack: {
      Compilation: { PROCESS_ASSETS_STAGE_SUMMARIZE: 1000 },
      sources: {
        ConcatSource: class {
          constructor(private readonly value: string) {}

          source() {
            return this.value
          }
        },
      },
    },
    hooks: {
      compilation: {
        tap: (_name: string, handler: (compilation: unknown) => void) => {
          registerCompilation = handler
        },
      },
    },
  }
  let registerCompilation!: (compilation: unknown) => void
  setupWebpackV5ProcessAssetsHook({
    compiler: rootCompiler,
    options: compilerOptions,
    runtimeState,
    getRuntimeRefreshRequirement: () => refreshRequired,
    consumeRuntimeRefreshRequirement,
    refreshRuntimeMetadata,
    prepareWebpackCssSources,
    isWatchMode: () => watchMode,
    debug: vi.fn(),
  } as unknown as SetupWebpackV5ProcessAssetsHookOptions)

  async function processCompilation(child: boolean, store: Record<string, string>) {
    const compilation = {
      compiler: child ? { outputPath: rootCompiler.outputPath, isChild: () => true } : rootCompiler,
      chunks: [],
      hooks: {
        processAssets: {
          tapPromise: (_options: unknown, handler: typeof callbacks[number]) => callbacks.push(handler),
        },
      },
      getAsset: (file: string) => file in store ? { source: { source: () => store[file]! } } : undefined,
      updateAsset: vi.fn((file: string, source: { source: () => string }) => { store[file] = source.source() }),
    }
    const callbackIndex = callbacks.length
    registerCompilation(compilation)
    const assets = Object.fromEntries(Object.keys(store).map(file => [file, { source: () => store[file]! }]))
    await callbacks[callbackIndex]!(assets)
    return compilation
  }

  return {
    compilerOptions,
    consumeRuntimeRefreshRequirement,
    isRefreshRequired: () => refreshRequired,
    prepareWebpackCssSources,
    processCompilation,
    prune,
    refreshRuntimeMetadata,
    runtimeState,
  }
}

describe('Webpack 子编译的产物处理边界', () => {
  it.each([false, true])('无 matcher 命中的子编译不消费共享状态，后续父编译仍转换；watch=%s', async (watchMode) => {
    const harness = createHarness(watchMode)
    const ignored = { 'helpers/stringify.wxs': 'module.exports = "bg-[#123456]"' }
    await harness.processCompilation(true, ignored)

    expect(ignored['helpers/stringify.wxs']).toBe('module.exports = "bg-[#123456]"')
    expect(harness.runtimeState.tailwindRuntime.extract).not.toHaveBeenCalled()
    expect(harness.refreshRuntimeMetadata).not.toHaveBeenCalled()
    expect(harness.prepareWebpackCssSources).not.toHaveBeenCalled()
    expect(harness.consumeRuntimeRefreshRequirement).not.toHaveBeenCalled()
    expect(harness.prune).not.toHaveBeenCalled()
    expect(harness.compilerOptions.onStart).not.toHaveBeenCalled()
    expect(harness.compilerOptions.onEnd).not.toHaveBeenCalled()
    expect(harness.isRefreshRequired()).toBe(true)

    const parent = { 'entry.js': 'const cls = "bg-[#123456]"' }
    await harness.processCompilation(false, parent)
    expect(parent['entry.js']).toBe('const cls = "bg-_b_h123456_B"')
    expect(harness.runtimeState.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    expect(harness.consumeRuntimeRefreshRequirement).toHaveBeenCalledTimes(1)
    expect(harness.compilerOptions.onStart).toHaveBeenCalledTimes(1)
    expect(harness.compilerOptions.onEnd).toHaveBeenCalledTimes(1)
    expect(harness.isRefreshRequired()).toBe(false)
  })

  it.each(['js', 'wxs'] as const)('用户的 %s matcher 命中 WXS 时仍处理子编译', async (matcher) => {
    const harness = createHarness(false)
    harness.compilerOptions[matcher === 'js' ? 'jsMatcher' : 'wxsMatcher'] = file => file.endsWith('.wxs')
    const child = { 'helpers/stringify.wxs': 'module.exports = "bg-[#123456]"' }
    await harness.processCompilation(true, child)
    expect(child['helpers/stringify.wxs']).toBe('module.exports = "bg-_b_h123456_B"')
    expect(harness.compilerOptions.jsHandler).toHaveBeenCalledTimes(1)
    expect(harness.compilerOptions.onEnd).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['theme.css', '.plain { color: red; }', 'styleHandler'],
    ['layout.wxml', '<view class="bg-[#123456]" />', 'templateHandler'],
  ] as const)('子编译含 %s 时继续消费匹配的产物', async (file, source, handler) => {
    const harness = createHarness(false)
    await harness.processCompilation(true, { [file]: source })
    expect(harness.compilerOptions[handler]).toHaveBeenCalledTimes(1)
    expect(harness.compilerOptions.onEnd).toHaveBeenCalledTimes(1)
  })
})
