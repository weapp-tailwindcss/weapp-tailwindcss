import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { TailwindResolvedSource } from '@/generator/index'
import type { InternalUserDefinedOptions } from '@/types/index'
import { readFileSync } from 'node:fs'
import { filterExistingCssRules, normalizeLegacyCompatCssSource, removeMiniProgramContainerCompatCss, removeTailwindApplyRules, removeUnsupportedMiniProgramAtRules } from '@weapp-tailwindcss/postcss/transform'
import { stableSerialize } from '@/utils/stable-serialize'
import { resolveCssEntrySource } from './directives'
import { collectDedupedPostTransformCompatCss, collectGeneratedSelectors, removeDuplicatedViteMarkers, removeGeneratedSelectorCompatCss } from './legacy-selectors'
import { createCssAppend } from './markers'
import { resolveCssSourceBase } from './source-resolver'
import { removeTailwindV4GeneratedUserCssArtifacts } from './user-css'

const LEGACY_CONTAINER_COMPAT_CSS = [
  '.container {',
  '  width: 100%;',
  '}',
  '@media (min-width: 40rem) {',
  '  .container {',
  '    max-width: 40rem;',
  '  }',
  '}',
  '@media (min-width: 48rem) {',
  '  .container {',
  '    max-width: 48rem;',
  '  }',
  '}',
  '@media (min-width: 64rem) {',
  '  .container {',
  '    max-width: 64rem;',
  '  }',
  '}',
  '@media (min-width: 80rem) {',
  '  .container {',
  '    max-width: 80rem;',
  '  }',
  '}',
  '@media (min-width: 96rem) {',
  '  .container {',
  '    max-width: 96rem;',
  '  }',
  '}',
].join('\n')

const LEGACY_COMPAT_CACHE_LIMIT = 128
const legacyCompatSourceCache = new Map<string, string>()
const legacyCompatTransformCache = new Map<string, string>()

function setLimitedCacheValue(cache: Map<string, string>, key: string, value: string) {
  if (cache.size >= LEGACY_COMPAT_CACHE_LIMIT) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      cache.delete(firstKey)
    }
  }
  cache.set(key, value)
}

function createLegacyCompatTransformCacheKey(source: string, options: IStyleHandlerOptions) {
  return `${stableSerialize(options)}\0${source}`
}

export { removeTailwindApplyRules }

function resolveLegacyCompatCssSource(rawSource: string) {
  const cached = legacyCompatSourceCache.get(rawSource)
  if (cached !== undefined) {
    return cached
  }
  const resolved = normalizeLegacyCompatCssSource(rawSource)
  setLimitedCacheValue(legacyCompatSourceCache, rawSource, resolved)
  return resolved
}

function hasContainerConfigToken(rawSource: string) {
  return rawSource.includes('@config') && /\bcontainer\b/.test(rawSource)
}

function hasConfiguredContainerCompat(rawSource: string, file: string, cssHandlerOptions: IStyleHandlerOptions) {
  if (hasContainerConfigToken(rawSource)) {
    return true
  }

  const base = resolveCssSourceBase(file, cssHandlerOptions)
  const cssEntrySource = resolveCssEntrySource(rawSource, base)
  if (!cssEntrySource?.config) {
    return false
  }

  try {
    return /\bcontainer\b/.test(readFileSync(cssEntrySource.config, 'utf8'))
  }
  catch {
    return false
  }
}

function hasConfiguredContainerCompatSource(source: TailwindResolvedSource) {
  if (typeof source.css !== 'string') {
    return false
  }
  if (hasContainerConfigToken(source.css)) {
    return true
  }

  const cssEntrySource = resolveCssEntrySource(source.css, source.base)
  if (cssEntrySource?.config) {
    try {
      if (/\bcontainer\b/.test(readFileSync(cssEntrySource.config, 'utf8'))) {
        return true
      }
    }
    catch {
      // 可选配置不可读时忽略，继续走其他兼容判断。
    }
  }

  if ('config' in source && typeof source.config === 'string') {
    try {
      if (/\bcontainer\b/.test(readFileSync(source.config, 'utf8'))) {
        return true
      }
    }
    catch {
      // 可选配置不可读时忽略，继续走其他兼容判断。
    }
  }

  return false
}

