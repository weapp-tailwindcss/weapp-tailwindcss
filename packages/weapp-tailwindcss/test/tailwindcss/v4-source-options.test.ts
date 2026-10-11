import path from 'node:path'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  normalizeTailwindV4SourceOptions,
  resolveTailwindV4SourceOptionsFromRuntime,
} from '@/tailwindcss/v4-engine/source'

describe('tailwind v4 source options', () => {
  it('normalizes css entries into inline css sources', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-source-'))
    const cssEntry = path.join(root, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, '@config "./tailwind.config.js";\n@import "tailwindcss";')
    await writeFile(path.join(root, 'src/tailwind.config.js'), 'export default {}')

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      css: '@import "tailwindcss";',
      cssEntries: [cssEntry, path.join(root, 'missing.css')],
    })

    expect(options?.cssEntries).toEqual([path.join(root, 'missing.css')])
    expect(options?.cssSources?.[0]).toMatchObject({
      file: cssEntry,
      base: path.dirname(cssEntry),
      dependencies: [cssEntry],
    })
    expect(options?.cssSources?.[0]?.css).toContain('@config')
    expect(options?.cssSources?.[0]?.css).toContain('tailwindcss')

    const packageJsonImport = path.join(root, 'src/with-package-json-import.css')
    await writeFile(packageJsonImport, '@config "#tw";\n@reference url(tailwindcss);')
    const packageJsonOptions = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      cssEntries: [packageJsonImport],
    })
    expect(packageJsonOptions?.cssSources?.[0]?.css).toContain('#tw')
  })

  it('keeps nested css imports in one compile root with complete dependencies', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-nested-source-'))
    const appEntry = path.join(root, 'app.css')
    const nestedEntry = path.join(root, 'styles/tailwind.css')
    await mkdir(path.dirname(nestedEntry), { recursive: true })
    await writeFile(appEntry, '@import "./styles/tailwind.css";')
    await writeFile(nestedEntry, [
      '@import "tailwindcss" source(none);',
      '@source "./pages/**/*.{wxml,ts}";',
    ].join('\n'))

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      cssEntries: [appEntry],
    })

    expect(options?.cssSources).toHaveLength(1)
    expect(options?.cssSources?.map(source => source.file)).toEqual([appEntry])
    expect(options?.cssSources?.[0]).toMatchObject({
      base: path.dirname(appEntry),
      dependencies: [appEntry, nestedEntry],
    })
    expect(options?.cssSources?.[0]?.css).toContain('@import "./styles/tailwind.css"')
  })

  it('deduplicates entries that are already reachable from another entry and preserves independent roots', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-entry-ownership-'))
    const appEntry = path.join(root, 'app.css')
    const nestedEntry = path.join(root, 'styles/tailwind.css')
    const sideEntry = path.join(root, 'side.css')
    await mkdir(path.dirname(nestedEntry), { recursive: true })
    await writeFile(appEntry, '@import "./styles/tailwind.css";')
    await writeFile(nestedEntry, '@import "tailwindcss" source(none);')
    await writeFile(sideEntry, '@import "tailwindcss" source(none);\n.side{color:red}')

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      cssEntries: [nestedEntry, appEntry, sideEntry],
    })

    expect(options?.cssSources?.map(source => source.file)).toEqual([appEntry, sideEntry])
    expect(options?.cssSources?.[0]?.dependencies).toEqual([appEntry, nestedEntry])
    expect(options?.cssSources?.[1]?.dependencies).toEqual([sideEntry])
  })

  it('handles deep and cyclic imports without duplicating compile roots', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-entry-cycle-'))
    const appEntry = path.join(root, 'app.css')
    const firstEntry = path.join(root, 'styles/first.css')
    const secondEntry = path.join(root, 'styles/second.css')
    await mkdir(path.dirname(firstEntry), { recursive: true })
    await writeFile(appEntry, '@import "./styles/first.css";\n.app{color:red}')
    await writeFile(firstEntry, '@import "./second.css";\n.first{color:blue}')
    await writeFile(secondEntry, '@import "./first.css";\n.second{color:green}')

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      cssEntries: [appEntry, secondEntry],
    })

    expect(options?.cssSources).toHaveLength(1)
    expect(options?.cssSources?.[0]?.file).toBe(appEntry)
    expect(options?.cssSources?.[0]?.dependencies).toEqual([appEntry, firstEntry, secondEntry])
  })

  it('resolves relative imports that use Windows separators on POSIX hosts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-entry-windows-path-'))
    const appEntry = path.join(root, 'app.css')
    const nestedEntry = path.join(root, 'styles/tailwind.css')
    await mkdir(path.dirname(nestedEntry), { recursive: true })
    await writeFile(appEntry, '@import ".\\\\styles\\\\tailwind.css";')
    await writeFile(nestedEntry, '.nested{color:red}')

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      cssEntries: [appEntry],
    })

    expect(options?.cssSources?.[0]?.dependencies).toEqual([appEntry, nestedEntry])
  })

  it('removes Vite request queries before treating css entries as file paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-query-entry-'))
    const cssEntry = path.join(root, 'src/app.css')
    const missingEntry = path.join(root, 'src/missing.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, '@import "tailwindcss";')

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      cssEntries: [
        `${cssEntry}?vue&type=style&index=0&src=true&lang.css`,
        `${missingEntry}?direct`,
      ],
    })

    expect(options?.cssSources?.[0]).toMatchObject({
      file: cssEntry,
      base: path.dirname(cssEntry),
      dependencies: [cssEntry],
    })
    expect(options?.cssEntries).toEqual([missingEntry])
  })

  it('normalizes configured source files, bases, and runtime fallbacks', () => {
    const root = path.resolve('/virtual/project')
    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      cssSources: [
        { file: 'src/app.css', css: '@reference "tailwindcss";', dependencies: [] },
        { file: 'src/side.css', dependencies: [] } as any,
      ],
    })

    expect(options?.cssSources?.[0]?.file).toBe(path.resolve(root, 'src/app.css'))
    expect(options?.cssSources?.[0]?.base).toBe(path.resolve(root, 'src'))
    expect(options?.cssSources?.[1]?.file).toBe(path.resolve(root, 'src/side.css'))
    expect(options?.cssSources?.[1]?.base).toBe(path.resolve(root, 'src'))
    expect(normalizeTailwindV4SourceOptions(undefined)).toBeUndefined()

    const runtimeOptions = resolveTailwindV4SourceOptionsFromRuntime({
      packageInfo: { name: '@tailwindcss/postcss' },
      options: {
        projectRoot: root,
        tailwindcss: {
          cwd: 'src',
          config: 'tailwind.config.ts',
          v4: {
            configuredBase: 'styles',
            sources: ['index.wxml'],
          },
        },
      },
    } as any)

    expect(runtimeOptions.projectRoot).toBe(root)
    expect(runtimeOptions.cwd).toBe(path.resolve(root, 'src'))
    expect(runtimeOptions.baseFallbacks).toContain(path.resolve(root, 'src'))
    expect(runtimeOptions.baseFallbacks).toContain('styles')
    expect(runtimeOptions.baseFallbacks).toContain(path.resolve(root, 'src'))
    expect(runtimeOptions.baseFallbacks).toContain(root)
    expect(runtimeOptions.packageName).toBe('tailwindcss')
    expect(runtimeOptions.sources).toEqual(['index.wxml'])

    const rawRuntimeOptions = resolveTailwindV4SourceOptionsFromRuntime({
      packageInfo: { name: 'tailwindcss' },
      options: {
        projectRoot: root,
        tailwindcss: {
          cwd: undefined,
          packageName: 'tailwindcss',
          v4: {
            base: 'raw-base',
            cssEntries: ['src/app.css'],
          },
        },
      },
    } as any)

    expect(rawRuntimeOptions.base).toBe('raw-base')
    expect(rawRuntimeOptions.baseFallbacks).toContain('raw-base')
    expect(rawRuntimeOptions.cssEntries).toEqual(['src/app.css'])
  })

  it('removes empty custom variants from normalized sources', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-empty-variant-'))
    const cssEntry = path.join(root, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss";',
      '@custom-variant wx;',
      '@custom-variant dark (&:where(.dark, .dark *));',
      '.keep{color:red}',
    ].join('\n'))

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      css: '@custom-variant wx { /* #ifdef MP-WEIXIN */ /* #endif */ }',
      cssEntries: [cssEntry],
      cssSources: [{
        css: '@custom-variant wx;\n.inline{color:blue}',
        file: path.join(root, 'src/inline.css'),
      }],
    })
    const sourceCss = options?.cssSources?.map(source => source.css).join('\n') ?? ''

    expect(options?.css).not.toContain('@custom-variant wx')
    expect(sourceCss).not.toContain('@custom-variant wx')
    expect(sourceCss).toContain('@custom-variant dark')
    expect(sourceCss).toContain('.inline')
  })

  it('returns original options when no v4 source normalization is needed', () => {
    const options = {
      projectRoot: path.resolve('/virtual/root'),
      css: '.keep{color:red}',
      cssSources: [
        {
          file: path.resolve('/virtual/root/src/app.css'),
          base: path.resolve('/virtual/root/src'),
          css: '.card{display:flex}',
          dependencies: [],
        },
      ],
    }

    expect(normalizeTailwindV4SourceOptions(options)).toStrictEqual(options)
  })

  it('normalizes css imports, url imports, package imports, and malformed css conservatively', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-imports-'))
    const cssEntry = path.join(root, 'src/app.css')
    const config = path.join(root, 'tailwind.config.ts')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(config, 'export default {}')
    await writeFile(cssEntry, [
      `@config "../${path.basename(config)}";`,
      '@import url(tailwindcss);',
      "@reference 'tailwindcss';",
      '@import "https://cdn.example.com/remote.css";',
    ].join('\n'))

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      packageName: 'tailwindcss',
      css: [
        `@config "./${path.basename(config)}";`,
        '@import url(tailwindcss);',
        "@reference 'tailwindcss';",
        '@import url("tailwindcss");',
      ].join('\n'),
      cssEntries: [cssEntry],
      cssSources: [
        { file: 'src/inline.css', css: '@import "tailwindcss";', dependencies: [] },
        { file: 'src/broken.css', css: '@import "tailwindcss"', dependencies: [] },
        { file: 'src/no-css.css', css: undefined, dependencies: [] } as any,
      ],
    })

    expect(options?.css).toContain('index.css')
    expect(options?.css).toContain('@config')
    expect(options?.cssSources?.[0]?.css).toContain('index.css')
    expect(options?.cssSources?.[1]?.css).toContain('index.css')
    expect(options?.cssSources?.[2]).toMatchObject({
      file: path.join(root, 'src/no-css.css'),
      base: path.join(root, 'src'),
    })
    expect(options?.cssSources?.some(source => source.file === cssEntry)).toBe(true)
  })

  it('leaves non-tailwind, package-json, and invalid css import specifiers unchanged', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-source-unchanged-'))
    const cssEntry = path.join(root, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, [
      '@config "#tw";',
      '@import "./local.css";',
      '@reference "#alias";',
      '@media (min-width: 640px) { .card { color: red } }',
    ].join('\n'))

    const options = normalizeTailwindV4SourceOptions({
      projectRoot: root,
      packageName: './tailwindcss',
      css: '.no-tailwind{color:red}',
      cssEntries: [cssEntry],
      cssSources: [
        { css: '@import url();', dependencies: [] },
        { file: '', base: '', dependencies: [] } as any,
      ],
    })

    expect(options?.css).toBe('.no-tailwind{color:red}')
    expect(options?.cssSources?.some(source => source.file === cssEntry)).toBe(true)
    expect(options?.cssSources?.find(source => source.file === cssEntry)?.css).toContain('#tw')
  })

  it('uses tailwindcss package fallback options for legacy runtime shape', () => {
    const root = path.resolve('/virtual/legacy-runtime')
    const options = resolveTailwindV4SourceOptionsFromRuntime({
      packageInfo: { name: '@tailwindcss/postcss' },
      options: {
        projectRoot: root,
        tailwind: {
          v4: {
            sources: ['src/**/*.wxml'],
          },
        },
      },
    } as any)

    expect(options.projectRoot).toBe(root)
    expect(options.cwd).toBe(root)
    expect(options.packageName).toBe('tailwindcss')
    expect(options.sources).toEqual(['src/**/*.wxml'])
  })

  it('resolves runtime options without explicit options and honors non-postcss package names', () => {
    const noOptions = resolveTailwindV4SourceOptionsFromRuntime({
      packageInfo: { name: 'tailwindcss' },
    } as any)

    expect(noOptions.projectRoot).toBe(process.cwd())
    expect(noOptions.packageName).toBe('tailwindcss')

    const root = path.resolve('/virtual/package-runtime')
    const withPackageName = resolveTailwindV4SourceOptionsFromRuntime({
      packageInfo: { name: '@tailwindcss/postcss' },
      options: {
        projectRoot: root,
        tailwindcss: {
          cwd: '/absolute/cwd',
          packageName: '@acme/tailwindcss',
          config: '/absolute/tailwind.config.ts',
          v4: {
            cssSources: [{ file: '/absolute/src/app.css', css: '.app{}', dependencies: [] }],
            cssEntries: ['/absolute/src/app.css'],
          },
        },
      },
    } as any)

    expect(withPackageName.cwd).toBe('/absolute/cwd')
    expect(withPackageName.packageName).toBe('@acme/tailwindcss')
    expect(withPackageName.baseFallbacks).toContain('/absolute/cwd')
    expect(withPackageName.baseFallbacks).toContain('/absolute')
    expect(withPackageName.cssEntries).toEqual(['/absolute/src/app.css'])
  })
})
