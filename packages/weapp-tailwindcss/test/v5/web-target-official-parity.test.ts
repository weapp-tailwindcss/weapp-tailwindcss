import type { OutputAsset, OutputChunk } from 'rollup'
import type { Transform } from 'node:stream'
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import tailwindcssPostcss from '@tailwindcss/postcss'
import tailwindcssVite from '@tailwindcss/vite'
import Vinyl from 'vinyl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WeappTailwindcss as createGulpPlugins } from '@/gulp'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '@/generator'
import { WeappTailwindcss as createVitePlugins } from '@/vite'
import { generateCssByGenerator } from '@/generation/index'
import {
  createContext,
  createRollupAsset,
  createRollupChunk,
  resetVitePluginTestContext,
  setCurrentContext,
} from '../bundlers/vite-plugin.testkit'
import {
  FakeConcatSource,
  createAssetsFromStore,
  createContext as createWebpackContext,
  getCompilerContextMock as getWebpackCompilerContextMock,
  getWebpackLoaderRuntime,
  path as webpackPath,
  testState as webpackTestState,
} from '../bundlers/webpack.v5.unit/shared'

const require = createRequire(import.meta.url)
const workspaceRoot = path.resolve(__dirname, '../../../..')
const tailwindcssV4Root = path.dirname(require.resolve('tailwindcss/package.json'))
const websiteRoot = path.join(workspaceRoot, 'website')
const createdRoots: string[] = []
const TEST_TIMEOUT = 120_000

interface WebParityFixture {
  css: string
  cssEntry: string
  root: string
}

const PARITY_CANDIDATES = [
  'container',
  'mx-auto',
  'flex',
  'inline-flex',
  'grid',
  'hidden',
  'grid-cols-[repeat(3,minmax(0,1fr))]',
  'auto-rows-[minmax(0,auto)]',
  'items-center',
  'justify-between',
  'gap-card',
  'gap-x-[clamp(12px,2vw,28px)]',
  'gap-y-3',
  'p-card',
  'px-[calc(var(--spacing-card)*2)]',
  'py-[18px]',
  'm-[3px_5px_7px_11px]',
  'size-[42px]',
  'min-h-dvh',
  'max-w-[min(72rem,calc(100vw-2rem))]',
  'aspect-[16/9]',
  'overflow-hidden',
  'rounded-full',
  'rounded-[22px]',
  'border',
  'border-brand/40',
  '!border-brand',
  'bg-brand',
  'bg-accent/70',
  'bg-[linear-gradient(135deg,var(--color-brand),color-mix(in_oklab,var(--color-accent)_55%,white))]',
  'text-white',
  'text-[#123456]',
  'text-[length:clamp(14px,2vw,20px)]',
  'font-semibold',
  'tracking-wide',
  'underline',
  'decoration-brand',
  'decoration-2',
  'underline-offset-4',
  'shadow-[0_18px_70px_rgba(15,23,42,0.24)]',
  'ring-2',
  'ring-brand/30',
  'outline-none',
  'opacity-90',
  'blur-[1px]',
  'backdrop-blur-md',
  'brightness-110',
  'contrast-125',
  'rotate-[2deg]',
  '-translate-y-[3px]',
  'scale-[1.03]',
  'transform-gpu',
  'origin-top-left',
  'transition-[transform,opacity,box-shadow]',
  'duration-[375ms]',
  'ease-[cubic-bezier(.16,1,.3,1)]',
  'animate-wiggle',
  '[--card-gap:18px]',
  '[mask-image:linear-gradient(to_bottom,black,transparent)]',
  'selection:bg-brand/20',
  'marker:text-brand',
  'placeholder:text-brand/60',
  'first-letter:text-4xl',
  'before:absolute',
  'before:inset-0',
  'before:content-[attr(data-label)]',
  'after:block',
  'after:h-px',
  'after:bg-brand/25',
  'hover:bg-brand/80',
  'hover:[box-shadow:0_0_0_3px_var(--color-brand)]',
  'active:scale-95',
  'focus-visible:ring-4',
  'disabled:opacity-40',
  'aria-expanded:bg-accent',
  'data-[state=open]:grid',
  'data-[density=compact]:gap-2',
  'group-hover/card:translate-x-2',
  'peer-checked:opacity-100',
  'has-[img]:p-0',
  '[&>*]:min-w-0',
  '[&_svg]:size-4',
  '[&:nth-child(3)]:text-brand',
  'supports-[display:grid]:grid',
  '[@media_(min-width:37rem)]:grid-cols-3',
  'xs:grid-cols-2',
  'md:grid-cols-4',
  'dark:bg-zinc-950',
  'dark:hover:bg-zinc-900',
]

