import path from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  appendLegacyCompatCss,
  appendLegacyContainerCompatCss,
  hasConfiguredContainerCompatSources,
  removeTailwindApplyRules,
} from '@/generation/legacy-compat'

describe('legacy compat css helpers', () => {
  it('removes @apply rules and empty wrapper at-rules from compat sources', () => {
    expect(removeTailwindApplyRules('@media screen { .card { @apply flex; } } .keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindApplyRules('@apply flex; .keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindApplyRules('.keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindApplyRules('.broken{')).toBe('.broken{')
  })

  it('detects configured container compat from inline and external source config', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-legacy-compat-'))
    await mkdir(path.join(cwd, 'src'), { recursive: true })
    const config = path.join(cwd, 'src/tailwind.config.js')
    await writeFile(config, 'export default { theme: { container: { center: true } } }')

    expect(hasConfiguredContainerCompatSources([
      {
        css: '@config "./tailwind.config.js";\n@import "tailwindcss";',
        base: path.join(cwd, 'src'),
        dependencies: [],
      } as any,
    ])).toBe(true)
    expect(hasConfiguredContainerCompatSources([
      {
        css: '@import "tailwindcss";',
        base: cwd,
        dependencies: [],
        config,
      } as any,
    ])).toBe(true)
    expect(hasConfiguredContainerCompatSources([
      {
        css: '@import "tailwindcss";',
        base: cwd,
        dependencies: [],
      } as any,
    ])).toBe(false)
    expect(hasConfiguredContainerCompatSources([
      {
        css: '@config "./missing.config.js";',
        base: cwd,
        dependencies: [],
        config: path.join(cwd, 'missing.config.js'),
      } as any,
    ])).toBe(false)
    expect(hasConfiguredContainerCompatSources([
      {
        css: undefined,
        base: cwd,
        dependencies: [],
      } as any,
    ])).toBe(false)
  })

  it('appends legacy compat css directly for non-weapp targets', async () => {
    const styleHandler = vi.fn(async (css: string) => ({ css }))
    const result = await appendLegacyCompatCss(
      '.generated{color:blue}',
      '@import "tailwindcss";\n.legacy{color:red}',
      'web',
      styleHandler as any,
      {} as any,
      {},
    )

    expect(result).toContain('.generated{color:blue}')
    expect(result).toContain('.legacy{color:red}')
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('transforms and caches legacy compat css for weapp targets', async () => {
    const styleHandler = vi.fn(async (css: string) => ({ css: css.replace('.legacy', '.legacy-x') }))
    const css = '.generated{color:blue}'
    const rawSource = '@import "tailwindcss";\n.legacy{color:red}'

    const first = await appendLegacyCompatCss(
      css,
      rawSource,
      'weapp',
      styleHandler as any,
      { majorVersion: 4 } as any,
      { isMainChunk: true },
    )
    const second = await appendLegacyCompatCss(
      css,
      rawSource,
      'weapp',
      styleHandler as any,
      { majorVersion: 4 } as any,
      { isMainChunk: true },
    )

    expect(first).toContain('.legacy-x{color:red}')
    expect(second).toBe(first)
    expect(styleHandler).toHaveBeenCalledTimes(1)
  })

  it('preserves unlayered selector overrides after layer css has been restored', async () => {
    const styleHandler = vi.fn(async (css: string) => ({ css }))
    const result = await appendLegacyCompatCss(
      'wx-button{background:#000}.same{display:block}',
      'wx-button{background:#444}.same{display:block}',
      'weapp',
      styleHandler as any,
      { majorVersion: 4 } as any,
      { isMainChunk: true },
      { preserveSelectorOverrides: true },
    )

    expect(result.match(/wx-button\{background:#000\}/g)).toHaveLength(1)
    expect(result.match(/wx-button\{background:#444\}/g)).toHaveLength(1)
    expect(result.match(/\.same\{display:block\}/g)).toHaveLength(1)
  })

  it('returns original css for container compat on weapp targets', async () => {
    const styleHandler = vi.fn(async (css: string) => ({ css }))
    const css = '.generated{color:blue}'

    await expect(appendLegacyContainerCompatCss(
      css,
      '.container{width:100%}',
      path.join(process.cwd(), 'app.wxss'),
      new Set(['container']),
      false,
      'weapp',
      styleHandler as any,
      {} as any,
      {},
    )).resolves.toBe(css)
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('returns original css when non-weapp container compat is already generated', async () => {
    const styleHandler = vi.fn(async (css: string) => ({ css }))
    const css = '.generated{color:blue}.container{width:100%}'

    const result = await appendLegacyContainerCompatCss(
      css,
      '.container{width:100%}',
      path.join(process.cwd(), 'app.css'),
      new Set(['container']),
      false,
      'web',
      styleHandler as any,
      {} as any,
      {},
    )

    expect(result).toBe(css)
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('checks external @config container compat on non-weapp container paths', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-legacy-config-container-'))
    await mkdir(path.join(cwd, 'src'), { recursive: true })
    await writeFile(
      path.join(cwd, 'src/tailwind.config.js'),
      'export default { theme: { container: { center: true } } }',
    )
    const styleHandler = vi.fn(async (css: string) => ({ css }))
    const css = '.generated{color:blue}'

    await expect(appendLegacyContainerCompatCss(
      css,
      '@config "./tailwind.config.js";\n@import "tailwindcss";',
      path.join(cwd, 'src/app.css'),
      new Set(),
      false,
      'web',
      styleHandler as any,
      {
        postcssOptions: {
          options: {
            from: path.join(cwd, 'src/app.css'),
          },
        },
      } as any,
      {},
    )).resolves.toBe(css)

    await expect(appendLegacyContainerCompatCss(
      css,
      '@config "./missing.config.js";\n@import "tailwindcss";',
      path.join(cwd, 'src/app.css'),
      new Set(),
      false,
      'web',
      styleHandler as any,
      {
        postcssOptions: {
          options: {
            from: path.join(cwd, 'src/app.css'),
          },
        },
      } as any,
      {},
    )).resolves.toBe(css)
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('skips empty compat css and strips mini-program container rules before transforming', async () => {
    const emptyStyleHandler = vi.fn(async (css: string) => ({ css }))
    const generatedCss = '.legacy{color:red}'

    await expect(appendLegacyCompatCss(
      generatedCss,
      '/*! tailwindcss v4.0.0 */\n.legacy{color:red}',
      'weapp',
      emptyStyleHandler as any,
      {} as any,
      {},
    )).resolves.toBe(generatedCss)
    expect(emptyStyleHandler).not.toHaveBeenCalled()

    const styleHandler = vi.fn(async (css: string) => ({ css }))
    const result = await appendLegacyCompatCss(
      '.generated{color:blue}',
      '@media source(none) { .container{width:100%} }\n.container{width:100%}\n.keep{color:red}',
      'weapp',
      styleHandler as any,
      {} as any,
      {},
    )

    expect(result).toContain('.keep{color:red}')
    expect(result).not.toContain('.container')
    expect(styleHandler).toHaveBeenCalledTimes(1)
  })

  it('repairs trailing unclosed compat blocks with comments and quotes', async () => {
    const styleHandler = vi.fn(async (css: string) => ({ css }))
    const result = await appendLegacyCompatCss(
      '.generated{color:blue}',
      [
        '/*! tailwindcss v4.0.0 */',
        '.legacy::before{content:"{\\"";color:red',
        '/* closed comment */',
      ].join('\n'),
      'weapp',
      styleHandler as any,
      {} as any,
      {},
    )

    expect(result).toContain('.legacy::before')
    expect(styleHandler).toHaveBeenCalledTimes(1)
  })

  it('keeps invalid non-block parse errors and evicts limited compat caches', async () => {
    const styleHandler = vi.fn(async (css: string) => ({ css }))

    await expect(appendLegacyCompatCss(
      '.generated{color:blue}',
      '.legacy{color:}',
      'weapp',
      styleHandler as any,
      {} as any,
      {},
    )).resolves.toContain('.legacy{color:}')

    for (let index = 0; index < 132; index++) {
      await appendLegacyCompatCss(
        '.generated{color:blue}',
        `.legacy-${index}{color:red}`,
        'web',
        styleHandler as any,
        {} as any,
        {},
      )
    }

    expect(styleHandler).toHaveBeenCalledTimes(1)
  })
})
