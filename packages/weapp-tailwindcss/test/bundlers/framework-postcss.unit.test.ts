import type { InternalUserDefinedOptions } from '@/types'
import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it, vi } from 'vitest'
import {
  adaptGeneratedCssWithFrameworkPipeline,
  captureFrameworkPostcssOptions,
  collectFrameworkPostcssOptionsFromLoaderEntries,
  resolveFrameworkPostcssOptions,
} from '@/generation/framework-postcss'

const owner = () => ({ cssPreflight: false }) as InternalUserDefinedOptions

function createFrameworkPlugin(files: string[] = []) {
  return {
    postcssPlugin: 'framework-token-transform',
    Declaration(decl: { source?: { input?: { file?: string } }, value: string }) {
      files.push(decl.source?.input?.file ?? '')
      decl.value = decl.value.replaceAll('framework-token', 'processed-token')
    },
  }
}

describe('framework PostCSS pipeline', () => {
  it('keeps the complete framework plugin chain except Tailwind generators', () => {
    const frameworkPlugin = createFrameworkPlugin()
    const tailwindPlugin = { postcssPlugin: '@tailwindcss/postcss' }
    const result = resolveFrameworkPostcssOptions({
      map: false,
      plugins: [frameworkPlugin, frameworkPlugin, tailwindPlugin],
    })

    expect(result?.plugins).toEqual([frameworkPlugin])
    expect(result?.options).toEqual({ map: false })
  })

  it('collects and merges PostCSS options from nested webpack loader rules', () => {
    const first = createFrameworkPlugin()
    const second = { postcssPlugin: 'framework-second-transform' }
    const result = collectFrameworkPostcssOptionsFromLoaderEntries([
      {
        oneOf: [{
          use: [{
            loader: '/node_modules/postcss-loader/index.js',
            options: { postcssOptions: { map: false, plugins: { first } } },
          }],
        }],
      },
      {
        rules: {
          use: {
            loader: '/node_modules/postcss-loader/index.js',
            options: { postcssOptions: { parser: 'postcss-scss', plugins: [second] } },
          },
        },
      },
      { loader: '/node_modules/css-loader/index.js' },
      null,
    ])

    expect(result?.plugins).toEqual([first, second])
    expect(result?.options).toEqual({ map: false, parser: 'postcss-scss' })
  })

  it('resolves function-based postcss-loader options with the loader context', () => {
    const plugin = createFrameworkPlugin()
    const loaderContext = { resourcePath: '/workspace/src/app.css' }
    const postcssOptions = vi.fn((context: typeof loaderContext) => ({
      config: false,
      from: context.resourcePath,
      plugins: [plugin],
    }))

    const result = collectFrameworkPostcssOptionsFromLoaderEntries([{
      loader: '/node_modules/postcss-loader/index.js',
      options: { postcssOptions },
    }], loaderContext)

    expect(postcssOptions).toHaveBeenCalledWith(loaderContext)
    expect(result?.plugins).toEqual([plugin])
    expect(result?.options).toEqual({ from: '/workspace/src/app.css' })
  })

  it('adapts generated CSS through the captured framework pipeline', async () => {
    const currentOwner = owner()
    const files: string[] = []
    captureFrameworkPostcssOptions(currentOwner, {
      plugins: [createFrameworkPlugin(files)],
    })
    const styleHandler = vi.fn(async (css: string, options: any) => {
      return postcss(options.postcssOptions.plugins).process(css, options.postcssOptions.options)
    })

    const css = await adaptGeneratedCssWithFrameworkPipeline(currentOwner, {
      css: ':root{--theme-unit:framework-token}',
      classSet: new Set(['theme-unit']),
      dependencies: [],
      source: 'generator',
      target: 'weapp',
      metadata: {
        file: '/workspace/src/theme.css',
        preflightMode: { inject: false, preserve: false },
      },
    }, {
      cssHandlerOptions: { isMainChunk: false } as any,
      file: '/workspace/src/theme.css',
      majorVersion: 4,
      styleHandler: styleHandler as any,
    })

    expect(css).toContain('--theme-unit:processed-token')
    expect(css).not.toContain('framework-token')
    expect(styleHandler).toHaveBeenCalledTimes(1)
    expect(new Set(files)).toEqual(new Set(['/workspace/src/theme.css']))
  })

  it('removes empty standard fallbacks emitted by the framework PostCSS pipeline', async () => {
    const currentOwner = owner()
    captureFrameworkPostcssOptions(currentOwner, {
      plugins: [{
        postcssPlugin: 'framework-custom-property-fallback',
        Declaration(decl: postcss.Declaration) {
          if (decl.prop === 'filter' && decl.value.includes('var(')) {
            decl.cloneBefore({ value: ' ' })
          }
        },
      }],
    })
    const styleHandler = vi.fn(async (css: string, options: any) => {
      return postcss(options.postcssOptions.plugins).process(css, options.postcssOptions.options)
    })

    const css = await adaptGeneratedCssWithFrameworkPipeline(currentOwner, {
      css: ':host,page,.tw-root,wx-root-portal-content{--tw-blur: }.blur-3xl{--tw-blur:blur(64px);filter:var(--tw-blur,) var(--tw-brightness,)}',
      classSet: new Set(['blur-3xl']),
      dependencies: [],
      source: 'generator',
      target: 'weapp',
      metadata: {
        file: '/workspace/src/theme.css',
        preflightMode: { inject: false, preserve: true },
      },
    }, {
      cssHandlerOptions: { isMainChunk: true } as any,
      file: '/workspace/src/theme.css',
      majorVersion: 4,
      styleHandler: styleHandler as any,
    })

    expect(css).toContain('--tw-blur:')
    expect(css).toMatch(/filter:var\(--tw-blur,\s*\) var\(--tw-brightness,\s*\)/)
    expect(css).not.toMatch(/(?:^|[;{])\s*filter:\s*;/)
  })

  it('clears the captured pipeline when the framework has no PostCSS config', () => {
    const currentOwner = owner()
    expect(captureFrameworkPostcssOptions(currentOwner, {
      plugins: [createFrameworkPlugin()],
    })).toBeDefined()
    expect(captureFrameworkPostcssOptions(currentOwner, undefined)).toBeUndefined()
  })
})