const PARITY_CSS = [
  '@import "tailwindcss" source(none);',
  '',
  '@theme {',
  '  --color-brand: #155dfc;',
  '  --color-accent: oklch(70% 0.17 162);',
  '  --color-zinc-900: #18181b;',
  '  --color-zinc-950: #09090b;',
  '  --spacing-card: 18px;',
  '  --breakpoint-xs: 30rem;',
  '  --animate-wiggle: wiggle 1s ease-in-out infinite;',
  '  @keyframes wiggle {',
  '    0%, 100% { transform: rotate(-3deg); }',
  '    50% { transform: rotate(3deg); }',
  '  }',
  '}',
  '',
  '@custom-variant dark (&:where(.dark, .dark *));',
  `@source inline("${PARITY_CANDIDATES.join(' ')}");`,
  '',
].join('\n')

const FILE_SCAN_CSS = [
  '@import "tailwindcss" source(none);',
  '@plugin "@iconify/tailwind4";',
  '',
  '@theme {',
  '  --color-brand: #155dfc;',
  '}',
  '',
  '@source "./**/*.{ts,tsx}";',
  '',
].join('\n')

const FILE_SCAN_SOURCE = [
  'export function Page() {',
  '  return (',
  '    <main className="sr-only flex text-brand icon-[mdi--home] icon-[logos--chrome]">',
  '      content',
  '    </main>',
  '  )',
  '}',
].join('\n')

