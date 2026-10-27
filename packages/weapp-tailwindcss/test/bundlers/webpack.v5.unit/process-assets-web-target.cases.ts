import { describe, expect, it, vi } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, createCompilerContextMock, getWebpackLoaderRuntime, isCssImportRewriteLoader, mkdir, mkdtemp, os, path, testState, WeappTailwindcss, writeFile } from './shared'

async function runFinalWebCssAssetRegenerationCase(options: {
  assetCss: string[]
  expected: string[]
  notExpected?: string[] | undefined
  inlineCandidates?: string | undefined
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-web-final-css-'))
  const cssEntry = path.join(root, 'src/css/tailwind.css')
  await mkdir(path.dirname(cssEntry), { recursive: true })
  await writeFile(cssEntry, [
    '@import "tailwindcss" source(none);',
    `@source inline("${options.inlineCandidates ?? 'sr-only flex icon-[mdi--wechat]'}");`,
  ].join('\n'), 'utf8')
  testState.currentContext = createContext({
    generator: {
      target: 'web',
    },
    mainCssChunkMatcher: vi.fn(() => false),
    styleHandler: vi.fn(async () => {
      throw new Error('web target should not use mini-program styleHandler')
    }),
    tailwindRuntime: {
      ...createContext().tailwindRuntime,
      majorVersion: 4,
      options: {
        tailwindcss: {
          cwd: root,
          packageName: 'tailwindcss',
          v4: {
            cssEntries: [cssEntry],
          },
        },
      },
    },
    tailwindcssBasedir: root,
  } as any)
  createCompilerContextMock.mockReturnValue(testState.currentContext)

  const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
  let currentAssetStore: Record<string, string> = {}
  const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
    currentAssetStore[file] = source.toString()
  })
  const compilation = {
    compiler: { outputPath: path.join(root, 'build') },
    chunks: [{ id: 'main', hash: 'hash-final-web-css', files: ['styles.css'] }],
    hooks: {
      processAssets: {
        tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
          processAssetsCallbacks.push(handler)
        },
      },
    },
    updateAsset,
    getAsset(file: string) {
      const content = currentAssetStore[file]
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

  const plugin = new WeappTailwindcss()
  plugin.apply(compiler as any)

  currentAssetStore = {
    'styles.css': options.assetCss.join('\n'),
  }
  await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

  const css = currentAssetStore['styles.css']
  expect(updateAsset).toHaveBeenCalledWith('styles.css', expect.any(FakeConcatSource))
  expect(css).toContain('.sr-only')
  expect(css).toContain('.flex')
  for (const item of options.expected) {
    expect(css).toContain(item)
  }
  for (const item of options.notExpected ?? ['@tailwind utilities', '@media source(none)', ':not(#\\#)']) {
    expect(css).not.toContain(item)
  }
}

