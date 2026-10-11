import type { WeappTailwindcssPostcssPluginAdapters } from '@/generator-plugin'
import path from 'node:path'
import postcss, { type Root } from 'postcss'
import { createWeappTailwindcssPostcssPlugin } from '@/generator-plugin'
import { prependConfigDirective } from '../src/generator-plugin/config-directive'
import {
  addDependencyMessages,
  addSourceDependencyMessages,
  replaceRootCss,
  resolveInputFile,
  resolvePostcssBase,
  resolvePostcssProjectRoot,
} from '../src/generator-plugin/context'

function createAdapters(overrides: Partial<WeappTailwindcssPostcssPluginAdapters> = {}) {
  const generate = vi.fn(async () => ({
    css: '.generated { color: red; }',
    rawCss: '.generated { color: red; }',
    target: 'weapp' as const,
    classSet: new Set(['generated']),
    dependencies: [],
  }))
  const adapters: WeappTailwindcssPostcssPluginAdapters = {
    createGenerator: vi.fn(() => ({ generate })),
    normalizeGeneratorOptions: vi.fn(options => ({
      target: options?.target ?? 'weapp',
      config: options?.config,
      styleOptions: options?.styleOptions,
      webCompat: options?.webCompat,
      importFallback: options?.importFallback ?? true,
      bareArbitraryValues: options?.bareArbitraryValues,
    })),
    resolveTailwindV4Source: vi.fn(async options => ({ version: 4, ...options })),
    ...overrides,
  }
  return {
    adapters,
    generate,
  }
}

