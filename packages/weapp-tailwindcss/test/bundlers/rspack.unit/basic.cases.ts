import { describe, expect, it, vi } from 'vitest'
import { patchRspackConfig } from '@/rspack'
import { getUseLoaders } from './shared'

describe('bundlers/rspack patchRspackConfig basic loader patching', () => {
  it('uses the physical CommonJS loader by default', () => {
    const config = {
      module: {
        rules: [
          {
            oneOf: [
              {
                use: [
                  { loader: 'css-loader' },
                  { loader: 'builtin:lightningcss-loader' },
                ],
              },
            ],
          },
        ],
      },
    }

    patchRspackConfig(config)

    expect((config.module.rules[0]!.oneOf[0]!.use.at(-1) as any).options).toMatchObject({ generateCss: true })

    expect(getUseLoaders(config)).toEqual([
      'css-loader',
      'builtin:lightningcss-loader',
      expect.stringMatching(/weapp-tw-css-import-rewrite-loader\.cjs$/),
    ])
  })

  it('injects css rewrite loader after lightning css loader without removing it', () => {
    const config = {
      module: {
        rules: [
          {
            oneOf: [
              {
                use: [
                  { loader: 'css-extract-loader' },
                  { loader: 'css-loader' },
                  { loader: 'builtin:lightningcss-loader' },
                ],
              },
            ],
          },
        ],
      },
    }

    patchRspackConfig(config, {
      cssImportRewriteLoader: {
        loader: '/virtual/weapp-tw-css-import-rewrite-loader.cjs',
      },
    })

    expect(getUseLoaders(config)).toEqual([
      'css-extract-loader',
      'css-loader',
      'builtin:lightningcss-loader',
      '/virtual/weapp-tw-css-import-rewrite-loader.cjs',
    ])
  })

  it('can remove lightning css loader explicitly', () => {
    const config = {
      module: {
        rules: [
          {
            oneOf: [
              {
                use: [
                  { loader: 'css-loader' },
                  { loader: 'builtin:lightningcss-loader' },
                ],
              },
            ],
          },
        ],
      },
    }

    patchRspackConfig(config, {
      removeLightningCssLoader: true,
      cssImportRewriteLoader: false,
    })

    expect(getUseLoaders(config)).toEqual(['css-loader'])
  })

  it('moves an existing rewrite loader after lightning css loader', () => {
    const config = {
      module: {
        rules: [
          {
            oneOf: [
              {
                use: [
                  { loader: 'css-loader' },
                  {
                    loader: '/virtual/weapp-tw-css-import-rewrite-loader.cjs',
                    options: {
                      tailwindcssImportRewriteRuntimeKey: 'legacy',
                    },
                  },
                  { loader: 'builtin:lightningcss-loader' },
                ],
              },
            ],
          },
        ],
      },
    }

    patchRspackConfig(config)

    expect(getUseLoaders(config)).toEqual([
      'css-loader',
      'builtin:lightningcss-loader',
      '/virtual/weapp-tw-css-import-rewrite-loader.cjs',
    ])
  })

  it('does not inject css rewrite loader into non-css rules', () => {
    const config = {
      module: {
        rules: [
          {
            oneOf: [
              {
                use: [
                  { loader: 'builtin:swc-loader' },
                ],
              },
            ],
          },
        ],
      },
    }

    patchRspackConfig(config)

    expect(getUseLoaders(config)).toEqual(['builtin:swc-loader'])
  })

  it('keeps function use rules unchanged', () => {
    const use = vi.fn()
    const config = {
      module: {
        rules: [
          {
            oneOf: [
              {
                use,
              },
            ],
          },
        ],
      },
    }

    patchRspackConfig(config)

    expect(config.module.rules[0].oneOf[0].use).toBe(use)
  })

  it('preserves single non-css loader entries', () => {
    const loader = { loader: 'builtin:swc-loader' }
    const config = {
      module: {
        rules: [
          {
            oneOf: [
              {
                use: loader,
              },
            ],
          },
        ],
      },
    }

    patchRspackConfig(config)

    expect(config.module.rules[0].oneOf[0].use).toBe(loader)
  })

  it('can expand a single css loader entry when injecting rewrite loader', () => {
    const config = {
      module: {
        rules: [
          {
            oneOf: [
              {
                use: { loader: 'css-loader' },
              },
            ],
          },
        ],
      },
    }

    patchRspackConfig(config, {
      cssImportRewriteLoader: {
        loader: '/virtual/weapp-tw-css-import-rewrite-loader.cjs',
      },
    })

    expect(config.module.rules[0].oneOf[0].use.map((item: any) => item.loader)).toEqual([
      'css-loader',
      '/virtual/weapp-tw-css-import-rewrite-loader.cjs',
    ])
  })
})