describe('bundlers/webpack WeappTailwindcss / process assets web target', () => {
  setupWebpackV5UnitTest()
  it('skips html and js transforms and preserves final css for web generator target', async () => {
    testState.currentContext = createContext({
      generator: {
        target: 'web',
      },
      htmlMatcher: (file: string) => file.endsWith('.html'),
      jsMatcher: (file: string) => file.endsWith('.js'),
      styleHandler: vi.fn(async () => {
        throw new Error('web target should not use mini-program styleHandler')
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
      },
    })
    createCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
    })
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [{ id: 'main', hash: 'hash-1' }],
      hooks: {
        processAssets: {
          tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
            processAssetsCallbacks.push(handler)
          },
        },
      },
      updateAsset,
      getAsset(file: string) {
        const content = currentAssetStore[file]
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

    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const mergedCss = [
      '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
      '@layer theme, base, components, utilities;',
      '@layer components {',
      '  .navbar__brand { color: var(--ifm-navbar-link-color); }',
      '  .navbar__items { gap: .75rem; }',
      '  .icon-\\[mdi--home\\] { display: inline-block; --svg: url("data:image/svg+xml,%3Csvg%3E"); }',
      '  .home-hero { display: grid; }',
      '  .home-v5 .home-facts { gap: 1rem; }',
      '  .rounded-full { border-radius: calc(infinity * 1px); }',
      '}',
    ].join('\n')
    currentAssetStore = {
      'index.html': '<div class="bg-[#07c160]"></div>',
      'index.js': 'const cls = "bg-[#07c160]"',
      'index.css': mergedCss,
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(testState.currentContext.templateHandler).not.toHaveBeenCalled()
    expect(testState.currentContext.jsHandler).not.toHaveBeenCalled()
    expect(testState.currentContext.styleHandler).not.toHaveBeenCalled()
    expect(updateAsset.mock.calls.some(([file]) => file === 'index.html')).toBe(false)
    expect(updateAsset.mock.calls.some(([file]) => file === 'index.js')).toBe(false)
    expect(currentAssetStore['index.css']).toContain('@layer components')
    expect(currentAssetStore['index.css']).toContain('.navbar__items')
    expect(currentAssetStore['index.css']).toContain('.icon-\\[mdi--home\\]')
    expect(currentAssetStore['index.css']).not.toContain(':not(#\\#)')
  })

  it('skips processAssets work when webpack reports no assets', async () => {
    testState.currentContext = createContext({
      generator: {
        target: 'web',
      },
    })
    createCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    const rootCompiler = {
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
            handler({
              compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
              chunks: [],
              hooks: {
                processAssets: {
                  tapPromise: (_options: unknown, processAssetsHandler: (assets: Record<string, any>) => Promise<void>) => {
                    processAssetsCallbacks.push(processAssetsHandler)
                  },
                },
              },
              updateAsset: vi.fn(),
              getAsset: vi.fn(),
            })
          },
        },
      },
    }

    const plugin = new WeappTailwindcss()
    plugin.apply(rootCompiler as any)

    expect(processAssetsCallbacks).toHaveLength(1)
    await processAssetsCallbacks[0]({})

    expect(testState.currentContext.onStart).not.toHaveBeenCalled()
    expect(testState.currentContext.onEnd).not.toHaveBeenCalled()
    expect(testState.currentContext.templateHandler).not.toHaveBeenCalled()
    expect(testState.currentContext.jsHandler).not.toHaveBeenCalled()
    expect(testState.currentContext.styleHandler).not.toHaveBeenCalled()
  })

  it('skips processAssets work for web generator target without css assets', async () => {
    testState.currentContext = createContext({
      generator: {
        target: 'web',
      },
      htmlMatcher: (file: string) => file.endsWith('.html'),
      jsMatcher: (file: string) => file.endsWith('.js'),
    })
    createCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
    })
    const rootCompiler = {
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
            handler({
              compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
              chunks: [{ id: 'main', hash: 'hash-1' }],
              hooks: {
                processAssets: {
                  tapPromise: (_options: unknown, processAssetsHandler: (assets: Record<string, any>) => Promise<void>) => {
                    processAssetsCallbacks.push(processAssetsHandler)
                  },
                },
              },
              updateAsset,
              getAsset(file: string) {
                const content = currentAssetStore[file]
                if (content === undefined) {
                  return undefined
                }
                return {
                  source: {
                    source: () => content,
                  },
                }
              },
            })
          },
        },
      },
    }

    const plugin = new WeappTailwindcss()
    plugin.apply(rootCompiler as any)

    currentAssetStore = {
      'index.html': '<div class="bg-[#07c160]"></div>',
      'index.js': 'const cls = "bg-[#07c160]"',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(testState.currentContext.onStart).not.toHaveBeenCalled()
    expect(testState.currentContext.onEnd).not.toHaveBeenCalled()
    expect(testState.currentContext.templateHandler).not.toHaveBeenCalled()
    expect(testState.currentContext.jsHandler).not.toHaveBeenCalled()
    expect(testState.currentContext.styleHandler).not.toHaveBeenCalled()
    expect(updateAsset).not.toHaveBeenCalled()
  })

  it('removes Tailwind v4 source media wrappers from processed web css assets', async () => {
    testState.currentContext = createContext({
      generator: {
        target: 'web',
      },
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      isKnownWebpackProcessedCssAsset: () => true,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
      },
    } as any)
    createCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
    })
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [{ id: 'main', hash: 'hash-processed-web-css', files: ['index.css'] }],
      hooks: {
        processAssets: {
          tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
            processAssetsCallbacks.push(handler)
          },
        },
      },
      updateAsset,
      getAsset(file: string) {
        const content = currentAssetStore[file]
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

    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    currentAssetStore = {
      'index.css': [
        '.home-hero{display:grid}',
        '@media source(none){',
        '  @tailwind utilities;',
        '}',
        '.home-v5{color:#0f172a}',
      ].join('\n'),
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(updateAsset).toHaveBeenCalledWith('index.css', expect.any(FakeConcatSource))
    expect(currentAssetStore['index.css']).toContain('.home-hero')
    expect(currentAssetStore['index.css']).toContain('.home-v5')
    expect(currentAssetStore['index.css']).not.toContain('@media source(none)')
    expect(currentAssetStore['index.css']).not.toContain('@tailwind utilities')
  })

  it('generates web css from explicit Tailwind v4 cssEntries when webpack only exposes merged css assets', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-web-entry-'))
    const cssEntry = path.join(root, 'src/tailwind.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@source inline("sr-only flex");',
    ].join('\n'), 'utf8')
    testState.currentContext = createContext({
      generator: {
        target: 'web',
      },
      mainCssChunkMatcher: vi.fn(() => false),
      isWebpackProcessedCssAsset: () => true,
      styleHandler: vi.fn(async () => {
        throw new Error('web target should not use mini-program styleHandler')
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        options: {
          tailwindcss: {
            cwd: root,
          packageName: 'tailwindcss',
            v4: {
              cssEntries: [cssEntry],
            },
          },
        },
      },
      tailwindcssBasedir: root,
    } as any)
    createCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
    })
    const compilation = {
      compiler: { outputPath: path.join(root, 'dist') },
      chunks: [{ id: 'main', hash: 'hash-explicit-web-entry', files: ['assets/styles.css'] }],
      hooks: {
        processAssets: {
          tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
            processAssetsCallbacks.push(handler)
          },
        },
      },
      updateAsset,
      getAsset(file: string) {
        const content = currentAssetStore[file]
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

    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    currentAssetStore = {
      'assets/styles.css': '.home-v5{display:grid}',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(updateAsset).toHaveBeenCalledWith('assets/styles.css', expect.any(FakeConcatSource))
    expect(currentAssetStore['assets/styles.css']).toContain('.sr-only')
    expect(currentAssetStore['assets/styles.css']).toContain('.flex')
    expect(currentAssetStore['assets/styles.css']).toContain('.home-v5')
    expect(currentAssetStore['assets/styles.css']).not.toContain(':not(#\\#)')
  })

  it('uses cached runtime class set without initial webpack watch bundle scan', async () => {
    const runtimeClassSetSync = vi.fn(async () => new Set(['flex']))
    testState.currentContext = createContext({
      generator: {
        target: 'web',
      },
      mainCssChunkMatcher: vi.fn(() => false),
      isKnownWebpackProcessedCssAsset: () => true,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['flex'])),
        getClassSetSync: vi.fn(() => new Set(['flex'])),
      },
      __internalWebpackRuntimeClassSetManager: {
        sync: runtimeClassSetSync,
        reset: vi.fn(),
      },
    } as any)
    createCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
    })
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [{ id: 'main', hash: 'hash-watch-base-runtime', files: ['assets/styles.css'] }],
      hooks: {
        processAssets: {
          tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
            processAssetsCallbacks.push(handler)
          },
        },
      },
      updateAsset,
      getAsset(file: string) {
        const content = currentAssetStore[file]
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
      options: {
        watch: true,
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

    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    currentAssetStore = {
      'index.html': '<div class="flex"></div>',
      'index.js': 'const cls = "flex"',
      'assets/styles.css': '.home-v5{display:grid}',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(runtimeClassSetSync).not.toHaveBeenCalled()
    expect(testState.currentContext.tailwindRuntime.extract).not.toHaveBeenCalled()
  })

  it('preserves processed Docusaurus custom css when regenerating explicit Tailwind v4 web cssEntries', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-web-docusaurus-'))
    const cssEntry = path.join(root, 'src/css/tailwind.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@source inline("sr-only flex icon-[mdi--wechat]");',
    ].join('\n'), 'utf8')
    testState.currentContext = createContext({
      generator: {
        target: 'web',
      },
      mainCssChunkMatcher: vi.fn(() => false),
      isWebpackProcessedCssAsset: () => true,
      styleHandler: vi.fn(async () => {
        throw new Error('web target should not use mini-program styleHandler')
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        options: {
          tailwindcss: {
            cwd: root,
          packageName: 'tailwindcss',
            v4: {
              cssEntries: [cssEntry],
            },
          },
        },
      },
      tailwindcssBasedir: root,
    } as any)
    createCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
    })
    const compilation = {
      compiler: { outputPath: path.join(root, 'build') },
      chunks: [{ id: 'main', hash: 'hash-docusaurus-web-css', files: ['assets/css/styles.12345678.css'] }],
      hooks: {
        processAssets: {
          tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
            processAssetsCallbacks.push(handler)
          },
        },
      },
      updateAsset,
      getAsset(file: string) {
        const content = currentAssetStore[file]
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

    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    currentAssetStore = {
      'assets/css/styles.12345678.css': [
        '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
        '@layer theme, base, components, utilities;',
        '@layer utilities {',
        '  .sr-only{position:absolute;width:1px;height:1px}',
        '  .icon-\\[mdi--wechat\\]{display:inline-block;--svg:url("data:image/svg+xml,%3Csvg%3E")}',
        '}',
        '.home-hero{display:grid;min-height:calc(100vh - var(--ifm-navbar-height))}',
        '.home-v5 .home-facts{display:flex;gap:1rem}',
      ].join('\n'),
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    const css = currentAssetStore['assets/css/styles.12345678.css']
    expect(updateAsset).toHaveBeenCalledWith('assets/css/styles.12345678.css', expect.any(FakeConcatSource))
    expect(css).toContain('.sr-only')
    expect(css).toContain('.flex')
    expect(css).toContain('.icon-\\[mdi--wechat\\]')
    expect(css).toContain('--svg')
    expect(css).toContain('.home-hero')
    expect(css).toContain('.home-v5 .home-facts')
    expect(css).not.toContain('@tailwind utilities')
    expect(css).not.toContain('@media source(none)')
    expect(css).not.toContain(':not(#\\#)')
  })

  it.each([
    {
      label: 'Docusaurus theme variables and custom selectors',
      assetCss: [
        '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */',
        '@layer theme, base, components, utilities;',
        '@layer utilities {',
        '  .sr-only{position:absolute;width:1px;height:1px}',
        '  .icon-\\[mdi--wechat\\]{display:inline-block;--svg:url("data:image/svg+xml,%3Csvg%3E")}',
        '}',
        ':root{--ifm-color-primary:#2563eb}',
        '.navbar{height:var(--ifm-navbar-height)}',
        '.home-hero{display:grid;min-height:calc(100vh - var(--ifm-navbar-height))}',
      ],
      expected: [
        '.icon-\\[mdi--wechat\\]',
        ':root',
        '--ifm-color-primary',
        '.navbar',
        '.home-hero',
      ],
    },
    {
      label: 'classless root variables and element selectors',
      assetCss: [
        '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */',
        '.sr-only{position:absolute;width:1px;height:1px}',
        ':root{--site-surface:#fff;--site-foreground:#111827}',
        'html[data-theme="dark"]{--site-surface:#020617}',
        'body{margin:0;background:var(--site-surface)}',
        'main > section{scroll-margin-top:4rem}',
      ],
      expected: [
        '--site-surface',
        'html[data-theme="dark"]',
        'body',
        'main > section',
      ],
    },
    {
      label: 'media query and keyframes from user css',
      assetCss: [
        '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */',
        '.sr-only{position:absolute;width:1px;height:1px}',
        '@media (min-width: 996px){.theme-doc-sidebar-container{display:block}}',
        '@keyframes docs-fade-in{from{opacity:0}to{opacity:1}}',
        '.theme-doc-markdown{animation:docs-fade-in .2s ease}',
      ],
      expected: [
        '@media (min-width: 996px)',
        '.theme-doc-sidebar-container',
        '@keyframes docs-fade-in',
        '.theme-doc-markdown',
      ],
    },
    {
      label: 'third-party component css and data url icon styles',
      assetCss: [
        '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */',
        '.sr-only{position:absolute;width:1px;height:1px}',
        '.n-button{display:inline-flex;align-items:center}',
        '.n-button--primary{background:#18a058;color:#fff}',
        '.van-icon-success{background-image:url("data:image/svg+xml,%3Csvg viewBox=%270 0 16 16%27%3E%3C/svg%3E")}',
        '.tdesign-popup__mask{position:fixed;inset:0}',
      ],
      expected: [
        '.n-button',
        '.n-button--primary',
        '.van-icon-success',
        'data:image/svg+xml',
        '.tdesign-popup__mask',
      ],
    },
    {
      label: 'font-face and custom property only css',
      assetCss: [
        '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */',
        '.sr-only{position:absolute;width:1px;height:1px}',
        '@font-face{font-family:"InterVariable";src:url("/fonts/inter.woff2") format("woff2");font-display:swap}',
        ':root{--font-display:"InterVariable",sans-serif}',
        'h1{font-family:var(--font-display)}',
      ],
      expected: [
        '@font-face',
        'InterVariable',
        '--font-display',
        'h1',
      ],
    },
  ])('preserves $label from final web css asset when regenerating explicit Tailwind v4 cssEntries', async ({ assetCss, expected }) => {
    await runFinalWebCssAssetRegenerationCase({
      assetCss,
      expected,
    })
  })

  it('regenerates web css in processAssets instead of consuming incomplete loader css', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-web-loader-finalizer-'))
    const cssEntry = path.join(root, 'src/css/tailwind.css')
    const page = path.join(root, 'src/pages/index.tsx')
    try {
      await mkdir(path.dirname(cssEntry), { recursive: true })
      await mkdir(path.dirname(page), { recursive: true })
      await writeFile(cssEntry, [
        '@import "tailwindcss" source(none);',
        '@source "../../src/**/*.{ts,tsx}";',
      ].join('\n'), 'utf8')
      await writeFile(page, 'export default <div className="flex grid items-center bg-[#0284c7]"></div>', 'utf8')

      testState.currentContext = createContext({
        generator: {
          target: 'web',
        },
        mainCssChunkMatcher: vi.fn(() => false),
        isKnownWebpackProcessedCssAsset: () => true,
        styleHandler: vi.fn(async () => {
          throw new Error('web target should not use mini-program styleHandler')
        }),
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          options: {
            tailwindcss: {
              cwd: root,
              packageName: 'tailwindcss',
              v4: {
                cssEntries: [cssEntry],
              },
            },
          },
        },
        tailwindcssBasedir: root,
      } as any)
      createCompilerContextMock.mockReturnValue(testState.currentContext)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: any) => void) | undefined
      let currentAssetStore: Record<string, string> = {}
      const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
        currentAssetStore[file] = source.toString()
      })
      const compilation = {
        compiler: { outputPath: path.join(root, 'build') },
        chunks: [{ id: 'main', hash: 'hash-web-loader-finalizer', files: ['assets/css/styles.css'] }],
        hooks: {
          processAssets: {
            tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
              processAssetsCallbacks.push(handler)
            },
          },
        },
        updateAsset,
        getAsset(file: string) {
          const content = currentAssetStore[file]
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
                tap: (_name: string, handler: (loaderContext: any, module: any) => void) => {
                  loaderHandler = handler
                },
              },
            })),
          },
        },
        hooks: {
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

      const plugin = new WeappTailwindcss()
      plugin.apply(compiler as any)

      const module = {
        resource: cssEntry,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      loaderHandler?.({}, module)
      const rewriteLoaderEntry = module.loaders.find(isCssImportRewriteLoader)
      const loaderRuntime = getWebpackLoaderRuntime(rewriteLoaderEntry?.options?.tailwindcssImportRewriteRuntimeKey)
      loaderRuntime?.cssImportRewrite?.registerGeneratedCss?.({
        classSet: new Set(['icon-[mdi--wechat]']),
        css: '.icon-\\[mdi--wechat\\]{display:inline-block}',
        dependencies: [],
        file: cssEntry,
      })
      loaderRuntime?.cssImportRewrite?.registerCssSourceFile?.({
        file: cssEntry,
        css: await readFile(cssEntry, 'utf8'),
        processed: false,
      })

      currentAssetStore = {
        'assets/css/styles.css': '.icon-\\[mdi--wechat\\]{display:inline-block}',
      }
      await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

      const css = currentAssetStore['assets/css/styles.css']
      expect(updateAsset).toHaveBeenCalledWith('assets/css/styles.css', expect.any(FakeConcatSource))
      expect(css).toContain('.flex')
      expect(css).toContain('.grid')
      expect(css).toContain('.items-center')
      expect(css).toContain('.bg-\\[\\#0284c7\\]')
      expect(css).not.toBe('.icon-\\[mdi--wechat\\]{display:inline-block}')
    }
    finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('regenerates web css for repeated arbitrary class changes in the same watch session', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-web-watch-arbitrary-'))
    const cssEntry = path.join(root, 'src/app.css')
    const page = path.join(root, 'src/pages/index/index.tsx')
    try {
      await mkdir(path.dirname(cssEntry), { recursive: true })
      await mkdir(path.dirname(page), { recursive: true })
      await writeFile(cssEntry, [
        '@import "tailwindcss" source(none);',
        '@source "./pages/index";',
      ].join('\n'), 'utf8')
      await writeFile(page, 'export default <div className="bg-[#111111] text-[#fff]"></div>', 'utf8')

      testState.currentContext = createContext({
        generator: {
          target: 'web',
        },
        mainCssChunkMatcher: vi.fn(() => false),
        isKnownWebpackProcessedCssAsset: () => true,
        styleHandler: vi.fn(async () => {
          throw new Error('web target should not use mini-program styleHandler')
        }),
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          getClassSet: vi.fn(async () => new Set<string>()),
          getClassSetSync: vi.fn(() => new Set<string>()),
          options: {
            tailwindcss: {
              cwd: root,
              packageName: 'tailwindcss',
              v4: {
                cssEntries: [cssEntry],
              },
            },
          },
        },
        tailwindcssBasedir: root,
      } as any)
      createCompilerContextMock.mockReturnValue(testState.currentContext)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: any) => void) | undefined
      let currentAssetStore: Record<string, string> = {}
      const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
        currentAssetStore[file] = source.toString()
      })
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{
          id: 'main',
          hash: 'stable-css-hash',
          files: ['css/app.css'],
          hasRuntime: () => true,
        }],
        chunkGraph: {
          getChunkModulesIterable: () => [{
            resource: cssEntry,
          }],
        },
        hooks: {
          processAssets: {
            tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
              processAssetsCallbacks.push(handler)
            },
          },
        },
        updateAsset,
        getAsset(file: string) {
          const content = currentAssetStore[file]
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
        options: {
          watch: true,
        },
        modifiedFiles: new Set<string>(),
        removedFiles: new Set<string>(),
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
                tap: (_name: string, handler: (loaderContext: any, module: any) => void) => {
                  loaderHandler = handler
                },
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
          compilation: {
            tap: (_name: string, handler: (_compilation: any) => void) => {
              handler(compilation)
            },
          },
        },
      }

      const plugin = new WeappTailwindcss()
      plugin.apply(compiler as any)

      const module = {
        resource: cssEntry,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      loaderHandler?.({}, module)
      const rewriteLoaderEntry = module.loaders.find(isCssImportRewriteLoader)
      const loaderRuntime = getWebpackLoaderRuntime(rewriteLoaderEntry?.options?.tailwindcssImportRewriteRuntimeKey)
      loaderRuntime?.cssImportRewrite?.registerCssSourceFile?.({
        file: cssEntry,
        css: await readFile(cssEntry, 'utf8'),
        processed: false,
      })

      currentAssetStore = {
        'css/app.css': await readFile(cssEntry, 'utf8'),
      }
      await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))
      expect(currentAssetStore['css/app.css']).toContain('.bg-\\[\\#111111\\]')
      currentAssetStore['css/app.css'] = [
        currentAssetStore['css/app.css'],
        '.site-shell{display:grid}',
        ':root{--site-shell-gap:16px}',
      ].join('\n')

      await writeFile(page, 'export default <div className="bg-[#222222] text-[#fff]"></div>', 'utf8')
      compiler.modifiedFiles = new Set([page])
      await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))
      expect(currentAssetStore['css/app.css']).toContain('.bg-\\[\\#222222\\]')
      expect(currentAssetStore['css/app.css']).not.toContain('.bg-\\[\\#111111\\]')
      expect(currentAssetStore['css/app.css']).toContain('.site-shell')
      expect(currentAssetStore['css/app.css']).toContain('--site-shell-gap')

      await writeFile(page, 'export default <div className="bg-[#333333] text-[#fff]"></div>', 'utf8')
      compiler.modifiedFiles = new Set([page])
      await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))
      expect(currentAssetStore['css/app.css']).toContain('.bg-\\[\\#333333\\]')
      expect(currentAssetStore['css/app.css']).not.toContain('.bg-\\[\\#222222\\]')
      expect(currentAssetStore['css/app.css']).toContain('.site-shell')
      expect(currentAssetStore['css/app.css']).toContain('--site-shell-gap')
    }
    finally {
      await rm(root, { force: true, recursive: true })
    }
  })

})
