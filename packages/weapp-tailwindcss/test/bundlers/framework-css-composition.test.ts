import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it, vi } from 'vitest'
import { captureFrameworkPostcssOptions } from '@/generation/framework-postcss'
import { generateTailwindV4Css } from '@/generation/service'
import { getCompilerContext } from '@/context'

describe('framework CSS composition', () => {
  it.each([
    ['legacy', 0],
    ['graph', 0],
    ['legacy', 8_000],
    ['graph', 8_000],
  ] as const)('merges imported and bundled CSS only after framework conversion (%s, %i padding rules)', async (mode, paddingRules) => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', mode)
    const directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-framework-css-'))
    try {
      const file = path.join(directory, 'entry.css')
      const vendor = '@charset "UTF-8";.vendor{width:16px;--framework-pass:0}.vendor-alt{height:24px;-webkit-transform:translateY(-50%);transform:translateY(-50%)}'
      const padding = Array.from({ length: paddingRules }, (_, index) => `.padding-${index}{color:rgb(1,2,3);height:1px}`).join('\n')
      const source = `@import "./vendor.css";\n@import "tailwindcss";\npage{--text-base:1rem;--radius-lg:.5rem}\n${padding}`
      await writeFile(path.join(directory, 'vendor.css'), vendor)
      await writeFile(file, source)
      const opts = getCompilerContext({
        tailwindcssBasedir: process.cwd(),
        generator: { target: 'weapp' },
        cssPreflight: false,
        rem2rpx: true,
      })
      const framework = {
        postcssPlugin: 'test-framework-units',
        Once(root: postcss.Root) {
          root.walkDecls((declaration) => {
            declaration.value = declaration.prop === '--framework-pass'
              ? String(Number(declaration.value) + 1)
              : declaration.value.replace(/(?<=\d)px\b/g, 'rpx')
          })
        },
      }
      captureFrameworkPostcssOptions(opts, { plugins: [framework] })
      const processedVendor = (await postcss([framework]).process(vendor, { from: file })).css
      const result = await generateTailwindV4Css({
        opts,
        runtimeState: {
          tailwindRuntime: opts.tailwindRuntime,
          readyPromise: Promise.resolve(),
        },
        runtime: new Set(['flex', 'gap-1']),
        rawSource: source,
        userRawSource: '.raw-user{height:10px}',
        frameworkProcessedUserCss: `.before{width:1rpx}\n@media source(none){/*! weapp-tailwindcss generator-placeholder */}\n:root{--spacing:0.25rem;--test-color:#006241;--brand-color:#123456;--color-custom:purple;--radius-custom:.5rem}page{--text-base:1rem;--radius-lg:.5rem}${processedVendor}\n.vendor{width:32rpx}.vendor{width:16rpx;--framework-pass:1}.bundle-only{height:8rpx;--framework-pass:1}`,
        file,
        cssStage: 'framework-processed',
        cssHandlerOptions: { majorVersion: 4, isMainChunk: false, sourceOptions: { cssEntries: [file], sourceFile: file } },
        cssUserHandlerOptions: { majorVersion: 4, isMainChunk: false },
        styleHandler: opts.styleHandler,
        debug: () => {},
        restoreLocalCssImports: false,
      })
      expect(result).toBeDefined()
      if (paddingRules > 0) {
        expect(result!.css.length).toBeGreaterThan(250_000)
      }
      const root = postcss.parse(result!.css)
      const charsets: string[] = []
      root.walkAtRules('charset', (rule) => {
        charsets.push(rule.params)
      })
      expect(charsets).toEqual(['"UTF-8"'])
      expect(root.first?.type).toBe('atrule')
      expect(result!.css).toMatch(/^@charset "UTF-8";/)
      const widths: string[] = []
      root.walkRules('.vendor', (rule) => {
        rule.walkDecls('width', (declaration) => {
          widths.push(declaration.value)
        })
      })
      expect(widths).toEqual(['16rpx', '32rpx', '16rpx'])
      const alternatives: string[] = []
      root.walkRules('.vendor-alt', (rule) => {
        alternatives.push(rule.toString())
      })
      expect(alternatives).toHaveLength(1)
      expect(result!.css).toContain('.bundle-only')
      const passes: string[] = []
      root.walkDecls('--framework-pass', (declaration) => {
        passes.push(declaration.value)
      })
      expect(passes).toEqual(['1', '1', '1'])
      expect(result!.css).toMatch(/\.raw-user\s*\{\s*height:\s*10rpx/)
      expect(result!.css.indexOf('.before')).toBeLessThan(result!.css.indexOf('.vendor'))
      expect(result!.css).toContain('.flex')
      expect(result!.css).not.toMatch(/(?<=\d)px\b/)
      const themeValues: string[] = []
      root.walkDecls('--spacing', (decl) => {
        themeValues.push(decl.value)
      })
      expect(themeValues).toEqual(['8rpx'])
      const customRadius: string[] = []
      root.walkDecls('--radius-custom', (decl) => {
        customRadius.push(decl.value)
      })
      expect(customRadius).toEqual(['16rpx'])
      expect(result!.css).not.toContain('--radius-custom:.5rem')
      for (const [property, value] of [['--test-color', '#006241'], ['--brand-color', '#123456'], ['--color-custom', 'purple'], ['--text-base', '32rpx'], ['--radius-lg', '16rpx']]) {
        const values: string[] = []
        root.walkDecls(property, (decl) => {
          values.push(decl.value)
        })
        expect(values).toEqual([value])
      }
    }
    finally {
      vi.unstubAllEnvs()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
