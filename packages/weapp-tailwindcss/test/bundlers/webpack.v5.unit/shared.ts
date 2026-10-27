import { initializeFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import nodeFs from 'node:fs'
import nodeOs from 'node:os'
import nodePath from 'node:path'
import { mkdir as nodeMkdir, mkdtemp as nodeMkdtemp, rm as nodeRm, writeFile as nodeWriteFile } from 'node:fs/promises'
import { afterEach, beforeEach, vi } from 'vitest'
import { createBundlerGeneratedCssMarker as createBundlerGeneratedCssMarkerImpl } from '@/bundlers/shared/generated-css-marker'
import { WeappTailwindcss as WeappTailwindcssImpl } from '@/bundlers/webpack/BaseUnifiedPlugin/v5'
import { getWebpackLoaderRuntime as getWebpackLoaderRuntimeImpl } from '@/bundlers/webpack/loaders/runtime-registry'
import { createCache } from '@/cache'
import { createJsHandler as createJsHandlerImpl } from '@/js'
import { replaceWxml as replaceWxmlImpl } from '@/wxml'

export const fs = nodeFs
export const os = nodeOs
export const path = nodePath
export const mkdir = nodeMkdir
export const mkdtemp = nodeMkdtemp
export const rm = nodeRm
export const writeFile = nodeWriteFile
export const createBundlerGeneratedCssMarker = createBundlerGeneratedCssMarkerImpl
export const WeappTailwindcss = WeappTailwindcssImpl
export const getWebpackLoaderRuntime = getWebpackLoaderRuntimeImpl
export const createJsHandler = createJsHandlerImpl
export const replaceWxml = replaceWxmlImpl

export const testState: {
  currentContext: TestContext
  existsSyncSpy?: ReturnType<typeof vi.spyOn>
  projectRoot?: string
} = {} as any

export const createCompilerContextMock = vi.fn<(options?: unknown) => TestContext>(() => testState.currentContext)
vi.mock('@/framework-policies/environment-snapshot', async importOriginal => importOriginal())

vi.mock('@/context', () => ({
  createCompilerContext: (options?: unknown) => createCompilerContextMock(options),
}))

export class FakeConcatSource {
  constructor(private readonly value: string) {}

  source() {
    return this.value
  }

  toString() {
    return this.value
  }
}

export interface LoaderModule {
  loaders: Array<{ loader: string, options?: Record<string, any> }>
  resource?: string
}

export const CSS_IMPORT_REWRITE_LOADER_PATH = path.resolve(
  __dirname,
  '../../../src/bundlers/webpack/BaseUnifiedPlugin/weapp-tw-css-import-rewrite-loader.cjs',
)

export function isCssImportRewriteLoader(entry: { loader?: string }) {
  return entry.loader?.includes('weapp-tw-css-import-rewrite-loader.cjs') ?? false
}

export function isCssGenerationLoader(entry: { loader?: string }) {
  return entry.loader?.includes('weapp-tw-css-generation-loader.cjs') ?? false
}

interface TestContext {
  disabled: boolean
  rewriteCssImports?: boolean
  generator?: unknown
  onLoad: ReturnType<typeof vi.fn>
  onStart: ReturnType<typeof vi.fn>
  onEnd: ReturnType<typeof vi.fn>
  onUpdate: ReturnType<typeof vi.fn>
  refreshTailwindcssRuntime: ReturnType<typeof vi.fn>
  templateHandler: ReturnType<typeof vi.fn>
  styleHandler: ReturnType<typeof vi.fn>
  jsHandler: ReturnType<typeof vi.fn>
  cache: ReturnType<typeof createCache>
  tailwindRuntime: {
    getClassSet: ReturnType<typeof vi.fn>
    getClassSetSync: ReturnType<typeof vi.fn>
    extract: ReturnType<typeof vi.fn>
    majorVersion: number
    options?: unknown
    collectContentTokens?: ReturnType<typeof vi.fn>
  }
  mainCssChunkMatcher: ReturnType<typeof vi.fn>
  cssMatcher: (file: string) => boolean
  htmlMatcher: (file: string) => boolean
  jsMatcher: (file: string) => boolean
  wxsMatcher: (file: string) => boolean
  runtimeLoaderPath: string
  appType?: string
  tailwindcss?: any
  tailwindcssBasedir?: string
}

export function createAssetsFromStore(store: Record<string, string>) {
  return Object.fromEntries(
    Object.keys(store).map(file => [
      file,
      {
        source: () => store[file],
      },
    ]),
  )
}

export function createContext(overrides: Partial<TestContext> = {}): TestContext {
  const cache = createCache()
  const projectRoot = testState.projectRoot ?? path.join(os.tmpdir(), 'weapp-tw-webpack-v5-unit')
  const runtimeSet = new Set(['beta'])

  const context: TestContext = {
    disabled: false,
    onLoad: vi.fn(),
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onUpdate: vi.fn(),
    refreshTailwindcssRuntime: vi.fn(async () => testState.currentContext.tailwindRuntime),
    templateHandler: vi.fn(async (code: string) => `tpl:${code}`),
    styleHandler: vi.fn(async (code: string) => ({ css: `css:${code}` })),
    jsHandler: vi.fn(async (code: string) => ({ code: `js:${code}` })),
    cache,
    tailwindRuntime: {
      getClassSet: vi.fn(async () => runtimeSet),
      getClassSetSync: vi.fn(() => runtimeSet),
      extract: vi.fn(async () => ({ classSet: runtimeSet })),
      majorVersion: 4,
      options: {
        projectRoot,
        tailwindcss: {},
      },
    },
    mainCssChunkMatcher: vi.fn(() => true),
    cssMatcher: (file: string) => file.endsWith('.css'),
    htmlMatcher: (file: string) => file.endsWith('.wxml'),
    jsMatcher: (file: string) => file.endsWith('.js'),
    wxsMatcher: (_file: string) => false,
    runtimeLoaderPath: '/virtual/weapp-tw-runtime-classset-loader.cjs',
    tailwindcssBasedir: projectRoot,
    appType: overrides.appType,
    ...overrides,
  }
  initializeFrameworkEnvironment(context)
  initializeFrameworkEnvironment(context.tailwindRuntime, context)
  return context
}

export function createCompilerWithLoaderTracking() {
  let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
  const compilation = {
    compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
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
            tap: (_name: string, handler: (loaderContext: any, module: LoaderModule) => void) => {
              loaderHandler = handler
            },
          },
        })),
      },
    },
    hooks: {
      normalModuleFactory: {
        tap: vi.fn((_name: string, handler: (factory: any) => void) => {
          handler({
            hooks: {
              beforeResolve: {
                tap: vi.fn(),
              },
            },
          })
        }),
      },
      compilation: {
        tap: vi.fn((_name: string, handler: (_compilation: any) => void) => {
          handler(compilation)
        }),
      },
      watchClose: {
        tap: vi.fn(),
      },
      shutdown: {
        tap: vi.fn(),
      },
    },
  }

  return {
    compiler,
    compilation,
    getLoaderHandler: () => loaderHandler,
  }
}

export function setupWebpackV5UnitTest() {
  beforeEach(async () => {
    testState.projectRoot = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v5-unit-'))
    testState.currentContext = createContext()
    createCompilerContextMock.mockClear()
    testState.existsSyncSpy = vi.spyOn(nodeFs as any, 'existsSync')
    testState.existsSyncSpy.mockReturnValue(true)
  })

  afterEach(async () => {
    delete process.env.WEAPP_TW_HMR_MEMORY_DEBUG
    delete process.env.WEAPP_TW_WATCH_REGRESSION
    testState.existsSyncSpy?.mockRestore()
    testState.existsSyncSpy = undefined
    if (testState.projectRoot) {
      await rm(testState.projectRoot, { force: true, recursive: true })
      testState.projectRoot = undefined
    }
    vi.doUnmock('@/generator')
    vi.resetModules()
  })
}
