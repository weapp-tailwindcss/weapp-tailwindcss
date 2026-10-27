import { describe, expect, it, vi } from 'vitest'
import { createContext, FakeConcatSource, createCompilerContextMock, testState, WeappTailwindcss } from './webpack.v5.unit/shared'

function createCompilerHarness() {
  const processAssetsCallbacks: Array<() => void> = []
  const compilation = {
    getAssets: () => [
      {
        name: 'app.wxss',
        source: {
          source: () => '.app{}',
        },
      },
    ],
    getAsset: vi.fn((name: string) => name === 'app.wxss' ? { source: { source: () => '.app{}' } } : undefined),
    updateAsset: vi.fn(),
    emitAsset: vi.fn(),
    hooks: {
      processAssets: {
        tap: vi.fn((_options: unknown, handler: () => void) => {
          processAssetsCallbacks.push(handler)
        }),
        tapPromise: vi.fn(),
      },
    },
  }
  const compiler = {
    options: {},
    webpack: {
      Compilation: {
        PROCESS_ASSETS_STAGE_SUMMARIZE: 0,
      },
      sources: {
        RawSource: FakeConcatSource,
        ConcatSource: FakeConcatSource,
      },
      NormalModule: {
        getCompilationHooks: vi.fn(() => ({
          loader: {
            tap: vi.fn(),
          },
        })),
      },
    },
    hooks: {
      invalid: { tap: vi.fn() },
      watchRun: { tap: vi.fn() },
      thisCompilation: {
        tap: vi.fn((_name: string, handler: (compilation: unknown) => void) => {
          handler(compilation)
        }),
      },
      compilation: {
        tap: vi.fn((_name: string, handler: (compilation: unknown) => void) => {
          handler(compilation)
        }),
      },
      normalModuleFactory: {
        tap: vi.fn((_name: string, handler: (factory: unknown) => void) => {
          handler({
            hooks: {
              beforeResolve: {
                tap: vi.fn(),
              },
            },
          })
        }),
      },
      watchClose: { tap: vi.fn() },
      shutdown: { tap: vi.fn() },
    },
  }
  return {
    compiler,
    compilation,
    processAssetsCallbacks,
  }
}

describe('bundlers/webpack builtin styleInjector', () => {
  it('applies builtin webpack style injector to the same compiler', () => {
    testState.currentContext = createContext({
      appType: 'native',
      styleInjector: {
        imports: ['shared.wxss'],
      },
    } as any)
    createCompilerContextMock.mockClear()
    const harness = createCompilerHarness()

    new WeappTailwindcss().apply(harness.compiler as any)
    const styleInjectorTap = (harness.compiler.hooks.thisCompilation.tap as ReturnType<typeof vi.fn>).mock.calls
      .find(([name]) => name === 'weapp-style-injector:webpack')

    expect(styleInjectorTap).toBeTruthy()
    expect(harness.processAssetsCallbacks).toHaveLength(1)

    harness.processAssetsCallbacks[0]()

    expect(harness.compilation.updateAsset).toHaveBeenCalledWith('app.wxss', expect.any(Function))
    const updateSource = harness.compilation.updateAsset.mock.calls.at(-1)?.[1] as () => FakeConcatSource
    expect(updateSource().toString()).toBe('@import "shared.wxss";\n.app{}')
  })

  it('does not apply builtin webpack style injector when the main plugin is disabled', () => {
    testState.currentContext = createContext({
      disabled: { plugin: true },
      styleInjector: true,
    } as any)
    createCompilerContextMock.mockClear()
    const harness = createCompilerHarness()

    new WeappTailwindcss().apply(harness.compiler as any)

    expect((harness.compiler.hooks.thisCompilation.tap as ReturnType<typeof vi.fn>).mock.calls
      .some(([name]) => name === 'weapp-style-injector:webpack')).toBe(false)
  })
})
