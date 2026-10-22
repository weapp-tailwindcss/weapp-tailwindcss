import postcss from 'postcss'
import { afterEach, vi } from 'vitest'

const MINIMAL_THEME_CSS = `
@theme default {
  --color-blue-500: oklch(62.3% 0.214 259.815);
  --color-slate-700: oklch(37.2% 0.044 257.287);
  --color-slate-900: oklch(20.8% 0.042 265.755);
  --spacing: 0.25rem;
}
@tailwind utilities;
`

describe('weapp-tailwindcss postcss generator', () => {
  afterEach(() => {
    vi.doUnmock('@/generator')
    vi.resetModules()
  })

  it('generates mini-program css from postcss input', async () => {
    const { default: weappTailwindcss } = await import('@/postcss')
    const result = await postcss([
      weappTailwindcss({
        candidates: ['hover:bg-blue-500', 'w-[100px]'],
        scanSources: false,
      }),
    ]).process(MINIMAL_THEME_CSS, {
      from: undefined,
    })

    expect(result.css).toContain('.w-_b100px_B')
    expect(result.css).toContain('width: 100px')
    expect(result.css).not.toContain(':hover')
    expect(result.css).not.toContain('@supports')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'weapp-tailwindcss:generated',
      target: 'weapp',
    }))
  })

  it('can generate web css from the same postcss entry', async () => {
    const { default: weappTailwindcss } = await import('@/postcss')
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
          webCompat: true,
        },
        packageName: 'tailwindcss',
        candidates: ['hover:bg-blue-500', 'w-[100px]'],
        scanSources: false,
      }),
    ]).process(MINIMAL_THEME_CSS, {
      from: undefined,
    })

    expect(result.css).toContain('.hover\\:bg-blue-500')
    expect(result.css).toContain('@media (hover: hover)')
    expect(result.css).toContain('.w-\\[100px\\]')
    expect(result.css).not.toContain('& > :not(:last-child)')
    expect(result.css).not.toContain('.w-_b100px_B')
    expect(result.messages).toContainEqual(expect.objectContaining({
      type: 'weapp-tailwindcss:generated',
      target: 'web',
    }))
  })

  it('keeps Tailwind v4 gradient utilities valid in default web compat output', async () => {
    const { default: weappTailwindcss } = await import('@/postcss')
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
          webCompat: true,
        },
        packageName: 'tailwindcss',
        candidates: [
          'flex',
          'flex-col',
          'gap-3',
          'rounded-[28rpx]',
          'border',
          'border-slate-200/80',
          'bg-gradient-to-br',
          'from-slate-900/95',
          'to-slate-700/95',
          'p-4',
          'text-white',
          'shadow-xl',
        ],
        scanSources: false,
      }),
    ]).process(MINIMAL_THEME_CSS, {
      from: undefined,
    })

    expect(result.css).toContain('.bg-gradient-to-br')
    expect(result.css).toContain('--tw-gradient-position: to bottom right')
    expect(result.css).toContain('background-image: linear-gradient(var(--tw-gradient-stops))')
    expect(result.css).toContain('.from-slate-900\\/95')
    expect(result.css).toContain('.to-slate-700\\/95')
    expect(result.css).toContain('--tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from)')
    expect(result.css).toContain('@property --tw-gradient-position')
    expect(result.css).toContain('@property --tw-gradient-stops')
    expect(result.css).toContain('@property --tw-gradient-via-stops')
    expect(result.css).toContain('--tw-gradient-position: initial')
    expect(result.css).toContain('--tw-gradient-stops: initial')
    expect(result.css).toContain('--tw-gradient-via-stops: initial')
  })

  it.each([
    ['taro', 'taro'],
    ['mpx', 'mpx'],
    ['uni-app', 'uni-app'],
    ['uni-app x', 'uni-app-x'],
  ] as const)('keeps Tailwind v4 gradient utilities valid for %s web compat output', async (_name, appType) => {
    const { default: weappTailwindcss } = await import('@/postcss')
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
          webCompat: true,
        },
        packageName: 'tailwindcss',
        candidates: [
          'flex',
          'flex-col',
          'gap-3',
          'rounded-[28rpx]',
          'border',
          'border-slate-200/80',
          'bg-gradient-to-br',
          'from-slate-900/95',
          'to-slate-700/95',
          'p-4',
          'text-white',
          'shadow-xl',
        ],
        scanSources: false,
        styleOptions: {
          appType,
        } as never,
      }),
    ]).process(MINIMAL_THEME_CSS, {
      from: undefined,
    })

    expect(result.css).toContain('.bg-gradient-to-br')
    expect(result.css).toContain('.from-slate-900\\/95')
    expect(result.css).toContain('.to-slate-700\\/95')
    expect(result.css).toContain('background-image: linear-gradient(var(--tw-gradient-stops))')
    expect(result.css).toContain('--tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from)')
    expect(result.css).toContain('@property --tw-gradient-position')
    expect(result.css).toContain('@property --tw-gradient-stops')
    expect(result.css).toContain('@property --tw-gradient-via-stops')
    expect(result.css).toContain('--tw-gradient-position: initial')
    expect(result.css).toContain('--tw-gradient-stops: initial')
    expect(result.css).toContain('--tw-gradient-via-stops: initial')
  })

  it('emits expanded web spacing selectors without mini-program tag fallback', async () => {
    const { default: weappTailwindcss } = await import('@/postcss')
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
          webCompat: true,
        },
        packageName: 'tailwindcss',
        candidates: ['space-y-2'],
        scanSources: false,
      }),
    ]).process(MINIMAL_THEME_CSS, {
      from: undefined,
    })

    expect(result.css).toContain(':where(.space-y-2 > :not(:last-child))')
    expect(result.css).not.toContain('& > :not(:last-child)')
    expect(result.css).not.toContain('>view+view')
    expect(result.css).not.toContain('>text+text')
  })

  it('expands block custom variants with nested media hover selectors for web output', async () => {
    const { default: weappTailwindcss } = await import('@/postcss')
    const result = await postcss([
      weappTailwindcss({
        generator: {
          target: 'web',
          webCompat: true,
        },
        packageName: 'tailwindcss',
        candidates: [
          'any-hover:bg-blue-500',
          'any-hover:focus:bg-blue-500',
          'any-hover:[&>span]:text-[22px]',
          'group-[.published]:any-hover:opacity-80',
          'group-[.published]:any-hover:[&>span]:opacity-80',
        ],
        scanSources: false,
      }),
    ]).process([
      MINIMAL_THEME_CSS,
      '@custom-variant any-hover {',
      '  @media (any-hover: hover) {',
      '    &:hover {',
      '      @slot;',
      '    }',
      '  }',
      '}',
    ].join('\n'), {
      from: undefined,
    })

    expect(result.css).toContain('@media (any-hover: hover)')
    expect(result.css).toContain('.any-hover\\:bg-blue-500')
    expect(result.css).toContain(':hover')
    expect(result.css).toContain('.any-hover\\:focus\\:bg-blue-500')
    expect(result.css).toContain(':hover:focus')
    expect(result.css).toContain('.any-hover\\:\\[\\&\\>span\\]\\:text-\\[22px\\]')
    expect(result.css).toContain(':hover > span')
    expect(result.css).toContain('.group-\\[\\.published\\]\\:any-hover\\:opacity-80')
    expect(result.css).toContain('.group-\\[\\.published\\]\\:any-hover\\:\\[\\&\\>span\\]\\:opacity-80')
    expect(result.css).not.toContain('@custom-variant')
    expect(result.css).not.toContain('@slot')
    expect(result.css).not.toContain('&:hover')
  })

})
