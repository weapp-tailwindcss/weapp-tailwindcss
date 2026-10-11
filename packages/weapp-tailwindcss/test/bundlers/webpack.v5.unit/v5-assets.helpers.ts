import { describe, expect, it } from 'vitest'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import {
  addRuntimeTransformCandidates,
  collectGeneratedCssRuntimeCandidates,
  collectWebpackJsRuntimeCandidatesFromAssets,
  collectWebpackJsRuntimeTokenSignature,
  collectRuntimeTokenSignatureParts,
  collectWebpackAssetUserCssMarkers,
  collectWebpackBareSelectorUserCss,
  collectWebpackCssRuleIdentityMarkers,
  createWebpackGeneratorCssSource,
  createWebpackGeneratorUserCssSourceAppend,
  createWebpackCssSourceTraceTokenSources,
  createWebpackCurrentAssetUserRawSource,
  createWebpackUserCssSourceAppend,
  finalizeMiniProgramUserCssAssetSource,
  finalizeTracedWebpackCssAsset,
  finalizeWebpackCssAssetOutputSource,
  finalizeWebpackCssAssetSource,
  getRuntimeClassSetSync,
  hasAdditionalWebpackAssetUserCssMarkers,
  hasDeferredWebpackGeneratedCss,
  hasMissingRuntimeCandidates,
  hasProcessedCssAssetUrl,
  hasUsableWebpackGeneratorCssSources,
  hasStaleRuntimeCandidates,
  hasWebpackTailwindSourceDirectives,
  isRuntimeTransformCandidate,
  isWebpackCssSourceRepresentedInAsset,
  isWebpackTailwindImportRequest,
  normalizeWebpackUserCssFallbackSource,
  normalizeWebpackGeneratorCssSources,
  parseWebpackCssLayerNames,
  pruneMapToMaxSize,
  pruneWebpackCssHandlerOptionCaches,
  removeTailwindV4StandaloneHostPreflightRule,
  removeWebpackGeneratorNonTailwindImports,
  removeWebpackTailwindGeneratedAssetCss,
  removeWebpackUserCssFallbackImports,
  resolveGeneratedCssRuntimeCandidates,
  resolveWebpackCssAssetModuleResource,
  resolveWebpackGeneratorRawSource,
  scopeWebpackGeneratorOptionsToCssSource,
  isSameWebpackCssSourceScope,
  shouldFallbackToWebpackUserCssOnGeneratorError,
  shouldAppendCurrentWebpackAssetUserCss,
  shouldConsumeWebpackLoaderGeneratedCss,
  shouldUseWebpackAssetAsGeneratorUserCss,
  shouldInjectWebpackCssTracePreflight,
  stringifyOptionalWebpackSourceValue,
  stringifyWebpackSourceLike,
  stripTrailingLineWhitespace,
  toMb,
  unescapeCssIdentifier,
} from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets'
import { createEscapeFragments } from '@/bundlers/shared/runtime-class-set/escaped-candidates'
import { createContext, path } from './shared'

class TestWebpackSource {
  constructor(private readonly value: string | { toString: () => string }) {}

  source() {
    return this.value
  }
}

