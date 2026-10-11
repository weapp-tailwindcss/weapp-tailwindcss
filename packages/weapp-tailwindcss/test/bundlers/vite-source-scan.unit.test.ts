import type { TailwindcssRuntimeLike } from '@/types'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach } from 'vitest'
import { describe, expect, it, vi } from 'vitest'

const createdDirs: string[] = []

async function createTempDir(prefix: string) {
  const dir = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(dir, { recursive: true })
  createdDirs.push(dir)
  return dir
}

describe('bundlers/vite source scan', () => {
  afterEach(async () => {
    vi.resetModules()
    vi.restoreAllMocks()
    await Promise.all(
      createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    )
  })

  it('matches absolute source entry patterns against Vite transformed file ids', async () => {
    const { createViteSourceScanMatcher } = await import('@/bundlers/vite/source-scan')
    const matcher = createViteSourceScanMatcher([{
      base: '/project',
      negated: false,
      pattern: '/project/src/**/*.{js,html,wxml}',
    }])

    expect(matcher?.('/project/src/index.js')).toBe(true)
    expect(matcher?.('/project/src/index.html')).toBe(true)
    expect(matcher?.('/project/other/index.js')).toBe(false)

    const explicitEmptyMatcher = createViteSourceScanMatcher([])
    expect(explicitEmptyMatcher?.('/project/src/index.js')).toBe(false)
  })

  it('resolves Tailwind v4 source candidates from cssSources before fallback source resolution', async () => {
    const fallbackResolve = vi.fn(async () => {
      throw new Error('cssSources should avoid full Tailwind v4 source fallback')
    })
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: '/project',
          base: '/project',
          baseFallbacks: [],
          cssSources: [{
            file: '/project/src/app.css',
            base: '/project/src',
            css: [
              '@import "tailwindcss" source(none);',
              '@source "./pages/**/*.{vue,ts}";',
              '@source inline("text-[45rpx]");',
            ].join('\n'),
          }],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike)

    expect(fallbackResolve).not.toHaveBeenCalled()
    expect(resolved?.entries).toEqual([
      {
        base: '/project/src/pages',
        pattern: '**/*.{vue,ts}',
        negated: false,
      },
    ])
    expect(resolved?.dependencies).toEqual(['/project/src/app.css'])
    expect(resolved?.inlineCandidates?.included).toEqual(new Set(['text-[45rpx]']))
  })

  it('skips cssSources without @source entries instead of falling back to workspace scans', async () => {
    const fallbackResolve = vi.fn(async () => {
      throw new Error('plain cssSources should not fall back to full Tailwind v4 source resolution')
    })
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: '/project',
          base: '/project',
          baseFallbacks: [],
          cssSources: [{
            file: '/project/src/theme.css',
            base: '/project/src',
            css: '@theme { --color-brand: #123456; }',
          }],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike)

    expect(resolved).toBeUndefined()
    expect(fallbackResolve).not.toHaveBeenCalled()
  })

  it('keeps explicit Tailwind v4 cssSources with only negated sources from expanding to workspace scans', async () => {
    const fallbackResolve = vi.fn(async () => {
      throw new Error('explicit source(none) with only @source not should not fall back to full Tailwind v4 source resolution')
    })
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: '/project',
          base: '/project',
          baseFallbacks: [],
          cssSources: [{
            file: '/project/src/app.css',
            base: '/project/src',
            css: [
              '@import "tailwindcss" source(none);',
              '@source not "./generated/**";',
            ].join('\n'),
          }],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike)

    expect(fallbackResolve).not.toHaveBeenCalled()
    expect(resolved?.explicit).toBe(true)
    expect(resolved?.entries).toEqual([])
    expect(resolved?.dependencies).toEqual(['/project/src/app.css'])
  })

  it('resolves Tailwind v4 cssSources @config relative to their source file directory', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan-css-source-config')
    const cssEntry = path.join(tempDir, 'src/sub-normal/pages/index.css')
    const configEntry = path.join(tempDir, 'tailwind.config.sub-normal.js')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(configEntry, [
      'module.exports = {',
      '  content: ["./src/sub-normal/**/*.{wxml,ts}"],',
      '}',
    ].join('\n'))

    const loadConfig = vi.fn(async ({ config }: { config: string }) => ({
      config: {
        content: config === configEntry ? ['./src/sub-normal/**/*.{wxml,ts}'] : [],
      },
    }))
    const fallbackResolve = vi.fn(async () => {
      throw new Error('cssSources should avoid full Tailwind v4 source fallback')
    })
    vi.doMock('tailwindcss-config', () => ({
      loadConfig,
    }))
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          cssSources: [{
            file: cssEntry,
            css: [
              '@import "tailwindcss" source(none);',
              '@config "../../../tailwind.config.sub-normal.js";',
            ].join('\n'),
          }],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike)

    expect(fallbackResolve).not.toHaveBeenCalled()
    expect(loadConfig).not.toHaveBeenCalled()
    expect(resolved?.dependencies).toEqual([configEntry, cssEntry].sort())
    expect(resolved?.entries).toEqual([
      {
        base: tempDir,
        pattern: 'src/sub-normal/**/*.{wxml,ts}',
        negated: false,
      },
    ])
  })

  it('discovers Tailwind v4 css roots from the Vite root and ignores output files', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan')
    const cssEntry = path.join(tempDir, 'app.css')
    const ignoredPreprocessorEntry = path.join(tempDir, 'ignored.scss')
    const distCssEntry = path.join(tempDir, 'dist/app.wxss')
    await mkdir(path.join(tempDir, 'dist'), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@source "./pages/**/*.{vue,ts}";',
      '@source inline("text-[45rpx]");',
    ].join('\n'))
    await writeFile(ignoredPreprocessorEntry, [
      '@import "tailwindcss" source(none);',
      '@source "./ignored/**/*.{vue,ts}";',
    ].join('\n'))
    await writeFile(distCssEntry, [
      '@import "tailwindcss" source(none);',
      '@source "./dist-only/**/*.{vue,ts}";',
    ].join('\n'))

    const fallbackResolve = vi.fn(async () => {
      throw new Error('auto-discovered css roots should avoid full Tailwind v4 source fallback')
    })
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { discoverTailwindV4CssEntries, resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })
    const discovered = await discoverTailwindV4CssEntries(tempDir, 'dist')

    expect(fallbackResolve).not.toHaveBeenCalled()
    expect(discovered).toEqual([cssEntry])
    expect(resolved?.explicit).toBe(true)
    expect(resolved?.entries).toEqual([
      {
        base: path.join(tempDir, 'pages'),
        pattern: '**/*.{vue,ts}',
        negated: false,
      },
    ])
    expect(resolved?.inlineCandidates?.included).toEqual(new Set(['text-[45rpx]']))
  })

  it('keeps bare Tailwind v4 imports aligned with official plugin root scanning', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan-default-root')
    const srcDir = path.join(tempDir, 'src')
    await mkdir(srcDir, { recursive: true })
    await writeFile(path.join(srcDir, 'main.css'), '@import "tailwindcss";')

    const fallbackResolve = vi.fn(async () => {
      throw new Error('auto-discovered css root should define the default source scan')
    })
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })

    expect(fallbackResolve).not.toHaveBeenCalled()
    expect(resolved?.explicit).toBe(false)
    expect(resolved?.entries).toBeUndefined()
    expect(resolved?.dependencies).toEqual([path.join(srcDir, 'main.css')])
  })

  it('keeps default root scanning when Tailwind v4 css only excludes sources', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan-negated-default')
    const srcDir = path.join(tempDir, 'src')
    await mkdir(srcDir, { recursive: true })
    await mkdir(path.join(tempDir, 'dist'), { recursive: true })
    await mkdir(path.join(srcDir, 'uni_modules'), { recursive: true })
    await writeFile(path.join(srcDir, 'main.css'), [
      '@import "tailwindcss";',
      '@source not "../dist";',
      '@source not "../src/uni_modules";',
    ].join('\n'))

    const fallbackResolve = vi.fn(async () => {
      throw new Error('auto-discovered css root should define the default source scan')
    })
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })

    expect(fallbackResolve).not.toHaveBeenCalled()
    expect(resolved?.explicit).toBe(false)
    expect(resolved?.entries).toEqual([
      {
        base: path.join(tempDir, 'dist'),
        pattern: '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,vue,uvue,nvue,svelte,mpx,html,wxml,axml,jxml,ksml,ttml,qml,qxml,tyml,xhsml,swan,css,wxss,acss,jxss,ttss,qss,tyss,scss,sass,less,styl,stylus}',
        negated: true,
      },
      {
        base: path.join(srcDir, 'uni_modules'),
        pattern: '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,vue,uvue,nvue,svelte,mpx,html,wxml,axml,jxml,ksml,ttml,qml,qxml,tyml,xhsml,swan,css,wxss,acss,jxss,ttss,qss,tyss,scss,sass,less,styl,stylus}',
        negated: true,
      },
    ])
    expect(resolved?.dependencies).toEqual([path.join(srcDir, 'main.css')])
  })

  it('reads static Tailwind config content without executing the config loader', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan')
    const cssEntry = path.join(tempDir, 'app.css')
    const configEntry = path.join(tempDir, 'tailwind.config.js')
    await writeFile(cssEntry, [
      '@import "tailwindcss";',
      '@config "./tailwind.config.js";',
    ].join('\n'))
    await writeFile(configEntry, [
      'export default {',
      '  content: ["./pages/**/*.{vue,ts}"],',
      '}',
    ].join('\n'))

    const loadConfig = vi.fn(async () => ({
      config: {
        content: ['./pages/**/*.{vue,ts}'],
      },
    }))
    vi.doMock('tailwindcss-config', () => ({
      loadConfig,
    }))
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => {
          throw new Error('css entry should be discovered')
        }),
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })
    await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })

    expect(loadConfig).not.toHaveBeenCalled()
    expect(resolved?.dependencies).toEqual([configEntry, cssEntry].sort())
  })

  it('caches Tailwind v4 css source entries while css and config dependencies are unchanged', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan')
    const cssEntry = path.join(tempDir, 'app.css')
    const configEntry = path.join(tempDir, 'tailwind.config.js')
    await writeFile(cssEntry, [
      '@import "tailwindcss";',
      '@config "./tailwind.config.js";',
    ].join('\n'))
    await writeFile(configEntry, [
      'const ext = "vue,ts"',
      'export default {',
      '  content: [`./pages/**/*.{${ext}}`],',
      '}',
    ].join('\n'))

    const loadConfig = vi.fn(async () => ({
      config: {
        content: ['./pages/**/*.{vue,ts}'],
      },
    }))
    vi.doMock('tailwindcss-config', () => ({
      loadConfig,
    }))
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => {
          throw new Error('css entry should be discovered')
        }),
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })
    await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })

    expect(loadConfig).toHaveBeenCalledTimes(1)
  })

  it('resolves Tailwind v4 @config relative to the current css entry directory', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan-css-config')
    const cssEntry = path.join(tempDir, 'sub-normal/pages/index.css')
    const configEntry = path.join(tempDir, 'sub-normal/tailwind.config.sub-normal.js')
    const parentConfigEntry = path.join(tempDir, 'tailwind.config.sub-normal.js')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await mkdir(path.dirname(configEntry), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@config "../tailwind.config.sub-normal.js";',
    ].join('\n'))
    await writeFile(configEntry, [
      'module.exports = {',
      '  content: ["./**/*.{wxml,ts}"],',
      '}',
    ].join('\n'))
    await writeFile(parentConfigEntry, [
      'module.exports = {',
      '  content: ["./should-not-match/**/*.{wxml,ts}"],',
      '}',
    ].join('\n'))

    const loadConfig = vi.fn(async ({ config }: { config: string }) => ({
      config: {
        content: config === configEntry ? ['./**/*.{wxml,ts}'] : [],
      },
    }))
    vi.doMock('tailwindcss-config', () => ({
      loadConfig,
    }))

    const { resolveTailwindV4EntriesFromCss } = await import('@/bundlers/vite/source-scan')
    const unresolved = await resolveTailwindV4EntriesFromCss(
      [
        '@import "tailwindcss" source(none);',
        '@config "./tailwind.config.sub-normal.js";',
      ].join('\n'),
      path.dirname(cssEntry),
    )
    const resolved = await resolveTailwindV4EntriesFromCss(
      [
        '@import "tailwindcss" source(none);',
        '@config "../tailwind.config.sub-normal.js";',
      ].join('\n'),
      path.dirname(cssEntry),
    )

    expect(loadConfig).toHaveBeenCalledTimes(1)
    expect(loadConfig).toHaveBeenCalledWith({
      config: path.join(path.dirname(cssEntry), 'tailwind.config.sub-normal.js'),
      cwd: path.dirname(cssEntry),
    })
    expect(unresolved?.entries).toEqual([])
    expect(resolved?.entries).toEqual([
      {
        base: path.dirname(configEntry),
        pattern: '**/*.{wxml,ts}',
        negated: false,
      },
    ])
  })

  it('discovers uni-app vite Tailwind v4 css entries with main and subpackage configs', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan-uni')
    const srcDir = path.join(tempDir, 'src')
    await mkdir(path.join(srcDir, 'sub-normal/pages'), { recursive: true })
    await mkdir(path.join(srcDir, 'pages-order'), { recursive: true })
    await writeFile(path.join(srcDir, 'main.css'), [
      '@import "tailwindcss" source(none);',
      '@config "./tailwind.config.js";',
      '@source "../src/**/*.{vue,js,ts,jsx,tsx,html}";',
    ].join('\n'))
    await writeFile(path.join(srcDir, 'pages-order/index.css'), [
      '@import "tailwindcss" source(none);',
      '@config "./tailwind.config.order.js";',
      '@source "./**/*.{vue,js,ts,jsx,tsx,html}";',
    ].join('\n'))
    await writeFile(path.join(srcDir, 'sub-normal/pages/index.css'), [
      '@import "tailwindcss" source(none);',
      '@config "../../tailwind.config.sub-normal.js";',
    ].join('\n'))
    await writeFile(path.join(srcDir, 'tailwind.config.js'), 'module.exports = { content: [] }')
    await writeFile(path.join(srcDir, 'tailwind.config.order.js'), 'module.exports = { content: [] }')
    await writeFile(path.join(srcDir, 'tailwind.config.sub-normal.js'), [
      'module.exports = {',
      '  content: ["./sub-normal/**/*.{wxml,html,js,ts,jsx,tsx,vue,mpx}"],',
      '}',
    ].join('\n'))

    const fallbackResolve = vi.fn(async () => {
      throw new Error('auto-discovered uni-app css roots should avoid full Tailwind v4 source fallback')
    })
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { discoverTailwindV4CssEntries, resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const discovered = await discoverTailwindV4CssEntries(tempDir, 'dist/dev/mp-weixin')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist/dev/mp-weixin',
    })

    expect(discovered.map(file => path.relative(tempDir, file)).sort()).toEqual([
      'src/main.css',
      'src/pages-order/index.css',
      'src/sub-normal/pages/index.css',
    ])
    expect(fallbackResolve).not.toHaveBeenCalled()
    expect(resolved?.entries).toContainEqual({
      base: srcDir,
      pattern: '**/*.{vue,js,ts,jsx,tsx,html}',
      negated: false,
    })
    expect(resolved?.entries).toContainEqual({
      base: path.join(srcDir, 'pages-order'),
      pattern: '**/*.{vue,js,ts,jsx,tsx,html}',
      negated: false,
    })
    expect(resolved?.entries).toContainEqual({
      base: srcDir,
      pattern: 'sub-normal/**/*.{wxml,html,js,ts,jsx,tsx,vue,mpx}',
      negated: false,
    })
  })

  it('does not let one Tailwind v4 css entry exclude another entry source during Vite source scanning', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan-sibling-not')
    const srcDir = path.join(tempDir, 'src')
    await mkdir(path.join(srcDir, 'sub-normal/pages'), { recursive: true })
    await writeFile(path.join(srcDir, 'app.css'), [
      '@import "tailwindcss" source(none);',
      '@source "../src/**/*.{ts,tsx,jsx,js,html}";',
      '@source not "../src/sub-normal/**/*";',
    ].join('\n'))
    await writeFile(path.join(srcDir, 'sub-normal/pages/index.css'), [
      '@import "tailwindcss" source(none);',
      '@source "../**/*.{css,ts,tsx,jsx,js,html}";',
    ].join('\n'))

    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => {
          throw new Error('auto-discovered css roots should avoid full Tailwind v4 source fallback')
        }),
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })

    expect(resolved?.explicit).toBe(true)
    expect(resolved?.entries).toContainEqual({
      base: srcDir,
      pattern: '**/*.{ts,tsx,jsx,js,html}',
      negated: false,
    })
    expect(resolved?.entries).toContainEqual({
      base: path.join(srcDir, 'sub-normal'),
      pattern: '**/*.{css,ts,tsx,jsx,js,html}',
      negated: false,
    })
    expect(resolved?.entries).not.toContainEqual({
      base: path.join(srcDir, 'sub-normal'),
      pattern: '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,vue,uvue,nvue,svelte,mpx,html,wxml,axml,jxml,ksml,ttml,qml,qxml,tyml,xhsml,swan,css,wxss,acss,jxss,ttss,qss,tyss,scss,sass,less,styl,stylus}',
      negated: true,
    })
  })

  it('does not let one configured Tailwind v4 cssSource exclude another cssSource during Vite source scanning', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan-sibling-css-source-not')
    const srcDir = path.join(tempDir, 'src')
    const appCss = [
      '@import "tailwindcss" source(none);',
      '@source "../src/**/*.{ts,tsx,jsx,js,html}";',
      '@source not "../src/sub-normal/**/*";',
    ].join('\n')
    const subCss = [
      '@import "tailwindcss" source(none);',
      '@source "../**/*.{css,ts,tsx,jsx,js,html}";',
    ].join('\n')

    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          packageName: 'tailwindcss',
          cssSources: [
            {
              file: path.join(srcDir, 'app.css'),
              base: srcDir,
              css: appCss,
            },
            {
              file: path.join(srcDir, 'sub-normal/pages/index.css'),
              base: path.join(srcDir, 'sub-normal/pages'),
              css: subCss,
            },
          ],
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => {
          throw new Error('configured cssSources should avoid full Tailwind v4 source fallback')
        }),
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })

    expect(resolved?.explicit).toBe(true)
    expect(resolved?.entries).toContainEqual({
      base: srcDir,
      pattern: '**/*.{ts,tsx,jsx,js,html}',
      negated: false,
    })
    expect(resolved?.entries).toContainEqual({
      base: path.join(srcDir, 'sub-normal'),
      pattern: '**/*.{css,ts,tsx,jsx,js,html}',
      negated: false,
    })
    expect(resolved?.entries?.some(entry => entry.negated)).toBe(false)
  })

  it('keeps broad Tailwind v4 fallback when the Vite root differs from the runtime project root', async () => {
    const tempDir = await createTempDir('weapp-tw-vite-source-scan')
    await writeFile(path.join(tempDir, 'app.css'), [
      '@import "tailwindcss" source(none);',
      '@source "./pages/**/*.{vue,ts}";',
    ].join('\n'))

    const fallbackResolve = vi.fn(async () => ({
      projectRoot: '/outside-project',
      base: '/outside-project',
      baseFallbacks: [],
      css: '@import "tailwindcss" source(none);\n@source "./fallback/**/*.{vue,ts}";',
      dependencies: [],
    }))
    vi.doMock('@/tailwindcss/v4-engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: '/outside-project',
          base: '/outside-project',
          baseFallbacks: [],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: fallbackResolve,
      }
    })

    const { resolveViteSourceScanEntries } = await import('@/bundlers/vite/source-scan')
    const resolved = await resolveViteSourceScanEntries({}, {
      majorVersion: 4,
    } as TailwindcssRuntimeLike, {
      root: tempDir,
      outDir: 'dist',
    })

    expect(fallbackResolve).toHaveBeenCalledTimes(1)
    expect(resolved?.entries).toEqual([
      {
        base: '/outside-project/fallback',
        pattern: '**/*.{vue,ts}',
        negated: false,
      },
    ])
  })
})