export function hasConfiguredContainerCompatSources(sources: TailwindResolvedSource[]) {
  return sources.some(source => hasConfiguredContainerCompatSource(source))
}

export async function appendLegacyCompatCss(
  css: string,
  rawSource: string,
  generatorTarget: string,
  styleHandler: InternalUserDefinedOptions['styleHandler'],
  cssHandlerOptions: IStyleHandlerOptions,
  generatorStyleOptions: Partial<IStyleHandlerOptions> | undefined,
  options: { preserveSelectorOverrides?: boolean | undefined, generatedSource?: string | undefined, compileAuthorCssFunctions?: ((css: string) => Promise<string>) | undefined } = {},
) {
  const resolvedCompatSource = resolveLegacyCompatCssSource(rawSource)
  const normalizedCompatSource = generatorTarget === 'weapp'
    ? removeMiniProgramContainerCompatCss(resolvedCompatSource)
    : resolvedCompatSource
  const filteredCompatSource = options.preserveSelectorOverrides
    ? normalizedCompatSource
    : removeGeneratedSelectorCompatCss(normalizedCompatSource, css)
  if (filteredCompatSource.trim().length === 0) {
    return css
  }
  const compatSource = await options.compileAuthorCssFunctions?.(filteredCompatSource) ?? filteredCompatSource
  if (generatorTarget !== 'weapp') {
    return createCssAppend(css, compatSource)
  }

  const styleOptions = {
    ...cssHandlerOptions,
    ...generatorStyleOptions,
  }
  const compatCssCacheKey = createLegacyCompatTransformCacheKey(compatSource, styleOptions)
  let compatCss = legacyCompatTransformCache.get(compatCssCacheKey)
  if (compatCss === undefined) {
    const handled = await styleHandler(compatSource, styleOptions)
    compatCss = handled.css
    setLimitedCacheValue(legacyCompatTransformCache, compatCssCacheKey, compatCss)
  }
  const transformedCompatCss = removeTailwindV4GeneratedUserCssArtifacts(
    removeDuplicatedViteMarkers(removeUnsupportedMiniProgramAtRules(compatCss), css),
    options.generatedSource ?? css,
  )
  const cleanedCompatCss = options.preserveSelectorOverrides
    ? filterExistingCssRules(css, transformedCompatCss)
    : collectDedupedPostTransformCompatCss(transformedCompatCss, css)
  if (cleanedCompatCss.trim().length === 0) {
    return css
  }
  return createCssAppend(css, cleanedCompatCss)
}

export async function appendLegacyContainerCompatCss(
  css: string,
  rawSource: string,
  file: string,
  runtime: Set<string>,
  configuredContainerCompat: boolean,
  generatorTarget: string,
  styleHandler: InternalUserDefinedOptions['styleHandler'],
  cssHandlerOptions: IStyleHandlerOptions,
  generatorStyleOptions: Partial<IStyleHandlerOptions> | undefined,
) {
  if (generatorTarget === 'weapp') {
    return css
  }

  const compatSource = resolveLegacyCompatCssSource(rawSource)
  const shouldAppendContainer = runtime.has('container')
    || hasConfiguredContainerCompat(rawSource, file, cssHandlerOptions)
    || configuredContainerCompat
    || collectGeneratedSelectors(compatSource).has('.container')
  if (
    generatorTarget !== 'weapp'
    || !shouldAppendContainer
    || collectGeneratedSelectors(css).has('.container')
  ) {
    return css
  }

  const styleOptions = {
    ...cssHandlerOptions,
    ...generatorStyleOptions,
  }
  const compatCssCacheKey = createLegacyCompatTransformCacheKey(LEGACY_CONTAINER_COMPAT_CSS, styleOptions)
  let compatCss = legacyCompatTransformCache.get(compatCssCacheKey)
  if (compatCss === undefined) {
    const handled = await styleHandler(LEGACY_CONTAINER_COMPAT_CSS, styleOptions)
    compatCss = handled.css
    setLimitedCacheValue(legacyCompatTransformCache, compatCssCacheKey, compatCss)
  }
  const cleanedCompatCss = collectDedupedPostTransformCompatCss(
    removeUnsupportedMiniProgramAtRules(compatCss),
    css,
  )
  if (cleanedCompatCss.trim().length === 0) {
    return css
  }
  return createCssAppend(css, cleanedCompatCss)
}
