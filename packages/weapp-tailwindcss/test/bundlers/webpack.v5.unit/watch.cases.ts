import { describe, expect, it, vi } from 'vitest'
import { setupWebpackV5UnitTest, FakeConcatSource, createContext, path, testState, WeappTailwindcss } from './shared'
describe('bundlers/webpack WeappTailwindcss / watch ignored paths', () => {
  setupWebpackV5UnitTest()
  it('adds webpack output path to configured watch ignored paths before webpack creates Watching', () => {
    const outputPath = path.resolve(process.cwd(), 'dist')
    const watch = vi.fn()
    const watchRunHandlers: Array<() => void> = []
    const compilation = {
      compiler: { outputPath },
      chunks: [],
      hooks: {
        processAssets: {
          tapPromise: vi.fn(),
        },
      },
      updateAsset: vi.fn(),
      getAsset: vi.fn(),
    }
    const compiler = {
      outputPath,
      options: {
        watchOptions: {
          aggregateTimeout: 100,
          ignored: ['**/node_modules/**', '**/.git/**'],
        },
      },
      watch,
      webpack: {
        Compilation: {
          PROCESS_ASSETS_STAGE_SUMMARIZE: Symbol('stage'),
        },
        sources: {
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
        watchRun: {
          tap: (_name: string, handler: () => void) => {
            watchRunHandlers.push(handler)
          },
        },
        normalModuleFactory: {
          tap: (_name: string, handler: (factory: any) => void) => {
            handler({
              hooks: {
                beforeResolve: {
                  tap: vi.fn(),
                },
              },
            })
          },
        },
        compilation: {
          tap: (_name: string, handler: (_compilation: any) => void) => {
            handler(compilation)
          },
        },
      },
    }

    new WeappTailwindcss().apply(compiler as any)
    expect(compiler.watch).toBe(watch)
    expect(watchRunHandlers.length).toBeGreaterThan(0)

    const ignored = compiler.options.watchOptions.ignored as unknown as (file: string) => boolean
    expect(ignored(outputPath)).toBe(true)
    expect(ignored(path.join(outputPath, 'app.js'))).toBe(true)
    expect(ignored(path.resolve('node_modules/pkg/index.js'))).toBe(true)
    expect(ignored(path.resolve('.git/index'))).toBe(true)
    expect(ignored(path.resolve('src/index.ts'))).toBe(false)
  })

  it('adds webpack output path to active watch ignored paths without patching compiler.watch', () => {
    const outputPath = path.resolve(process.cwd(), 'dist')
    const watch = vi.fn()
    const watchRunHandlers: Array<() => void> = []
    const compilation = {
      compiler: { outputPath },
      chunks: [],
      hooks: {
        processAssets: {
          tapPromise: vi.fn(),
        },
      },
      updateAsset: vi.fn(),
      getAsset: vi.fn(),
    }
    const compiler = {
      outputPath,
      options: {},
      watch,
      watching: {
        watchOptions: {
          aggregateTimeout: 100,
          ignored: ['**/node_modules/**', '**/.git/**'],
        },
      },
      webpack: {
        Compilation: {
          PROCESS_ASSETS_STAGE_SUMMARIZE: Symbol('stage'),
        },
        sources: {
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
        watchRun: {
          tap: (_name: string, handler: () => void) => {
            watchRunHandlers.push(handler)
          },
        },
        normalModuleFactory: {
          tap: (_name: string, handler: (factory: any) => void) => {
            handler({
              hooks: {
                beforeResolve: {
                  tap: vi.fn(),
                },
              },
            })
          },
        },
        compilation: {
          tap: (_name: string, handler: (_compilation: any) => void) => {
            handler(compilation)
          },
        },
      },
    }

    new WeappTailwindcss().apply(compiler as any)
    expect(compiler.watch).toBe(watch)
    for (const handler of watchRunHandlers) {
      handler()
    }

    const ignored = compiler.watching.watchOptions.ignored as unknown as (file: string) => boolean
    expect(ignored(outputPath)).toBe(true)
    expect(ignored(path.join(outputPath, 'app.js'))).toBe(true)
    expect(ignored(path.resolve('node_modules/pkg/index.js'))).toBe(true)
    expect(ignored(path.resolve('.git/index'))).toBe(true)
    expect(ignored(path.resolve('src/index.ts'))).toBe(false)
  })

  it('adds delayed compilation output path to active watch ignored paths', () => {
    const outputPath = path.resolve(process.cwd(), 'dist-h5')
    const watch = vi.fn()
    const thisCompilationHandlers: Array<(compilation: any) => void> = []
    const compilation = {
      compiler: { outputPath },
      outputOptions: { path: outputPath },
      chunks: [],
      hooks: {
        processAssets: {
          tapPromise: vi.fn(),
        },
      },
      updateAsset: vi.fn(),
      getAsset: vi.fn(),
    }
    const compiler = {
      options: {},
      watch,
      watching: {
        watchOptions: {
          aggregateTimeout: 100,
          ignored: ['**/node_modules/**'],
        },
      },
      webpack: {
        Compilation: {
          PROCESS_ASSETS_STAGE_SUMMARIZE: Symbol('stage'),
        },
        sources: {
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
        watchRun: {
          tap: vi.fn(),
        },
        normalModuleFactory: {
          tap: (_name: string, handler: (factory: any) => void) => {
            handler({
              hooks: {
                beforeResolve: {
                  tap: vi.fn(),
                },
              },
            })
          },
        },
        thisCompilation: {
          tap: (_name: string, handler: (compilationParam: any) => void) => {
            thisCompilationHandlers.push(handler)
            handler(compilation)
          },
        },
        compilation: {
          tap: (_name: string, handler: (compilationParam: any) => void) => {
            handler(compilation)
          },
        },
      },
    }

    new WeappTailwindcss().apply(compiler as any)
    expect(compiler.watch).toBe(watch)
    expect(thisCompilationHandlers.length).toBeGreaterThan(0)
    const ignored = compiler.watching.watchOptions.ignored as unknown as (file: string) => boolean
    expect(ignored(outputPath)).toBe(true)
    expect(ignored(path.join(outputPath, 'app.js'))).toBe(true)
    expect(ignored(path.resolve('node_modules/pkg/index.js'))).toBe(true)
    expect(ignored(path.resolve('src/index.ts'))).toBe(false)
  })

  it('wraps mixed webpack watch ignored rules as a predicate', () => {
    const outputPath = path.resolve(process.cwd(), 'dist')
    const ignoredPredicate = vi.fn((file: string) => file.replace(/\\/g, '/').includes('/custom-cache/'))
    const watch = vi.fn()
    const watchRunHandlers: Array<() => void> = []
    const compilation = {
      compiler: { outputPath },
      chunks: [],
      hooks: {
        processAssets: {
          tapPromise: vi.fn(),
        },
      },
      updateAsset: vi.fn(),
      getAsset: vi.fn(),
    }
    const compiler = {
      outputPath,
      options: {
        watchOptions: {
          aggregateTimeout: 100,
          ignored: [/node_modules/, '**/.git/**', ignoredPredicate],
        },
      },
      watch,
      watching: {
        watchOptions: {
          aggregateTimeout: 100,
          ignored: [/node_modules/, '**/.git/**', ignoredPredicate],
        },
      },
      webpack: {
        Compilation: {
          PROCESS_ASSETS_STAGE_SUMMARIZE: Symbol('stage'),
        },
        sources: {
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
        watchRun: {
          tap: (_name: string, handler: () => void) => {
            watchRunHandlers.push(handler)
          },
        },
        normalModuleFactory: {
          tap: (_name: string, handler: (factory: any) => void) => {
            handler({
              hooks: {
                beforeResolve: {
                  tap: vi.fn(),
                },
              },
            })
          },
        },
        compilation: {
          tap: (_name: string, handler: (_compilation: any) => void) => {
            handler(compilation)
          },
        },
      },
    }

    new WeappTailwindcss().apply(compiler as any)
    expect(compiler.watch).toBe(watch)
    expect(typeof compiler.options.watchOptions.ignored).toBe('function')
    for (const handler of watchRunHandlers) {
      handler()
    }

    const ignored = compiler.watching.watchOptions.ignored
    for (const handler of watchRunHandlers) {
      handler()
    }

    expect(compiler.watching.watchOptions.ignored).toBe(ignored)
    expect(typeof ignored).toBe('function')
    expect(ignored(path.join(process.cwd(), 'node_modules/pkg/index.js'))).toBe(true)
    expect(ignored(path.join(process.cwd(), '.git/index'))).toBe(true)
    expect(ignored(path.join(process.cwd(), 'custom-cache/index.js'))).toBe(true)
    expect(ignored(outputPath)).toBe(true)
    expect(ignored(path.join(outputPath, 'client/index.js'))).toBe(true)
    expect(ignored(path.join(process.cwd(), 'src/index.ts'))).toBe(false)
  })

  it('does not patch webpack watch when the plugin is disabled', () => {
    testState.currentContext = createContext({
      disabled: true,
    })
    const watch = vi.fn()
    const compiler = {
      outputPath: path.resolve(process.cwd(), 'dist'),
      options: {},
      watch,
      webpack: {
        Compilation: {
          PROCESS_ASSETS_STAGE_SUMMARIZE: Symbol('stage'),
        },
        sources: {
          ConcatSource: FakeConcatSource,
        },
        NormalModule: {
          getCompilationHooks: vi.fn(),
        },
      },
      hooks: {},
    }

    new WeappTailwindcss().apply(compiler as any)
    expect(compiler.watch).toBe(watch)
  })

})
