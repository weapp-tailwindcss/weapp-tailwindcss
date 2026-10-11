import path from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { isTailwindCssImport, parseCssImportSpecifier, parseImportSourceParam, quoteCssImportSpecifier } from '@weapp-tailwindcss/postcss'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import { resolveCompiledSourceRoot, resolveScanSources } from '@/tailwindcss/v4-engine/generator/scan-sources'

const base = process.cwd()
const imports = [
  '/workspace/node_modules/tailwindcss/index.css',
  'C:/workspace/node_modules/tailwindcss/index.css',
  String.raw`C:\workspace\node_modules\tailwindcss\index.css`,
  String.raw`\\server\share\node_modules\tailwindcss\index.css`,
  String.raw`C:\workspace with spaces\node_modules\tailwindcss\index.css`,
  './node_modules/tailwindcss/index.css',
]

function source(css: string) {
  return { css, base, projectRoot: base, baseFallbacks: [], dependencies: [] }
}

describe('Tailwind CSS import paths (Refs #1159)', () => {
  it.each(imports)('serializes and decodes %s at the CSS boundary', (file) => {
    const quoted = quoteCssImportSpecifier(file)
    const expected = file.includes('\\') ? file.replaceAll('\\', '/') : file
    expect(parseCssImportSpecifier(quoted)?.specifier).toBe(expected)
    expect(isTailwindCssImport(quoted)).toBe(true)
    expect(parseCssImportSpecifier(`url(${JSON.stringify(file)})`)?.specifier).toBe(file)
    expect(isTailwindCssImport(`url(${JSON.stringify(file)})`)).toBe(true)
  })

  it('decodes CSS escapes, quotes, comments and source strings', () => {
    expect(parseCssImportSpecifier(String.raw`/* entry */ "tailwind\63 ss" layer(utilities)`)?.specifier).toBe('tailwindcss')
    expect(parseCssImportSpecifier(String.raw`url("C:\\project's files\\tailwindcss\\index.css") source(none)`)?.specifier)
      .toBe(String.raw`C:\project's files\tailwindcss\index.css`)
    expect(parseCssImportSpecifier('url(./tailwindcss/index.css)')?.specifier).toBe('./tailwindcss/index.css')
    expect(parseImportSourceParam(String.raw`"tailwindcss" source("./my\20 content")`))
      .toEqual({ none: false, sourcePath: './my content' })
    expect(isTailwindCssImport('"./other/index.css"')).toBe(false)
    expect(parseCssImportSpecifier('url("tailwindcss"')).toBeUndefined()
    expect(parseCssImportSpecifier(quoteCssImportSpecifier(`C:\\a"b\\tailwindcss\\index.css`))?.specifier)
      .toBe('C:/a"b/tailwindcss/index.css')
  })

  it.each(imports)('discovers default sources through %s', async (file) => {
    const resolved = await resolveScanSources(source(`@import ${JSON.stringify(file)};`), true)
    expect(resolved).toEqual(expect.arrayContaining([
      expect.objectContaining({ base, pattern: '**/*', negated: false }),
    ]))
  })

  it.each(imports)('preserves source(none) and explicit roots through %s', async (file) => {
    const request = JSON.stringify(file)
    expect(await resolveScanSources(source(`@import ${request} source(none);`), true)).toBe(false)
    expect(resolveCompiledSourceRoot(source(`@import ${request} source(none);`))).toBe('none')
    const css = `@import ${request} source("./content");`
    expect(resolveCompiledSourceRoot(source(css))).toEqual({ base, pattern: './content' })
    expect(await resolveScanSources(source(css), true)).toEqual(expect.arrayContaining([
      expect.objectContaining({ base: path.resolve(base, 'content'), negated: false }),
    ]))
  })

  it('generates standard and special utilities from the default source scan', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-1159 source-'))
    const candidates = ['h-8', 'h-20', 'h-50', 'mt-2', 'flex', 'text-slate-500', 'bg-emerald-50/80', 'h-[64rpx]', 'h-[400rpx]']
    try {
      await writeFile(path.join(root, 'index.tsx'), `<View className="${candidates.join(' ')}" />`)
      const resolved = await resolveTailwindV4Source({ css: '@import "tailwindcss";', base: root, projectRoot: root })
      const engine = createTailwindV4Engine(resolved)
      try {
        const generated = await engine.generate({ scanSources: true, styleOptions: { rem2rpx: true } })
        for (const candidate of candidates) {
          expect(generated.classSet.has(candidate), candidate).toBe(true)
        }
        expect(generated.css).toContain('--spacing: 8rpx')
        expect(generated.css).toContain('height: calc(var(--spacing) * 50)')
        expect(generated.css).toContain('display: flex')
        expect(generated.css).toContain('.text-slate-500')
        expect(generated.css).toContain('.h-_b64rpx_B')
        expect(generated.css).toContain('.h-_b400rpx_B')
      }
      finally {
        engine.dispose()
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
