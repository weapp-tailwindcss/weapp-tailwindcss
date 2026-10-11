import { describe, expect, it } from 'vitest'
import {
  createAssetHashByChunkMap,
  createRuntimeAwareCssHash,
  createWebpackCssAssetResourceMap,
  createWebpackDirectCssAssetResourceMap,
  getCacheKey,
  hasLoaderEntry,
  inferWebpackMainCssFiles,
  isCssLikeModuleResource,
  resolveSingleActiveWebpackCssResource,
  stripResourceQuery,
} from '@/bundlers/webpack/BaseUnifiedPlugin/shared'

describe('bundlers/webpack shared helpers', () => {
  it('returns cache keys and strips resource query/hash suffixes', () => {
    expect(getCacheKey('pages/index.js')).toBe('pages/index.js')
    expect(stripResourceQuery(undefined)).toBeUndefined()
    expect(stripResourceQuery('app.css?type=style')).toBe('app.css')
    expect(stripResourceQuery('app.css#hash')).toBe('app.css')
    expect(stripResourceQuery('app.css')).toBe('app.css')
  })

  it('detects css-like module resources and loader entries', () => {
    const cssMatcher = (file: string) => file.endsWith('.css')

    expect(isCssLikeModuleResource(undefined, cssMatcher)).toBe(false)
    expect(isCssLikeModuleResource('app.css?type=style', cssMatcher)).toBe(true)
    expect(isCssLikeModuleResource('app.scss?inline', cssMatcher)).toBe(true)
    expect(isCssLikeModuleResource('component.vue?vue&type=style&index=0&lang.scss', cssMatcher)).toBe(true)
    expect(isCssLikeModuleResource('component.vue?vue&type=style&index=0&lang=less', cssMatcher)).toBe(true)
    expect(isCssLikeModuleResource('component.mpx?type=styles&index=0', cssMatcher, 'mpx')).toBe(true)
    expect(isCssLikeModuleResource('component.mpx?type=styles&index=0', cssMatcher)).toBe(true)

    expect(hasLoaderEntry([{ loader: '/virtual/runtime-loader.js?abc' }], 'runtime-loader.js')).toBe(true)
    expect(hasLoaderEntry([{ loader: '/virtual/runtime-loader.js?abc' }])).toBe(false)
    expect(hasLoaderEntry([{ loader: undefined }], 'runtime-loader.js')).toBe(false)
  })

  it('creates stable per-asset hash from chunk hashes', () => {
    const chunks = [
      {
        id: 'main',
        hash: 'hash-main',
        files: ['app.js', 'app.wxss'],
      },
      {
        id: 'vendor',
        hash: 'hash-vendor',
        files: ['app.js'],
      },
      {
        id: 'empty',
        hash: undefined,
        files: ['noop.js'],
      },
      {
        name: 'runtime',
        hash: 'hash-runtime',
        files: new Set(['runtime.js', '']),
      },
      {
        id: 'nofiles',
        hash: 'hash-nofiles',
      },
    ]

    const result = createAssetHashByChunkMap(chunks)

    expect(result.get('app.js')).toBe('main:hash-main|vendor:hash-vendor')
    expect(result.get('app.wxss')).toBe('main:hash-main')
    expect(result.get('runtime.js')).toBe('runtime:hash-runtime')
    expect(result.has('noop.js')).toBe(false)
    expect(result.has('')).toBe(false)
  })

  it('includes runtime class set hash for css assets without chunk hash', () => {
    const sourceHash = 'source:old-utilities'

    expect(createRuntimeAwareCssHash('main:chunk-a', sourceHash, 'runtime:1')).toBe('main:chunk-a:runtime:1')
    expect(createRuntimeAwareCssHash(undefined, sourceHash, 'runtime:1')).toBe('source:old-utilities:runtime:1')
    expect(createRuntimeAwareCssHash(undefined, sourceHash, 'runtime:2')).toBe('source:old-utilities:runtime:2')
  })

  it('infers main css from webpack runtime chunks without app or main filenames', () => {
    const cssMatcher = (file: string) => file.endsWith('.wxss')
    const result = inferWebpackMainCssFiles([
      {
        id: 'entry-runtime',
        files: ['entry/root-style.bundle.wxss', 'entry/root-runtime.js'],
        hasRuntime: () => true,
      },
      {
        id: 'page',
        files: ['pages/index/index.wxss', 'pages/index/index.js'],
        hasRuntime: () => false,
      },
    ], cssMatcher)

    expect([...result]).toEqual(['entry/root-style.bundle.wxss'])
  })

  it('requires configured source resource matches before inferring v4 main css files', () => {
    const cssMatcher = (file: string) => file.endsWith('.wxss')
    const resourcesByAsset = new Map([
      ['entry/root-style.bundle.wxss', new Set(['/workspace/src/styles/root-entry.css'])],
      ['sub-independent/pages/index.wxss', new Set(['/workspace/src/sub-independent/pages/index.css'])],
    ])
    const result = inferWebpackMainCssFiles([
      {
        id: 'entry-runtime',
        files: ['entry/root-style.bundle.wxss'],
        hasRuntime: () => true,
      },
      {
        id: 'independent-runtime',
        files: ['sub-independent/pages/index.wxss'],
        hasRuntime: () => true,
      },
    ], cssMatcher, {
      mainSourceFiles: new Set(['/workspace/src/styles/root-entry.css']),
      resourcesByAsset,
    })

    expect([...result]).toEqual(['entry/root-style.bundle.wxss'])
  })

  it('maps css assets to webpack module resources from chunk graph without filename matching', () => {
    const cssMatcher = (file: string) => file.endsWith('.wxss')
    const result = createWebpackCssAssetResourceMap(
      [
        {
          id: 'entry-runtime',
          files: ['entry/root-style.bundle.wxss'],
        },
      ],
      {
        getChunkModulesIterable: () => [
          { resource: '/workspace/src/styles/root-entry.css?type=style' },
          { resource: '/workspace/src/pages/index.tsx' },
        ],
      },
      cssMatcher,
      resource => stripResourceQuery(resource),
    )

    expect(result.get('entry/root-style.bundle.wxss')).toEqual(new Set([
      '/workspace/src/styles/root-entry.css',
      '/workspace/src/pages/index.tsx',
    ]))
  })

  it('maps mini-css-extract identifiers to their replacement css resource', () => {
    const cssMatcher = (file: string) => file.endsWith('.acss')
    const result = createWebpackDirectCssAssetResourceMap(
      [
        {
          id: 'entry-runtime',
          files: ['entry/root-style.bundle.acss', 'entry/runtime.js'],
        },
      ],
      {
        getChunkModulesIterable: () => [
          {
            identifier: () => 'css|/loaders/css-loader.js!/loaders/postcss-loader.js!/workspace/src/styles/replacement.css|0|||}}',
            type: 'css/mini-extract',
          },
        ],
      },
      cssMatcher,
      resource => stripResourceQuery(resource),
    )

    expect(result.get('entry/root-style.bundle.acss')).toEqual(new Set([
      '/workspace/src/styles/replacement.css',
    ]))
  })

  it('keeps mini-css-extract identifiers out of the transitive css resource map', () => {
    const result = createWebpackCssAssetResourceMap(
      [{ id: 'entry-runtime', files: ['app.acss'] }],
      {
        getChunkModulesIterable: () => [
          {
            identifier: () => 'css|/loaders/css-loader.js!/workspace/src/app.single.css|0|||}}',
            type: 'css/mini-extract',
          },
        ],
      },
      file => file.endsWith('.acss'),
      resource => stripResourceQuery(resource),
    )

    expect(result).toEqual(new Map())
  })

  it('does not claim direct css ownership when one webpack chunk emits multiple css assets', () => {
    const cssMatcher = (file: string) => file.endsWith('.wxss')
    const result = createWebpackDirectCssAssetResourceMap(
      [
        {
          id: 'runtime-entry',
          files: ['app.wxss', 'styles/app-hash.wxss', 'pages/index.wxss'],
        },
      ],
      {
        getChunkModulesIterable: () => [
          {
            identifier: () => 'css|/loaders/css-loader.js!/workspace/src/app.css|0|||}}',
            type: 'css/mini-extract',
          },
        ],
      },
      cssMatcher,
      resource => stripResourceQuery(resource),
    )

    expect(result).toEqual(new Map())
  })

  it('resolves the only active webpack css module resource for generated web css assets', () => {
    expect(resolveSingleActiveWebpackCssResource(
      new Set(['/workspace/demo/src/sub-normal/pages/index.css']),
      new Set(['/workspace/demo/src/sub-normal/pages/index.css']),
    )).toBe('/workspace/demo/src/sub-normal/pages/index.css')

    expect(resolveSingleActiveWebpackCssResource(
      new Set([
        '/workspace/demo/src/sub-normal/pages/index.css',
        '/workspace/demo/src/sub-normal/pages/other.css',
      ]),
      new Set([
        '/workspace/demo/src/sub-normal/pages/index.css',
        '/workspace/demo/src/sub-normal/pages/other.css',
      ]),
    )).toBeUndefined()

    expect(resolveSingleActiveWebpackCssResource(
      new Set(['/workspace/demo/src/sub-normal/pages/index.css']),
      new Set(['/workspace/demo/src/app.css']),
    )).toBeUndefined()
  })

  it('collects nested webpack css module resources from chunk graph modules', () => {
    const cssMatcher = (file: string) => file.endsWith('.wxss')
    const result = createWebpackCssAssetResourceMap(
      [
        {
          id: 'runtime-entry',
          files: ['entry/root-style.bundle.wxss'],
          hasRuntime: () => true,
        },
      ],
      {
        getModule: dependency => (dependency as { resolvedModule?: any }).resolvedModule,
        getChunkModulesIterable: () => [
          {
            modules: [
              { resource: '/workspace/src/styles/root-entry.css?type=style' },
              {
                rootModule: {
                  userRequest: '/workspace/src/pages/index.css',
                },
              },
            ],
            dependencies: [
              {
                resolvedModule: {
                  resource: '/workspace/node_modules/ui/dist/style.css',
                },
              },
            ],
          },
        ],
      },
      cssMatcher,
      resource => stripResourceQuery(resource),
    )

    expect(result.get('entry/root-style.bundle.wxss')).toEqual(new Set([
      '/workspace/src/styles/root-entry.css',
      '/workspace/src/pages/index.css',
      '/workspace/node_modules/ui/dist/style.css',
    ]))
  })

  it('maps css assets from webpack dependency requests relative to the issuer module', () => {
    const cssMatcher = (file: string) => file.endsWith('.wxss')
    const result = createWebpackCssAssetResourceMap(
      [
        {
          id: 'subpackage-page',
          files: ['sub-normal/pages/index.wxss'],
        },
      ],
      {
        getChunkModulesIterable: () => [
          {
            resource: '/workspace/src/sub-normal/pages/index.vue',
            dependencies: [
              { request: './index.css' },
            ],
          },
        ],
      },
      cssMatcher,
      (resource, issuer) => {
        if (!isCssLikeModuleResource(resource, file => file.endsWith('.css'))) {
          return undefined
        }
        const normalized = stripResourceQuery(resource)
        if (!normalized) {
          return undefined
        }
        if (normalized.startsWith('.')) {
          const issuerResource = issuer?.resource ? stripResourceQuery(issuer.resource) : undefined
          return issuerResource ? `${issuerResource.slice(0, issuerResource.lastIndexOf('/'))}/${normalized.replace(/^\.\//, '')}` : undefined
        }
        return normalized
      },
    )

    expect(result.get('sub-normal/pages/index.wxss')).toEqual(new Set([
      '/workspace/src/sub-normal/pages/index.css',
    ]))
  })

  it('scores generated subpackage css assets against registered source css files', async () => {
    const { scoreTailwindV4CssSourceFileMatch } = await import('@/generation/source-resolver/matching')

    const matchedScore = scoreTailwindV4CssSourceFileMatch(
      'sub-normal/pages/index.wxss',
      '/workspace/demo/src/sub-normal/pages/index.css',
      {
        outputRoot: '/workspace/demo/dist',
        projectRoot: '/workspace/demo',
        cwd: '/workspace/demo',
      },
    )
    const basenameOnlyScore = scoreTailwindV4CssSourceFileMatch(
      'sub-normal/pages/index.wxss',
      '/workspace/demo/src/sub-independent/pages/index.css',
      {
        outputRoot: '/workspace/demo/dist',
        projectRoot: '/workspace/demo',
        cwd: '/workspace/demo',
      },
    )

    expect(matchedScore).toBeGreaterThanOrEqual(1000)
    expect(basenameOnlyScore).toBeLessThan(1000)
  })
})