function normalizeCss(css: string) {
  return css
    .replace(/\/\*![\s\S]*?\*\//g, '')
    .replace(/\/\*# sourceMappingURL=.*?\*\//g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function createViteResolver(root: string) {
  return (options: unknown) => async (id: string, importer?: string) => {
    if (id === 'tailwindcss' || id === 'tailwindcss/index.css') {
      return path.join(root, 'node_modules/tailwindcss/index.css')
    }
    if (id.startsWith('.')) {
      return path.resolve(importer ? path.dirname(importer) : root, id)
    }
    try {
      return require.resolve(id, {
        paths: [root],
      })
    }
    catch {
      return undefined
    }
  }
}

async function createFixtureRoot(name: string): Promise<WebParityFixture> {
  const root = await mkdtemp(path.join(tmpdir(), `weapp-tw-${name}-`))
  createdRoots.push(root)
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await symlink(tailwindcssV4Root, path.join(root, 'node_modules/tailwindcss'), 'dir')
  const cssEntry = path.join(root, 'src/app.css')
  await mkdir(path.dirname(cssEntry), { recursive: true })
  await writeFile(cssEntry, PARITY_CSS, 'utf8')
  return {
    root,
    cssEntry,
    css: PARITY_CSS,
  }
}

async function findPackageRoot(resolvedFile: string) {
  let dir = path.dirname(resolvedFile)
  while (dir !== path.dirname(dir)) {
    try {
      await access(path.join(dir, 'package.json'))
      return dir
    }
    catch {
      dir = path.dirname(dir)
    }
  }
  throw new Error(`Unable to find package root for ${resolvedFile}`)
}

async function linkFixturePackage(root: string, packageName: string) {
  const packageDir = await findPackageRoot(require.resolve(packageName, {
    paths: [websiteRoot],
  }))
  const target = path.join(root, 'node_modules', ...packageName.split('/'))
  await mkdir(path.dirname(target), { recursive: true })
  await symlink(packageDir, target, 'dir')
}

async function createFileScanFixtureRoot(): Promise<WebParityFixture> {
  const fixture = await createFixtureRoot('web-target-file-scan')
  await linkFixturePackage(fixture.root, '@iconify/tailwind4')
  await linkFixturePackage(fixture.root, '@iconify-json/mdi')
  await linkFixturePackage(fixture.root, '@iconify-json/logos')
  await writeFile(fixture.cssEntry, FILE_SCAN_CSS, 'utf8')
  await writeFile(path.join(fixture.root, 'src/page.tsx'), FILE_SCAN_SOURCE, 'utf8')
  return {
    ...fixture,
    css: FILE_SCAN_CSS,
  }
}

async function createWebsiteFixture(): Promise<WebParityFixture> {
  const cssEntry = path.join(websiteRoot, 'src/css/tailwind.css')
  return {
    root: websiteRoot,
    cssEntry,
    css: await readFile(cssEntry, 'utf8'),
  }
}

async function generateOfficialPostcssCss(cssEntry: string, css: string) {
  const result = await postcss([
    tailwindcssPostcss({
      optimize: false,
    }),
  ]).process(css, {
    from: cssEntry,
  })
  return result.css
}

async function generateOfficialViteCss(root: string, cssEntry: string, css: string) {
  const plugins = tailwindcssVite({
    optimize: false,
  })
  const scanPlugin = plugins.find(plugin => plugin.name === '@tailwindcss/vite:scan')
  const buildPlugin = plugins.find(plugin => plugin.name === '@tailwindcss/vite:generate:build')
  expect(scanPlugin, 'official tailwind vite scan plugin should exist').toBeTruthy()
  expect(buildPlugin, 'official tailwind vite build plugin should exist').toBeTruthy()
  const createResolver = createViteResolver(root)
  await (scanPlugin?.configResolved as any)?.call(scanPlugin, {
    build: {
      cssMinify: false,
      ssr: false,
    },
    command: 'build',
    css: {
      devSourcemap: false,
    },
    createResolver,
    resolve: {},
    root,
  })
  const transform = (buildPlugin?.transform as any)?.handler ?? buildPlugin?.transform
  const environment = {
    config: {
      createResolver,
      resolve: {},
    },
    name: 'client',
  }
  const result = await transform?.call({
    addWatchFile: vi.fn(),
    environment,
  }, css, cssEntry)
  expect(result?.code, 'official tailwind vite transform should emit css').toBeTruthy()
  return String(result.code)
}

async function generateCoreCss(root: string, css: string, cssEntry?: string) {
  const source = await resolveTailwindV4Source({
    base: cssEntry ? path.dirname(cssEntry) : root,
    css,
    packageName: 'tailwindcss',
    projectRoot: root,
  })
  const generator = createWeappTailwindcssGenerator(source)
  const result = await generator.generate({
    target: 'web',
  })
  return result.css
}

async function generateSharedGeneratorCss(root: string, cssEntry: string, css: string) {
  const runtimeState = {
    tailwindRuntime: {
      majorVersion: 4,
      getClassSet: vi.fn(async () => new Set<string>()),
      getClassSetSync: vi.fn(() => new Set<string>()),
      extract: vi.fn(async () => ({ classSet: new Set<string>() })),
      options: {
        projectRoot: root,
        tailwindcss: {
          cwd: root,
          packageName: 'tailwindcss',
          v4: {
            cssEntries: [cssEntry],
          },
        },
      },
    } as any,
    readyPromise: Promise.resolve(),
  }
  const result = await generateCssByGenerator({
    opts: {
      generator: {
        target: 'web',
      },
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      tailwindcssBasedir: root,
    } as any,
    runtimeState,
    runtime: new Set(),
    rawSource: css,
    file: cssEntry,
    cssHandlerOptions: {
      isMainChunk: true,
      majorVersion: 4,
      postcssOptions: {
        options: {
          from: cssEntry,
        },
      },
      sourceOptions: {
        sourceFile: cssEntry,
      },
    } as any,
    cssUserHandlerOptions: {
      isMainChunk: false,
      majorVersion: 4,
      postcssOptions: {
        options: {
          from: cssEntry,
        },
      },
    } as any,
    debug: vi.fn(),
    styleHandler: vi.fn(async (code: string) => ({ css: code })),
  })
  expect(result?.css, 'shared generator should emit css').toBeTruthy()
  return result!.css
}

function getGenerateBundleHandler(plugin: { generateBundle?: unknown }) {
  const hook = plugin.generateBundle as any
  return typeof hook === 'object' ? hook.handler : hook
}

async function generateVitePluginCss(root: string, cssEntry: string, css: string) {
  resetVitePluginTestContext()
  setCurrentContext(createContext({
    appType: undefined,
    cssEntries: [cssEntry],
    generator: {
      target: 'web',
    },
    mainCssChunkMatcher: vi.fn(() => true),
    tailwindcssBasedir: root,
    tailwindRuntime: {
      majorVersion: 4,
      getClassSet: vi.fn(async () => new Set<string>()),
      getClassSetSync: vi.fn(() => new Set<string>()),
      extract: vi.fn(async () => ({ classSet: new Set<string>() })),
      options: {
        projectRoot: root,
        tailwindcss: {
          cwd: root,
          packageName: 'tailwindcss',
          v4: {
            cssEntries: [cssEntry],
          },
        },
      },
    },
  }))
  const plugins = createVitePlugins({
    cssEntries: [cssEntry],
    generator: {
      target: 'web',
    },
    tailwindcssBasedir: root,
  })
  const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post')
  expect(postPlugin, 'weapp vite post plugin should exist').toBeTruthy()
  await (postPlugin?.configResolved as any)?.call(postPlugin, {
    build: {
      outDir: 'dist',
    },
    command: 'build',
    css: {
      postcss: {
        plugins: [],
      },
    },
    plugins: [],
    root,
  })
  const bundle = {
    'assets/app.css': {
      ...createRollupAsset(css),
      fileName: 'assets/app.css',
      originalFileName: cssEntry,
    } as OutputAsset,
    'assets/main.js': {
      ...createRollupChunk('import "./app.css";'),
      fileName: 'assets/main.js',
    } as OutputChunk,
  }
  const generateBundle = getGenerateBundleHandler(postPlugin!)
  await generateBundle?.call({
    addWatchFile: vi.fn(),
    emitFile: vi.fn((asset: { fileName?: string, name?: string, source?: string }) => {
      const fileName = asset.fileName ?? asset.name
      if (fileName) {
        bundle[fileName] = {
          ...createRollupAsset(String(asset.source ?? '')),
          fileName,
        } as OutputAsset
      }
    }),
    getModuleInfo: vi.fn(),
  }, {}, bundle)
  return String((bundle['assets/app.css'] as OutputAsset).source)
}

function runGulpTransform(transform: Transform, file: Vinyl) {
  return new Promise<string>((resolve, reject) => {
    transform.once('data', (result: Vinyl) => {
      resolve(result.contents?.toString('utf8') ?? '')
    })
    transform.once('error', reject)
    transform.write(file)
    transform.end()
  })
}

async function generateGulpCss(root: string, cssEntry: string, css: string) {
  const plugins = createGulpPlugins({
    cssEntries: [cssEntry],
    generator: {
      target: 'web',
    },
    mainCssChunkMatcher: () => true,
    tailwindcssBasedir: root,
  })
  return await runGulpTransform(plugins.transformWxss(), new Vinyl({
    cwd: root,
    base: path.dirname(cssEntry),
    path: cssEntry,
    contents: Buffer.from(css),
  }))
}

async function generateWebpackPluginCss(root: string, cssEntry: string, css: string) {
  vi.resetModules()
  const { WeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
  webpackTestState.currentContext = createWebpackContext({
    cssEntries: [cssEntry],
    cssMatcher: (file: string) => file.endsWith('.css'),
    generator: {
      target: 'web',
    },
    mainCssChunkMatcher: vi.fn(() => true),
    styleHandler: vi.fn(async () => {
      throw new Error('web target should generate css without mini-program styleHandler')
    }),
    tailwindcssBasedir: root,
    tailwindRuntime: {
      majorVersion: 4,
      getClassSet: vi.fn(async () => new Set<string>()),
      getClassSetSync: vi.fn(() => new Set<string>()),
      extract: vi.fn(async () => ({ classSet: new Set<string>() })),
      options: {
        projectRoot: root,
        tailwindcss: {
          cwd: root,
          packageName: 'tailwindcss',
          v4: {
            cssEntries: [cssEntry],
          },
        },
      },
    },
  } as any)
  getWebpackCompilerContextMock.mockClear()

  const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
  let loaderHandler: ((loaderContext: any, module: { loaders: Array<{ loader: string, options?: Record<string, any> }>, resource?: string }) => void) | undefined
  let assetStore: Record<string, string> = {
    'assets/app.css': css,
  }
  const compilation = {
    compiler: {
      outputPath: webpackPath.join(root, 'dist'),
    },
    chunks: [{
      files: ['assets/app.css'],
      hash: 'hash-web-parity',
      id: 'main',
    }],
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
    options: {},
    outputPath: webpackPath.join(root, 'dist'),
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
            tap: (_name: string, handler: typeof loaderHandler) => {
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
      thisCompilation: {
        tap: vi.fn((_name: string, handler: (_compilation: any) => void) => {
          handler(compilation)
        }),
      },
      watchRun: {
        tap: vi.fn(),
      },
    },
  }

  new WeappTailwindcss().apply(compiler as any)
  const sourceCssModule = {
    loaders: [{ loader: '/path/postcss-loader.js' }],
    resource: cssEntry,
  }
  loaderHandler?.({}, sourceCssModule)
  const classSetLoaderEntry = sourceCssModule.loaders.find(entry => entry.loader === webpackTestState.currentContext.runtimeLoaderPath)
  const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
  loaderRuntime?.classSet?.registerCssSourceFile?.({
    css,
    file: cssEntry,
  })

  await processAssetsCallbacks[0](createAssetsFromStore(assetStore))
  return assetStore['assets/app.css']
}

afterEach(async () => {
  resetVitePluginTestContext()
  await Promise.all(createdRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('web target official tailwind parity', () => {
  async function expectWebParity(fixture: WebParityFixture, viteCandidates = ['.flex', '.bg-brand', '@layer']) {
    const officialPostcss = await generateOfficialPostcssCss(fixture.cssEntry, fixture.css)
    const officialVite = await generateOfficialViteCss(fixture.root, fixture.cssEntry, fixture.css)
    const expected = normalizeCss(officialPostcss)

    expect(normalizeCss(officialVite)).toBe(expected)

    const strictOutputs = {
      core: await generateCoreCss(fixture.root, fixture.css, fixture.cssEntry),
      gulp: await generateGulpCss(fixture.root, fixture.cssEntry, fixture.css),
      webpack: await generateWebpackPluginCss(fixture.root, fixture.cssEntry, fixture.css),
    }
    const viteCss = await generateVitePluginCss(fixture.root, fixture.cssEntry, fixture.css)

    for (const [name, css] of Object.entries(strictOutputs)) {
      expect(normalizeCss(css), `${name} web output should match official Tailwind CSS`).toBe(expected)
      expect(css, `${name} web output should keep Tailwind web layers`).toContain('@layer')
      expect(css, `${name} web output should never include mini-program specificity fallback`).not.toContain(':not(#\\#)')
    }
    for (const candidate of viteCandidates) {
      expect(viteCss, `vite web output should include ${candidate}`).toContain(candidate)
    }
    expect(viteCss, 'vite web output should never include mini-program specificity fallback').not.toContain(':not(#\\#)')
  }

  it('keeps every weapp-tailwindcss web generation path identical to official Tailwind CSS output', async () => {
    await expectWebParity(await createFixtureRoot('web-target-official-parity'))
  }, TEST_TIMEOUT)

  it('keeps the real website Tailwind CSS web output identical to @tailwindcss/postcss', async () => {
    const fixture = await createWebsiteFixture()
    const officialPostcss = await generateOfficialPostcssCss(fixture.cssEntry, fixture.css)
    const outputs = {
      core: await generateCoreCss(fixture.root, fixture.css, fixture.cssEntry),
      shared: await generateSharedGeneratorCss(fixture.root, fixture.cssEntry, fixture.css),
      webpack: await generateWebpackPluginCss(fixture.root, fixture.cssEntry, fixture.css),
    }

    for (const [name, css] of Object.entries(outputs)) {
      expect(css, `${name} website web output should match @tailwindcss/postcss byte-for-byte`).toBe(officialPostcss)
      expect(css).toContain('.sr-only')
      expect(css).toContain('.icon-\\[logos--html-5\\]')
      expect(css).toContain('.icon-\\[bi--android2\\]')
      expect(css).toContain('.icon-\\[logos--react\\]')
      expect(css).not.toContain('.icon-\\[logos--android-icon\\]')
      expect(css).not.toContain('.icon-\\[mdi--wechat\\]')
      expect(css).not.toContain('.icon-\\[mdi--android\\]')
      expect(css).not.toContain('.icon-\\[mdi--cellphone-link\\]')
      expect(css).toContain('--svg')
      expect(css).not.toContain(':not(#\\#)')
    }
  }, TEST_TIMEOUT)

  it('keeps filesystem @source scanning identical to official Tailwind CSS output for static utilities and dynamic icon plugins', async () => {
    const fixture = await createFileScanFixtureRoot()
    await expectWebParity(fixture, ['.flex', '.text-brand', '@layer'])

    const css = await generateCoreCss(fixture.root, fixture.css, fixture.cssEntry)
    expect(css).toContain('.sr-only')
    expect(css).toContain('.icon-\\[mdi--home\\]')
    expect(css).toContain('.icon-\\[logos--chrome\\]')
    expect(css).toContain('--svg')
    expect(css).toMatch(/mask|background/)
  }, TEST_TIMEOUT)
})
