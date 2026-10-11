import type { TailwindCssRuntimeOptions } from '@/tailwindcss/runtime-types'
import type { TailwindV4ResolvedSource } from '@/tailwindcss/v4-engine'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss'
import { afterEach, vi } from 'vitest'
import { getCompilerContext } from '@/context'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, getTailwindV4IncrementalGenerateCacheStatsForTest, resolveTailwindV4Source, resolveTailwindV4SourceOptionsFromRuntime, transformTailwindV4CssToWeapp } from '@/tailwindcss/v4-engine'
import { resolveTailwindV4SourceFromRuntimeOptions } from '@/tailwindcss/v4-engine/source'

const require = createRequire(import.meta.url)
const tailwindcssRoot = path.dirname(require.resolve('tailwindcss/package.json'))

const MINIMAL_THEME_CSS = `
@theme default {
  --color-amber-200: oklch(92.4% 0.12 95.746);
  --color-red-500: oklch(63.7% 0.237 25.331);
  --color-blue-500: oklch(62.3% 0.214 259.815);
  --color-orange-200: oklch(90.1% 0.076 70.697);
  --breakpoint-sm: 40rem;
  --spacing: 0.25rem;
}
@tailwind utilities;
`

const UNOCSS_DEFAULT_STYLE_CANDIDATES = [
  'w-10px',
  'w-1/2',
  'w-50%',
  'w-2.5rem',
  'h-100vh',
  'min-w-20em',
  'max-w-80vw',
  'size-10px',
  'basis-20%',
  'grid-cols-200px',
  'aspect-16/9',
  'p-10px',
  'px-1.5rem',
  'py-2em',
  'm-4rem',
  '-mt-2px',
  'gap-12px',
  'top-1/2',
  '-top-1.5rem',
  'translate-x-10px',
  'rotate-45deg',
  'rounded-2px',
  'border-1px',
  'outline-2px',
  'blur-4px',
  'leading-1.2em',
  'tracking-0.1em',
  'duration-300ms',
  'delay-1s',
  'opacity-50%',
  'bg-#fff',
  'bg-#ffffff80',
  'text-#f00',
  'text-rgb(255,0,0)',
  'w-calc(100%-1rem)',
]

const UNOCSS_DEFAULT_SOURCE_CLASSES = [
  'hover:!p-2.5px',
  'sm:-top-1.5rem',
  'text-var(--brand)',
]

function compactCss(css: string) {
  return css.replace(/\s+/g, '')
}

async function linkTailwindcssPackage(root: string) {
  const nodeModulesDir = path.join(root, 'node_modules')
  await mkdir(nodeModulesDir, { recursive: true })
  await symlink(tailwindcssRoot, path.join(nodeModulesDir, 'tailwindcss'), 'dir')
}