describe('bundlers/webpack v5-assets helpers', () => {
  it('removes only standalone :host Tailwind theme preflight rules', () => {
    expect(removeTailwindV4StandaloneHostPreflightRule('.card{color:red}')).toBe('.card{color:red}')
    expect(removeTailwindV4StandaloneHostPreflightRule(':host{color:red}.card{color:blue}')).toBe(':host{color:red}.card{color:blue}')
    expect(removeTailwindV4StandaloneHostPreflightRule(':host{color:red}.card{--tw:--theme(color.red.500)}')).toBe(':host{color:red}.card{--tw:--theme(color.red.500)}')
    expect(removeTailwindV4StandaloneHostPreflightRule(':host{--tw:--theme(color.red.500)}\n.card{color:red}')).toBe('.card{color:red}')
    expect(removeTailwindV4StandaloneHostPreflightRule(':host{--tw:--theme(')).toBe(':host{--tw:--theme(')
  })

  it('filters runtime transform candidates and missing runtime candidates', () => {
    expect(isRuntimeTransformCandidate('bg-red-500')).toBe(true)
    expect(isRuntimeTransformCandidate('')).toBe(false)
    expect(isRuntimeTransformCandidate('foo=bar')).toBe(false)
    expect(isRuntimeTransformCandidate('<view>')).toBe(false)
    expect(isRuntimeTransformCandidate('text-${color}')).toBe(false)
    expect(hasMissingRuntimeCandidates(undefined, new Set(['bg-red-500']))).toBe(false)
    expect(hasMissingRuntimeCandidates(new Set(['bg-red-500']), undefined)).toBe(false)
    expect(hasMissingRuntimeCandidates(new Set(['bg-red-500']), new Set(['bg-red-500']))).toBe(false)
    expect(hasMissingRuntimeCandidates(new Set(['bg-red-500']), new Set(['bg-blue-500']))).toBe(true)
    expect(hasMissingRuntimeCandidates(new Set<string>(), new Set(['foo=bar']))).toBe(false)
    expect(hasStaleRuntimeCandidates(undefined, new Set(['bg-red-500']))).toBe(false)
    expect(hasStaleRuntimeCandidates(new Set(['bg-red-500']), undefined)).toBe(false)
    expect(hasStaleRuntimeCandidates(new Set(['bg-red-500']), new Set(['bg-red-500']))).toBe(false)
    expect(hasStaleRuntimeCandidates(new Set(['bg-red-500', 'text-[102.43rpx]']), new Set(['bg-red-500']))).toBe(true)
    expect(hasStaleRuntimeCandidates(new Set(['foo=bar']), new Set<string>())).toBe(false)
  })

  it('collects runtime token signatures and generated css runtime candidates', () => {
    expect(collectRuntimeTokenSignatureParts('foo c_bg_Red alpha_Beta-1 no_match')).toEqual(['c_bg_Red', 'alpha_Beta-1', 'no_match'])
    const fallback = new Set(['fallback'])
    expect(resolveGeneratedCssRuntimeCandidates('.plain{color:red}', fallback)).toBe(fallback)
    expect(resolveGeneratedCssRuntimeCandidates('/*! tailwindcss v4.0.0 */ .bg-red-500{color:red}', fallback)).toEqual(new Set(['bg-red-500']))
    expect(resolveGeneratedCssRuntimeCandidates('/*! tailwindcss v4.0.0 */ .foo\\:bar{color:red}')).toEqual(new Set(['foo:bar']))
    expect(collectGeneratedCssRuntimeCandidates('/*! tailwindcss v4.0.0 */ .foo\\3d bar{color:red}')).toEqual(new Set())
    expect(collectGeneratedCssRuntimeCandidates('/*! tailwindcss v4.0.0 */ .foo{')).toEqual(new Set())
  })

  it('reads runtime class set synchronously with fallback for unsupported runtimes', () => {
    expect(getRuntimeClassSetSync({} as any)).toEqual(new Set())
    expect(getRuntimeClassSetSync({ getClassSetSync: () => undefined } as any)).toEqual(new Set())
    expect(getRuntimeClassSetSync({ getClassSetSync: () => ['a', 'b'] } as any)).toEqual(new Set(['a', 'b']))
    expect(getRuntimeClassSetSync({ getClassSetSync: () => { throw new Error('fail') } } as any)).toEqual(new Set())
  })

  it('collects webpack js runtime candidates and token signatures from assets', () => {
    const escapeFragments = createEscapeFragments(MappingChars2String)
    const assets = new Map<string, any>([
      ['a.js', 'const cls = "bg-_b_h123456_B _e invalid=value"'],
      ['b.js', new TestWebpackSource({ toString: () => 'const marker = "foo_Bar baz_Qux"' })],
      ['c.js', 'const cls = "foo_B_g"'],
    ])
    const getAssetSource = (file: string) => assets.get(file)
    expect(collectWebpackJsRuntimeCandidatesFromAssets({
      escapeFragments,
      getAssetSource,
      isWebGeneratorTarget: true,
      jsAssets: ['a.js'],
    })).toBeUndefined()
    expect(collectWebpackJsRuntimeCandidatesFromAssets({
      escapeFragments,
      getAssetSource,
      isWebGeneratorTarget: false,
      jsAssets: ['missing.js', 'a.js'],
    })).toEqual(new Set(['bg-[#123456]']))
    expect(collectWebpackJsRuntimeCandidatesFromAssets({
      escapeFragments,
      getAssetSource,
      isWebGeneratorTarget: false,
      jsAssets: ['c.js'],
    })).toEqual(new Set())
    expect(collectWebpackJsRuntimeTokenSignature({
      getAssetSource,
      isWebGeneratorTarget: true,
      jsAssets: ['b.js'],
    })).toBe('')
    expect(collectWebpackJsRuntimeTokenSignature({
      getAssetSource,
      isWebGeneratorTarget: false,
      jsAssets: ['missing.js', 'b.js'],
    })).toBe('baz_Qux\nfoo_Bar')
    expect(stringifyWebpackSourceLike('plain')).toBe('plain')
    expect(stringifyWebpackSourceLike(new TestWebpackSource({ toString: () => 'object-source' }) as any)).toBe('object-source')

    const target = new Set(['base'])
    addRuntimeTransformCandidates(target, undefined)
    addRuntimeTransformCandidates(target, new Set(['bg-red-500', 'foo=bar']))
    expect(target).toEqual(new Set(['base', 'bg-red-500']))

    expect(stringifyOptionalWebpackSourceValue('plain')).toBe('plain')
    expect(stringifyOptionalWebpackSourceValue({ toString: () => 'object' })).toBe('object')
    expect(stringifyOptionalWebpackSourceValue(undefined)).toBe('')
  })

  it('covers small cache and string helpers', () => {
    expect(toMb(2 * 1024 * 1024 + 100)).toBe(2)
    expect(stripTrailingLineWhitespace('a  \n\tb\t\nc')).toBe('a\n\tb\nc')

    const map = new Map<string, number>([['a', 1], ['b', 2], ['c', 3]])
    pruneMapToMaxSize(map, 2)
    expect([...map.keys()]).toEqual(['b', 'c'])
    pruneMapToMaxSize(map, 3)
    expect([...map.keys()]).toEqual(['b', 'c'])
    pruneMapToMaxSize(new Map(), 0)
    const undefinedKeyMap = new Map<any, number>([[undefined, 1], ['next', 2]])
    pruneMapToMaxSize(undefinedKeyMap, 0)
    expect([...undefinedKeyMap.keys()]).toEqual([undefined, 'next'])
  })

  it('prunes webpack css handler option caches by active css assets and max size', () => {
    const cssHandlerOptionsCache = new Map<string, any>([
      ['4:1:src:hash:generator:app.wxss', {}],
      ['4:1:src:hash:generator:stale.wxss', {}],
    ])
    const cssUserHandlerOptionsCache = new Map<string, any>()
    for (let index = 0; index < 130; index++) {
      cssUserHandlerOptionsCache.set(`key-${index}:app.wxss`, {})
    }
    pruneWebpackCssHandlerOptionCaches(cssHandlerOptionsCache, cssUserHandlerOptionsCache, new Set(['app.wxss']))
    expect([...cssHandlerOptionsCache.keys()]).toEqual(['4:1:src:hash:generator:app.wxss'])
    expect(cssUserHandlerOptionsCache.size).toBe(128)
    expect(cssUserHandlerOptionsCache.has('key-0:app.wxss')).toBe(false)
    expect(cssUserHandlerOptionsCache.has('key-129:app.wxss')).toBe(true)
  })

  it('resolves generator raw source from explicit Tailwind source css', () => {
    expect(resolveWebpackGeneratorRawSource('.asset{}', { isMainChunk: true, postcssOptions: { options: { from: 'app.wxss' } } })).toBe('.asset{}')
    expect(resolveWebpackGeneratorRawSource('.asset{}', {
      isMainChunk: true,
      postcssOptions: { options: { from: 'app.wxss' } },
      sourceOptions: {
        sourceCss: '@tailwind utilities;',
      },
    })).toBe('@tailwind utilities;')
    expect(resolveWebpackGeneratorRawSource('.asset{}', {
      isMainChunk: true,
      postcssOptions: { options: { from: 'app.wxss' } },
      sourceOptions: {
        sourceCss: '/*! tailwindcss v4.0.0 */ .bg-red-500{color:red}',
      },
    })).toBe('/*! tailwindcss v4.0.0 */ .bg-red-500{color:red}')
  })

  it('regenerates explicit Tailwind v4 source css in watch when loader output misses fresh candidates', () => {
    expect(shouldConsumeWebpackLoaderGeneratedCss({
      hasBundlerGeneratedCssMarker: false,
      shouldRegenerateExplicitTailwindV4CssSource: false,
    })).toBe(true)
    expect(shouldConsumeWebpackLoaderGeneratedCss({
      hasBundlerGeneratedCssMarker: true,
      shouldRegenerateExplicitTailwindV4CssSource: false,
    })).toBe(true)
    expect(shouldConsumeWebpackLoaderGeneratedCss({
      hasBundlerGeneratedCssMarker: true,
      shouldRegenerateExplicitTailwindV4CssSource: true,
    })).toBe(true)
    expect(shouldConsumeWebpackLoaderGeneratedCss({
      allowMarkerlessRegistryMatch: true,
      hasBundlerGeneratedCssMarker: false,
      loaderGeneratedClassSet: new Set(['i-[mdi--github-circle]']),
      sourceCandidates: new Set(['i-[mdi--github-circle]']),
      shouldRegenerateExplicitTailwindV4CssSource: true,
      watchMode: false,
    })).toBe(true)
    expect(shouldConsumeWebpackLoaderGeneratedCss({
      hasBundlerGeneratedCssMarker: true,
      loaderGeneratedClassSet: new Set(['bg-red-500']),
      sourceCandidates: new Set(['bg-red-500']),
      shouldRegenerateExplicitTailwindV4CssSource: true,
    })).toBe(true)
    expect(shouldConsumeWebpackLoaderGeneratedCss({
      hasBundlerGeneratedCssMarker: true,
      loaderGeneratedClassSet: new Set(['bg-red-500']),
      sourceCandidates: new Set(['bg-red-500', 'text-[102.43rpx]']),
      shouldRegenerateExplicitTailwindV4CssSource: true,
    })).toBe(true)
    expect(shouldConsumeWebpackLoaderGeneratedCss({
      hasBundlerGeneratedCssMarker: true,
      loaderGeneratedClassSet: new Set(['bg-red-500']),
      sourceCandidates: new Set(['bg-red-500', 'text-[102.43rpx]']),
      shouldRegenerateExplicitTailwindV4CssSource: true,
      watchMode: true,
    })).toBe(true)
    expect(shouldConsumeWebpackLoaderGeneratedCss({
      hasBundlerGeneratedCssMarker: true,
      loaderGeneratedClassSet: new Set(['bg-red-500', 'tw-watch-style-mpx-tailwindcss-v4-rollback']),
      sourceCandidates: new Set(['bg-red-500']),
      shouldRegenerateExplicitTailwindV4CssSource: true,
      watchMode: true,
    })).toBe(false)
  })

  it('detects deferred generated css through registered raw selectors', () => {
    const classSets = [new Set(['i-[mdi--github-circle]', 'bg-red-500'])]
    expect(hasDeferredWebpackGeneratedCss(
      '/*! weapp-tailwindcss webpack-generated-css:%2Fapp.css */ .i-\\[mdi--github-circle\\]{color:red}',
      classSets,
    )).toBe(true)
    expect(hasDeferredWebpackGeneratedCss(
      '.i-_bmdi--github-circle_B{color:red}',
      classSets,
    )).toBe(false)
  })

  it('scopes webpack generator cssEntries to the current css source file', () => {
    const appCss = path.resolve('/workspace/src/app.css')
    const subCss = path.resolve('/workspace/src/sub/pages/index.css')
    const options = createContext({
      cssEntries: [appCss, subCss],
      tailwindcss: {
        v4: {
          cssEntries: [appCss, subCss],
        },
      },
    } as any)

    const scoped = scopeWebpackGeneratorOptionsToCssSource(options as any, subCss)
    expect(scoped).not.toBe(options)
    expect(scoped.cssEntries).toEqual([subCss])
    expect(scoped.tailwindcss?.v4?.cssEntries).toEqual([subCss])
    expect(options.cssEntries).toEqual([appCss, subCss])
    expect(options.tailwindcss?.v4?.cssEntries).toEqual([appCss, subCss])
  })

  it('keeps webpack generator options unchanged without a matching css entry source', () => {
    const options = createContext({
      cssEntries: ['/workspace/src/app.css'],
      tailwindcss: {
        v4: {
          cssEntries: ['/workspace/src/app.css'],
        },
      },
    } as any)

    expect(scopeWebpackGeneratorOptionsToCssSource(options as any, undefined)).toBe(options)
    expect(scopeWebpackGeneratorOptionsToCssSource(options as any, '/workspace/src/unknown.css')).toBe(options)
  })

  it('clears webpack generator cssEntries for unmatched main css assets', () => {
    const options = createContext({
      cssEntries: ['/workspace/src/app.css'],
      tailwindcss: {
        v4: {
          cssEntries: ['/workspace/src/app.css'],
        },
      },
    } as any)

    const scoped = scopeWebpackGeneratorOptionsToCssSource(options as any, undefined, {
      disableUnmatchedCssEntries: true,
    })
    expect(scoped).not.toBe(options)
    expect(scoped.cssEntries).toEqual([])
    expect(scoped.tailwindcss?.v4?.cssEntries).toEqual([])
    expect(options.cssEntries).toEqual(['/workspace/src/app.css'])

    const scopedWithUnmatchedSource = scopeWebpackGeneratorOptionsToCssSource(options as any, '/workspace/src/pages/index.css', {
      disableUnmatchedCssEntries: true,
    })
    expect(scopedWithUnmatchedSource).not.toBe(options)
    expect(scopedWithUnmatchedSource.cssEntries).toEqual([])
    expect(scopedWithUnmatchedSource.tailwindcss?.v4?.cssEntries).toEqual([])
  })

  it('normalizes generator css source arrays', () => {
    expect(hasUsableWebpackGeneratorCssSources(undefined)).toBe(false)
    expect(hasUsableWebpackGeneratorCssSources([{ css: '', file: 'empty.css', base: '.', dependencies: [] } as any])).toBe(false)
    expect(hasUsableWebpackGeneratorCssSources([{ css: '@tailwind utilities;', file: 'app.css', base: '.', dependencies: [] } as any])).toBe(true)
    expect(normalizeWebpackGeneratorCssSources(undefined)).toBeUndefined()
    expect(normalizeWebpackGeneratorCssSources([])).toBeUndefined()
    expect(normalizeWebpackGeneratorCssSources([
      { css: '', file: 'empty.css', base: '.', dependencies: [] } as any,
      { css: '@tailwind utilities;', file: 'app.css', base: '.', dependencies: [] } as any,
    ])).toEqual([{ css: '@tailwind utilities;', file: 'app.css', base: '.', dependencies: [] }])
    expect(createWebpackGeneratorCssSource(undefined, '@tailwind utilities;')).toBeUndefined()
    expect(createWebpackGeneratorCssSource('/repo/app.css', '.card{}')).toBeUndefined()
    expect(createWebpackGeneratorCssSource('/repo/app.css', '@tailwind utilities;')).toEqual({
      file: '/repo/app.css',
      base: '/repo',
      css: '@tailwind utilities;',
      dependencies: ['/repo/app.css'],
    })
  })

  it('detects processed css asset urls and generator user css eligibility', () => {
    expect(hasProcessedCssAssetUrl('.icon{background:url(data:image/svg+xml,a)}')).toBe(true)
    expect(hasProcessedCssAssetUrl('.icon{background:url("data:image/svg+xml,%3Csvg%3E")}')).toBe(true)
    expect(hasProcessedCssAssetUrl('.icon{background:url(  \'data:image/png;base64,AAAA\'  )}')).toBe(true)
    expect(hasProcessedCssAssetUrl('.icon{background:url("/a.svg")}')).toBe(false)
    expect(hasProcessedCssAssetUrl('.icon{background:url(https://example.com/a.svg)}')).toBe(false)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('.card{color:red}', '.generated{}')).toBe(true)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('abc{background:#222}', '.generated{}')).toBe(true)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('wx-button{background:#444}', '.generated{}')).toBe(true)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('button::after{display:none;border:none;content:""}', '.generated{}')).toBe(true)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('.card{background:url(data:image/svg+xml,a)}', '.generated{}')).toBe(false)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('.card{background:url(data:image/svg+xml,a)}', '.generated{}', { processed: true })).toBe(true)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('@tailwind utilities;', '.generated{}')).toBe(false)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('/*! tailwindcss v4.0.0 */ .bg-red-500{color:red}', '/*! tailwindcss v4.0.0 */ .bg-red-500{color:red}')).toBe(false)
    expect(shouldUseWebpackAssetAsGeneratorUserCss('/*! tailwindcss v4.0.0 */ .bg-red-500{color:red}.card{color:blue}', '/*! tailwindcss v4.0.0 */ .bg-red-500{color:red}')).toBe(true)
  })

  it('collects user css markers from selectors, custom properties, keyframes and font faces', () => {
    expect(collectWebpackAssetUserCssMarkers([
      '.card,.escaped\\:hover{--brand:red;color:red}',
      'page{display:block}',
      '@keyframes spin{to{opacity:1}}',
      '@font-face{font-family:"Icon Font";src:url(icon.woff2)}',
    ].join('\n'))).toEqual(new Set([
      'class:card',
      'class:escaped\\:hover',
      'class:woff2',
      'selector:page',
      'selector:to',
      'custom-property:--brand',
      'keyframes:spin',
      'font-face:"Icon Font"',
    ]))
    expect(collectWebpackAssetUserCssMarkers('@layer base{button::after,wx-button::after{display:none;border:none;content:""}wx-button{background:#000}}')).toEqual(new Set([
      'selector:button::after',
      'selector:wx-button::after',
      'selector:wx-button',
    ]))
    expect(collectWebpackAssetUserCssMarkers('.card{')).toEqual(new Set(['class:card']))
  })

  it('collects bare selector user css without class rules and keyframes', () => {
    expect(collectWebpackBareSelectorUserCss([
      '@import "./theme.css";',
      '@config "../tailwind.config.js";',
      '@source "../src";',
      '@custom-variant wx { @slot; }',
      '.card{color:red}',
      '.issue-941-bg-image{background-image:url("./issue-941-asset.svg")}',
      'button::after,wx-button::after{display:none;border:none;content:""}',
      'wx-button{background:#000}',
      'abc{background:#222}',
      '@font-face{font-family:"Icon Font";src:url(icon.woff2)}',
      '@keyframes spin{to{transform:rotate(360deg)}}',
    ].join('\n'))).toBe([
      'button::after,wx-button::after{display:none;border:none;content:""}',
      'wx-button{background:#000}',
      'abc{background:#222}',
    ].join('\n'))
    expect(collectWebpackBareSelectorUserCss('@layer base{wx-button{background:#444}abc{background:#222}button::after{content:""}}@layer components{.card{color:red}}')).toBe('@layer base{wx-button{background:#444}abc{background:#222}button::after{content:""}}')
  })

  it('parses and removes webpack Tailwind generated layer css', () => {
    expect(parseWebpackCssLayerNames('theme, utilities, components')).toEqual(['theme', 'utilities', 'components'])
    expect(parseWebpackCssLayerNames(' , base , ')).toEqual(['base'])
    expect(removeWebpackTailwindGeneratedAssetCss('@layer theme, utilities;\n@layer components{.btn{color:red}}')).toBe('@layer components{.btn{color:red}}')
    expect(removeWebpackTailwindGeneratedAssetCss('@layer theme{.bg-red-500{color:red}}\n@layer components{.btn{color:red}}')).toBe('@layer components{.btn{color:red}}')
    expect(removeWebpackTailwindGeneratedAssetCss('@layer base{button::after,wx-button::after{display:none;border:none;content:""}wx-button{background:#000}}')).toBe('@layer base{button::after,wx-button::after{display:none;border:none;content:""}wx-button{background:#000}}')
    expect(removeWebpackTailwindGeneratedAssetCss('@layer utilities{.bg-\\[\\#222222\\]{color:red}.text-\\[\\#fff\\]{color:white}}\n.site-shell{display:grid}\n:root{--site-shell-gap:16px}')).toBe('.site-shell{display:grid}\n:root{--site-shell-gap:16px}')
    expect(removeWebpackTailwindGeneratedAssetCss('/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */\n.bg-\\[\\#111111\\]{background-color:#111111}.text-\\[\\#fff\\]{color:#fff}\n.site-shell{display:grid}\n:root{--site-shell-gap:16px}')).toBe('.site-shell{display:grid}\n:root{--site-shell-gap:16px}')
    expect(removeWebpackTailwindGeneratedAssetCss('@supports (display:grid){}')).toBe('')
    expect(removeWebpackTailwindGeneratedAssetCss('@media screen{@supports (display:grid){}}')).toBe('')
    expect(removeWebpackTailwindGeneratedAssetCss('@layer components{}')).toBe('')
    expect(removeWebpackTailwindGeneratedAssetCss('@media screen{}')).toBe('')
    expect(removeWebpackTailwindGeneratedAssetCss('@layer components{.btn{color:red}}')).toBe('@layer components{.btn{color:red}}')
    expect(removeWebpackTailwindGeneratedAssetCss('@layer theme{')).toBe('@layer theme{')
  })

  it('collects css rule identity markers and unescapes identifiers', () => {
    expect(unescapeCssIdentifier('foo\\3a bar')).toBe('foo:bar')
    expect(unescapeCssIdentifier('foo\\:bar')).toBe('foo:bar')
    expect(collectWebpackCssRuleIdentityMarkers('.foo,.bar\\3a baz{color:red}@keyframes spin{to{}}')).toEqual(new Set([
      'class:foo',
      'class:bar\\3a',
      'keyframes:spin',
    ]))
    expect(collectWebpackCssRuleIdentityMarkers('.foo{color:red}@keyframes {to{}}')).toEqual(new Set(['class:foo']))
    expect(collectWebpackCssRuleIdentityMarkers('.foo{')).toEqual(new Set())
  })

  it('detects additional user css markers against generator css', () => {
    expect(hasAdditionalWebpackAssetUserCssMarkers('.card{color:red}', '.card{color:red}')).toBe(false)
    expect(hasAdditionalWebpackAssetUserCssMarkers('.card{color:red}.extra{color:blue}', '.card{color:red}')).toBe(true)
    expect(hasAdditionalWebpackAssetUserCssMarkers('}', '.card{color:red}')).toBe(false)
  })

  it('detects webpack Tailwind source directives and import requests', () => {
    expect(hasWebpackTailwindSourceDirectives(undefined)).toBe(false)
    expect(hasWebpackTailwindSourceDirectives('.card{}')).toBe(false)
    expect(hasWebpackTailwindSourceDirectives('@tailwind utilities;')).toBe(true)
    expect(hasWebpackTailwindSourceDirectives('@source "../pages";')).toBe(true)
    expect(hasWebpackTailwindSourceDirectives('.bg-red-500{color:red}/*! tailwindcss v4.0.0 */')).toBe(true)

    expect(isWebpackTailwindImportRequest(undefined)).toBeUndefined()
    expect(isWebpackTailwindImportRequest('tailwindcss')).toBe(true)
    expect(isWebpackTailwindImportRequest('tailwindcss/theme.css')).toBe(true)
    expect(isWebpackTailwindImportRequest('tailwindcss4')).toBe(true)
    expect(isWebpackTailwindImportRequest('tailwindcss4/utilities')).toBe(true)
    expect(isWebpackTailwindImportRequest('weapp-tailwindcss')).toBe(true)
    expect(isWebpackTailwindImportRequest('weapp-tailwindcss/index.css')).toBe(true)
    expect(isWebpackTailwindImportRequest('./local.css')).toBe(false)
  })

  it('removes non-Tailwind imports from generator source css', () => {
    expect(removeWebpackGeneratorNonTailwindImports(undefined)).toBeUndefined()
    expect(removeWebpackGeneratorNonTailwindImports('.card{}')).toBe('.card{}')
    expect(removeWebpackGeneratorNonTailwindImports([
      '@import "./theme.css";',
      '@import "tailwindcss";',
      '@import "weapp-tailwindcss/index.css";',
      '.card{color:red}',
    ].join('\n'))).toBe([
      '@import "tailwindcss";',
      '@import "weapp-tailwindcss/index.css";',
      '.card{color:red}',
    ].join('\n'))
    expect(removeWebpackGeneratorNonTailwindImports('@import "')).toBe('@import "')
  })

  it('removes imports from registered user css loader fallback source', () => {
    expect(removeWebpackUserCssFallbackImports([
      '@import "./theme.css";',
      '@import "tailwindcss";',
      'wx-button{background:#444}',
    ].join('\n'))).toBe('wx-button{background:#444}')
    expect(removeWebpackUserCssFallbackImports('abc{background:#222}')).toBe('abc{background:#222}')
    expect(removeWebpackUserCssFallbackImports('@import "')).toBe('@import "')
    expect(normalizeWebpackUserCssFallbackSource('@import "tailwindcss";\n@layer base{wx-button{background:#000}}')).toBe('wx-button{background:#000}')
  })

  it('checks whether source css is represented in webpack asset css', () => {
    expect(isWebpackCssSourceRepresentedInAsset('.card{color:red}', undefined)).toBe(false)
    expect(isWebpackCssSourceRepresentedInAsset('.card{color:red}', '@tailwind utilities;')).toBe(false)
    expect(isWebpackCssSourceRepresentedInAsset('.card{color:red}@keyframes fade{to{}}', [
      '@tailwind utilities;',
      '.card{color:red}',
      '@keyframes fade{to{}}',
    ].join('\n'))).toBe(true)
    expect(isWebpackCssSourceRepresentedInAsset('.card{color:red}', [
      '@tailwind utilities;',
      '.missing{color:red}',
    ].join('\n'))).toBe(false)
  })

  it('creates sorted and deduped user css appends', () => {
    expect(createWebpackUserCssSourceAppend([], '.generated{}')).toBeUndefined()
    expect(createWebpackUserCssSourceAppend([
      { file: '/repo/b.css', css: '.b{color:blue}', processed: true },
      { file: '/repo/a.css', css: '.a{color:red}', processed: true },
      { file: '/repo/dup.css', css: '.a{color:red}', processed: true },
      { file: '/repo/skip.css', css: '.skip{color:black}', processed: true },
      { file: '/repo/data.css', css: '.icon{background:url(data:image/svg+xml,a)}' },
    ], '.generated{}', '/repo/b.css', file => !file.endsWith('skip.css'))).toEqual({
      css: '.b{color:blue}\n.a{color:red}',
      processed: true,
    })
    expect(createWebpackUserCssSourceAppend([
      { file: '/repo/c.css', css: '.c{color:cyan}', processed: true },
      { file: '/repo/a.css', css: '.a{color:red}', processed: true },
      { file: '/repo/b.css', css: '.b{color:blue}', processed: true },
    ], '.generated{}', '/repo/b.css')).toEqual({
      css: '.b{color:blue}\n.a{color:red}\n.c{color:cyan}',
      processed: true,
    })
    expect(createWebpackUserCssSourceAppend([
      { file: '/repo/current.css', css: '.current{color:green}', processed: true },
      { file: '/repo/a.css', css: '.a{color:red}', processed: true },
    ], '.generated{}', '/repo/current.css')).toEqual({
      css: '.current{color:green}\n.a{color:red}',
      processed: true,
    })
    expect(createWebpackUserCssSourceAppend([
      { file: '/repo/a.css', css: '.generated{}', processed: true },
    ], '.generated{}')).toBeUndefined()
  })

  it('combines generator user css source parts without duplicating existing rules', () => {
    expect(createWebpackGeneratorUserCssSourceAppend(undefined)).toBeUndefined()
    expect(createWebpackGeneratorUserCssSourceAppend({ css: '   ', processed: true })).toBeUndefined()
    expect(createWebpackGeneratorUserCssSourceAppend(
      { css: '.a{color:red}', processed: true },
      { css: '.a{color:red}\n.b{color:blue}', processed: false },
    )).toEqual({
      css: '.a{color:red}\n.b{color:blue}',
      processed: false,
    })
    expect(createWebpackGeneratorUserCssSourceAppend(
      { css: '.a{color:red}', processed: true },
      { css: '.a{color:red}', processed: true },
    )).toEqual({
      css: '.a{color:red}',
      processed: true,
    })
  })

  it('resolves css trace preflight injection from chunk and source css content', () => {
    expect(shouldInjectWebpackCssTracePreflight(undefined, { isMainChunk: true })).toBe(true)
    expect(shouldInjectWebpackCssTracePreflight(undefined, { isMainChunk: false })).toBe(false)
    expect(shouldInjectWebpackCssTracePreflight('mpx', { isMainChunk: true })).toBe(true)
    expect(shouldInjectWebpackCssTracePreflight('mpx', { isMainChunk: false })).toBe(false)
    expect(shouldInjectWebpackCssTracePreflight(undefined, {
      isMainChunk: false,
      sourceOptions: {
        sourceCss: '@import "tailwindcss" source(none);',
      },
    })).toBe(true)
    expect(shouldInjectWebpackCssTracePreflight(undefined, {
      isMainChunk: false,
      sourceOptions: {
        sourceCss: '@tailwind base;',
      },
    })).toBe(true)
    expect(shouldInjectWebpackCssTracePreflight(undefined, {
      isMainChunk: false,
      sourceOptions: {
        sourceCss: '@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities) source(none);',
      },
    })).toBe(false)
  })

  it('resolves webpack css asset module resources from webpack module metadata', () => {
    const cssMatcher = (file: string) => file.endsWith('.css') || file.endsWith('.wxss')
    expect(resolveWebpackCssAssetModuleResource('/repo/src/app.css?modules', undefined, { cssMatcher })).toBe('/repo/src/app.css')
    expect(resolveWebpackCssAssetModuleResource('?type=styles', undefined, { appType: 'mpx', cssMatcher })).toBeUndefined()
    expect(resolveWebpackCssAssetModuleResource('./page.css?modules', { resource: '/repo/src/pages/index.js' }, { cssMatcher })).toBe('/repo/src/pages/page.css')
    expect(resolveWebpackCssAssetModuleResource('./page.css?modules', { context: '/repo/src/pages' }, { cssMatcher })).toBe('/repo/src/pages/page.css')
    expect(resolveWebpackCssAssetModuleResource('./page.css?modules', undefined, { cssMatcher })).toBeUndefined()
    expect(resolveWebpackCssAssetModuleResource('/repo/src/app.js', undefined, { cssMatcher })).toBeUndefined()
    expect(resolveWebpackCssAssetModuleResource('/repo/src/app.wxss?type=styles', undefined, { appType: 'mpx', cssMatcher })).toBe('/repo/src/app.wxss')
  })

  it('resolves Windows webpack css module resources without rewriting POSIX absolute resources', () => {
    const cssMatcher = (file: string) => file.endsWith('.css')
    expect(resolveWebpackCssAssetModuleResource('D:\\repo\\src\\app.css?modules', undefined, { cssMatcher })).toBe('D:\\repo\\src\\app.css')
    expect(resolveWebpackCssAssetModuleResource('./page.css?modules', { resource: 'D:\\repo\\src\\pages\\index.js' }, { cssMatcher })).toBe('D:\\repo\\src\\pages\\page.css')
    expect(resolveWebpackCssAssetModuleResource('./page.css?modules', { context: 'D:\\repo\\src\\pages' }, { cssMatcher })).toBe('D:\\repo\\src\\pages\\page.css')
    expect(resolveWebpackCssAssetModuleResource('/repo/src/app.css?modules', undefined, { cssMatcher })).toBe('/repo/src/app.css')
  })

  it('checks whether registered css sources share the same webpack output scope', () => {
    const resourcesByAsset = new Map<string, Set<string>>([
      ['pages/index.css', new Set(['/repo/src/pages/index.css'])],
    ])
    expect(isSameWebpackCssSourceScope({
      candidateSourceFile: '/repo/src/pages/index.css',
      outputFile: 'pages/index.css',
      resourcesByAsset,
    })).toBe(false)
    expect(isSameWebpackCssSourceScope({
      candidateSourceFile: '/repo/src/pages/index.css',
      currentSourceFile: '/repo/src/pages/index.css',
      outputFile: 'pages/index.css',
      resourcesByAsset,
    })).toBe(true)
    expect(isSameWebpackCssSourceScope({
      candidateSourceFile: '/repo/src/pages/index.css',
      currentSourceFile: '/repo/src/app.css',
      outputFile: 'pages/index.css',
      resourcesByAsset,
    })).toBe(true)
    expect(isSameWebpackCssSourceScope({
      candidateSourceFile: '/repo/src/other.css',
      currentSourceFile: '/repo/src/app.css',
      outputFile: 'pages/index.css',
      resourcesByAsset,
    })).toBe(false)
  })

  it('checks webpack css source scope across Windows resource keys', () => {
    const resourcesByAsset = new Map<string, Set<string>>([
      ['pages/index.css', new Set(['D:\\repo\\src\\pages\\index.css'])],
    ])
    expect(isSameWebpackCssSourceScope({
      candidateSourceFile: 'D:\\repo\\src\\pages\\index.css',
      currentSourceFile: 'D:\\repo\\src\\app.css',
      outputFile: 'pages/index.css',
      resourcesByAsset,
    })).toBe(true)
    expect(isSameWebpackCssSourceScope({
      candidateSourceFile: 'D:\\repo\\src\\other.css',
      currentSourceFile: 'D:\\repo\\src\\app.css',
      outputFile: 'pages/index.css',
      resourcesByAsset,
    })).toBe(false)
  })

  it('decides whether current webpack asset user css should be appended', () => {
    const base = {
      currentAssetHasBundlerGeneratedMarker: false,
      currentAssetHasUserCss: true,
      currentAssetLooksGenerated: false,
      registeredUserRawSource: undefined,
      shouldPreserveGeneratedWebAssetUserCss: false,
      sourceCssProcessed: false,
    }
    expect(shouldAppendCurrentWebpackAssetUserCss(base)).toBe(true)
    expect(shouldAppendCurrentWebpackAssetUserCss({ ...base, currentAssetHasBundlerGeneratedMarker: true })).toBe(false)
    expect(shouldAppendCurrentWebpackAssetUserCss({ ...base, shouldPreserveGeneratedWebAssetUserCss: true })).toBe(false)
    expect(shouldAppendCurrentWebpackAssetUserCss({ ...base, sourceCssProcessed: true, registeredUserRawSource: { css: '.registered{}', processed: true }, currentAssetHasUserCss: false })).toBe(false)
    expect(shouldAppendCurrentWebpackAssetUserCss({ ...base, sourceCssProcessed: true, registeredUserRawSource: { css: '.registered{}', processed: true }, currentAssetHasUserCss: true })).toBe(true)
    expect(shouldAppendCurrentWebpackAssetUserCss({ ...base, sourceCssProcessed: true, currentAssetLooksGenerated: true, currentAssetHasUserCss: false })).toBe(false)

    expect(createWebpackCurrentAssetUserRawSource({
      currentAssetHasUserCss: true,
      currentAssetLooksGenerated: false,
      currentAssetUserCssSource: '.asset{}',
      shouldAppendCurrentAssetUserCss: false,
      sourceCssProcessed: false,
    })).toBeUndefined()
    expect(createWebpackCurrentAssetUserRawSource({
      currentAssetHasUserCss: false,
      currentAssetLooksGenerated: false,
      currentAssetUserCssSource: '.asset{}',
      shouldAppendCurrentAssetUserCss: true,
      sourceCssProcessed: true,
    })).toEqual({ css: '.asset{}', processed: true })
    expect(createWebpackCurrentAssetUserRawSource({
      currentAssetHasUserCss: false,
      currentAssetLooksGenerated: false,
      currentAssetUserCssSource: '.asset{}',
      shouldAppendCurrentAssetUserCss: true,
      sourceCssProcessed: false,
    })).toBeUndefined()
    expect(createWebpackCurrentAssetUserRawSource({
      currentAssetHasUserCss: true,
      currentAssetLooksGenerated: true,
      currentAssetUserCssSource: '.asset{}',
      shouldAppendCurrentAssetUserCss: true,
      sourceCssProcessed: false,
    })).toEqual({ css: '.asset{}', processed: true })
  })

  it('decides when plain webpack css can fall back after generator errors', () => {
    expect(shouldFallbackToWebpackUserCssOnGeneratorError({
      configuredMainCssEntryFilesLength: 0,
      generatorRawSource: '.card{color:red}',
      hasExplicitTailwindV4SourceCss: false,
    })).toBe(true)
    expect(shouldFallbackToWebpackUserCssOnGeneratorError({
      configuredMainCssEntryFilesLength: 1,
      generatorRawSource: '.card{color:red}',
      hasExplicitTailwindV4SourceCss: false,
    })).toBe(false)
    expect(shouldFallbackToWebpackUserCssOnGeneratorError({
      configuredMainCssEntryFilesLength: 0,
      generatorRawSource: '@tailwind utilities;',
      hasExplicitTailwindV4SourceCss: false,
    })).toBe(false)
    expect(shouldFallbackToWebpackUserCssOnGeneratorError({
      configuredMainCssEntryFilesLength: 0,
      generatorRawSource: '@source "../pages";',
      hasExplicitTailwindV4SourceCss: false,
    })).toBe(false)
    expect(shouldFallbackToWebpackUserCssOnGeneratorError({
      configuredMainCssEntryFilesLength: 0,
      generatorRawSource: '.btn{@apply flex;}',
      hasExplicitTailwindV4SourceCss: false,
    })).toBe(false)
    expect(shouldFallbackToWebpackUserCssOnGeneratorError({
      configuredMainCssEntryFilesLength: 0,
      generatorRawSource: '.card{color:red}',
      hasExplicitTailwindV4SourceCss: true,
    })).toBe(false)
  })

  it('finalizes mini-program user css assets while preserving web target css', () => {
    const baseContext = createContext({
      cssPreflight: {
        'box-sizing': 'border-box',
      },
      cssRemoveHoverPseudoClass: true,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
      },
    } as any)
    expect(finalizeMiniProgramUserCssAssetSource('.card:hover{color:red}', baseContext as any, true)).toBe('.card:hover{color:red}')
    const finalized = finalizeMiniProgramUserCssAssetSource('.card,.card:hover{color:red}', baseContext as any, false)
    expect(finalized).not.toContain(':hover')
    expect(finalized).toContain('.card')
    const withoutPreflight = finalizeMiniProgramUserCssAssetSource('.card{color:red}', baseContext as any, false, {
      cssPreflight: false,
    })
    expect(withoutPreflight).toContain('.card')
  })

  it('finalizes traced webpack css assets according to target and trace options', () => {
    const cssHandlerOptions = {
      isMainChunk: false,
      postcssOptions: { options: { from: 'page.css' } },
    }
    const baseContext = createContext({
      appType: 'mpx',
      cssPreflight: {
        'box-sizing': 'border-box',
      },
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
      },
    } as any)
    expect(finalizeTracedWebpackCssAsset('.card{color:red}', cssHandlerOptions, {
      annotateCss: css => `traced:${css}`,
      compilerOptions: baseContext as any,
      isWebGeneratorTarget: true,
    })).toBe('traced:.card{color:red}')
    expect(finalizeTracedWebpackCssAsset('.card{color:red}', cssHandlerOptions, {
      annotateCss: css => `traced:${css}`,
      compilerOptions: baseContext as any,
      isWebGeneratorTarget: false,
    })).toBe('traced:.card{color:red}')
    const traceContext = {
      ...baseContext,
      cssSourceTrace: true,
    }
    expect(createWebpackCssSourceTraceTokenSources(baseContext as any, undefined)).toBeUndefined()
    expect(createWebpackCssSourceTraceTokenSources(baseContext as any, {
      getSourceCandidatesForEntries: () => new Set(),
      signatureHash: 'sig',
      tokenSources: new Map([['card', new Set(['/repo/src/page.wxml'])]]),
    })).toBeUndefined()
    expect(createWebpackCssSourceTraceTokenSources(traceContext as any, {
      getSourceCandidatesForEntries: () => new Set(),
      signatureHash: 'sig',
      tokenSources: new Map([['card', new Set(['/repo/src/page.wxml'])]]),
    })?.get('card')).toEqual({
      token: 'card',
      sources: ['/repo/src/page.wxml'],
    })
    const finalized = finalizeTracedWebpackCssAsset('.card{color:red}', cssHandlerOptions, {
      annotateCss: css => `/* tokens: card <= src/page.wxml */\n${css}`,
      compilerOptions: traceContext as any,
      isWebGeneratorTarget: false,
    })
    expect(finalized).toContain('tokens:')
    expect(finalized).toContain('.card')
    let annotatedCss = ''
    finalizeTracedWebpackCssAsset('.card:hover,.card{color:red}', cssHandlerOptions, {
      annotateCss: (css) => {
        annotatedCss = css
        return css
      },
      compilerOptions: traceContext as any,
      isWebGeneratorTarget: false,
    })
    expect(annotatedCss).toContain('.card')
    expect(annotatedCss).not.toContain(':hover')
    annotatedCss = ''
    finalizeTracedWebpackCssAsset('.card:hover,.card{color:red}', cssHandlerOptions, {
      annotateCss: (css) => {
        annotatedCss = css
        return css
      },
      compilerOptions: traceContext as any,
      finalized: true,
      isWebGeneratorTarget: false,
    })
    expect(annotatedCss).toContain(':hover')
  })

  it('finalizes webpack css asset sources for web and mini-program targets', () => {
    const baseContext = createContext({
      cssPreflight: {
        'box-sizing': 'border-box',
      },
      cssRemoveHoverPseudoClass: true,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
      },
    } as any)

    expect(finalizeWebpackCssAssetSource('@tailwind utilities;\n.card{color:red}', baseContext as any, true)).toBe('.card{color:red}')
    expect(finalizeWebpackCssAssetSource('/*! weapp-tailwindcss generated */\n.card{color:red}', baseContext as any, true, {
      generatedCss: true,
    })).toContain('.card')
    expect(finalizeWebpackCssAssetSource('.card:hover{color:red}', baseContext as any, false)).not.toContain(':hover')
    const finalAssetSource = [
      '@media (prefers-color-scheme: light) {}',
      '@media screen { @supports (display: grid) { /* removed */ } }',
      '@media (prefers-color-scheme: dark) { .card{background:#232323} }',
    ].join('\n')
    const finalizedAsset = finalizeWebpackCssAssetOutputSource(finalAssetSource, baseContext as any, false)
    expect(finalizedAsset).not.toContain('prefers-color-scheme: light')
    expect(finalizedAsset).not.toContain('@supports')
    expect(finalizedAsset).toContain('@media (prefers-color-scheme: dark) { .card{background:#232323} }')
    expect(finalizeWebpackCssAssetOutputSource(finalAssetSource, baseContext as any, true)).toBe(finalAssetSource)
    const layeredUserCss = finalizeWebpackCssAssetSource('@layer base{wx-button{background:#000}}abc{background:#222}', baseContext as any, false)
    expect(layeredUserCss).not.toContain('@layer')
    expect(layeredUserCss).toContain('wx-button{background:#000}')
    expect(layeredUserCss).toContain('abc{background:#222}')
    expect(finalizeWebpackCssAssetSource('@media {', baseContext as any, false, {
      generatedCss: true,
    })).toContain('@media')
    expect(finalizeWebpackCssAssetSource('view,text,::after,::before{border:0 solid}.card{color:red', baseContext as any, false, {
      generatedCss: true,
    })).toContain('.card')
    const withoutExistingPreflight = finalizeWebpackCssAssetSource(
      'view,text,::after,::before{border:0 solid;box-sizing:border-box;margin:0;padding:0;--tw-gradient-from:#0000}.card{color:red}',
      baseContext as any,
      false,
      {
        cssPreflight: false,
        generatedCss: true,
        preserveExistingPreflight: false,
      },
    )
    expect(withoutExistingPreflight).not.toContain('view,text,::after,::before')
    expect(withoutExistingPreflight).not.toContain('box-sizing:border-box')
    expect(withoutExistingPreflight).toContain('.card{color:red}')
    const dedupedPreflight = finalizeWebpackCssAssetSource(
      [
        'view,text,::after,::before{border:0 solid;box-sizing:border-box;margin:0;padding:0}',
        '.card{color:red}',
        'view,text,::after,::before{--tw-gradient-from:#0000}',
      ].join('\n'),
      baseContext as any,
      false,
      {
        cssPreflight: true,
        generatedCss: true,
      },
    )
    expect(dedupedPreflight.match(/view,text,::after,::before/g)).toHaveLength(1)
    expect(dedupedPreflight).toContain('--tw-gradient-from:#0000')
    const gradientCss = finalizeWebpackCssAssetSource([
      '.bg-gradient-to-r{',
      'background-image:linear-gradient(var(--tw-gradient-stops));',
      '--tw-gradient-position:to right in oklab',
      '}',
    ].join(''), baseContext as any, false, {
      generatedCss: true,
    })
    expect(gradientCss).toContain('--tw-gradient-position:to right')
    expect(gradientCss).not.toContain('in oklab')

    const defaultPreflightContext = createContext({
      cssRemoveHoverPseudoClass: true,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
      },
    } as any)
    const defaultPreflightCss = finalizeWebpackCssAssetSource([
      'view,text,::after,::before{--tw-content:""}',
      '.before_ccontent-test::before{--tw-content:"test";content:var(--tw-content)}',
    ].join(''), defaultPreflightContext as any, false, {
      generatedCss: true,
    })
    expect(defaultPreflightCss).toContain('border:0 solid')
    expect(defaultPreflightCss).toContain('box-sizing:border-box')
    expect(defaultPreflightCss).toContain('margin:0')
    expect(defaultPreflightCss).toContain('padding:0')
    expect(defaultPreflightCss).toContain('--tw-content:')
  })
})