describe('generator postcss plugin factory', () => {
  it.each([false, true])('释放生成会话，包括生成失败：%s', async (fails) => {
    const dispose = vi.fn()
    const { adapters, generate } = createAdapters()
    if (fails) generate.mockRejectedValueOnce(new Error('generation failed'))
    adapters.createGenerator = () => ({ generate, dispose })
    const task = postcss([createWeappTailwindcssPostcssPlugin(adapters)({ scanSources: false })]).process('@tailwind utilities;', { from: undefined })
    if (fails) await expect(task).rejects.toThrow('generation failed')
    else await task
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps generation ordered between user PostCSS plugins', async () => {
    const { adapters } = createAdapters()
    const plugin = createWeappTailwindcssPostcssPlugin(adapters)
    const before = {
      postcssPlugin: 'before-generator',
      Once(root: Root) {
        root.append({ prop: '--before-generator', value: '1' })
      },
    }
    const after = {
      postcssPlugin: 'after-generator',
      OnceExit(root: Root) {
        root.append({ prop: '--after-generator', value: '1' })
      },
    }

    const result = await postcss([
      before,
      plugin(),
      after,
    ]).process('@import "tailwindcss";', {
      from: undefined,
    })

    expect(adapters.resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: expect.stringContaining('--before-generator: 1'),
    }))
    expect(result.css).toContain('.generated')
    expect(result.css).toContain('--after-generator: 1')
    expect(result.css).not.toContain('--before-generator: 1')
  })

  it('handles context helpers and config directive escaping', async () => {
    const result = await postcss().process('.a{color:red}', {
      from: 'src/app.css',
    })
    const inputFile = resolveInputFile(result)

    expect(inputFile).toBe(path.resolve(process.cwd(), 'src/app.css'))
    expect(resolvePostcssBase(result, {})).toBe(path.dirname(inputFile!))
    expect(resolvePostcssBase(result, { base: '/custom/base' })).toBe('/custom/base')
    expect(resolvePostcssProjectRoot(result, {})).toBe(path.dirname(inputFile!))
    expect(resolvePostcssProjectRoot(result, { projectRoot: '/custom/root' })).toBe('/custom/root')
    expect(prependConfigDirective('.a{}', 'C:\\repo\\"tw".config.ts')).toBe('@config "C:/repo/\\\"tw\\\".config.ts";\n.a{}')
    expect(prependConfigDirective('@config "./tailwind.config.ts";\n.a{}', './other.ts')).toContain('@config "./tailwind.config.ts";')
    expect(prependConfigDirective('.a{}', undefined)).toBe('.a{}')

    addDependencyMessages(result, {
      css: '',
      rawCss: '',
      target: 'weapp',
      classSet: new Set(),
      dependencies: ['dep.css'],
    })
    addSourceDependencyMessages(result, ['source.vue'])
    expect(result.messages).toEqual([
      { type: 'dependency', plugin: 'weapp-tailwindcss', file: 'dep.css' },
      { type: 'dependency', plugin: 'weapp-tailwindcss', file: 'source.vue' },
    ])
  })

  it('replaces root css and preserves invalid css fallback text', async () => {
    const valid = await postcss().process('.a{color:red}', {
      from: undefined,
    })
    replaceRootCss(valid.root, '.b{color:blue}', valid)
    expect(valid.root.toString()).toBe('.b{color:blue}')

    replaceRootCss(valid.root, '.broken{color:red', valid)
    expect(valid.root.toString()).toContain('.broken{color:red')
  })

  it('prepends Tailwind import and reference for apply-only css before resolving source', async () => {
    const { adapters } = createAdapters({
      createGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: [
            '.card { display: flex; }',
            '.unused { color: red; }',
            ':root { --spacing: 0.25rem; }',
          ].join('\n'),
          rawCss: '',
          target: 'weapp',
          classSet: new Set<string>(),
          dependencies: [],
        })),
      })),
    })
    const plugin = createWeappTailwindcssPostcssPlugin(adapters)
    const result = await postcss([
      plugin({
        scanSources: false,
      }),
    ]).process('.card { @apply flex; }', {
      from: undefined,
    })

    expect(adapters.resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: expect.stringContaining('@import "tailwindcss" source(none);'),
    }))
    expect(adapters.resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: expect.stringContaining('@reference "tailwindcss";'),
    }))
    expect(result.css).toContain('.card')
    expect(result.css).toContain('--spacing')
    expect(result.css).not.toContain('.unused')
  })

  it('applies web css compatibility transform for web target', async () => {
    const { adapters } = createAdapters({
      createGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: [
            '@layer theme {',
            '  :root { --color-blue-500: oklch(62.3% .214 259.815); }',
            '}',
            '@property --tw-rotate-x { syntax: "*"; inherits: false; }',
            '@supports (color: color-mix(in lab, red, red)) {',
            '  .text-blue { color: color-mix(in oklab, var(--color-blue-500) 50%, transparent); }',
            '}',
          ].join('\n'),
          rawCss: '',
          target: 'web',
          classSet: new Set<string>(),
          dependencies: [],
        })),
      })),
    })
    const plugin = createWeappTailwindcssPostcssPlugin(adapters)
    const result = await postcss([
      plugin({
        generator: {
          target: 'web',
          webCompat: true,
        },
      }),
    ]).process('@import "tailwindcss";', {
      from: undefined,
    })

    expect(result.css).not.toContain('@layer')
    expect(result.css).not.toContain('@property')
    expect(result.css).not.toContain('@supports')
    expect(result.css).toContain('color: rgba(')
    expect(result.css).toContain('--color-blue-500: rgb(')
    expect(result.css).not.toContain('color: color-mix(')
    expect(result.css).not.toContain('--color-blue-500: oklch(')
    expect(result.css).toContain(':root')
    expect(result.css).toContain('.text-blue')
  })

  it('finalizes Tailwind v4 gradient interpolation for mini-program generator targets', async () => {
    const { adapters } = createAdapters({
      createGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: [
            '.bg-gradient-to-r {',
            '  background-image: linear-gradient(var(--tw-gradient-stops));',
            '  --tw-gradient-position: to right in oklab;',
            '}',
          ].join('\n'),
          rawCss: '',
          target: 'wx' as any,
          classSet: new Set<string>(),
          dependencies: [],
        })),
      })),
    })
    const plugin = createWeappTailwindcssPostcssPlugin(adapters)
    const result = await postcss([
      plugin({
        generator: {
          target: 'weapp',
        },
      }),
    ]).process('@import "tailwindcss";', {
      from: undefined,
    })

    expect(result.css).toContain('--tw-gradient-position: to right')
    expect(result.css).not.toContain('in oklab')
  })

  it('applies default web css compatibility transform for web target', async () => {
    const { adapters } = createAdapters({
      normalizeGeneratorOptions: vi.fn(options => ({
        target: options?.target ?? 'weapp',
        webCompat: options?.webCompat ?? (options?.target === 'web' ? true : undefined),
        importFallback: options?.importFallback ?? true,
      })),
      createGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: [
            '@layer utilities { .text-blue { color: oklch(62.3% .214 259.815); } }',
            '.space-y-2 { :where(& > :not(:last-child)) { margin-block-end: calc(var(--spacing) * 2); } }',
            '@property --tw-rotate-x { syntax: "*"; inherits: false; }',
          ].join('\n'),
          rawCss: '',
          target: 'web',
          classSet: new Set<string>(),
          dependencies: [],
        })),
      })),
    })
    const plugin = createWeappTailwindcssPostcssPlugin(adapters)
    const result = await postcss([
      plugin({
        generator: {
          target: 'web',
        },
      }),
    ]).process('@import "tailwindcss";', {
      from: undefined,
    })

    expect(result.css).not.toContain('@layer')
    expect(result.css).not.toContain('@property')
    expect(result.css).toContain('color: rgb(')
    expect(result.css).not.toContain('color: oklch(')
    expect(result.css).not.toContain('& > :not(:last-child)')
    expect(result.css).toContain(':where(.space-y-2 > :not(:last-child))')
    expect(result.css).toContain('.text-blue')
  })
})
