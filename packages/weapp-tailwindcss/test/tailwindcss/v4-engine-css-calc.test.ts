import { afterEach } from 'vitest'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

const THEME_CSS = `
@theme default {
  --spacing: 0.25rem;
  --color-red-500: oklch(63.7% 0.237 25.331);
}
@tailwind utilities;
`

describe('tailwindcss v4 engine cssCalc', () => {
  afterEach(() => {
    clearTailwindV4IncrementalGenerateCacheForTest()
  })

  it('keeps runtime spacing calc on web when cssCalc is disabled', async () => {
    const source = await resolveTailwindV4Source({
      css: THEME_CSS,
      base: process.cwd(),
    })
    const result = await createTailwindV4Engine(source).generate({
      candidates: ['mt-2', 'gap-2', 'p-2'],
      scanSources: false,
      target: 'web',
    })

    expect(result.css).toMatch(/gap:\s*calc\(var\(--spacing\)\s*\*\s*2\)/)
    expect(result.css).not.toContain('gap: 0.5rem')
  })

  it.each(['weapp', 'web'] as const)('precomputes configured spacing calc for %s generation', async (target) => {
    const source = await resolveTailwindV4Source({
      css: THEME_CSS,
      base: process.cwd(),
    })
    const result = await createTailwindV4Engine(source).generate({
      candidates: ['mt-2', 'gap-2', 'p-2'],
      scanSources: false,
      target,
      styleOptions: {
        cssCalc: ['--spacing'],
      },
    })

    expect(result.rawCss).toMatch(/calc\(var\(--spacing\)\s*\*\s*2\)/)
    expect(result.css).toContain('gap: 0.5rem')
    expect(result.css).toContain('padding: 0.5rem')
    expect(result.css).toContain('margin-top: 0.5rem')
    expect(result.css).toMatch(/--spacing:\s*0?\.25rem/)
    expect(result.css).not.toMatch(/gap:\s*calc\(var\(--spacing\)/)
  })

  it('honors nested cssOptions.cssCalc on web', async () => {
    const source = await resolveTailwindV4Source({
      css: THEME_CSS,
      base: process.cwd(),
    })
    const result = await createTailwindV4Engine(source).generate({
      candidates: ['gap-2'],
      scanSources: false,
      target: 'web',
      styleOptions: {
        cssOptions: {
          cssCalc: [/^--spacing$/],
        },
      },
    })

    expect(result.css).toContain('gap: 0.5rem')
    expect(result.css).not.toMatch(/gap:\s*calc\(var\(--spacing\)/)
  })

  it('precomputes spacing calc on incremental web generation', async () => {
    const source = await resolveTailwindV4Source({
      css: THEME_CSS,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    const styleOptions = {
      cssCalc: ['--spacing'] as (string | RegExp)[],
    }

    await engine.generate({
      candidates: ['mt-2', 'gap-2'],
      incrementalCache: true,
      scanSources: false,
      target: 'web',
      styleOptions,
    })
    const result = await engine.generate({
      candidates: ['mt-2', 'gap-2', 'p-2'],
      incrementalCache: true,
      scanSources: false,
      target: 'web',
      styleOptions,
    })

    expect(result.css).toContain('gap: 0.5rem')
    expect(result.css).toContain('padding: 0.5rem')
    expect(result.css).toContain('margin-top: 0.5rem')
    expect(result.incrementalCss ?? '').toContain('padding: 0.5rem')
    expect(result.incrementalCss ?? '').not.toMatch(/padding:\s*calc\(var\(--spacing\)/)
  })
})
