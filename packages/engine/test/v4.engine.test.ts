import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTailwindV4Engine,
  resolveTailwindV4Source,
} from '@/v4'

const require = createRequire(import.meta.url)
const packageRoot = path.resolve(__dirname, '..')
const tailwindNodeBase = path.dirname(require.resolve('@tailwindcss/node'))
const tempDirs: string[] = []

async function createTempDir() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-engine-v4-engine-'))
  tempDirs.push(tempDir)
  return tempDir
}

async function createDefaultSource(css = '@import "tailwindcss";') {
  return resolveTailwindV4Source({
    projectRoot: packageRoot,
    base: tailwindNodeBase,
    css,
  })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(tempDir => fs.rm(tempDir, { recursive: true, force: true })))
})

describe('Tailwind v4 engine', () => {
  it('释放旧引擎包装持有的生成与校验会话', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    await engine.generate({ candidates: ['flex'] })
    expect(engine.dispose).toBeTypeOf('function')
    engine.dispose?.()
    engine.dispose?.()
    await expect(engine.generate({ candidates: ['grid'] })).rejects.toThrow('disposed')
    await expect(engine.validateCandidates(['flex'])).rejects.toThrow('disposed')
  })

  it('generates CSS from inline css and explicit candidates', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      candidates: ['text-red-500'],
    })

    expect(result.classSet).toContain('text-red-500')
    expect(result.css).toContain('.text-red-500')
  })

  it('exposes the loaded design system through the engine API', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const designSystem = await engine.loadDesignSystem()

    expect(designSystem.parseCandidate('text-red-500').length).toBeGreaterThan(0)
  })

  it('does not include invalid candidates in classSet', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      candidates: ['text-red-500', 'definitely-not-a-tailwind-class'],
    })

    expect(result.classSet).toContain('text-red-500')
    expect(result.classSet).not.toContain('definitely-not-a-tailwind-class')
    expect(result.css).not.toContain('definitely-not-a-tailwind-class')
  })

  it('generates arbitrary value utilities', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      candidates: ['w-[100px]'],
    })

    expect(result.classSet).toContain('w-[100px]')
    expect(result.css).toContain('width: 100px')
  })

  it('keeps UnoCSS-style bare arbitrary values disabled by default', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      candidates: ['p-10%', 'p-2.5px', 'm-4rem'],
    })

    expect(result.rawCandidates).toContain('p-10%')
    expect(result.classSet).not.toContain('p-10%')
    expect(result.css).not.toContain('.p-10\\%')
  })

  it('generates CSS for UnoCSS-style bare arbitrary values when enabled', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      bareArbitraryValues: true,
      candidates: ['p-10%', 'p-2.5px', 'm-4rem'],
    })

    expect(result.classSet).toEqual(new Set(['p-10%', 'p-2.5px', 'm-4rem']))
    expect(result.css).toContain('.p-10\\%')
    expect(result.css).toContain('padding: 10%')
    expect(result.css).toContain('.p-2\\.5px')
    expect(result.css).toContain('padding: 2.5px')
    expect(result.css).toContain('.m-4rem')
    expect(result.css).toContain('margin: 4rem')
    expect(result.css).not.toContain('.p-\\[10\\%\\]')
    expect(result.css).not.toContain('.p-\\[2\\.5px\\]')
  })

  it('supports broader bare arbitrary value forms when enabled', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      bareArbitraryValues: true,
      candidates: [
        'bg-#fff',
        'bg-\\#000',
        'text-rgb(255,0,0)',
        'grid-cols-repeat(2,_minmax(0,_1fr))',
        'w-calc(100%_-_1rem)',
        'w-calc(100vh)',
        'sm:-top-1.5rem',
      ],
    })

    expect(result.classSet).toEqual(new Set([
      'bg-#fff',
      'bg-\\#000',
      'text-rgb(255,0,0)',
      'grid-cols-repeat(2,_minmax(0,_1fr))',
      'w-calc(100%_-_1rem)',
      'w-calc(100vh)',
      'sm:-top-1.5rem',
    ]))
    expect(result.css).toContain('.bg-\\#fff')
    expect(result.css).toContain('background-color: #fff')
    expect(result.css).toContain('.bg-\\\\\\#000')
    expect(result.css).toContain('background-color: #000')
    expect(result.css).toContain('.text-rgb\\(255\\,0\\,0\\)')
    expect(result.css).toContain('color: rgb(255,0,0)')
    expect(result.css).toContain('.grid-cols-repeat\\(2\\,_minmax\\(0\\,_1fr\\)\\)')
    expect(result.css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(result.css).toContain('.w-calc\\(100\\%_-_1rem\\)')
    expect(result.css).toContain('width: calc(100% - 1rem)')
    expect(result.css).toContain('.w-calc\\(100vh\\)')
    expect(result.css).toContain('width: calc(100vh)')
    expect(result.css).toContain('.sm\\:-top-1\\.5rem')
    expect(result.css).toContain('top: calc(1.5rem * -1)')
  })

  it('extracts UnoCSS-style bare arbitrary values from inline sources when enabled', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      bareArbitraryValues: true,
      sources: [{
        extension: 'html',
        content: '<view class="text-var(--brand) w-calc(100%-1rem) bg-#fff text-rgb(255,0,0)"></view>',
      }],
    })

    expect([...result.rawCandidates]).toEqual(expect.arrayContaining([
      'text-var(--brand)',
      'w-calc(100%-1rem)',
      'bg-#fff',
      'text-rgb(255,0,0)',
    ]))
    expect(result.classSet).toEqual(new Set([
      'text-var(--brand)',
      'w-calc(100%-1rem)',
      'bg-#fff',
      'text-rgb(255,0,0)',
    ]))
    expect(result.css).toContain('.text-var\\(--brand\\)')
    expect(result.css).toContain('color: var(--brand)')
    expect(result.css).toContain('.w-calc\\(100\\%-1rem\\)')
    expect(result.css).toContain('width: calc(100% - 1rem)')
    expect(result.css).toContain('.bg-\\#fff')
    expect(result.css).toContain('.text-rgb\\(255\\,0\\,0\\)')
  })

  it('extracts UnoCSS-style bare arbitrary values from scanned files when enabled', async () => {
    const tempDir = await createTempDir()
    await fs.writeFile(
      path.join(tempDir, 'page.html'),
      '<view class="text-var(--brand) w-calc(100%-1rem) bg-#fff"></view>',
      'utf8',
    )
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      bareArbitraryValues: true,
      scanSources: [{
        base: tempDir,
        pattern: '*.html',
        negated: false,
      }],
    })

    expect(result.classSet).toEqual(new Set([
      'text-var(--brand)',
      'w-calc(100%-1rem)',
      'bg-#fff',
    ]))
    expect(result.css).toContain('color: var(--brand)')
    expect(result.css).toContain('width: calc(100% - 1rem)')
    expect(result.css).toContain('background-color: #fff')
  })

  it('preserves escaped underscores in bare arbitrary values', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      bareArbitraryValues: true,
      candidates: [
        'content-"hello_world"',
        'content-"hello\\_world"',
        'content-"hello\\5f world"',
      ],
    })

    expect(result.classSet).toEqual(new Set([
      'content-"hello_world"',
      'content-"hello\\_world"',
      'content-"hello\\5f world"',
    ]))
    expect(result.css).toContain('.content-\\"hello_world\\"')
    expect(result.css).toContain('--tw-content: "hello world"')
    expect(result.css).toContain('.content-\\"hello\\\\_world\\"')
    expect(result.css).toContain('--tw-content: "hello_world"')
    expect(result.css).toContain('.content-\\"hello\\\\5f\\ world\\"')
  })

  it('includes @source inline candidates in classSet', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource([
      '@import "tailwindcss";',
      '@source inline("w-4");',
    ].join('\n')))
    const result = await engine.generate()

    expect(result.rawCandidates).toContain('w-4')
    expect(result.classSet).toContain('w-4')
    expect(result.css).toContain('.w-4')
  })

  it('expands official @source inline variant and range syntax', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource([
      '@import "tailwindcss";',
      '@source inline("{hover:,focus:,}underline");',
      '@source inline("p-{2..6..2}");',
    ].join('\n')))
    const result = await engine.generate()

    expect(result.classSet).toEqual(new Set([
      'hover:underline',
      'focus:underline',
      'underline',
      'p-2',
      'p-4',
      'p-6',
    ]))
    expect(result.css).toContain('.underline')
    expect(result.css).toContain('.hover\\:underline')
    expect(result.css).toContain('.focus\\:underline')
    expect(result.css).toContain('.p-2')
    expect(result.css).toContain('.p-4')
    expect(result.css).toContain('.p-6')
  })

  it('applies @source not inline exclusions after explicit candidates', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource([
      '@import "tailwindcss";',
      '@source not inline("bg-red-{200..300..100}");',
    ].join('\n')))
    const result = await engine.generate({
      candidates: ['bg-red-100', 'bg-red-200', 'bg-red-300'],
    })

    expect(result.classSet).toContain('bg-red-100')
    expect(result.classSet).not.toContain('bg-red-200')
    expect(result.classSet).not.toContain('bg-red-300')
    expect(result.css).toContain('.bg-red-100')
    expect(result.css).not.toContain('.bg-red-200')
    expect(result.css).not.toContain('.bg-red-300')
  })

  it('reads available cssEntries and records dependencies', async () => {
    const tempDir = await createTempDir()
    const entry = path.join(tempDir, 'app.css')
    await fs.writeFile(entry, [
      '@import "tailwindcss";',
      '@source inline("w-4");',
    ].join('\n'), 'utf8')

    const source = await resolveTailwindV4Source({
      projectRoot: packageRoot,
      base: tailwindNodeBase,
      cssEntries: [entry],
    })

    expect(source.css).toContain('@source inline("w-4");')
    expect(source.dependencies).toContain(entry)
  })

  it('reads in-memory cssSources and records file dependencies', async () => {
    const tempDir = await createTempDir()
    const cssDir = path.join(tempDir, 'styles')
    const cssFile = path.join(cssDir, 'app.css')
    const source = await resolveTailwindV4Source({
      projectRoot: tempDir,
      baseFallbacks: [tailwindNodeBase],
      cssSources: [
        {
          file: cssFile,
          css: [
            '@import "tailwindcss";',
            '@source inline("text-green-500");',
          ].join('\n'),
        },
      ],
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate()

    expect(source.base).toBe(cssDir)
    expect(source.dependencies).toContain(cssFile)
    expect(result.classSet).toContain('text-green-500')
    expect(result.css).toContain('.text-green-500')
  })

  it('combines cssEntries and in-memory cssSources', async () => {
    const tempDir = await createTempDir()
    const entry = path.join(tempDir, 'app.css')
    const virtualFile = path.join(tempDir, 'virtual.css')
    await fs.writeFile(entry, [
      '@import "tailwindcss";',
      '@source inline("w-4");',
    ].join('\n'), 'utf8')

    const source = await resolveTailwindV4Source({
      projectRoot: packageRoot,
      base: tailwindNodeBase,
      cssEntries: [entry],
      cssSources: [
        {
          file: virtualFile,
          css: '@source inline("h-4");',
        },
      ],
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate()

    expect(source.dependencies).toEqual(expect.arrayContaining([entry, virtualFile]))
    expect(result.classSet).toContain('w-4')
    expect(result.classSet).toContain('h-4')
  })

  it('keeps missing cssEntries as imports and records dependencies', async () => {
    const tempDir = await createTempDir()
    const entry = path.join(tempDir, 'missing.css')

    const source = await resolveTailwindV4Source({
      projectRoot: packageRoot,
      base: tailwindNodeBase,
      cssEntries: [entry],
    })

    expect(source.css).toContain('@import "')
    expect(source.css).toContain('missing.css')
    expect(source.css).not.toContain('\\')
    expect(source.dependencies).toContain(entry)
  })

  it('falls back to tailwindcss when packageName is a PostCSS plugin', async () => {
    const source = await resolveTailwindV4Source({
      projectRoot: packageRoot,
      base: tailwindNodeBase,
      packageName: '@tailwindcss/postcss',
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate({
      candidates: ['w-4'],
    })

    expect(source.css).toBe('@import "tailwindcss";')
    expect(result.classSet).toContain('w-4')
    expect(result.css).toContain('.w-4')
  })

  it('resolves default source options, relative bases, and non-PostCSS package imports', async () => {
    const tempDir = await createTempDir()
    const source = await resolveTailwindV4Source({
      projectRoot: tempDir,
      cwd: 'app',
      base: 'styles',
      baseFallbacks: ['fallback', 'styles'],
      packageName: '@scope/tailwind-preset',
    })

    expect(source).toEqual({
      projectRoot: tempDir,
      base: path.join(tempDir, 'styles'),
      baseFallbacks: [
        path.join(tempDir, 'fallback'),
        tempDir,
        path.join(tempDir, 'app'),
      ],
      css: '@import "@scope/tailwind-preset";',
      dependencies: [],
    })
  })

  it('resolves absolute CSS source dependencies and ignores empty fallback entries', async () => {
    const tempDir = await createTempDir()
    const cssFile = path.join(tempDir, 'styles/app.css')
    const dependency = path.join(tempDir, 'dep.css')
    const source = await resolveTailwindV4Source({
      projectRoot: tempDir,
      baseFallbacks: ['', tempDir],
      cssSources: [
        {
          file: cssFile,
          css: '@import "tailwindcss";',
          dependencies: [dependency],
        },
      ],
    })

    expect(source.base).toBe(path.dirname(cssFile))
    expect(source.baseFallbacks).toEqual([tempDir])
    expect(source.dependencies).toEqual([cssFile, dependency])
  })

  it('uses the same validity check in validateCandidates and generate', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const candidates = ['w-4', 'w-[100px]', 'definitely-not-a-tailwind-class']
    const validated = await engine.validateCandidates(candidates)
    const generated = await engine.generate({ candidates })

    expect(generated.classSet).toEqual(validated)
  })

  it('scans candidate sources with the raw candidate scanner', async () => {
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      sources: [
        {
          content: '<div class="text-blue-500 invalid-token"></div>',
          extension: 'html',
        },
      ],
    })

    expect(result.rawCandidates).toContain('text-blue-500')
    expect(result.classSet).toContain('text-blue-500')
    expect(result.classSet).not.toContain('invalid-token')
  })

  it('scans explicit filesystem sources when requested', async () => {
    const tempDir = await createTempDir()
    await fs.writeFile(
      path.join(tempDir, 'index.html'),
      '<div class="text-green-500 invalid-token"></div>',
      'utf8',
    )
    const engine = createTailwindV4Engine(await createDefaultSource())
    const result = await engine.generate({
      scanSources: [
        {
          base: tempDir,
          pattern: '**/*.html',
          negated: false,
        },
      ],
    })

    expect(result.rawCandidates).toContain('text-green-500')
    expect(result.classSet).toContain('text-green-500')
    expect(result.classSet).not.toContain('invalid-token')
    expect(result.css).toContain('.text-green-500')
  })

  it('uses compiled @source entries when scanSources is true', async () => {
    const tempDir = await createTempDir()
    const srcDir = path.join(tempDir, 'src')
    await fs.mkdir(srcDir, { recursive: true })
    await fs.writeFile(path.join(srcDir, 'index.html'), '<div class="text-green-500"></div>', 'utf8')
    await fs.writeFile(path.join(srcDir, 'ignored.html'), '<div class="text-red-500"></div>', 'utf8')
    const css = [
      '@import "tailwindcss";',
      '@source "./src/**/*.html";',
      '@source not "./src/ignored.html";',
    ].join('\n')
    const source = await resolveTailwindV4Source({
      projectRoot: tempDir,
      base: tempDir,
      baseFallbacks: [tailwindNodeBase],
      css,
    })
    const engine = createTailwindV4Engine(source)

    const withoutScan = await engine.generate()
    const withScan = await engine.generate({ scanSources: true })

    expect(withoutScan.classSet).not.toContain('text-green-500')
    expect(withScan.classSet).toContain('text-green-500')
    expect(withScan.classSet).not.toContain('text-red-500')
    expect(withScan.css).toContain('.text-green-500')
    expect(withScan.css).not.toContain('.text-red-500')
  })

  it('uses @import source() root and @source not entries when scanSources is true', async () => {
    const tempDir = await createTempDir()
    await fs.mkdir(path.join(tempDir, 'src/legacy'), { recursive: true })
    await fs.mkdir(path.join(tempDir, 'outside'), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'src/index.html'), '<div class="text-green-500"></div>', 'utf8')
    await fs.writeFile(path.join(tempDir, 'src/legacy/index.html'), '<div class="text-red-500"></div>', 'utf8')
    await fs.writeFile(path.join(tempDir, 'outside/index.html'), '<div class="text-blue-500"></div>', 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: tempDir,
      base: tempDir,
      baseFallbacks: [tailwindNodeBase],
      css: [
        '@import "tailwindcss" source("./src");',
        '@source not "./src/legacy";',
      ].join('\n'),
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate({ scanSources: true })

    expect(result.root).toEqual({ base: tempDir, pattern: './src' })
    expect(result.sources).toEqual([{ base: tempDir, pattern: './src/legacy', negated: true }])
    expect(result.classSet).toContain('text-green-500')
    expect(result.classSet).not.toContain('text-red-500')
    expect(result.classSet).not.toContain('text-blue-500')
  })

  it('strips @import source() roots when scanSources is disabled', async () => {
    const tempDir = await createTempDir()
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'src/index.html'), '<div class="text-red-500"></div>', 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: tempDir,
      base: tempDir,
      baseFallbacks: [tailwindNodeBase],
      css: [
        '@import "tailwindcss" source("./src");',
        '@source "./src/**/*.html";',
      ].join('\n'),
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate({
      candidates: ['text-green-500'],
      scanSources: false,
    })

    expect(result.root).toBeNull()
    expect(result.sources).toEqual([])
    expect(result.classSet).toContain('text-green-500')
    expect(result.classSet).not.toContain('text-red-500')
    expect(result.css).toContain('.text-green-500')
    expect(result.css).not.toContain('.text-red-500')
  })

  it('uses source(none) to disable automatic source detection when scanSources is true', async () => {
    const tempDir = await createTempDir()
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true })
    await fs.mkdir(path.join(tempDir, 'admin'), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'src/index.html'), '<div class="text-green-500"></div>', 'utf8')
    await fs.writeFile(path.join(tempDir, 'admin/index.html'), '<div class="text-red-500"></div>', 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: tempDir,
      base: tempDir,
      baseFallbacks: [tailwindNodeBase],
      css: [
        '@import "tailwindcss" source(none);',
        '@source "./admin";',
      ].join('\n'),
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate({ scanSources: true })

    expect(result.root).toBe('none')
    expect(result.classSet).toContain('text-red-500')
    expect(result.classSet).not.toContain('text-green-500')
  })
})