describe('tailwindcss v4 engine', () => {
  afterEach(() => {
    clearTailwindV4IncrementalGenerateCacheForTest()
    vi.restoreAllMocks()
  })

  it('generates css and class set from explicit candidates', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['bg-red-500', 'w-[100px]', 'not-a-tailwind-class'],
    })

    expect(result.classSet).toEqual(new Set(['bg-red-500', 'w-[100px]']))
    expect(result.target).toBe('weapp')
    expect(result.rawCss).toContain('.bg-red-500')
    expect(result.rawCss).toContain('background-color: var(--color-red-500)')
    expect(result.rawCss).toContain('.w-\\[100px\\]')
    expect(result.css).toContain('.w-_b100px_B')
    expect(result.css).toContain('width: 100px')
    expect(result.css).not.toContain('not-a-tailwind-class')
  })

  it('generates utilities from a standalone @tailwind utilities directive', async () => {
    const source = await resolveTailwindV4Source({
      css: [
        '@theme default {',
        '  --color-red-500: oklch(63.7% 0.237 25.331);',
        '  --spacing: 0.25rem;',
        '}',
        '@tailwind utilities;',
      ].join('\n'),
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['bg-red-500', 'p-4', 'w-[100px]'],
    })

    expect(result.classSet).toEqual(new Set(['bg-red-500', 'p-4', 'w-[100px]']))
    expect(result.rawCss).toContain('.bg-red-500')
    expect(result.rawCss).toContain('background-color: var(--color-red-500)')
    expect(result.rawCss).toContain('.p-4')
    expect(result.rawCss).toContain('padding: calc(var(--spacing) * 4)')
    expect(result.rawCss).toContain('.w-\\[100px\\]')
    expect(result.rawCss).toContain('width: 100px')
    expect(result.css).toContain('.bg-red-500')
    expect(result.css).toContain('.p-4')
    expect(result.css).toContain('.w-_b100px_B')
    expect(result.css).not.toContain('.w-\\[100px\\]')
  })

  it('incrementally generates mini-program css for hex arbitrary candidates', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    await engine.generate({
      candidates: ['bg-[#000000]', 'text-[46px]', 'h-[28px]'],
      incrementalCache: true,
      scanSources: false,
    })
    const result = await engine.generate({
      candidates: [
        'bg-[#00f7]',
        'text-[28px]',
        'h-[16px]',
        'ring-[1.5px]',
        'shadow-[0_53px_55px_#000000]',
        'bg-[#000000]',
        'text-[46px]',
        'h-[28px]',
      ],
      incrementalCache: true,
      scanSources: false,
    })

    expect(result.classSet).toEqual(new Set([
      'bg-[#000000]',
      'text-[46px]',
      'h-[28px]',
      'bg-[#00f7]',
      'text-[28px]',
      'h-[16px]',
      'ring-[1.5px]',
      'shadow-[0_53px_55px_#000000]',
    ]))
    expect(result.css).toContain('.bg-_b_h00f7_B')
    expect(result.css).toContain('.shadow-_b0_53px_55px__h000000_B')
  })

  it('bounds v4 incremental generation caches across changing sources', async () => {
    clearTailwindV4IncrementalGenerateCacheForTest()
    const initialStats = getTailwindV4IncrementalGenerateCacheStatsForTest()

    for (let index = 0; index < initialStats.max + 4; index += 1) {
      const source = await resolveTailwindV4Source({
        css: `${MINIMAL_THEME_CSS}\n/* cache-source-${index} */`,
        base: process.cwd(),
      })
      const engine = createTailwindV4Engine(source)
      await engine.generate({
        candidates: [`text-[${index}px]`],
        incrementalCache: true,
      })
    }

    const stats = getTailwindV4IncrementalGenerateCacheStatsForTest()
    expect(stats.size).toBeLessThanOrEqual(stats.max)
    expect(stats.taskSize).toBeLessThanOrEqual(stats.taskMax)
  })

  it('bounds v4 incremental cache entries across long HMR-style candidate growth', async () => {
    clearTailwindV4IncrementalGenerateCacheForTest()
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    const stats = getTailwindV4IncrementalGenerateCacheStatsForTest()
    const stableCandidates = ['bg-red-500']
    const growthProbeCount = Math.min(stats.entryCandidatesMax, 128)

    for (let index = 0; index < growthProbeCount + 12; index += 1) {
      await engine.generate({
        candidates: [...stableCandidates, `text-[${index}px]`],
        incrementalCache: true,
        scanSources: false,
      })
    }

    const nextStats = getTailwindV4IncrementalGenerateCacheStatsForTest()
    expect(nextStats.entries).toHaveLength(1)
    expect(nextStats.entries[0]?.candidates).toBe(stableCandidates.length + 1)
    expect(nextStats.entries[0]?.candidates).toBeLessThanOrEqual(stats.entryCandidatesMax)
    expect(nextStats.entries[0]?.cssBytes).toBeLessThanOrEqual(stats.entryCssBytesMax)
  })

  it('does not admit oversized v4 incremental cache entries', async () => {
    clearTailwindV4IncrementalGenerateCacheForTest()
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    const candidates = Array.from({ length: 768 }, (_, index) => `content-['${'x'.repeat(4096)}-${index}']`)

    const result = await engine.generate({
      candidates,
      incrementalCache: true,
      scanSources: false,
    })

    expect(result.classSet.size).toBeGreaterThan(0)
    expect(getTailwindV4IncrementalGenerateCacheStatsForTest().size).toBe(0)
  })

  it('normalizes Tailwind v4 package CSS imports to stylesheet entrypoints', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-package-css-'))
    await linkTailwindcssPackage(root)

    const source = await resolveTailwindV4Source({
      css: [
        '@import "tailwindcss" source(none);',
        '@reference "tailwindcss";',
        '',
      ].join('\n'),
      base: root,
      packageName: 'tailwindcss',
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate({
      candidates: ['w-[100px]'],
      target: 'web',
    })

    expect(source.css).not.toContain('@import "tailwindcss"')
    expect(source.css).not.toContain('@reference "tailwindcss"')
    expect(source.css).toContain('/tailwindcss/index.css')
    expect(result.classSet).toEqual(new Set(['w-[100px]']))
    expect(result.rawCss).toContain('.w-\\[100px\\]')
  })

  it('treats rpx arbitrary text values as lengths in generated mini-program css', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['text-[55rpx]', 'text-[32.4rpx]'],
      styleOptions: {
        isMainChunk: false,
      },
    })

    expect(result.classSet).toEqual(new Set(['text-[55rpx]', 'text-[32.4rpx]']))
    expect(result.css).toContain('.text-_b55rpx_B')
    expect(result.css).toContain('font-size: 55rpx')
    expect(result.css).toContain('.text-_b32_d4rpx_B')
    expect(result.css).toContain('font-size: 32.4rpx')
    expect(result.css).not.toContain('.text-_blength_c32_d4rpx_B')
    expect(result.css).not.toContain('text-\\[length\\:')
    expect(result.css).not.toContain('color: 55rpx')
    expect(result.css).not.toContain('color: 32.4rpx')

    const transformed = await transformTailwindV4CssToWeapp(
      '.text-\\[55rpx\\] { color: 55rpx; }',
      { isMainChunk: false },
    )

    expect(transformed).toContain('.text-_b55rpx_B')
    expect(transformed).toContain('font-size: 55rpx')
    expect(transformed).not.toContain('color: 55rpx')
  })

  it('keeps raw candidates and mini-program css transform boundaries aligned after Tailwind generation', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: [
        'text-[22rpx]',
        'hover:text-[22rpx]',
        'bg-[color:#123456]',
      ],
      styleOptions: {
        isMainChunk: false,
      },
    })

    const expectedClassSet = new Set([
      'text-[22rpx]',
      'hover:text-[22rpx]',
      'bg-[color:#123456]',
    ])
    expect(result.classSet).toEqual(expectedClassSet)
    expect(result.rawCandidates).toEqual(expectedClassSet)

    expect(result.rawCss).toContain('.text-\\[22rpx\\]')
    expect(result.rawCss).toContain('.hover\\:text-\\[22rpx\\]')
    expect(result.rawCss).toContain('.bg-\\[color\\:\\#123456\\]')
    expect(result.rawCss).toContain('font-size: 22rpx')
    expect(result.rawCss).toContain('background-color: #123456')
    expect(result.rawCss).not.toContain('color: 22rpx')
    expect(result.rawCss).not.toContain('text-\\[length\\:')

    expect(result.css).toContain('.text-_b22rpx_B')
    expect(result.css).toContain('.bg-_bcolor_c_h123456_B')
    expect(result.css).toContain('font-size: 22rpx')
    expect(result.css).toContain('background-color: #123456')
    expect(result.css).not.toContain('.text-\\[22rpx\\]')
    expect(result.css).not.toContain('.hover\\:text-\\[22rpx\\]')
    expect(result.css).not.toContain('.hover_ctext-_b22rpx_B')
    expect(result.css).not.toContain('.bg-\\[color\\:\\#123456\\]')
    expect(result.css).not.toContain('color: 22rpx')
    expect(result.css).not.toContain('text-\\[length\\:')
  })

  it('treats rpx arbitrary values as lengths in generated uni-app web css', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: [
        'text-[55rpx]',
        'text-[32.4rpx]',
        'hover:text-[66rpx]',
        'hover:text-[32.4rpx]',
        'border-[10rpx]',
        'border-x-[12rpx]',
        'bg-[10rpx]',
        'outline-[5rpx]',
        'ring-[8rpx]',
      ],
      styleOptions: {
        appType: 'uni-app-vite',
      },
      target: 'web',
    })

    expect(result.classSet).toEqual(new Set([
      'text-[55rpx]',
      'text-[32.4rpx]',
      'hover:text-[66rpx]',
      'hover:text-[32.4rpx]',
      'border-[10rpx]',
      'border-x-[12rpx]',
      'bg-[10rpx]',
      'outline-[5rpx]',
      'ring-[8rpx]',
    ]))
    expect(result.rawCandidates).toEqual(result.classSet)
    expect(result.css).toContain('.text-\\[55rpx\\]')
    expect(result.css).toContain('font-size: 1.71875rem')
    expect(result.css).toContain('.text-\\[32\\.4rpx\\]')
    expect(result.css).toContain('font-size: 1.0125rem')
    expect(result.css).toContain('.hover\\:text-\\[66rpx\\]')
    expect(result.css).toContain('font-size: 2.0625rem')
    expect(result.css).toContain('.hover\\:text-\\[32\\.4rpx\\]')
    expect(result.css).not.toContain('text-\\[length\\:')
    expect(result.css).toContain('.border-\\[10rpx\\]')
    expect(result.css).toContain('border-width: 0.3125rem')
    expect(result.css).toContain('.border-x-\\[12rpx\\]')
    expect(result.css).toContain('border-inline-width: 0.375rem')
    expect(result.css).toContain('.bg-\\[10rpx\\]')
    expect(result.css).toContain('background-size: 0.3125rem')
    expect(result.css).toContain('.outline-\\[5rpx\\]')
    expect(result.css).toContain('outline-width: 0.15625rem')
    expect(result.css).toContain('.ring-\\[8rpx\\]')
    expect(result.css).toContain('calc(0.25rem + var(--tw-ring-offset-width))')
    expect(result.css).not.toContain('color: 55rpx')
    expect(result.css).not.toContain('color: 32.4rpx')
    expect(result.css).not.toContain('color: 66rpx')
    expect(result.css).not.toContain('border-color: 10rpx')
    expect(result.css).not.toContain('border-inline-color: 12rpx')
    expect(result.css).not.toContain('background-color: 10rpx')
    expect(result.css).not.toContain('outline-color: 5rpx')
    expect(result.css).not.toContain('--tw-ring-color: 8rpx')
  })

  it('converts uni-app x web rpx utilities back to rem without changing native output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme inline {
          --text-xs: 24rpx;
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const styleOptions = {
      appType: 'uni-app-x' as const,
      rem2rpx: true,
    }

    const webResult = await createTailwindV4Engine(source).generate({
      candidates: ['mt-[10rpx]', 'text-xs'],
      scanSources: false,
      styleOptions,
      target: 'web',
    })
    const nativeResult = await createTailwindV4Engine(source).generate({
      candidates: ['mt-[10rpx]', 'text-xs'],
      scanSources: false,
      styleOptions,
      target: 'weapp',
    })

    expect(webResult.css).toMatch(/\.mt-\\\[10rpx\\\]\s*\{[\s\S]*margin-top:\s*0\.3125rem/)
    expect(webResult.css).toMatch(/\.text-xs\s*\{[\s\S]*font-size:\s*0\.75rem/)
    expect(webResult.css).not.toMatch(/(?:margin-top|font-size):\s*\d+(?:\.\d+)?rpx/)
    expect(nativeResult.css).toMatch(/\.mt-_b10rpx_B\s*\{[\s\S]*margin-top:\s*10rpx/)
    expect(nativeResult.css).toMatch(/\.text-xs\s*\{[\s\S]*font-size:\s*24rpx/)
  })

  it('treats scanned rpx arbitrary values as lengths in generated uni-app web css', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-web-rpx-length-'))
    const pageFile = path.join(root, 'src/pages/index/index.vue')
    await mkdir(path.dirname(pageFile), { recursive: true })
    await writeFile(pageFile, [
      '<template>',
      '<view class="text-[102.43rpx] text-[#123456] border-[10rpx] bg-[10rpx] outline-[5rpx] ring-[8rpx]"></view>',
      '</template>',
    ].join(''), 'utf8')
    const source = await resolveTailwindV4Source({
      css: [
        '@theme default { --color-blue-500: oklch(62.3% 0.214 259.815); }',
        '@tailwind utilities;',
        '@source "./src/**/*.{vue,js,ts}";',
      ].join('\n'),
      base: root,
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      styleOptions: {
        appType: 'uni-app-vite',
      },
      target: 'web',
    })

    expect(result.css).toContain('.text-\\[102\\.43rpx\\]')
    expect(result.css).toContain('font-size: 3.20094rem')
    expect(result.css).toContain('.text-\\[\\#123456\\]')
    expect(result.css).toContain('color: #123456')
    expect(result.css).toContain('border-width: 0.3125rem')
    expect(result.css).toContain('background-size: 0.3125rem')
    expect(result.css).toContain('outline-width: 0.15625rem')
    expect(result.css).toContain('initial-value: 0px')
    expect(result.css).not.toContain('color: 102.43rpx')
    expect(result.css).not.toContain('border-color: 10rpx')
    expect(result.css).not.toContain('background-color: 10rpx')
    expect(result.css).not.toContain('outline-color: 5rpx')
    expect(result.css).not.toContain('--tw-ring-color: 8rpx')
  })

  it('keeps ordinary web rpx arbitrary values aligned with official Tailwind', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['text-[55rpx]', 'border-[10rpx]', 'bg-[10rpx]', 'outline-[5rpx]', 'ring-[8rpx]'],
      target: 'web',
    })

    expect(result.css).toContain('.text-\\[55rpx\\]')
    expect(result.css).toContain('color: 55rpx')
    expect(result.css).toContain('border-color: 10rpx')
    expect(result.css).toContain('background-color: 10rpx')
    expect(result.css).toContain('outline-color: 5rpx')
    expect(result.css).toContain('--tw-ring-color: 8rpx')
    expect(result.css).not.toContain('font-size: 55rpx')
  })

  it('treats scanned rpx arbitrary values as lengths for uni-app H5 web css', async () => {
    const previousUniPlatform = process.env['UNI_PLATFORM']
    process.env['UNI_PLATFORM'] = 'h5'
    try {
      const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-uni-h5-rpx-length-'))
      const pageFile = path.join(root, 'src/pages/index/index.vue')
      await mkdir(path.dirname(pageFile), { recursive: true })
      await writeFile(pageFile, [
        '<template>',
        '<view class="text-[102.43rpx] text-[#123456] border-[10rpx] bg-[10rpx] outline-[5rpx] ring-[8rpx]"></view>',
        '</template>',
      ].join(''), 'utf8')
      const source = await resolveTailwindV4Source({
        css: [
          '@tailwind utilities;',
          '@source "./src/**/*.{vue,js,ts}";',
        ].join('\n'),
        base: root,
      })
      const engine = createTailwindV4Engine(source)

      const result = await engine.generate({
        target: 'web',
      })

      expect(result.css).toContain('.text-\\[102\\.43rpx\\]')
      expect(result.css).toContain('font-size: 3.20094rem')
      expect(result.css).toContain('color: #123456')
      expect(result.css).toContain('border-width: 0.3125rem')
      expect(result.css).toContain('background-size: 0.3125rem')
      expect(result.css).toContain('outline-width: 0.15625rem')
      expect(result.css).toContain('initial-value: 0px')
      expect(result.css).not.toContain('color: 102.43rpx')
      expect(result.css).not.toContain('border-color: 10rpx')
      expect(result.css).not.toContain('background-color: 10rpx')
      expect(result.css).not.toContain('outline-color: 5rpx')
      expect(result.css).not.toContain('--tw-ring-color: 8rpx')
    }
    finally {
      if (previousUniPlatform === undefined) {
        delete process.env['UNI_PLATFORM']
      }
      else {
        process.env['UNI_PLATFORM'] = previousUniPlatform
      }
    }
  })

  it('scopes Tailwind v4 gradient variables to mini-program component elements', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['bg-linear-to-r', 'from-amber-200', 'to-orange-200'],
      styleOptions: {
        isMainChunk: true,
      },
    })
    const css = compactCss(result.css)

    expect(css).toContain('view,text,::after,::before{--tw-gradient-position:initial')
    expect(css).toContain('page,.tw-root,wx-root-portal-content,:host{')
    expect(css).toContain('--tw-gradient-from:rgba(0,0,0,0)')
    expect(css).toContain('--tw-gradient-to:rgba(0,0,0,0)')
    expect(css).toContain('--tw-gradient-from-position:0%')
    expect(css).toContain('--tw-gradient-to-position:100%')
    expect(css).toContain('--color-amber-200:')
    expect(css).toContain('--color-orange-200:')
    expect(css).toContain('.from-amber-200{--tw-gradient-from:var(--color-amber-200)')
    expect(css).toContain('.to-orange-200{--tw-gradient-to:var(--color-orange-200)')
  })

  it('can append new utilities via the v4 incremental cache without full source scans', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const first = await engine.generate({
      candidates: ['text-[18rpx]'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        isMainChunk: false,
      },
    })
    const second = await engine.generate({
      candidates: ['text-[18rpx]', 'text-[28rpx]', 'text-[32.4rpx]'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        isMainChunk: false,
      },
    })

    expect(first.classSet).toEqual(new Set(['text-[18rpx]']))
    expect(second.classSet).toEqual(new Set(['text-[18rpx]', 'text-[28rpx]', 'text-[32.4rpx]']))
    expect(second.css).toContain('.text-_b18rpx_B')
    expect(second.css).toContain('font-size: 18rpx')
    expect(second.css).toContain('.text-_b28rpx_B')
    expect(second.css).toContain('font-size: 28rpx')
    expect(second.css).toContain('.text-_b32_d4rpx_B')
    expect(second.css).toContain('font-size: 32.4rpx')
    expect(second.css).not.toContain('.text-_blength_c32_d4rpx_B')
    expect(second.incrementalCss).toContain('.text-_b28rpx_B')
    expect(second.incrementalCss).toContain('font-size: 28rpx')
    expect(second.incrementalCss).toContain('.text-_b32_d4rpx_B')
    expect(second.incrementalCss).toContain('font-size: 32.4rpx')
    expect(second.incrementalCss).not.toContain('.text-_blength_c32_d4rpx_B')
    expect(second.incrementalCss).not.toContain('.text-_b18rpx_B')
    expect(second.css.match(/\.text-_b18rpx_B/g) ?? []).toHaveLength(1)
    expect(second.css.indexOf('.text-_b28rpx_B')).toBeGreaterThan(second.css.indexOf('.text-_b18rpx_B'))
  })

  it('regenerates the v4 incremental cache when requested utilities are removed', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const first = await engine.generate({
      candidates: ['text-[88rpx]', 'text-[188rpx]'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        isMainChunk: false,
      },
    })
    const second = await engine.generate({
      candidates: ['text-[88rpx]'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        isMainChunk: false,
      },
    })

    expect(first.css).toContain('.text-_b88rpx_B')
    expect(first.css).toContain('.text-_b188rpx_B')
    expect(second.css).toContain('.text-_b88rpx_B')
    expect(second.css).not.toContain('.text-_b188rpx_B')
    expect(second.rawCss).not.toContain('.text-\\[188rpx\\]')
    expect(second.incrementalCss).toBeUndefined()
    expect(second.incrementalRawCss).toBeUndefined()
    expect(second.classSet).toEqual(new Set(['text-[88rpx]']))
    expect(second.rawCandidates).toEqual(new Set(['text-[88rpx]']))
  })

  it('treats rpx selectors as lengths in web incremental css', async () => {
    const source = await resolveTailwindV4Source({
      css: `${MINIMAL_THEME_CSS}\n/* web rpx incremental */`,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const first = await engine.generate({
      candidates: ['text-[88rpx]', 'border-[10rpx]'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        appType: 'uni-app-vite',
      },
      target: 'web',
    })
    const second = await engine.generate({
      candidates: ['text-[88rpx]', 'border-[10rpx]', 'text-[188rpx]', 'text-[32.4rpx]', 'bg-[10rpx]', 'outline-[5rpx]', 'ring-[8rpx]'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        appType: 'uni-app-vite',
      },
      target: 'web',
    })

    expect(first.classSet).toEqual(new Set(['text-[88rpx]', 'border-[10rpx]']))
    expect(second.classSet).toEqual(new Set(['text-[88rpx]', 'border-[10rpx]', 'text-[188rpx]', 'text-[32.4rpx]', 'bg-[10rpx]', 'outline-[5rpx]', 'ring-[8rpx]']))
    expect(second.incrementalCss).toBeUndefined()
    expect(second.css).toContain('.text-\\[88rpx\\]')
    expect(second.css).toContain('font-size: 2.75rem')
    expect(second.css).toContain('.text-\\[188rpx\\]')
    expect(second.css).toContain('font-size: 5.875rem')
    expect(second.css).toContain('.text-\\[32\\.4rpx\\]')
    expect(second.css).toContain('font-size: 1.0125rem')
    expect(second.css).toContain('.border-\\[10rpx\\]')
    expect(second.css).toContain('border-width: 0.3125rem')
    expect(second.css).toContain('.bg-\\[10rpx\\]')
    expect(second.css).toContain('background-size: 0.3125rem')
    expect(second.css).toContain('.outline-\\[5rpx\\]')
    expect(second.css).toContain('outline-width: 0.15625rem')
    expect(second.css).toContain('.ring-\\[8rpx\\]')
    expect(second.css).toContain('calc(0.25rem + var(--tw-ring-offset-width))')
    expect(second.css).not.toContain('text-\\[length\\:')
    expect(second.css).not.toContain('border-\\[length\\:')
    expect(second.css).not.toContain('bg-\\[length\\:')
    expect(second.css).not.toContain('outline-\\[length\\:')
    expect(second.css).not.toContain('ring-\\[length\\:')
    expect(second.css).not.toContain('color: 88rpx')
    expect(second.css).not.toContain('color: 188rpx')
    expect(second.css).not.toContain('color: 32.4rpx')
    expect(second.css).not.toContain('border-color: 10rpx')
    expect(second.css).not.toContain('background-color: 10rpx')
    expect(second.css).not.toContain('outline-color: 5rpx')
    expect(second.css).not.toContain('--tw-ring-color: 8rpx')
  })

  it('converts newly added uni-app x web rpx utilities in incremental css', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme inline {
          --text-xs: 24rpx;
        }
        @tailwind utilities;
        /* uni-app x web rpx incremental */
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    const generateOptions = {
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        appType: 'uni-app-x' as const,
        rem2rpx: true,
      },
      target: 'web' as const,
    }

    const first = await engine.generate({
      ...generateOptions,
      candidates: ['text-xs'],
    })
    const second = await engine.generate({
      ...generateOptions,
      candidates: ['text-xs', 'mt-[10rpx]'],
    })

    expect(second.incrementalCss).toBeUndefined()
    expect(first.css).toMatch(/\.text-xs\s*\{[\s\S]*font-size:\s*0\.75rem/)
    expect(second.css).toMatch(/\.mt-\\\[10rpx\\\]\s*\{[\s\S]*margin-top:\s*0\.3125rem/)
    expect(second.css).not.toContain('margin-top: 10rpx')
  })

  it('remembers requested candidates that do not generate css in the v4 incremental cache', async () => {
    const source = await resolveTailwindV4Source({
      css: `${MINIMAL_THEME_CSS}\n/* invalid candidate cache regression */`,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const first = await engine.generate({
      candidates: ['text-[88rpx]', 'not-a-tailwind-class'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        isMainChunk: false,
      },
    })
    const second = await engine.generate({
      candidates: ['text-[88rpx]', 'not-a-tailwind-class'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        isMainChunk: false,
      },
    })

    expect(first.classSet).toEqual(new Set(['text-[88rpx]']))
    expect(second.classSet).toEqual(new Set(['text-[88rpx]']))
    expect(second.rawCandidates).toEqual(new Set(['text-[88rpx]', 'not-a-tailwind-class']))
    expect(second.css.match(/\.text-_b88rpx_B/g) ?? []).toHaveLength(1)
  })

  it('seeds the v4 incremental cache from the initial source scan', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const first = await engine.generate({
      candidates: ['text-[88rpx]'],
      incrementalCache: true,
      scanSources: true,
      styleOptions: {
        isMainChunk: false,
      },
    })
    const second = await engine.generate({
      candidates: ['text-[88rpx]', 'text-[188rpx]'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        isMainChunk: false,
      },
    })

    expect(first.classSet).toEqual(new Set(['text-[88rpx]']))
    expect(second.classSet).toEqual(new Set(['text-[88rpx]', 'text-[188rpx]']))
    expect(second.css).toContain('.text-_b88rpx_B')
    expect(second.css).toContain('.text-_b188rpx_B')
    expect(second.css.match(/\.text-_b88rpx_B/g) ?? []).toHaveLength(1)
  })

  it('reuses css-macro style options when seeding the v4 incremental cache from a source scan', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --color-blue-500: oklch(62.3% 0.214 259.815);
          --color-red-500: oklch(63.7% 0.237 25.331);
        }
        @custom-variant wx {
          /* #ifdef MP-WEIXIN */
          @slot;
          /* #endif */
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    await engine.generate({
      candidates: ['wx:bg-blue-500'],
      incrementalCache: true,
      scanSources: true,
      styleOptions: {
        isMainChunk: false,
      },
    })
    const second = await engine.generate({
      candidates: ['wx:bg-blue-500', 'wx:bg-red-500'],
      incrementalCache: true,
      scanSources: false,
      styleOptions: {
        isMainChunk: false,
      },
    })

    expect(second.incrementalCss).toBeUndefined()
    expect(second.css).toContain('.wx_cbg-blue-500')
    expect(second.css).toContain('.wx_cbg-red-500')
  })

  it('dedupes concurrent v4 incremental generation for identical requests', async () => {
    vi.resetModules()
    const generate = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return {
        fragments: [{
          id: 'mock:tailwind',
          kind: 'tailwind' as const,
          order: 0,
          root: postcss.parse('.text-\\[88rpx\\] { font-size: 88rpx; }'),
          sourceId: 'mock',
        }],
        classSet: new Set(['text-[88rpx]']),
        rawCandidates: new Set(['text-[88rpx]']),
        dependencies: [],
        sourceEntries: [],
      }
    })
    vi.doMock('@weapp-tailwindcss/engine', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@weapp-tailwindcss/engine')>()
      return {
        ...actual,
        createTailwindGenerationSession: vi.fn(() => ({
          dispose: vi.fn(),
          generate,
          invalidate: vi.fn(),
          source: {} as never,
        })),
        createTailwindV4Engine: vi.fn(() => ({
          generate: vi.fn(),
          loadDesignSystem: vi.fn(),
          source: {} as never,
          validateCandidates: vi.fn(),
        })),
      }
    })
    const { createTailwindV4Engine: createMockedTailwindV4Engine } = await import('@/tailwindcss/v4-engine')
    const source = {
      base: process.cwd(),
      baseFallbacks: [],
      css: MINIMAL_THEME_CSS,
      dependencies: [],
      projectRoot: process.cwd(),
    } satisfies TailwindV4ResolvedSource

    const [first, second] = await Promise.all([
      createMockedTailwindV4Engine(source).generate({
        candidates: ['text-[88rpx]'],
        incrementalCache: true,
        scanSources: false,
        styleOptions: {
          isMainChunk: false,
        },
      }),
      createMockedTailwindV4Engine(source).generate({
        candidates: ['text-[88rpx]'],
        incrementalCache: true,
        scanSources: false,
        styleOptions: {
          isMainChunk: false,
        },
      }),
    ])

    expect(generate).toHaveBeenCalledTimes(1)
    expect(first.css).toContain('.text-_b88rpx_B')
    expect(second.css).toContain('.text-_b88rpx_B')
  })

  it('uses mini-program-safe Tailwind v4 default color variables for native v4 weapp output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @import "tailwindcss";
        @theme default {
          --color-blue-500: oklch(62.3% 0.214 259.815);
          --color-red-500: oklch(63.7% 0.237 25.331);
        }
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['bg-blue-500', 'text-red-500'],
      // 该用例只验证默认主题变量，避免无关的 monorepo 源码扫描造成资源竞争。
      scanSources: false,
    })

    expect(result.css).toContain('--color-blue-500: rgb(50, 128, 255)')
    expect(result.css).toContain('--color-red-500: rgb(251, 44, 54)')
    expect(result.css).toContain('--font-sans:')
    expect(result.css).toContain('--default-font-family: var(--font-sans)')
    expect(result.css).toContain('background-color: var(--color-blue-500)')
    expect(result.css).toContain('color: var(--color-red-500)')
    expect(result.css).not.toContain('oklch(')
    expect(result.css).not.toContain('oklab(')
  })

  it('keeps native Tailwind v4 OKLCH default color variables for web output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --color-blue-500: oklch(62.3% 0.214 259.815);
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['bg-blue-500'],
      target: 'web',
    })

    expect(result.css).toContain('--color-blue-500: oklch(62.3% 0.214 259.815)')
    expect(result.css).toContain('background-color: var(--color-blue-500)')
  })

  it('unwraps custom cascade layers for mini-program output while preserving native layers for web output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme {
          --color-midnight: #121063;
        }
        @layer components {
          .layer-card-v4 {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--color-midnight);
          }
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()
    const webResult = await engine.generate({
      target: 'web',
    })
    const css = compactCss(result.css)
    const webCss = compactCss(webResult.css)

    expect(result.rawCss).toContain('@layer components')
    expect(result.css).not.toContain('@layer')
    expect(css).toContain('.layer-card-v4{display:flex;align-items:center;gap:8px;color:var(--color-midnight);}')
    expect(webResult.css).toBe(webResult.rawCss)
    expect(webResult.css).toContain('@layer components')
    expect(webCss).toContain('@layercomponents{.layer-card-v4{display:flex;align-items:center;gap:8px;color:var(--color-midnight);}}')
  })

  it('removes unsupported vendor-prefixed keyframes from Tailwind v4 theme sources', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --animate-spin: spin 1s linear infinite;
          @-webkit-keyframes spin {
            to {
              -webkit-transform: rotate(1turn);
              transform: rotate(1turn);
            }
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['animate-spin'],
    })

    expect(result.classSet).toEqual(new Set(['animate-spin']))
    expect(result.rawCss).toContain('.animate-spin')
    expect(result.rawCss).toContain('@keyframes spin')
    expect(result.rawCss).not.toContain('@-webkit-keyframes')
  })

  it('extracts candidates from runtime sources', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      sources: [{
        extension: 'html',
        content: '<view class="w-4 bg-red-500 nope"></view>',
      }],
    })

    expect(result.classSet).toEqual(new Set(['bg-red-500', 'w-4']))
    expect(result.rawCss).toContain('.w-4')
    expect(result.rawCss).toContain('width: calc(var(--spacing) * 4)')
    expect(result.css).toContain('.w-4')
  })

  it('supports default UnoCSS class syntax when unocss compatibility is enabled', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const disabledResult = await engine.generate({
      candidates: ['p-10%', 'p-2.5px', 'm-4rem'],
    })
    expect(disabledResult.classSet).toEqual(new Set())
    expect(disabledResult.rawCss).not.toContain('.p-10\\%')

    const { arbitraryValues } = getCompilerContext({
      unocss: true,
      __internalDeferMissingCssEntriesWarning: true,
    } as any)
    const enabledResult = await engine.generate({
      bareArbitraryValues: arbitraryValues.bareArbitraryValues,
      candidates: UNOCSS_DEFAULT_STYLE_CANDIDATES,
      sources: [{
        extension: 'html',
        content: `<view class="${UNOCSS_DEFAULT_SOURCE_CLASSES.join(' ')}"></view>`,
      }],
    })

    expect(arbitraryValues.bareArbitraryValues).toBe(true)
    expect(enabledResult.classSet).toEqual(new Set([
      ...UNOCSS_DEFAULT_STYLE_CANDIDATES,
      ...UNOCSS_DEFAULT_SOURCE_CLASSES,
    ]))
    expect(enabledResult.rawCss).toContain('.w-10px')
    expect(enabledResult.rawCss).toContain('.w-1\\/2')
    expect(enabledResult.rawCss).toContain('.w-50\\%')
    expect(enabledResult.rawCss).toContain('.bg-\\#fff')
    expect(enabledResult.rawCss).toContain('.text-rgb\\(255\\,0\\,0\\)')
    expect(enabledResult.rawCss).toContain('.hover\\:\\!p-2\\.5px')
    expect(enabledResult.rawCss).toContain('.sm\\:-top-1\\.5rem')
    expect(enabledResult.css).toContain('.w-10px')
    expect(enabledResult.css).toContain('.w-1_f2')
    expect(enabledResult.css).toContain('.w-50_v')
    expect(enabledResult.css).toContain('.w-2_d5rem')
    expect(enabledResult.css).toContain('.h-100vh')
    expect(enabledResult.css).toContain('.min-w-20em')
    expect(enabledResult.css).toContain('.max-w-80vw')
    expect(enabledResult.css).toContain('.size-10px')
    expect(enabledResult.css).toContain('.basis-20_v')
    expect(enabledResult.css).toContain('.grid-cols-200px')
    expect(enabledResult.css).toContain('.aspect-16_f9')
    expect(enabledResult.css).toContain('.p-10px')
    expect(enabledResult.css).toContain('.px-1_d5rem')
    expect(enabledResult.css).toContain('.py-2em')
    expect(enabledResult.css).toContain('.m-4rem')
    expect(enabledResult.css).toContain('.-mt-2px')
    expect(enabledResult.css).toContain('.gap-12px')
    expect(enabledResult.css).toContain('.top-1_f2')
    expect(enabledResult.css).toContain('.-top-1_d5rem')
    expect(enabledResult.css).toContain('.translate-x-10px')
    expect(enabledResult.css).toContain('.rotate-45deg')
    expect(enabledResult.css).toContain('.rounded-2px')
    expect(enabledResult.css).toContain('.border-1px')
    expect(enabledResult.css).toContain('.outline-2px')
    expect(enabledResult.css).toContain('.blur-4px')
    expect(enabledResult.css).toContain('.leading-1_d2em')
    expect(enabledResult.css).toContain('.tracking-0_d1em')
    expect(enabledResult.css).toContain('.duration-300ms')
    expect(enabledResult.css).toContain('.delay-1s')
    expect(enabledResult.css).toContain('.opacity-50_v')
    expect(enabledResult.css).toContain('.bg-_hfff')
    expect(enabledResult.css).toContain('.bg-_hffffff80')
    expect(enabledResult.css).toContain('.text-_hf00')
    expect(enabledResult.css).toContain('.text-rgb_p255_m0_m0_P')
    expect(enabledResult.css).toContain('.text-var_p--brand_P')
    expect(enabledResult.css).toContain('.w-calc_p100_v-1rem_P')
    expect(enabledResult.css).toContain('.sm_c-top-1_d5rem')
    expect(enabledResult.css).toContain('@media (min-width: 40rem)')
    expect(enabledResult.css).toContain('background-color: rgba(255,255,255,0.50196)')
    expect(enabledResult.css).toContain('color: var(--brand)')
    expect(enabledResult.css).toContain('width: calc(100% - 1rem)')
    expect(enabledResult.css).not.toContain(':hover')

    const bareColorResult = await engine.generate({
      bareArbitraryValues: true,
      candidates: ['bg-#000'],
    })

    expect(bareColorResult.classSet).toEqual(new Set(['bg-#000']))
    expect(bareColorResult.rawCss).toContain('.bg-\\#000')
    expect(bareColorResult.rawCss).toContain('background-color: #000')
    expect(bareColorResult.css).toContain('.bg-_h000')
    expect(bareColorResult.css).toContain('background-color: #000')

    const limitedResult = await engine.generate({
      bareArbitraryValues: {
        units: ['px'],
      },
      candidates: ['p-10%', 'p-10px'],
    })

    expect(limitedResult.classSet).toEqual(new Set(['p-10px']))
    expect(limitedResult.css).toContain('.p-10px')
    expect(limitedResult.css).not.toContain('.p-10_v')
  })

  it('collects UnoCSS-style bare arbitrary values from scanned source files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-unocss-source-'))
    const sourceFile = path.join(root, 'index.html')
    await writeFile(
      sourceFile,
      '<view class="text-var(--brand) w-calc(100%-1rem) bg-#fff"></view>',
    )
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: root,
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      bareArbitraryValues: true,
      scanSources: [{
        base: root,
        pattern: '*.html',
        negated: false,
      }],
    })

    expect(result.classSet).toEqual(new Set([
      'bg-#fff',
      'text-var(--brand)',
      'w-calc(100%-1rem)',
    ]))
    expect(result.css).toContain('.bg-_hfff')
    expect(result.css).toContain('.text-var_p--brand_P')
    expect(result.css).toContain('.w-calc_p100_v-1rem_P')
  })

  it('includes @source inline candidates in the class set', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --spacing: 0.25rem;
        }
        @source inline("w-4");
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()

    expect(result.classSet).toEqual(new Set(['w-4']))
    expect(result.rawCss).toContain('.w-4')
    expect(result.rawCss).toContain('width: calc(var(--spacing) * 4)')
    expect(result.css).toContain('.w-4')
  })

  it('scans compiled @source entries by default', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-engine-'))
    const srcDir = path.join(root, 'src')
    await writeFile(path.join(root, 'ignored.html'), '<view class="bg-blue-500"></view>', 'utf8')
    await mkdir(srcDir, { recursive: true })
    await writeFile(path.join(srcDir, 'index.html'), '<view class="bg-red-500"></view>', 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: root,
      base: root,
      css: `
        @theme default {
          --color-red-500: oklch(63.7% 0.237 25.331);
          --color-blue-500: oklch(62.3% 0.214 259.815);
        }
        @source "./src/**/*.html";
        @tailwind utilities;
      `,
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()

    expect(result.classSet).toEqual(new Set(['bg-red-500']))
    expect(result.sources.map(entry => ({ ...entry, base: path.normalize(entry.base) }))).toEqual(expect.arrayContaining([
      {
        base: srcDir,
        pattern: '**/*.html',
        negated: false,
      },
      {
        base: root,
        pattern: '**/node_modules/**',
        negated: true,
      },
    ]))
    expect(result.rawCss).toContain('.bg-red-500')
    expect(result.rawCss).not.toContain('.bg-blue-500')
    expect(result.css).toContain('.bg-red-500')
    expect(result.css).not.toContain('.bg-blue-500')
  })

  it('ignores Tailwind config files during source scanning', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-config-scan-'))
    const srcDir = path.join(root, 'src')
    await linkTailwindcssPackage(root)
    await mkdir(srcDir, { recursive: true })
    await writeFile(path.join(srcDir, 'page.html'), '<view class="bg-red-500"></view>', 'utf8')
    await writeFile(path.join(root, 'tailwind.config.js'), [
      'module.exports = {',
      '  content: ["./**/*.{html,js,ts,jsx,tsx}"],',
      '  corePlugins: { container: false },',
      '}',
    ].join('\n'), 'utf8')
    const cssEntry = path.join(root, 'app.css')
    await writeFile(cssEntry, `
      @theme default {
        --color-red-500: oklch(63.7% 0.237 25.331);
      }
      @import "tailwindcss" source(none);
      @config "./tailwind.config.js";
      @source "./**/*.{html,js,ts,jsx,tsx}";
      @tailwind utilities;
    `, 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: root,
      cssEntries: [cssEntry],
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({ target: 'web' })

    expect(result.classSet).toEqual(new Set(['bg-red-500']))
    expect(result.classSet.has('container')).toBe(false)
    expect(result.rawCss).toContain('.bg-red-500')
    expect(result.rawCss).not.toContain('.container')
  })

  it('supports official source detection directives in generator mode', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-source-detection-'))
    const srcDir = path.join(root, 'src')
    await linkTailwindcssPackage(root)
    await mkdir(srcDir, { recursive: true })
    await writeFile(path.join(srcDir, 'page.html'), '<view class="bg-red-500 w-4"></view>', 'utf8')
    await writeFile(path.join(srcDir, 'ignored.html'), '<view class="bg-blue-500"></view>', 'utf8')
    await writeFile(path.join(root, 'outside.html'), '<view class="text-blue-500"></view>', 'utf8')
    const cssEntry = path.join(root, 'app.css')
    await writeFile(cssEntry, `
      @theme default {
        --color-red-100: #fee2e2;
        --color-red-200: #fecaca;
        --color-red-300: #fca5a5;
        --color-red-500: oklch(63.7% 0.237 25.331);
        --color-blue-500: oklch(62.3% 0.214 259.815);
        --spacing: 0.25rem;
      }
      @import "tailwindcss" source(none);
      @source "./src/**/*.html";
      @source not "./src/ignored.html";
      @source inline("underline {hover:,focus:}underline bg-red-{100..300..100}");
      @source not inline("focus:underline");
      @tailwind utilities;
    `, 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: root,
      cssEntries: [cssEntry],
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()

    expect([...result.classSet]).toEqual(expect.arrayContaining([
      'bg-red-100',
      'bg-red-200',
      'bg-red-300',
      'bg-red-500',
      'hover:underline',
      'underline',
      'w-4',
    ]))
    expect(result.classSet.has('bg-blue-500')).toBe(false)
    expect(result.classSet.has('focus:underline')).toBe(false)
    expect(result.classSet.has('text-blue-500')).toBe(false)
    expect(result.rawCss).toContain('.bg-red-500')
    expect(result.rawCss).toContain('.hover\\:underline')
    expect(result.rawCss).not.toContain('.focus\\:underline')
    expect(result.css).toContain('.bg-red-500')
    expect(result.css).not.toContain('@source')
  })

  it('keeps Tailwind v4 default ignored paths for negated-only source directives', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-source-negated-only-'))
    const srcDir = path.join(root, 'src')
    await linkTailwindcssPackage(root)
    await mkdir(srcDir, { recursive: true })
    await mkdir(path.join(root, 'node_modules', 'ignored-pkg'), { recursive: true })
    await writeFile(path.join(srcDir, 'page.html'), '<view class="bg-red-500"></view>', 'utf8')
    await writeFile(path.join(root, 'node_modules', 'ignored-pkg', 'index.js'), 'export const cls = "bg-blue-500"', 'utf8')
    await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\npackages:\n  bg-green-500: {}\n', 'utf8')
    const cssEntry = path.join(root, 'app.css')
    await writeFile(cssEntry, `
      @theme default {
        --color-red-500: oklch(63.7% 0.237 25.331);
        --color-blue-500: oklch(62.3% 0.214 259.815);
        --color-green-500: oklch(72.3% 0.219 149.579);
      }
      @import "tailwindcss";
      @source not "./dist";
      @tailwind utilities;
    `, 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: root,
      cssEntries: [cssEntry],
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()

    expect(result.classSet).toEqual(new Set(['bg-red-500']))
    expect(result.rawCss).toContain('.bg-red-500')
    expect(result.rawCss).not.toContain('.bg-blue-500')
    expect(result.rawCss).not.toContain('.bg-green-500')
  })

  it('scans from the project cwd for bare Tailwind v4 imports resolved through cssEntries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-default-cwd-'))
    const cssDir = path.join(root, 'src', 'styles')
    const pagesDir = path.join(root, 'pages')
    await linkTailwindcssPackage(root)
    await mkdir(cssDir, { recursive: true })
    await mkdir(pagesDir, { recursive: true })
    await mkdir(path.join(root, 'node_modules', 'ignored-pkg'), { recursive: true })
    await writeFile(path.join(pagesDir, 'index.html'), '<view class="bg-red-500 w-4"></view>', 'utf8')
    await writeFile(path.join(cssDir, 'local.html'), '<view class="bg-blue-500"></view>', 'utf8')
    await writeFile(path.join(root, 'node_modules', 'ignored-pkg', 'index.js'), 'export const cls = "bg-green-500"', 'utf8')
    await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\npackages:\n  text-red-500: {}\n', 'utf8')
    const cssEntry = path.join(cssDir, 'app.css')
    await writeFile(cssEntry, `
      @theme default {
        --color-red-500: oklch(63.7% 0.237 25.331);
        --color-blue-500: oklch(62.3% 0.214 259.815);
        --color-green-500: oklch(72.3% 0.219 149.579);
        --spacing: 0.25rem;
      }
      @import "tailwindcss";
      @tailwind utilities;
    `, 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: root,
      cssEntries: [cssEntry],
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()

    expect(path.normalize(source.base)).toBe(cssDir)
    expect(result.classSet).toEqual(new Set(['bg-blue-500', 'bg-red-500', 'w-4']))
    expect(result.rawCss).toContain('.bg-red-500')
    expect(result.rawCss).toContain('.w-4')
    expect(result.rawCss).not.toContain('.bg-green-500')
    expect(result.rawCss).not.toContain('.text-red-500')
  })

  it('refreshes bare import scanning when cssEntries source files change', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-cssentries-hmr-'))
    const cssDir = path.join(root, 'src', 'styles')
    const pagesDir = path.join(root, 'pages')
    await linkTailwindcssPackage(root)
    await mkdir(cssDir, { recursive: true })
    await mkdir(pagesDir, { recursive: true })
    const page = path.join(pagesDir, 'index.html')
    await writeFile(page, '<view class="bg-red-500"></view>', 'utf8')
    const cssEntry = path.join(cssDir, 'app.css')
    await writeFile(cssEntry, `
      @theme default {
        --color-red-500: oklch(63.7% 0.237 25.331);
        --color-blue-500: oklch(62.3% 0.214 259.815);
      }
      @import "tailwindcss";
      @tailwind utilities;
    `, 'utf8')

    const generate = async () => {
      const source = await resolveTailwindV4Source({
        projectRoot: root,
        cssEntries: [cssEntry],
      })
      return createTailwindV4Engine(source).generate({ incrementalCache: true })
    }

    const initial = await generate()
    await writeFile(page, '<view class="bg-blue-500"></view>', 'utf8')
    const updated = await generate()

    expect(initial.dependencies.map(file => path.normalize(file))).toContain(cssEntry)
    expect(updated.dependencies.map(file => path.normalize(file))).toContain(cssEntry)
    expect(initial.classSet).toEqual(new Set(['bg-red-500']))
    expect(updated.classSet).toEqual(new Set(['bg-blue-500']))
    expect(updated.rawCss).toContain('.bg-blue-500')
    expect(updated.rawCss).not.toContain('.bg-red-500')
  })

  it('uses the Tailwind v4 import source base for automatic source detection', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-source-base-'))
    const srcDir = path.join(root, 'src')
    await linkTailwindcssPackage(root)
    await mkdir(srcDir, { recursive: true })
    await writeFile(path.join(srcDir, 'page.html'), '<view class="bg-red-500"></view>', 'utf8')
    await writeFile(path.join(root, 'outside.html'), '<view class="bg-blue-500"></view>', 'utf8')
    const cssEntry = path.join(root, 'app.css')
    await writeFile(cssEntry, `
      @theme default {
        --color-red-500: oklch(63.7% 0.237 25.331);
        --color-blue-500: oklch(62.3% 0.214 259.815);
      }
      @import "tailwindcss" source("./src");
      @tailwind utilities;
    `, 'utf8')
    const source = await resolveTailwindV4Source({
      projectRoot: root,
      cssEntries: [cssEntry],
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate()

    expect(result.classSet).toEqual(new Set(['bg-red-500']))
    expect(result.rawCss).toContain('.bg-red-500')
    expect(result.rawCss).not.toContain('.bg-blue-500')
  })

  it('resolves cssEntries and tracks the entry dependency', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-engine-'))
    const cssEntry = path.join(root, 'app.css')
    await writeFile(cssEntry, MINIMAL_THEME_CSS, 'utf8')

    const source = await resolveTailwindV4Source({
      projectRoot: root,
      cssEntries: ['app.css'],
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate({ candidates: ['w-4'] })

    expect(path.normalize(source.base)).toBe(root)
    expect(result.dependencies.map(file => path.normalize(file))).toContain(cssEntry)
    expect(result.classSet).toEqual(new Set(['w-4']))
    expect(result.css).toContain('.w-4')
  })

  it('supports Tailwind v4 subpath imports for @import, @reference, @plugin, and @config', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-subpath-'))
    const cssDir = path.join(root, 'src', 'css')
    const srcDir = path.join(root, 'src')
    const cssEntry = path.join(cssDir, 'entry.css')
    await mkdir(cssDir, { recursive: true })
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      imports: {
        '#tokens.css': './src/css/tokens.css',
        '#reference.css': './src/css/reference.css',
        '#legacy-plugin': './tailwind.plugin.cjs',
        '#tw-config': './tailwind.config.cjs',
      },
    }, null, 2), 'utf8')
    await writeFile(path.join(root, 'tailwind.config.cjs'), [
      'module.exports = {',
      '  theme: {',
      '    extend: {',
      '      colors: { config: "#445566" },',
      '      spacing: { config: "11px" },',
      '    },',
      '  },',
      '}',
    ].join('\n'), 'utf8')
    await writeFile(path.join(root, 'tailwind.plugin.cjs'), [
      'module.exports = function ({ addUtilities }) {',
      '  addUtilities({',
      '    ".plugin-card": { color: "#778899" },',
      '  })',
      '}',
    ].join('\n'), 'utf8')
    await writeFile(path.join(cssDir, 'tokens.css'), [
      '@theme {',
      '  --color-imported: #123456;',
      '  --color-reference: #246810;',
      '}',
    ].join('\n'), 'utf8')
    await writeFile(path.join(cssDir, 'reference.css'), [
      '@import "#tokens.css";',
      '@utility ref-bg {',
      '  background-color: var(--color-reference);',
      '}',
    ].join('\n'), 'utf8')
    await writeFile(path.join(srcDir, 'page.html'), [
      '<div class="bg-imported bg-config plugin-card card-shell ref-card m-config"></div>',
    ].join('\n'), 'utf8')
    await writeFile(cssEntry, [
      '@config "#tw-config";',
      '@plugin "#legacy-plugin";',
      '@reference "#reference.css";',
      '@import "#tokens.css";',
      '@source "../page.html";',
      '@tailwind utilities;',
      '.card-shell {',
      '  @apply bg-imported;',
      '}',
      '.ref-card {',
      '  @apply ref-bg;',
      '}',
      '',
    ].join('\n'), 'utf8')

    const source = await resolveTailwindV4Source({
      projectRoot: root,
      cssEntries: [cssEntry],
    })
    const engine = createTailwindV4Engine(source)
    const result = await engine.generate()

    expect([...result.classSet]).toEqual(expect.arrayContaining([
      'bg-config',
      'bg-imported',
      'm-config',
      'plugin-card',
    ]))
    expect(result.rawCss).toContain('background-color: var(--color-imported)')
    expect(result.rawCss).toContain('background-color: var(--color-reference)')
    expect(result.rawCss).toContain('background-color: #445566')
    expect(result.rawCss).toContain('margin: 11px')
    expect(result.rawCss).toContain('color: #778899')
    expect(result.rawCss).toContain('.card-shell')
    expect(result.rawCss).toContain('.ref-card')
    expect(result.rawCss).not.toContain('@config')
    expect(result.rawCss).not.toContain('@plugin')
    expect(result.rawCss).not.toContain('@reference')
  })

  it('keeps cssEntries source options aligned with engine defaults', async () => {
    const projectRoot = path.resolve('/workspace/app')
    const customBase = path.resolve('/custom/base')
    const cssEntry = path.join(projectRoot, 'src', 'app.css')
    const implicitPatchOptions = {
      projectRoot,
      tailwindcss: {
        cwd: projectRoot,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
    } satisfies TailwindCssRuntimeOptions
    const explicitPatchOptions = {
      projectRoot,
      tailwindcss: {
        cwd: projectRoot,
        packageName: 'tailwindcss',
        v4: {
          base: customBase,
          cssEntries: [cssEntry],
        },
      },
    } satisfies TailwindCssRuntimeOptions
    const implicitBaseOptions = resolveTailwindV4SourceOptionsFromRuntime({
      options: {
        projectRoot,
        tailwind: {
          cwd: projectRoot,
          v4: {
            base: projectRoot,
            hasUserDefinedSources: false,
            cssEntries: [cssEntry],
          },
        },
      },
      packageInfo: { name: 'tailwindcss', version: '4.2.4' },
    } as any)
    const explicitBaseOptions = resolveTailwindV4SourceOptionsFromRuntime({
      options: {
        projectRoot,
        tailwind: {
          cwd: projectRoot,
          v4: {
            base: projectRoot,
            configuredBase: customBase,
            hasUserDefinedSources: false,
            cssEntries: [cssEntry],
          },
        },
      },
      packageInfo: { name: 'tailwindcss', version: '4.2.4' },
    } as any)
    const rawExplicitBaseOptions = resolveTailwindV4SourceOptionsFromRuntime({
      options: explicitPatchOptions,
      packageInfo: { name: 'tailwindcss', version: '4.2.4' },
    } as any)
    const implicitPatchSource = await resolveTailwindV4SourceFromRuntimeOptions(implicitPatchOptions)
    const explicitPatchSource = await resolveTailwindV4SourceFromRuntimeOptions(explicitPatchOptions)

    expect(implicitBaseOptions.base).toBeUndefined()
    expect(explicitBaseOptions.base).toBe(customBase)
    expect(rawExplicitBaseOptions.base).toBe(customBase)
    expect(implicitBaseOptions.cssEntries).toEqual([cssEntry])
    expect(explicitBaseOptions.cssEntries).toEqual([cssEntry])
    expect(implicitBaseOptions.baseFallbacks).toEqual([
      projectRoot,
    ])
    expect(explicitBaseOptions.baseFallbacks).toEqual([
      customBase,
      projectRoot,
    ])
    expect(path.normalize(implicitPatchSource.base)).toBe(path.join(projectRoot, 'src'))
    expect(path.normalize(explicitPatchSource.base)).toBe(customBase)
  })

  it('passes configured v4 source entries through for bundler generation', () => {
    const sourceEntries = [
      {
        base: '/workspace/app',
        pattern: 'src/**/*.{vue,tsx,wxml}',
        negated: false,
      },
      {
        base: '/workspace/app',
        pattern: 'dist',
        negated: true,
      },
    ]
    const options = resolveTailwindV4SourceOptionsFromRuntime({
      options: {
        projectRoot: '/workspace/app',
        tailwind: {
          cwd: '/workspace/app',
          v4: {
            cssEntries: ['/workspace/app/src/app.css'],
            sources: sourceEntries,
          },
        },
      },
      packageInfo: { name: 'tailwindcss', version: '4.2.4' },
    } as any)

    expect(options.sources).toBe(sourceEntries)
  })

  it('normalizes runtime cssSources @config relative to their source file', () => {
    const projectRoot = path.resolve('/workspace/app')
    const cssFile = path.join(projectRoot, 'src', 'sub-normal', 'pages', 'index.css')
    const options = resolveTailwindV4SourceOptionsFromRuntime({
      options: {
        projectRoot,
        tailwind: {
          cwd: projectRoot,
          v4: {
            cssSources: [{
              file: cssFile,
              css: '@import "tailwindcss" source(none);\n@config "../../../tailwind.config.sub-normal.js";',
            }],
          },
        },
      },
      packageInfo: { name: 'tailwindcss', version: '4.2.4' },
    } as any)

    expect(options.cssSources?.[0]).toEqual(expect.objectContaining({
      file: cssFile,
      base: path.dirname(cssFile),
      css: expect.stringContaining(`@config "${path.join(projectRoot, 'tailwind.config.sub-normal.js').replaceAll(path.sep, '/')}";`),
    }))
  })

  it('ignores inline Tailwind v4 css and preserves configured cssSources from runtime options', () => {
    const options = resolveTailwindV4SourceOptionsFromRuntime({
      options: {
        projectRoot: '/workspace/app',
        tailwind: {
          cwd: '/workspace/app',
          v4: {
            css: '@import "tailwindcss";',
            cssSources: [{
              file: '/workspace/app/src/app.scss',
              css: '@import "tailwindcss";',
            }],
          },
        },
      },
      packageInfo: { name: 'tailwindcss', version: '4.2.4' },
    } as any)

    expect(options.css).toBeUndefined()
    expect(options.cssSources).toEqual([{
      file: '/workspace/app/src/app.scss',
      css: '@import "tailwindcss";',
    }])
  })

  it('keeps missing cssEntries as imports for Tailwind resolution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-engine-'))
    const cssEntry = path.join(root, 'missing.css')

    const source = await resolveTailwindV4Source({
      projectRoot: root,
      cssEntries: ['missing.css'],
    })

    expect(source.dependencies.map(file => path.normalize(file))).toEqual([cssEntry])
    expect(source.css).toBe('@import "missing.css";')
  })

  it('uses mini-program css as the default output', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['hover:bg-blue-500', 'w-[100px]'],
    })

    expect(result.target).toBe('weapp')
    expect(result.rawCss).toContain('.hover\\:bg-blue-500')
    expect(result.rawCss).toContain('@media (hover: hover)')
    expect(result.css).toContain('.w-_b100px_B')
    expect(result.css).toContain('width: 100px')
    expect(result.css).not.toContain(':hover')
    expect(result.css).not.toContain('@supports')
  })

  it.each([true, false])(
    'finalizes issue #1002 utilities for uni-app x uvue when isMainChunk=%s',
    async (isMainChunk) => {
      const source = await resolveTailwindV4Source({
        css: `
          @theme default {
            --color-white: #fff;
            --text-xs: 0.75rem;
            --text-xs--line-height: calc(1 / 0.75);
            --text-sm: 0.875rem;
            --text-sm--line-height: calc(1.25 / 0.875);
            --text-base: 1rem;
            --text-base--line-height: calc(1.5 / 1);
            --text-xl: 1.25rem;
            --text-xl--line-height: calc(1.75 / 1.25);
          }
          @tailwind utilities;
        `,
        base: process.cwd(),
      })
      const engine = createTailwindV4Engine(source)

      const result = await engine.generate({
        candidates: ['text-xs', 'text-sm', 'text-base', 'text-xl', 'text-white', 'rounded-full'],
        styleOptions: {
          appType: 'uni-app-x',
          uniAppX: true,
          uniAppXCssTarget: 'uvue',
          uniAppXUnsupported: 'warn',
          cssPresetEnv: {
            features: {
              'custom-properties': {
                preserve: false,
              },
            },
          },
          isMainChunk,
          majorVersion: 4,
          rem2rpx: true,
        },
      })

      expect(result.css).toContain('.text-xs')
      expect(result.css).toContain('.text-sm')
      expect(result.css).toContain('.text-base')
      expect(result.css).toContain('.text-xl')
      expect(result.css).toMatch(/\.text-white\s*\{\s*color:\s*#fff/)
      expect(result.css).toMatch(/\.rounded-full\s*\{\s*border-radius:\s*9999px/)
      expect(result.css).not.toContain('var(--text-')
      expect(result.css).not.toContain('var(--color-white)')
      expect(result.css).not.toMatch(/line-height:\s*calc\(/)
      expect(result.css).not.toContain('calc(infinity')
      expect(result.css).not.toContain('.tw-root')
      expect(result.css).not.toMatch(/(?:^|\})\s*(?:view|text|page|wx-root-portal-content)\s*,/)
    },
  )

  it('normalizes issue #823 translate arguments in generated uni-app x uvue css', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['[transform:translate(10px,20px)]'],
      styleOptions: {
        appType: 'uni-app-x',
        uniAppX: true,
        uniAppXCssTarget: 'uvue',
        uniAppXUnsupported: 'warn',
        isMainChunk: false,
        majorVersion: 4,
      },
    })

    expect(result.rawCss).toContain('transform: translate(10px,20px)')
    expect(result.css).toContain('transform: translate(10px 20px)')
    expect(result.css).not.toContain('translate(10px,20px)')
  })

  it('keeps incremental uni-app x uvue utilities free of root carriers and infinity values', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --color-white: #fff;
          --text-xs: 0.75rem;
          --text-xs--line-height: calc(1 / 0.75);
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    const styleOptions = {
      appType: 'uni-app-x' as const,
      uniAppX: true,
      uniAppXCssTarget: 'uvue' as const,
      cssPresetEnv: {
        features: {
          'custom-properties': {
            preserve: false,
          },
        },
      },
      isMainChunk: false,
      majorVersion: 4 as const,
      rem2rpx: true,
    }

    await engine.generate({
      candidates: ['text-xs'],
      incrementalCache: true,
      scanSources: false,
      styleOptions,
    })
    const result = await engine.generate({
      candidates: ['text-xs', 'text-white', 'rounded-full'],
      incrementalCache: true,
      scanSources: false,
      styleOptions,
    })

    expect(result.incrementalCss).toBeUndefined()
    expect(result.css).toMatch(/\.text-white\s*\{\s*color:\s*#fff/)
    expect(result.css).toMatch(/\.rounded-full\s*\{\s*border-radius:\s*9999px/)
    expect(result.css).not.toContain('var(--color-white)')
    expect(result.css).not.toMatch(/line-height:\s*calc\(/)
    expect(result.css).not.toContain('calc(infinity')
    expect(result.css).not.toContain('.tw-root')
    expect(result.css).not.toContain('view,text')
  })

  it('downgrades Tailwind v4 color-mix alpha colors for mini-program output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --color-white: #fff;
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['text-white/10'],
    })

    expect(result.rawCss).toContain('color-mix')
    expect(result.css).toContain('.text-white_f10')
    expect(result.css).toContain('color: rgba(255, 255, 255, 0.1)')
    expect(result.css).not.toContain('color-mix')
    expect(result.css).not.toContain('oklab')
    expect(result.css).not.toContain('oklch')
    expect(result.css).not.toContain('display-p3')
  })

  it('keeps modern color syntax out of incremental mini-program css', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --color-white: #fff;
          --color-blue-500: oklch(62.3% 0.214 259.815);
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    await engine.generate({
      candidates: ['bg-blue-500'],
      incrementalCache: true,
      scanSources: false,
    })
    const result = await engine.generate({
      candidates: ['bg-blue-500', 'text-white/10'],
      incrementalCache: true,
      scanSources: false,
    })

    expect(result.incrementalCss).toBeUndefined()
    expect(result.css).toContain('background-color: var(--color-blue-500)')
    expect(result.css).toContain('color: rgba(255, 255, 255, 0.1)')
    expect(result.css).toContain('.text-white_f10')
    expect(result.css).toContain('view,text,::after,::before')
    expect(result.css).toContain('--tw-content')
    expect(result.css).not.toContain('box-sizing:border-box')
    expect(result.css).not.toContain('color-mix')
    expect(result.css).not.toContain('oklab')
    expect(result.css).not.toContain('oklch')
    expect(result.css).not.toContain('display-p3')
  })

  it('keeps Tailwind v4 default values in v4 generator output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --color-blue-500: #3b82f6;
          --color-gray-200: #e5e7eb;
          --blur-sm: 8px;
          --radius-sm: 0.25rem;
          --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      target: 'web',
      candidates: ['ring', 'border', 'shadow-sm', 'rounded-sm', 'blur-sm', 'outline'],
    })

    expect(result.css).toContain('border-style: var(--tw-border-style)')
    expect(result.css).not.toContain('@layer base')
    expect(result.css).toContain('--tw-ring-shadow: var(--tw-ring-inset,) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor)')
    expect(result.css).toContain('--tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1))')
    expect(result.css).toContain('border-radius: var(--radius-sm)')
    expect(result.css).toContain('--tw-blur: blur(var(--blur-sm))')
    expect(result.css).toContain('--blur-sm: 8px')
    expect(result.css).toContain('outline-width: 1px')
  })

  it('uses Tailwind v4 default values for mini-program output by default', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --color-blue-500: #3b82f6;
          --color-gray-200: #e5e7eb;
          --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['ring', 'border', 'shadow-sm'],
    })

    expect(result.css).toContain('calc(1px + var(--tw-ring-offset-width))')
    expect(result.css).toContain('--tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgba(0, 0, 0, 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgba(0, 0, 0, 0.1))')
  })

  it('can opt out of Tailwind v4 default values for native Tailwind v4 output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --color-blue-500: #3b82f6;
          --color-gray-200: #e5e7eb;
          --blur-sm: 8px;
          --radius-sm: 0.25rem;
          --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      target: 'web',
      candidates: ['ring', 'border', 'shadow-sm', 'rounded-sm', 'blur-sm', 'outline'],
    })

    expect(result.css).not.toContain('--default-ring-width: 3px')
    expect(result.css).not.toContain('border-color: var(--color-gray-200, currentcolor)')
    expect(result.css).toContain('calc(1px + var(--tw-ring-offset-width))')
    expect(result.css).toContain('--tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1))')
    expect(result.css).not.toContain('--blur-sm: 4px')
    expect(result.css).toContain('outline-width: 1px')
  })

  it('expands spacing child combinators for view and text in mini-program output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --spacing: 0.25rem;
        }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['space-y-4'],
    })
    const css = compactCss(result.css)

    expect(css).toContain('.space-y-4>view+view')
    expect(css).toContain('.space-y-4>view+text')
    expect(css).toContain('.space-y-4>text+view')
    expect(css).toContain('.space-y-4>text+text')
  })

  it('removes browser preflight while keeping utility variables for mini-program output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme default {
          --spacing: 0.25rem;
        }
        @tailwind base;
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['transform', 'before:bg-gray-200', 'before:content-["x"]', 'w-4'],
    })

    expect(result.rawCss).toContain('::before')
    expect(result.css).toContain('.transform')
    expect(result.css).toContain('.w-4')
    expect(result.css).toContain('--tw-rotate-x')
    expect(result.css).toContain('--tw-content: "x"')
    expect(result.css).toContain('--tw-content: ""')
    expect(result.css).toContain('background-color: var(--color-gray-200)')
    expect(result.css).not.toContain('::-webkit')
    expect(result.css).not.toContain(':-moz')
    expect(result.css).not.toMatch(/^::before,\s*::after\s*\{\s*--tw-content:/m)
    expect(result.css).not.toContain('@supports')
  })

  it('quotes generated complex url values before mini-program postcss handling', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['[background:url(https://example.com?q={[{[([{[[2]]}])]}]})]'],
    })

    expect(result.rawCss).toContain('background: url(https://example.com')
    expect(result.css).toContain('background: url("https://example.com')
  })

  it('filters unsupported slash variants from mini-program output', async () => {
    const source = await resolveTailwindV4Source({
      css: `
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      candidates: ['in-[.group/name]:flex', 'not-in-[.group/name]:flex', 'group-hover/item:visible', 'flex'],
    })

    expect(result.rawCss).not.toContain('in-')
    expect(result.rawCss).not.toContain('not-in-')
    expect(result.rawCss).not.toContain('group-hover')
    expect(result.css).toContain('.flex')
    expect(result.css).not.toContain('in-')
    expect(result.css).not.toContain('not-in-')
    expect(result.css).not.toContain('group-hover')
  })

  it('filters unsupported has-in slash variants discovered by source scanning', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-has-in-source-'))
    await writeFile(
      path.join(root, 'index.html'),
      '<view class="has-in-[.group/name]:flex has-not-in-[.group/name]:block bg-red-500"></view>',
    )
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: root,
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      scanSources: [{
        base: root,
        pattern: '*.html',
        negated: false,
      }],
    })

    expect(result.classSet).toEqual(new Set(['bg-red-500']))
    expect(result.rawCss).not.toContain('has-in-')
    expect(result.rawCss).not.toContain('has-not-in-')
    expect(result.css).not.toContain('has-in-')
    expect(result.css).not.toContain('has-not-in-')
    expect(result.css).toContain('.bg-red-500')
  })

  it('can generate web css without mini-program escaping', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      target: 'web',
      candidates: ['w-[100px]'],
    })

    expect(result.target).toBe('web')
    expect(result.css).toBe(result.rawCss)
    expect(result.css).toContain('.w-\\[100px\\]')
    expect(result.css).not.toContain('.w-_b100px_B')
  })

  it('can generate web css without mini-program selector transforms', async () => {
    const source = await resolveTailwindV4Source({
      css: MINIMAL_THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)

    const result = await engine.generate({
      target: 'web',
      candidates: ['hover:bg-blue-500', 'w-[100px]'],
    })

    expect(result.target).toBe('web')
    expect(result.css).toBe(result.rawCss)
    expect(result.css).toContain('.hover\\:bg-blue-500')
    expect(result.css).toContain('@media (hover: hover)')
    expect(result.css).toContain('.w-\\[100px\\]')
    expect(result.css).not.toContain('.w-_b100px_B')
  })
})
