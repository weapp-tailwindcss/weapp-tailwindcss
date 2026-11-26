import type { StyleHandler } from '@weapp-tailwindcss/postcss/transform'
import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import { filterExistingCssRules, removeMiniProgramContainerCompatCss, removeUnsupportedMiniProgramAtRules } from '@weapp-tailwindcss/postcss/transform'
import { collectDedupedPostTransformCompatCss, removeDuplicatedViteMarkers, removeGeneratedSelectorCompatCss } from '../legacy-selectors'
import { createCssAppend } from '../markers'
import { removeTailwindV4GeneratedUserCssArtifacts } from '../user-css'
import { createLegacyCompatTransformCacheKey, legacyCompatTransformCache, setLimitedCacheValue } from './cache'
import { resolveLegacyCompatCssSource } from './source'

export async function appendLegacyCompatCss(
  css: string,
  rawSource: string,
  generatorTarget: string,
  styleHandler: StyleHandler,
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
    cssOptions: {
      ...cssHandlerOptions.cssOptions,
      ...generatorStyleOptions?.cssOptions,
      colorMixDynamicAlpha: generatorStyleOptions?.cssOptions?.colorMixDynamicAlpha
        ?? cssHandlerOptions.cssOptions?.colorMixDynamicAlpha,
    },
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
