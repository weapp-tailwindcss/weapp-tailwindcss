import type { StyleHandler } from '@weapp-tailwindcss/postcss/transform'
import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import { removeUnsupportedMiniProgramAtRules } from '@weapp-tailwindcss/postcss/transform'
import { collectDedupedPostTransformCompatCss, collectGeneratedSelectors } from '../legacy-selectors'
import { createCssAppend } from '../markers'
import { createLegacyCompatTransformCacheKey, legacyCompatTransformCache, setLimitedCacheValue } from './cache'
import { hasConfiguredContainerCompat, resolveLegacyCompatCssSource } from './source'

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

export async function appendLegacyContainerCompatCss(
  css: string,
  rawSource: string,
  file: string,
  runtime: Set<string>,
  configuredContainerCompat: boolean,
  generatorTarget: string,
  styleHandler: StyleHandler,
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
