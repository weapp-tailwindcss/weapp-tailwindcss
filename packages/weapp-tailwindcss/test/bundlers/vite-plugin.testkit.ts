import type { OutputAsset, OutputChunk } from 'rollup'
import type * as UniAppXModule from '@/uni-app-x'
import { vi } from 'vitest'
import { createCache } from '@/cache'
import { refreshTailwindcssRuntimeSymbol } from '@/tailwindcss/runtime'

function createRefreshableRuntime(
  tailwindRuntime: Record<string, any>,
  getTailwindcssBasedir: () => string | undefined,
) {
  const refreshTailwindcssRuntime = vi.fn(async () => {
    const basedir = getTailwindcssBasedir()
    if (basedir) {
      tailwindRuntime.options ??= {}
      tailwindRuntime.options.projectRoot = basedir
      tailwindRuntime.options.tailwindcss ??= {}
      tailwindRuntime.options.tailwindcss.cwd = basedir
      tailwindRuntime.options.tailwindcss.v4 ??= {}
      tailwindRuntime.options.tailwindcss.v4.base ??= basedir
      tailwindRuntime.options.tailwindcss.v4.cssSources ??= [
        {
          file: `${basedir}/app.css`,
          base: basedir,
          css: '@import "tailwindcss";',
          dependencies: [],
        },
      ]
    }
    return tailwindRuntime
  })
  tailwindRuntime.refreshTailwindcssRuntime = refreshTailwindcssRuntime
  Object.defineProperty(tailwindRuntime, refreshTailwindcssRuntimeSymbol, {
    value: refreshTailwindcssRuntime,
    configurable: true,
  })
  return refreshTailwindcssRuntime
}

export function createContext(overrides: Record<string, unknown> = {}) {
  const cache = createCache()
  const runtimeSet = new Set(['alpha'])
  const testRoot = '/virtual/weapp-tailwindcss-vite-test'
  const testTailwindcssOptions = {
    cwd: testRoot,
    v4: {
      cssSources: [
        {
          file: `${testRoot}/app.css`,
          base: testRoot,
          css: '@import "tailwindcss" source(none);',
          dependencies: [],
        },
      ],
    },
  }
  const defaultTailwindRuntime = {
    getClassSet: vi.fn(async () => runtimeSet),
    getClassSetSync: vi.fn(() => runtimeSet),
    majorVersion: 4,
    extract: vi.fn(async () => ({ classSet: runtimeSet })),
    options: {
      projectRoot: testRoot,
      tailwindcss: testTailwindcssOptions,
    },
  }
  const { tailwindRuntime: overrideTailwindRuntime, ...restOverrides } = overrides as {
    tailwindRuntime?: {
      options?: {
        tailwindcss?: {
          v4?: Record<string, unknown>
        } & Record<string, unknown>
      } & Record<string, unknown>
    } & Record<string, unknown>
  }
  const mergedTailwindRuntimeOptions = overrideTailwindRuntime?.options
    ? {
        ...defaultTailwindRuntime.options,
        ...overrideTailwindRuntime.options,
        ...(overrideTailwindRuntime.options.tailwindcss === undefined
          ? {}
          : { tailwindcss: overrideTailwindRuntime.options.tailwindcss }),
      }
    : defaultTailwindRuntime.options
  const mergedTailwindRuntime = overrideTailwindRuntime
    ? {
        ...defaultTailwindRuntime,
        ...overrideTailwindRuntime,
        options: mergedTailwindRuntimeOptions,
      }
    : defaultTailwindRuntime
  let context: Record<string, any>
  const refreshTailwindcssRuntime = createRefreshableRuntime(mergedTailwindRuntime, () => context?.tailwindcssBasedir)

  context = {
    disabled: false,
    onLoad: vi.fn(),
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onUpdate: vi.fn(),
    templateHandler: vi.fn(async (code: string) => `tpl:${code}`),
    styleHandler: vi.fn(async (code: string) => ({
      css: `css:${code}`,
      map: {
        toJSON: () => ({
          version: 3,
          file: 'style.css',
          sources: ['style.css'],
          names: [],
          mappings: 'AAAA',
          sourcesContent: [code],
        }),
      },
    })),
    // 保持 jsHandler 为同步实现，以符合 JsHandler 的类型签名
    jsHandler: vi.fn((code: string) => ({ code: `js:${code}` })),
    mainCssChunkMatcher: vi.fn(() => true),
    appType: 'uni-app',
    cache,
    cssMatcher: (file: string) => file.endsWith('.css'),
    htmlMatcher: (file: string) => file.endsWith('.wxml'),
    jsMatcher: (file: string) => file.endsWith('.js'),
    wxsMatcher: () => false,
    tailwindRuntime: mergedTailwindRuntime,
    refreshTailwindcssRuntime,
    uniAppX: undefined as any,
    runtimeLoaderPath: undefined,
    mainChunkRegex: undefined,
    cssEntries: undefined,
    customReplaceDictionary: undefined,
    ...restOverrides,
  }
  return context
}

export type InternalContext = ReturnType<typeof createContext>

let currentContext: InternalContext = createContext()

const hoistedMocks = vi.hoisted(() => ({
  postcssHtmlTransformMock: vi.fn(() => ({ postcssPlugin: 'mocked-html-transform' })),
  transformUVueMock: vi.fn((code: string, id: string, _jsHandler?: unknown, _runtimeSet?: Set<string>) => ({
    code: `uvue:${id}:${code}`,
  })),
}))

const { postcssHtmlTransformMock, transformUVueMock } = hoistedMocks

vi.mock('@weapp-tailwindcss/postcss/html-transform', () => ({
  default: postcssHtmlTransformMock,
}))

vi.mock('@/uni-app-x/transform', () => ({
  transformUVue: transformUVueMock,
}))
vi.mock('@/uni-app-x', async (importOriginal) => {
  const actual = await importOriginal<typeof UniAppXModule>()
  return {
    ...actual,
  }
})

export const createCompilerContextMock = vi.fn<(options?: unknown) => InternalContext>(() => currentContext)
vi.mock('@/context', () => ({
  createCompilerContext: (options?: unknown) => createCompilerContextMock(options),
}))

export function setCurrentContext(nextContext: InternalContext) {
  currentContext = nextContext
}

export function getCurrentContext() {
  return currentContext
}

export function resetVitePluginTestContext() {
  setCurrentContext(createContext())
  createCompilerContextMock.mockClear()
  postcssHtmlTransformMock.mockClear()
  transformUVueMock.mockClear()
}

export function getTransformUVueMock() {
  return transformUVueMock
}

export function createRollupAsset(source: string): OutputAsset {
  return {
    type: 'asset',
    fileName: 'index.wxml',
    name: undefined,
    source,
    needsCodeReference: false,
    names: [] as string[],
    originalFileName: null,
    originalFileNames: [] as string[],
  } as OutputAsset
}

export function createRollupChunk(code: string): OutputChunk {
  return {
    type: 'chunk',
    fileName: 'index.js',
    name: 'index',
    code,
    map: null,
    facadeModuleId: null,
    moduleIds: [],
    modules: {},
    imports: [],
    exports: [],
    dynamicImports: [],
    implicitlyLoadedBefore: [],
    importedBindings: {},
    isEntry: true,
    isDynamicEntry: false,
    referencedFiles: [],
    isImplicitEntry: false,
    sourcemapFileName: null,
    preliminaryFileName: null,
  } as unknown as OutputChunk
}
